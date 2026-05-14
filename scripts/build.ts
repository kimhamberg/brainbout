import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { Glob } from "bun";

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
