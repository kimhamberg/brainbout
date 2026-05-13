import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    outDir: "dist",
    cssMinify: "lightningcss",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        crown: resolve(__dirname, "games/crown.html"),
        flux: resolve(__dirname, "games/flux.html"),
        lex: resolve(__dirname, "games/lex.html"),
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
