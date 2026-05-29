/**
 * Bundle-size gate (audit VH-6). pixi.js (~120KB gzip) must NOT leak into the
 * shipped trainer pages (index + the games) — it belongs only in the verdant-*
 * render pages. For each built HTML entry we walk the JS chunk graph it loads,
 * sum the GZIPPED bytes, and assert it's under a per-category budget. Run after
 * `bun run build`. Mirrors the atlas golden-hash gate: a deterministic CI check.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";

const DIST = join(import.meta.dirname ?? ".", "..", "dist");

// gzipped KB budgets per HTML entry (current actuals: app ≤29, verdant ≤170).
// APP is a tight tripwire — a pixi.js leak would jump a page to ~160KB.
// VERDANT sits near the audit's 200KB target (full graph incl. the lazy pixi).
const VERDANT_BUDGET = 210; // pixi-bearing render pages (full transitive graph)
// The hub (index.html) lazy-loads ONE small pixi ambient strip, so its FULL
// graph legitimately includes the on-demand pixi chunk — but it gets its OWN,
// tighter budget (not VERDANT's), so it still trips on a SECOND pixi copy or
// real bloat. The BOOT column below proves pixi stays OUT of its EAGER shell.
const HUB_BUDGET = 200; // index.html: pixi-free boot + one lazy pixi strip (~178KB)
const APP_BUDGET = 60; // any pixi-free trainer page — pixi must stay OUT entirely
// EAGER boot shell (static imports only): pixi (~120KB gz) must NOT be here —
// it's loaded on demand via import("pixi.js") in pixi-stage. This is the gate
// that proves the lazy-load (VH-6); if pixi ever leaks back into a static
// import path the boot shell blows past this and CI fails.
const BOOT_BUDGET = 60;

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

function resolveRef(fromFile: string, ref: string): string {
  return ref.startsWith("/")
    ? join(DIST, ref.slice(1))
    : resolve(dirname(fromFile), ref);
}

/**
 * Transitive set of .js chunks an HTML entry loads. `followDynamic=false` walks
 * only STATIC import/export edges — i.e. the EAGER boot shell that ships before
 * first paint; lazy `import("…")` chunks (pixi) are excluded.
 */
function jsGraph(html: string, followDynamic = true): Set<string> {
  const seen = new Set<string>();
  const queue: string[] = [];
  const htmlSrc = readFileSync(html, "utf8");
  for (const m of htmlSrc.matchAll(/(?:src|href)="([^"]+\.js)"/gu)) {
    queue.push(resolveRef(html, m[1] as string));
  }
  while (queue.length > 0) {
    const f = queue.pop() as string;
    if (seen.has(f)) continue;
    let code: string;
    try {
      code = readFileSync(f, "utf8");
    } catch {
      continue; // unresolved (e.g. external) — skip
    }
    seen.add(f);
    // Static edges: `import …from "x.js"` / `export …from "x.js"`. The `[^(]`
    // guard stops this from also swallowing a dynamic `import("x.js")` call.
    for (const m of code.matchAll(
      /(?:import|export)[^("']*?["']([^"']+\.js)["']/gu,
    )) {
      if (m[1]) queue.push(resolveRef(f, m[1]));
    }
    // Dynamic edges: `import("x.js")` — the lazy chunks (pixi). Skipped when
    // computing the EAGER boot shell.
    if (followDynamic) {
      for (const m of code.matchAll(/import\(\s*["']([^"']+\.js)["']/gu)) {
        if (m[1]) queue.push(resolveRef(f, m[1]));
      }
    }
  }
  return seen;
}

function gzipKB(files: Set<string>): number {
  let bytes = 0;
  for (const f of files) bytes += Bun.gzipSync(readFileSync(f)).length;
  return bytes / 1024;
}

const htmls = listFiles(DIST)
  .filter((f) => f.endsWith(".html"))
  .sort();

let failed = false;
process.stdout.write(
  "page                          full JS    boot JS  chunks  budget\n",
);
process.stdout.write(
  "────────────────────────────────────────────────────────────────\n",
);
// The Phase-0 static-diorama showcase (verdant.html) renders pixi immediately by
// design — it's a dev showcase, not a boot shell, so the lazy-load BOOT gate
// doesn't apply (bun also merges its single-use render module into the entry).
// The SHIPPED paths — the playable zones + the Walk — must stay lazy.
const BOOT_EXEMPT = (name: string): boolean => name.endsWith("verdant.html");

for (const html of htmls) {
  const name = html.slice(DIST.length + 1);
  const graph = jsGraph(html);
  const kb = gzipKB(graph);
  const bootKb = gzipKB(jsGraph(html, false)); // static-only = the boot shell
  const budget =
    name === "index.html"
      ? HUB_BUDGET
      : name.includes("verdant")
        ? VERDANT_BUDGET
        : APP_BUDGET;
  const bootOver = !BOOT_EXEMPT(name) && bootKb > BOOT_BUDGET;
  const over = kb > budget || bootOver;
  if (over) failed = true;
  const bootCol = BOOT_EXEMPT(name)
    ? `${bootKb.toFixed(1).padStart(7)} KB*`
    : `${bootKb.toFixed(1).padStart(7)} KB`;
  process.stdout.write(
    `${name.padEnd(28)} ${kb.toFixed(1).padStart(7)} KB ${bootCol} ${String(graph.size).padStart(6)}   ${String(budget)}/${String(BOOT_BUDGET)}${over ? "  ✗ OVER" : ""}\n`,
  );
}

if (failed) {
  process.stderr.write(
    '\n::error::A bundle exceeded budget. Full graph over the page budget, or the EAGER boot shell over BOOT_BUDGET (pixi must load lazily via import("pixi.js"), never a static import).\n',
  );
  process.exit(1);
}
process.stdout.write("\n✓ all bundles within budget\n");
