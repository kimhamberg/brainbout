import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    cssMinify: "lightningcss",
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        crown: resolve(import.meta.dirname, "games/crown.html"),
        flux: resolve(import.meta.dirname, "games/flux.html"),
        lex: resolve(import.meta.dirname, "games/lex.html"),
      },
    },
  },
  css: {
    transformer: "lightningcss",
    lightningcss: {
      drafts: { customMedia: true },
    },
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
