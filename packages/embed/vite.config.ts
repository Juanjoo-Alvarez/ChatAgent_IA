import { defineConfig } from "vite";

export default defineConfig({
  define: {
    "process.env.NODE_ENV": JSON.stringify("production")
  },
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
    minify: "oxc",
    sourcemap: true,
    target: "es2022"
  }
});
