import { join } from "node:path";
import crown from "../games/crown.html";
import flux from "../games/flux.html";
import lex from "../games/lex.html";
import index from "../index.html";
import { assetFetch, COOP_COEP_HEADERS } from "./serve";

const ROOT = join(import.meta.dirname, "..");

const server = Bun.serve({
  port: 5173,
  development: { hmr: true, console: true },
  routes: {
    "/": index,
    "/games/crown.html": crown,
    "/games/flux.html": flux,
    "/games/lex.html": lex,
  },
  fetch: assetFetch(ROOT, { headers: COOP_COEP_HEADERS }),
});

console.log(`→ ${server.url}`);
