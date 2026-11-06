import { describe, expect, it, vi } from "vitest";

import {
  InMemoryQuotaStore,
  QuotaExceededError,
  QuotaManager,
  createQuotaFetch,
  createResilientFetch,
  createRetryFetch,
  isRequestNotSent,
  sleep,
  type FetchLike
} from "../src";

const URL_ = "https://api.example.test/resource";

function quotaWith(limit: number) {
  const quota = new QuotaManager({
    store: new InMemoryQuotaStore(),
    policies: { tmdb: { windows: [{ limit, windowMs: 60_000 }] }, google_books: { windows: [{ limit, windowMs: 60_000 }] } }
  });
  const used = async (provider = "tmdb") => (await quota.usage(provider)).windows[0]?.used;
  return { quota, used };
}

function sequence(...steps: (number | Error)[]): { fetch: FetchLike; calls: () => number } {
  let index = 0;
  const fetchImpl: FetchLike = () => {
    const step = steps[Math.min(index, steps.length - 1)] as number | Error;
    index += 1;
    return step instanceof Error ? Promise.reject(step) : Promise.resolve(new Response("{}", { status: step }));
  };
  return { fetch: fetchImpl, calls: () => index };
}

function connectionError(code: string): Error {
  return new TypeError("fetch failed", { cause: Object.assign(new Error(code), { code }) });
}

const noWait = { sleep: () => Promise.resolve(), random: () => 0.5 };

describe("isRequestNotSent", () => {
  it("detects connection errors that happen before sending", () => {
    expect(isRequestNotSent(connectionError("ECONNREFUSED"))).toBe(true);
    expect(isRequestNotSent(connectionError("ENOTFOUND"))).toBe(true);
    expect(
      isRequestNotSent(
        new TypeError("fetch failed", {
          cause: new AggregateError([Object.assign(new Error(), { code: "ECONNREFUSED" })])
        })
      )
    ).toBe(true);
  });

  it("assumes the request was sent when it cannot be proven otherwise", () => {
    expect(isRequestNotSent(connectionError("ECONNRESET"))).toBe(false);
    expect(isRequestNotSent(new TypeError("fetch failed"))).toBe(false);
    expect(isRequestNotSent("boom")).toBe(false);
  });
});

describe("createQuotaFetch", () => {
  it("counts every request, including HTTP errors", async () => {
    const { quota, used } = quotaWith(5);
    const guarded = createQuotaFetch(sequence(200, 500).fetch, quota, "tmdb");

    await guarded(URL_, {});
    await guarded(URL_, {});

    expect(await used()).toBe(2);
  });

  it("blocks requests without calling the provider when the quota is exhausted", async () => {
    const { quota, used } = quotaWith(1);
    const upstream = sequence(200);
    const guarded = createQuotaFetch(upstream.fetch, quota, "tmdb");

    await guarded(URL_, {});
    await expect(guarded(URL_, {})).rejects.toBeInstanceOf(QuotaExceededError);

    expect(upstream.calls()).toBe(1);
    expect(await used()).toBe(1);
  });

  it("returns the quota when the connection was never established", async () => {
    const { quota, used } = quotaWith(5);
    const guarded = createQuotaFetch(sequence(connectionError("ECONNREFUSED")).fetch, quota, "tmdb");

    await expect(guarded(URL_, {})).rejects.toThrow("fetch failed");
    expect(await used()).toBe(0);
  });

  it("keeps counting resets that may happen after sending", async () => {
    const { quota, used } = quotaWith(5);
    const guarded = createQuotaFetch(sequence(connectionError("ECONNRESET")).fetch, quota, "tmdb");

    await expect(guarded(URL_, {})).rejects.toThrow();
    expect(await used()).toBe(1);
  });

  it("does not register already aborted requests", async () => {
    const { quota, used } = quotaWith(5);
    const controller = new AbortController();
    controller.abort();

    await expect(createQuotaFetch(sequence(200).fetch, quota, "tmdb")(URL_, { signal: controller.signal })).rejects.toBeDefined();
    expect(await used()).toBe(0);
  });
});

