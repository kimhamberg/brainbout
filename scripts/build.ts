import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { Glob } from "bun";

const ROOT = join(import.meta.dirname, "..");
const DIST = join(ROOT, "dist");
const BASE = process.env.BASE ?? "/";

rmSync(DIST, { recursive: true, force: true });

const common = {
  outdir: DIST,
  minify: true,
  publicPath: BASE,
  define: { __BB_BASE__: JSON.stringify(BASE) },
} as const;

// Two builds sharing one outdir. The trainer pages are pixi-free and ship as a
// single chunk each (no splitting overhead). The verdant pages enable
// `splitting` so each entry dynamically import()s its render layer — pixi
// code-splits into a shared on-demand chunk, kept OUT of every boot shell
// (audit VH-6, asserted by the bundle-size gate's BOOT column).
const trainer = await Bun.build({
  entrypoints: [
    join(ROOT, "index.html"),
    join(ROOT, "games/crown.html"),
    join(ROOT, "games/cycle.html"),
    join(ROOT, "games/daily.html"),
    join(ROOT, "games/flux.html"),
    join(ROOT, "games/lex.html"),
  ],
  ...common,
});
const verdant = await Bun.build({
  entrypoints: [
    join(ROOT, "games/verdant.html"),
    join(ROOT, "games/verdant-grove.html"),
    join(ROOT, "games/verdant-bench.html"),
    join(ROOT, "games/verdant-meadow.html"),
    join(ROOT, "games/verdant-walk.html"),
  ],
  ...common,
  splitting: true,
});

for (const result of [trainer, verdant]) {
  if (!result.success) {
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }
}

// Bun.build emits `${publicPath}../chunk-X.js` for nested-dir HTML
// entrypoints (dist/games/*.html). At BASE=/brainbout/ that collapses
// to /chunk-X.js (one level above /brainbout/) and 404s on GitHub
// Pages. Patch the HTML to point at the actual chunk location
// (siblings of dist/index.html).
const glob = new Glob("**/*.html");
for (const rel of glob.scanSync({ cwd: DIST, onlyFiles: true })) {
  const path = join(DIST, rel);
  const before = readFileSync(path, "utf-8");
  const after = before.replaceAll(`${BASE}../`, BASE);
  if (after !== before) {
    writeFileSync(path, after);
  }
}

cpSync(join(ROOT, "public"), DIST, { recursive: true });
