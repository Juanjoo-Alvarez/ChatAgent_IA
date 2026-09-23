import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

// Vite necesita rutas absolutas por entrada en modo multi-página.
const resolveEntry = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url));

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolveEntry("index.html"),
        webComponent: resolveEntry("web-component.html")
      }
    }
  }
});