describe("createRetryFetch", () => {
  it("retries transient statuses and returns the first success", async () => {
    const upstream = sequence(503, 502, 200);
    const onRetry = vi.fn();

    const response = await createRetryFetch(upstream.fetch, { ...noWait, onRetry })(URL_, {});

    expect(response.status).toBe(200);
    expect(upstream.calls()).toBe(3);
    expect(onRetry).toHaveBeenNthCalledWith(1, { attempt: 1, delayMs: 125, reason: "status", status: 503 });
    expect(onRetry).toHaveBeenNthCalledWith(2, { attempt: 2, delayMs: 250, reason: "status", status: 502 });
  });

  it("stops after the maximum number of attempts", async () => {
    const upstream = sequence(503);

    const response = await createRetryFetch(upstream.fetch, { ...noWait, maxAttempts: 2 })(URL_, {});

    expect(response.status).toBe(503);
    expect(upstream.calls()).toBe(2);
  });

  it("does not retry client errors", async () => {
    const upstream = sequence(404);

    expect((await createRetryFetch(upstream.fetch, noWait)(URL_, {})).status).toBe(404);
    expect(upstream.calls()).toBe(1);
  });

  it("honours Retry-After and gives up when it is too long", async () => {
    const delays: number[] = [];
    const wait = (ms: number) => {
      delays.push(ms);
      return Promise.resolve();
    };
    let calls = 0;
    const limited: FetchLike = () => {
      calls += 1;
      const retryAfter = calls === 1 ? "2" : "120";
      return Promise.resolve(new Response("{}", { status: 429, headers: { "Retry-After": retryAfter } }));
    };

    const response = await createRetryFetch(limited, { sleep: wait })(URL_, {});

    expect(response.status).toBe(429);
    expect(delays).toEqual([2000]);
    expect(calls).toBe(2);
  });

  it("accepts Retry-After as an HTTP date", async () => {
    const delays: number[] = [];
    const upstream: FetchLike = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(
        new Response("{}", { status: 503, headers: { "Retry-After": new Date(Date.now() + 60_000).toUTCString() } })
      )
      .mockResolvedValueOnce(new Response("{}", { status: 503, headers: { "Retry-After": "later" } }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    await createRetryFetch(upstream, {
      ...noWait,
      maxRetryAfterMs: 120_000,
      sleep: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      }
    })(URL_, {});

    expect(delays[0]).toBeGreaterThan(50_000);
    expect(delays[1]).toBe(250);
  });

  it("retries network failures but not aborts or quota errors", async () => {
    const network = sequence(new TypeError("fetch failed"), 200);
    expect((await createRetryFetch(network.fetch, noWait)(URL_, {})).status).toBe(200);

    const abort = sequence(new DOMException("aborted", "AbortError"));
    await expect(createRetryFetch(abort.fetch, noWait)(URL_, {})).rejects.toThrow("aborted");
    expect(abort.calls()).toBe(1);

    const quota = sequence(new QuotaExceededError("tmdb", 100, []));
    await expect(createRetryFetch(quota.fetch, noWait)(URL_, {})).rejects.toBeInstanceOf(QuotaExceededError);
    expect(quota.calls()).toBe(1);

    const exhausted = sequence(new TypeError("fetch failed"));
    await expect(createRetryFetch(exhausted.fetch, { ...noWait, maxAttempts: 2 })(URL_, {})).rejects.toThrow();
    expect(exhausted.calls()).toBe(2);
  });

  it("caps the exponential backoff", async () => {
    const delays: number[] = [];
    await createRetryFetch(sequence(500, 500, 500, 500, 200).fetch, {
      maxAttempts: 5,
      baseDelayMs: 1000,
      maxDelayMs: 3000,
      random: () => 1,
      sleep: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      }
    })(URL_, {});

    expect(delays).toEqual([1000, 2000, 3000, 3000]);
  });

  it("rejects invalid attempt counts", () => {
    expect(() => createRetryFetch(sequence(200).fetch, { maxAttempts: 0 })).toThrow(TypeError);
  });
});

describe("sleep", () => {
  it("resolves after the delay and rejects when aborted", async () => {
    await expect(sleep(1, undefined)).resolves.toBeUndefined();

    const controller = new AbortController();
    const pending = sleep(10_000, controller.signal);
    controller.abort(new Error("cancelled"));
    await expect(pending).rejects.toThrow("cancelled");

    await expect(sleep(1, controller.signal)).rejects.toThrow("cancelled");

    const live = new AbortController();
    await expect(sleep(1, live.signal)).resolves.toBeUndefined();
  });
});

describe("createResilientFetch", () => {
  it("counts each retry as a separate external request", async () => {
    const { quota, used } = quotaWith(10);
    const upstream = sequence(503, 503, 200);

    const response = await createResilientFetch({
      provider: "tmdb",
      quota,
      fetch: upstream.fetch,
      retry: noWait
    })(URL_, {});

    expect(response.status).toBe(200);
    expect(await used("tmdb")).toBe(3);
    expect(await used("google_books")).toBe(0);
  });

  it("stops retrying when the quota runs out", async () => {
    const { quota, used } = quotaWith(2);
    const upstream = sequence(503);

    await expect(
      createResilientFetch({ provider: "tmdb", quota, fetch: upstream.fetch, retry: noWait })(URL_, {})
    ).rejects.toBeInstanceOf(QuotaExceededError);

    expect(upstream.calls()).toBe(2);
    expect(await used()).toBe(2);
  });

  it("uses the global fetch by default", async () => {
    const { quota } = quotaWith(1);
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    await createResilientFetch({ provider: "tmdb", quota })(URL_, {});

    expect(spy).toHaveBeenCalledWith(URL_, {});
    spy.mockRestore();
  });
});
