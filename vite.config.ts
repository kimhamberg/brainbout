import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        rapid: resolve(__dirname, "games/rapid.html"),
        flux: resolve(__dirname, "games/flux.html"),
        vocab: resolve(__dirname, "games/vocab.html"),
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
