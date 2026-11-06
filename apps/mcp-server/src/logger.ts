export interface Logger {
  info(event: string, data?: Record<string, unknown>): void;
  error(event: string, data?: Record<string, unknown>): void;
}

/** Registros JSON por stderr; stdout queda libre para otros transportes. */
export function createJsonLogger(write: (line: string) => void = (line) => process.stderr.write(`${line}\n`)): Logger {
  const log = (level: "info" | "error", event: string, data: Record<string, unknown> = {}): void => {
    write(JSON.stringify({ time: new Date().toISOString(), level, event, ...data }));
  };
  return {
    info: (event, data) => log("info", event, data),
    error: (event, data) => log("error", event, data)
  };
}

export const silentLogger: Logger = {
  info: () => undefined,
  error: () => undefined
};
