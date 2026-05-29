import { join } from "node:path";
import crown from "../games/crown.html";
import cycle from "../games/cycle.html";
import daily from "../games/daily.html";
import flux from "../games/flux.html";
import lex from "../games/lex.html";
import verdant from "../games/verdant.html";
import verdantBench from "../games/verdant-bench.html";
import verdantGrove from "../games/verdant-grove.html";
import index from "../index.html";
import { assetFetch, COOP_COEP_HEADERS } from "./serve";

const ROOT = join(import.meta.dirname, "..");

const server = Bun.serve({
  port: 5173,
  development: { hmr: true, console: true },
  routes: {
    "/": index,
    "/games/crown.html": crown,
    "/games/cycle.html": cycle,
    "/games/daily.html": daily,
    "/games/flux.html": flux,
    "/games/lex.html": lex,
    "/games/verdant.html": verdant,
    "/games/verdant-grove.html": verdantGrove,
    "/games/verdant-bench.html": verdantBench,
  },
  fetch: assetFetch(ROOT, { headers: COOP_COEP_HEADERS }),
});

console.log(`→ ${server.url}`);
