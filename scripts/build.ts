import { cpSync, rmSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const ROOT = join(import.meta.dirname, "..");
const DIST = join(ROOT, "dist");
const BASE = process.env.BASE ?? "/";

rmSync(DIST, { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: [
    join(ROOT, "index.html"),
    join(ROOT, "games/crown.html"),
    join(ROOT, "games/flux.html"),
    join(ROOT, "games/lex.html"),
  ],
  outdir: DIST,
  minify: true,
  publicPath: BASE,
  define: { __BB_BASE__: JSON.stringify(BASE) },
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

cpSync(join(ROOT, "public"), DIST, { recursive: true });

const SF = "stockfish-18-lite-single";
for (const ext of [".js", ".wasm"]) {
  cpSync(
    join(ROOT, "node_modules/stockfish/bin", SF + ext),
    join(DIST, "stockfish", SF + ext),
  );
}
