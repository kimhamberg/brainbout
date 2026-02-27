import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        puzzles: resolve(__dirname, "games/puzzles.html"),
        nback: resolve(__dirname, "games/nback.html"),
        stroop: resolve(__dirname, "games/stroop.html"),
        math: resolve(__dirname, "games/math.html"),
      },
    },
  },
});
