import type { TransportConfiguration } from "./configuration";

/** Presupuesto de recuperación y único temporizador de espera entre intentos. */
export class ReconnectController {
  private attempts = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  public constructor(private readonly config: TransportConfiguration) {}

  public get scheduled(): boolean { return this.timer !== undefined; }

  public schedule(reconnect: () => void): boolean {
    if (this.attempts >= this.config.maxReconnectAttempts) { return false; }
    const delay = Math.min(this.config.reconnectDelayMs * 2 ** this.attempts, this.config.maxReconnectDelayMs);
    this.attempts += 1;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      reconnect();
    }, delay);
    return true;
  }

  public reset(): void { this.attempts = 0; }

  public cancel(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}
