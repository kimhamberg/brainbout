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
// VERDANT sits near the audit's 200KB target; Phase 7 should lazy-load pixi so
// the boot shell stays under it once verdant becomes the shipped app.
const VERDANT_BUDGET = 210; // pixi-bearing render pages
const APP_BUDGET = 60; // shipped trainer pages — pixi must stay OUT

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

/** Transitive set of .js chunks an HTML entry loads. */
function jsGraph(html: string): Set<string> {
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
    for (const m of code.matchAll(
      /(?:import|export)[^"']*?["']([^"']+\.js)["']|import\(\s*["']([^"']+\.js)["']/gu,
    )) {
      const ref = m[1] ?? m[2];
      if (ref) queue.push(resolveRef(f, ref));
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
  "page                         gzip JS    chunks  budget\n",
);
process.stdout.write(
  "───────────────────────────────────────────────────────\n",
);
for (const html of htmls) {
  const name = html.slice(DIST.length + 1);
  const isVerdant = name.includes("verdant");
  const graph = jsGraph(html);
  const kb = gzipKB(graph);
  const budget = isVerdant ? VERDANT_BUDGET : APP_BUDGET;
  const over = kb > budget;
  if (over) failed = true;
  process.stdout.write(
    `${name.padEnd(28)} ${kb.toFixed(1).padStart(7)} KB ${String(graph.size).padStart(6)}   ${String(budget)} KB${over ? "  ✗ OVER" : ""}\n`,
  );
}

if (failed) {
  process.stderr.write(
    "\n::error::A bundle exceeded its gzip budget. If pixi.js leaked into a shipped trainer page, lazy-load it / keep it in the verdant-* render pages only.\n",
  );
  process.exit(1);
}
process.stdout.write("\n✓ all bundles within budget\n");
