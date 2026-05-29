import { join } from "node:path";
import verdant from "../games/verdant.html";
import verdantBench from "../games/verdant-bench.html";
import verdantGrove from "../games/verdant-grove.html";
import verdantMeadow from "../games/verdant-meadow.html";
import verdantWalk from "../games/verdant-walk.html";
import index from "../index.html";
import { assetFetch, COOP_COEP_HEADERS } from "./serve";

const ROOT = join(import.meta.dirname, "..");

const server = Bun.serve({
  port: 5173,
  development: { hmr: true, console: true },
  routes: {
    "/": index,
    "/games/verdant.html": verdant,
    "/games/verdant-grove.html": verdantGrove,
    "/games/verdant-bench.html": verdantBench,
    "/games/verdant-meadow.html": verdantMeadow,
    "/games/verdant-walk.html": verdantWalk,
  },
  fetch: assetFetch(ROOT, { headers: COOP_COEP_HEADERS }),
});

console.log(`→ ${server.url}`);
