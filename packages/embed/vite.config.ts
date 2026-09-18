import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      name: "AGIChat",
      formats: ["es", "iife"],
      fileName: (format) =>
        format === "es"
          ? "agichat-widget.js"
          : "agichat-widget.iife.js"
    },
    sourcemap: true,
    target: "es2022"
  }
});
