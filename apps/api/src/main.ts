import { createApi } from "./app.js";
import { loadApiConfig } from "./config.js";

try {
  const config = loadApiConfig(process.env);
  const app = createApi(config);
  const address = await app.start();
  console.info(JSON.stringify({ event: "chat_listening", host: address.address, port: address.port, mode: config.mode, sessions: config.sessionStore }));
  let stopping = false;
  const stop = () => {
    if (stopping) { return; }
    stopping = true;
    void app.stop().then(() => process.exit(0), () => process.exit(1));
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
} catch {
  console.error(JSON.stringify({ event: "chat_start_failed", hint: "Revisa configuración, puertos y disponibilidad de Redis." }));
  process.exitCode = 1;
}
