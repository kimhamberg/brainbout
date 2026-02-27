import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        blitz: resolve(__dirname, "games/blitz.html"),
        memory: resolve(__dirname, "games/memory.html"),
        stroop: resolve(__dirname, "games/stroop.html"),
        math: resolve(__dirname, "games/math.html"),
      },
    },
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
