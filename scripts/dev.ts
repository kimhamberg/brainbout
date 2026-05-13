import { join } from "node:path";
import crown from "../games/crown.html";
import flux from "../games/flux.html";
import lex from "../games/lex.html";
import index from "../index.html";

const ROOT = join(import.meta.dirname, "..");

const HEADERS = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

const server = Bun.serve({
  port: 5173,
  development: { hmr: true, console: true },
  routes: {
    "/": index,
    "/games/crown.html": crown,
    "/games/flux.html": flux,
    "/games/lex.html": lex,
  },
  async fetch(req) {
    const { pathname } = new URL(req.url);
    const rootFiles = new Set([
      "/favicon.svg",
      "/apple-touch-icon.png",
      "/manifest.json",
    ]);
    const sfMatch = /^\/stockfish\/(.+)$/u.exec(pathname);
    const path = sfMatch
      ? join(ROOT, "node_modules/stockfish/bin", sfMatch[1]!)
      : rootFiles.has(pathname)
        ? join(ROOT, pathname)
        : join(ROOT, "public", pathname);
    const f = Bun.file(path);
    if (await f.exists()) {
      return new Response(f, { headers: HEADERS });
    }
    return new Response("Not Found", { status: 404 });
  },
});

console.log(`→ ${server.url}`);
