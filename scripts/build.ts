import { createHash } from "node:crypto";
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { Glob } from "bun";

/**
 * A strict Content-Security-Policy injected into the SHIPPED HTML only (not
 * source — the dev server's HMR would trip a hash-only script-src). Inline
 * <script>s (the theme FOUC-setter) are allowlisted by sha256; pixi runs without
 * eval via `pixi.js/unsafe-eval`; Google Fonts (Montserrat) is allowed.
 */
function cspFor(html: string): string {
  const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gu)].map(
    (m) =>
      `'sha256-${createHash("sha256")
        .update(m[1] ?? "")
        .digest("base64")}'`,
  );
  const scriptSrc = ["'self'", ...hashes].join(" ");
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data:",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
  ].join("; ");
}

const ROOT = join(import.meta.dirname, "..");
const DIST = join(ROOT, "dist");
const BASE = process.env.BASE ?? "/";

rmSync(DIST, { recursive: true, force: true });

const common = {
  outdir: DIST,
  // Pin the root so HTML output paths mirror the entrypoints relative to the
  // repo (games/*.html → dist/games/*.html). Without this, the verdant-only
  // build's common ancestor is games/, flattening the pages to dist root — and
  // the hub links games/verdant-walk.html, which would then 404 in prod.
  root: ROOT,
  minify: true,
  publicPath: BASE,
  define: { __BB_BASE__: JSON.stringify(BASE) },
} as const;

// Two splitting builds sharing one outdir, kept SEPARATE on purpose: a single
// combined build lets Bun's cross-entry shared-chunk heuristic hoist pixi into
// the hub's EAGER boot graph (pixi is shared by the hub strip + the verdant
// pages). Isolating the hub build keeps its dynamic import("./hub-diorama")
// genuinely lazy, so pixi stays OUT of the hub boot shell (audit VH-6, asserted
// by the bundle-size gate's BOOT column). Both builds enable `splitting` so each
// entry's pixi render layer code-splits into an on-demand chunk. (pixi is
// duplicated across the two builds' chunks — the cost of the clean boot split.)
const trainer = await Bun.build({
  entrypoints: [join(ROOT, "index.html")],
  ...common,
  splitting: true,
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
  const patched = readFileSync(path, "utf-8").replaceAll(`${BASE}../`, BASE);
  const withCsp = patched.replace(
    /(<meta charset[^>]*>)/iu,
    `$1\n    <meta http-equiv="Content-Security-Policy" content="${cspFor(patched)}">`,
  );
  writeFileSync(path, withCsp);
}

cpSync(join(ROOT, "public"), DIST, { recursive: true });
