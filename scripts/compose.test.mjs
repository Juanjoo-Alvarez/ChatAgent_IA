import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { after, test } from "node:test";
import { fileURLToPath, URL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), "agichat-compose-"));
const envFile = join(temporary, ".env");
writeFileSync(envFile, "", "utf8");
after(() => { unlinkSync(envFile); rmdirSync(temporary); });

const windowsDocker = join(process.env.ProgramFiles ?? "C:/Program Files", "Docker", "Docker", "resources", "bin", "docker.exe");
const docker = process.env.DOCKER_BIN ?? (process.platform === "win32" && existsSync(windowsDocker) ? windowsDocker : "docker");

/** Renderiza Compose sin daemon, red ni archivos .env personales. No arranca servicios. */
function mcpEnvironment(overrides = {}) {
  let output;
  try {
    output = execFileSync(docker, [
      "compose", "--env-file", envFile, "-f", "compose.yaml", "-f", "compose.backend.yaml",
      "--profile", "backend", "--profile", "scale", "config", "--format", "json"
    ], {
      cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        TMDB_READ_ACCESS_TOKEN: "compose-test-token", QUOTA_TMDB: "1000/1d",
        GOOGLE_BOOKS_ENABLED: "", GOOGLE_BOOKS_API_KEY: "", GOOGLE_BOOKS_TIMEOUT_MS: "", QUOTA_GOOGLE_BOOKS: "",
        ...overrides
      }
    });
  } catch {
    throw new Error("No se pudo validar Compose. Se necesita Docker CLI con Compose; no es necesario iniciar el daemon.");
  }
  return JSON.parse(output).services.mcp.environment;
}

test("books stay disabled by default without inventing a provider quota", () => {
  const env = mcpEnvironment();
  assert.equal(env.GOOGLE_BOOKS_ENABLED, "false");
  assert.equal(env.QUOTA_GOOGLE_BOOKS, "");
  assert.equal(env.GOOGLE_BOOKS_API_KEY, "");
  assert.equal(env.GOOGLE_BOOKS_TIMEOUT_MS, "8000");
});

test("the MCP container receives the configured book flag, quota, key and timeout", () => {
  const env = mcpEnvironment({
    GOOGLE_BOOKS_ENABLED: "true", QUOTA_GOOGLE_BOOKS: "5/1s,1000/1d",
    GOOGLE_BOOKS_API_KEY: "synthetic-test-key", GOOGLE_BOOKS_TIMEOUT_MS: "12000"
  });
  assert.equal(env.GOOGLE_BOOKS_ENABLED, "true");
  assert.equal(env.QUOTA_GOOGLE_BOOKS, "5/1s,1000/1d");
  assert.equal(env.GOOGLE_BOOKS_API_KEY, "synthetic-test-key");
  assert.equal(env.GOOGLE_BOOKS_TIMEOUT_MS, "12000");
});

test("books can be enabled with an explicit quota and no optional API key", () => {
  const env = mcpEnvironment({ GOOGLE_BOOKS_ENABLED: "true", QUOTA_GOOGLE_BOOKS: "300/1d" });
  assert.equal(env.GOOGLE_BOOKS_ENABLED, "true");
  assert.equal(env.QUOTA_GOOGLE_BOOKS, "300/1d");
  assert.equal(env.GOOGLE_BOOKS_API_KEY, "");
});
