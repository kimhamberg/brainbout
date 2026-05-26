/**
 * stryke runner — orchestrates: instrument → dry-run → per-mutant run → report.
 *
 * Architecture:
 *   - One bun worker runs all mutants in-process with runtime-toggled
 *     instrumentation.
 *   - The runner streams the worker's stdout, tracking a "START <id>" marker
 *     before each mutant and a "RESULT <json>" after. A watchdog kills the
 *     worker if no progress arrives within `heartbeatMs` (catches synchronous
 *     infinite-loop mutants the worker cannot interrupt itself).
 *   - A hard wall-clock cap stops the whole pipeline at `wallclockMs`.
 *     Anything still pending is marked `timeout` so we always finish.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Glob } from "bun";
import ts from "typescript";
import { instrumentFile } from "./instrument";
import type { Mutation, MutantResult, MutantStatus } from "./types";

export interface Config {
  /** Project root — paths in `mutate` are relative to this. */
  root: string;
  /** Source files to mutate (relative to root). */
  mutate: string[];
  /** Absolute paths to test files. */
  testFiles: string[];
  /** Where instrumented sources + worker land. */
  tmpDir: string;
  /** Per-mutant test execution budget inside the worker. */
  timeoutMs: number;
  /** Runner-side watchdog: kill worker if stdout silent this long while a mutant is in-flight. */
  heartbeatMs: number;
  /** Runner-side per-mutant cap: kill worker if a mutant doesn't produce
   * its RESULT within this many ms. Robust even when tests use fake-timer
   * mocks that block the worker's own time-based budget. */
  perMutantBudgetMs: number;
  /** Hard cap on total runner wall-clock. Anything pending → timeout. */
  wallclockMs: number;
  /** Max worker respawns after kills. */
  maxRespawns: number;
  /** Extra `--preload` paths passed to the worker process. */
  preloads?: string[];
  /** If set, write the JSON report here. */
  reportPath?: string;
  /** Suppress informational console output. */
  quiet?: boolean;
}

export interface StrykeReport {
  schemaVersion: "1";
  score: number;
  instrumentMs: number;
  workerMs: number;
  byStatus: Record<MutantStatus, number>;
  mutations: Array<Mutation & { result: MutantResult | null }>;
}

/** Source files we never mutate. Entry files mount DOM/register listeners
 * on import — their side effects break the harness or burn the wallclock.
 * Declaration files have no runtime code. */
const SRC_EXCLUDES: string[] = [
  ".d.ts",
  ".entry.ts",
  "src/games/crown.ts",
  "src/games/flux.ts",
  "src/games/lex.ts",
  "src/games/crown-block.ts",
  "src/games/flux-block.ts",
  "src/games/lex-block.ts",
  "src/engine/block.ts",
];
const TEST_EXCLUDES: string[] = [
  "stryke-self.test.ts",
  "property.test.ts",
  "dict-json.test.ts",
  // Uses jest.useFakeTimers(); the mock leaks across our test boundary
  // (our harness doesn't restore real timers between tests) and corrupts
  // every in-process time source the worker uses for per-mutant budgeting.
  "timer.test.ts",
];

function discoverMutate(root: string): string[] {
  const out: string[] = [];
  const glob = new Glob("src/**/*.ts");
  for (const rel of glob.scanSync({ cwd: root })) {
    if (SRC_EXCLUDES.some((s) => rel.endsWith(s))) continue;
    out.push(rel);
  }
  return out.sort();
}

function discoverTests(root: string): string[] {
  const out: string[] = [];
  const glob = new Glob("test/*.test.ts");
  for (const rel of glob.scanSync({ cwd: root })) {
    if (TEST_EXCLUDES.some((s) => rel.endsWith(s))) continue;
    out.push(path.join(root, rel));
  }
  return out.sort();
}

function loadConfig(root: string): Config {
  return {
    root,
    mutate: discoverMutate(root),
    testFiles: discoverTests(root),
    tmpDir: path.join(root, ".stryke-tmp"),
    preloads: [path.join(root, "test/setup.ts")],
    reportPath: path.join(root, "reports/stryke.json"),
    timeoutMs: 400,
    heartbeatMs: 600,
    perMutantBudgetMs: 1500,
    wallclockMs: 30_000,
    maxRespawns: 16,
  };
}

interface BatchOutcome {
  results: MutantResult[];
  hungMutant: number | null;
  wallExceeded: boolean;
  exited: boolean;
}

async function runWorkerBatch(
  proc: ReturnType<typeof Bun.spawn>,
  heartbeatMs: number,
  wallDeadline: number,
  perMutantBudgetMs: number,
): Promise<BatchOutcome> {
  const results: MutantResult[] = [];
  let currentStartedId: number | null = null;
  let currentStartedAt = Date.now();
  let lastActivity = Date.now();
  let buf = "";
  let wallExceeded = false;
  let hungMutant: number | null = null;
  const stdout = proc.stdout as ReadableStream<Uint8Array>;
  const reader = stdout.getReader();
  const decoder = new TextDecoder();

  const handleLine = (line: string): void => {
    if (line.startsWith("START ")) {
      currentStartedId = Number(line.slice("START ".length));
      currentStartedAt = Date.now();
    } else if (line.startsWith("RESULT ")) {
      try {
        const r = JSON.parse(line.slice("RESULT ".length)) as MutantResult;
        results.push(r);
        if (r.id === currentStartedId) currentStartedId = null;
      } catch {
        /* malformed result line — ignore */
      }
    } else if (line.length > 0) {
      console.log(line);
    }
  };

  while (true) {
    const pollMs = Math.min(200, Math.max(50, wallDeadline - Date.now()));
    interface ReadValue { done: boolean; value?: Uint8Array }
    const winner = await Promise.race([
      reader.read().then((v) => ({ kind: "read" as const, v: v as ReadValue })),
      new Promise<{ kind: "tick" }>((r) =>
        setTimeout(() => r({ kind: "tick" }), pollMs),
      ),
    ]);

    if (winner.kind === "read") {
      const { done, value } = winner.v;
      if (done) {
        if (buf.length > 0) handleLine(buf);
        return { results, hungMutant: null, wallExceeded: false, exited: true };
      }
      lastActivity = Date.now();
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        handleLine(buf.slice(0, nl));
        buf = buf.slice(nl + 1);
      }
    }

    if (Date.now() > wallDeadline) {
      wallExceeded = true;
      try { proc.kill("SIGKILL"); } catch {}
      break;
    }
    if (
      currentStartedId !== null &&
      Date.now() - lastActivity > heartbeatMs
    ) {
      hungMutant = currentStartedId;
      try { proc.kill("SIGKILL"); } catch {}
      break;
    }
    // Per-mutant runner-side cap: if the worker hasn't emitted RESULT for
    // the currently-started mutant within perMutantBudgetMs, kill it. This
    // is the only effective bound when tests use `jest.useFakeTimers()` —
    // those mock every in-process time source the worker could check.
    if (
      currentStartedId !== null &&
      Date.now() - currentStartedAt > perMutantBudgetMs
    ) {
      hungMutant = currentStartedId;
      try { proc.kill("SIGKILL"); } catch {}
      break;
    }
  }

  try { await proc.exited; } catch {}
  return { results, hungMutant, wallExceeded, exited: false };
}

export async function runStryke(cfg: Config): Promise<StrykeReport> {
  const root = cfg.root;
  const log = (s: string): void => { if (!cfg.quiet) console.log(s); };
  mkdirSync(cfg.tmpDir, { recursive: true });

  const allMutations: Mutation[] = [];
  const instrumentedPaths = new Map<string, string>();
  let nextId = 0;
  const t0 = performance.now();
  for (const rel of cfg.mutate) {
    const abs = path.join(root, rel);
    const { result, nextId: nextIdAfter } = instrumentFile(abs, root, nextId);
    nextId = nextIdAfter;
    const outPath = path.join(cfg.tmpDir, rel);
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, result.code);
    instrumentedPaths.set(abs, outPath);
    for (const m of result.mutations) allMutations.push(m as Mutation);
  }
  const instrumentMs = performance.now() - t0;
  log(
    `[stryke] instrumented ${String(cfg.mutate.length)} file(s), ` +
      `${String(allMutations.length)} mutants in ${instrumentMs.toFixed(1)}ms`,
  );

  const aliases: Array<{ orig: string; instr: string }> = [];
  for (const [orig, instr] of instrumentedPaths) aliases.push({ orig, instr });

  const rewrittenTestFiles: string[] = [];
  for (const testFile of cfg.testFiles) {
    const rewritten = rewriteTestImports(testFile, aliases);
    const outPath = path.join(cfg.tmpDir, "tests", path.basename(testFile));
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, rewritten);
    rewrittenTestFiles.push(outPath);
  }

  const workerScript = path.join(cfg.tmpDir, "worker.ts");
  writeFileSync(
    workerScript,
    generateWorker(cfg.preloads ?? [], aliases, rewrittenTestFiles),
  );

  const t1 = performance.now();
  const wallDeadline = Date.now() + cfg.wallclockMs;

  let remaining = allMutations.map((m) => m.id);
  const collected: MutantResult[] = [];
  let respawns = 0;

  const preloadArgs: string[] = [];
  for (const p of cfg.preloads ?? []) {
    preloadArgs.push("--preload", p);
  }
  preloadArgs.push("--preload", harnessPath(root));

  // Force a fresh dry-run on the first spawn — the worker treats an empty
  // file as "no cache", writes it after dry-run, and subsequent respawns
  // load it to skip the dry-run.
  const coveragePath = path.join(cfg.tmpDir, "coverage.json");
  try {
    if (existsSync(coveragePath)) writeFileSync(coveragePath, "");
  } catch {}

  // Tell the worker which file each mutant belongs to. The worker uses this
  // to narrow static-mutant test attribution: instead of running every test
  // for a static (module-init) mutant, run only tests that exercised the
  // mutant's own file. Huge perf win on files with many top-level constants.
  const mutantMetaPath = path.join(cfg.tmpDir, "mutant-meta.json");
  writeFileSync(
    mutantMetaPath,
    JSON.stringify({
      mutantFile: allMutations.map((m) => [m.id, m.file] as const),
    }),
  );

  while (remaining.length > 0 && Date.now() < wallDeadline) {
    const proc = Bun.spawn(
      ["bun", ...preloadArgs, workerScript],
      {
        cwd: root,
        stdio: ["ignore", "pipe", "inherit"],
        env: {
          ...process.env,
          STRYKE_MUTANT_IDS: JSON.stringify(remaining),
          STRYKE_TIMEOUT_MS: String(cfg.timeoutMs),
          STRYKE_COVERAGE_PATH: coveragePath,
          STRYKE_MUTANT_META_PATH: mutantMetaPath,
        },
      },
    );
    const batch = await runWorkerBatch(
      proc,
      cfg.heartbeatMs,
      wallDeadline,
      cfg.perMutantBudgetMs,
    );
    for (const r of batch.results) {
      collected.push(r);
      const i = remaining.indexOf(r.id);
      if (i >= 0) remaining.splice(i, 1);
    }
    if (batch.hungMutant !== null) {
      collected.push({
        id: batch.hungMutant,
        status: "timeout",
        durationMs: cfg.heartbeatMs,
      });
      const i = remaining.indexOf(batch.hungMutant);
      if (i >= 0) remaining.splice(i, 1);
      respawns++;
      log(
        `[stryke] mutant ${String(batch.hungMutant)} hung — killed worker, respawning ` +
          `(${String(respawns)}/${String(cfg.maxRespawns)})`,
      );
      if (respawns >= cfg.maxRespawns) {
        log("[stryke] max respawns reached — marking remaining as unrun");
        for (const id of remaining) {
          collected.push({ id, status: "unrun", durationMs: 0 });
        }
        remaining = [];
        break;
      }
    } else if (batch.wallExceeded) {
      break;
    } else if (batch.exited) {
      break;
    }
  }

  if (Date.now() >= wallDeadline && remaining.length > 0) {
    log(
      `[stryke] wall-clock ${String(cfg.wallclockMs)}ms exceeded — ` +
        `marking ${String(remaining.length)} pending as unrun`,
    );
    for (const id of remaining) {
      collected.push({ id, status: "unrun", durationMs: 0 });
    }
  }

  const workerMs = performance.now() - t1;
  const byStatus: Record<MutantStatus, number> = {
    killed: 0,
    survived: 0,
    timeout: 0,
    "no-coverage": 0,
    unrun: 0,
  };
  for (const r of collected) byStatus[r.status]++;
  const total = collected.length;
  // Score denominator excludes `unrun` (we don't know whether those would
  // have been killed) and `no-coverage` (no test exercises them — scoring
  // them as failures would be unfair).
  const scoreDenom =
    byStatus.killed + byStatus.survived + byStatus.timeout;
  const score = scoreDenom === 0
    ? 0
    : (byStatus.killed + byStatus.timeout) / scoreDenom;
  log(
    `[stryke] ran ${String(total)} mutants in ${workerMs.toFixed(1)}ms ` +
      `(respawns: ${String(respawns)})`,
  );
  log(
    `[stryke] killed=${String(byStatus.killed)} ` +
      `survived=${String(byStatus.survived)} ` +
      `timeout=${String(byStatus.timeout)} ` +
      `no-cov=${String(byStatus["no-coverage"])} ` +
      `unrun=${String(byStatus.unrun)}`,
  );
  log(`[stryke] mutation score: ${(score * 100).toFixed(2)}% (over ${String(scoreDenom)} executed mutants)`);

  const report: StrykeReport = {
    schemaVersion: "1",
    score,
    instrumentMs,
    workerMs,
    byStatus,
    mutations: allMutations.map((m) => ({
      ...m,
      result: collected.find((r) => r.id === m.id) ?? null,
    })),
  };
  if (cfg.reportPath) {
    mkdirSync(path.dirname(cfg.reportPath), { recursive: true });
    writeFileSync(cfg.reportPath, JSON.stringify(report, null, 2));
    log(`[stryke] report: ${cfg.reportPath}`);
  }

  const survivors = collected
    .filter((r) => r.status === "survived")
    .map((r) => allMutations.find((m) => m.id === r.id))
    .filter((m): m is Mutation => m !== undefined);
  for (const s of survivors.slice(0, 30)) {
    log(
      `  [Survived] ${s.mutator} ${s.file}:${String(s.line)}:${String(s.col)} ` +
        `${JSON.stringify(s.original)} → ${JSON.stringify(s.replacement)}`,
    );
  }
  const timedOut = collected
    .filter((r) => r.status === "timeout")
    .map((r) => allMutations.find((m) => m.id === r.id))
    .filter((m): m is Mutation => m !== undefined);
  for (const s of timedOut.slice(0, 10)) {
    log(
      `  [Timeout]  ${s.mutator} ${s.file}:${String(s.line)}:${String(s.col)} ` +
        `${JSON.stringify(s.original)} → ${JSON.stringify(s.replacement)}`,
    );
  }
  return report;
}

function harnessPath(_root: string): string {
  return path.join(import.meta.dir, "harness.ts");
}

function rewriteTestImports(
  testFile: string,
  aliases: Array<{ orig: string; instr: string }>,
): string {
  const code = readFileSync(testFile, "utf-8");
  const source = ts.createSourceFile(
    testFile,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const baseDir = path.dirname(testFile);
  interface SpliceOp { start: number; end: number; replacement: string; }
  const ops: SpliceOp[] = [];
  const visit = (node: ts.Node): void => {
    let spec: ts.StringLiteralLike | undefined;
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      spec = node.moduleSpecifier;
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      spec = node.arguments[0];
    }
    if (spec && spec.text.startsWith(".")) {
      const base = path.resolve(baseDir, spec.text);
      let resolved = base;
      for (const ext of ["", ".ts", ".tsx", ".js", ".mjs", "/index.ts"]) {
        if (existsSync(base + ext)) {
          resolved = base + ext;
          break;
        }
      }
      const alias = aliases.find((a) => a.orig === resolved);
      ops.push({
        start: spec.getStart() + 1,
        end: spec.getEnd() - 1,
        replacement: alias ? alias.instr : resolved,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  ops.sort((a, b) => b.start - a.start);
  let out = code;
  for (const op of ops) {
    out = out.slice(0, op.start) + op.replacement + out.slice(op.end);
  }
  return out;
}

/** Block of code that imports happy-dom setup (if any), the harness, the
 * instrumented modules (collecting their `__stryker_init` exports), then the
 * rewritten test files. Used by both the coordinator (for the dry-run pass)
 * and each Worker thread (so it can run covering tests). */
function emitModuleLoadBlock(
  setupPaths: string[],
  aliases: Array<{ orig: string; instr: string }>,
  rewrittenTestFiles: string[],
): string {
  const harnessAbs = path.join(import.meta.dir, "harness.ts");
  const lines: string[] = [];
  for (const sp of setupPaths) {
    lines.push(`await import(${JSON.stringify(sp)});`);
  }
  lines.push(`const __harness = await import(${JSON.stringify(harnessAbs)});`);
  lines.push(`const runTest = __harness.runTest;`);
  lines.push(`const staticHits = new Set<number>();`);
  lines.push(`(globalThis as any).__stryker_hits__ = staticHits;`);
  lines.push(`const inits: Array<() => void> = [];`);
  for (let i = 0; i < aliases.length; i++) {
    const a = aliases[i]!;
    lines.push(`try {`);
    lines.push(`  const instr${String(i)} = await import(${JSON.stringify(a.instr)});`);
    lines.push(`  if (typeof (instr${String(i)} as any).__stryker_init === "function") inits.push((instr${String(i)} as any).__stryker_init);`);
    lines.push(`} catch (e) { console.error("[w] instr import failed:", ${JSON.stringify(a.orig)}, String(e)); }`);
  }
  lines.push(`const reinit = (): void => { for (const fn of inits) fn(); };`);
  for (const t of rewrittenTestFiles) {
    lines.push(`try { await import(${JSON.stringify(t)}); } catch (e) { console.error("[w] test import failed:", ${JSON.stringify(t)}, String(e)); }`);
  }
  lines.push(`(globalThis as any).__stryker_hits__ = null;`);
  lines.push(`const reg = (globalThis as any).__stryke_registry__ as Array<{ name: string; fn: () => unknown }>;`);
  return lines.join("\n");
}

/** Single-process worker: imports everything, builds (or loads) coverage,
 * iterates mutants serially in this process. Hung mutants are caught by
 * the parent runner via heartbeat → SIGKILL → respawn.
 *
 * NOTE: an earlier prototype tried Bun Worker threads for per-mutant
 * isolation. Bun + happy-dom's `GlobalRegistrator` segfaults the runtime
 * when registered inside a spawned Worker (canary 1.3.13 — `panic:
 * Segmentation fault` from `workers_spawned` then `workers_terminated`).
 * Until that lands upstream, stay on the bun-subprocess model. */
function generateWorker(
  setupPaths: string[],
  aliases: Array<{ orig: string; instr: string }>,
  rewrittenTestFiles: string[],
): string {
  return `
const write = (s: string): void => { process.stdout.write(s); };

${emitModuleLoadBlock(setupPaths, aliases, rewrittenTestFiles)}
console.log("[worker] registered tests:", reg.length);

function withTimeoutBaseline<T>(p: Promise<T>, ms: number): Promise<T | "TIMEOUT"> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("TIMEOUT" as const), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); resolve(e); },
    );
  });
}

const mutantTests = new Map<number, number[]>();
const coveragePath = process.env.STRYKE_COVERAGE_PATH ?? "";
const fs = await import("node:fs");
let cacheLoaded = false;
if (coveragePath && fs.existsSync(coveragePath)) {
  const raw = fs.readFileSync(coveragePath, "utf-8").trim();
  if (raw.length > 0) {
    try {
      const c = JSON.parse(raw) as { mutantTests: Array<[number, number[]]> };
      for (const [id, idxs] of c.mutantTests) mutantTests.set(id, idxs);
      cacheLoaded = true;
      console.log("[worker] coverage cache hit, skipping dry-run");
    } catch (e) {
      console.error("[worker] coverage cache parse failed:", String(e));
    }
  }
}

if (!cacheLoaded) {
  const dryRunMaxMs = Number(process.env.STRYKE_DRY_RUN_MS ?? "200");
  const coverage = new Map<string, Set<number>>();
  const brokenBaseline: string[] = [];
  const slowBaseline: string[] = [];
  for (const t of reg) {
    const hits = new Set<number>();
    (globalThis as any).__M__ = null;
    (globalThis as any).__stryker_hits__ = hits;
    const t0 = performance.now();
    const r = await withTimeoutBaseline(runTest(t as any), dryRunMaxMs);
    const elapsed = performance.now() - t0;
    (globalThis as any).__stryker_hits__ = null;
    if (r === "TIMEOUT") { slowBaseline.push(t.name + " (>" + String(dryRunMaxMs) + "ms)"); continue; }
    if (r !== true) { brokenBaseline.push(t.name); continue; }
    if (elapsed > dryRunMaxMs) { slowBaseline.push(t.name + " (" + elapsed.toFixed(0) + "ms)"); continue; }
    coverage.set(t.name, hits);
  }
  if (brokenBaseline.length > 0) console.error("[worker] baseline failures (" + String(brokenBaseline.length) + "): " + brokenBaseline.slice(0, 3).join(" | "));
  if (slowBaseline.length > 0) console.error("[worker] slow tests excluded (" + String(slowBaseline.length) + "): " + slowBaseline.slice(0, 3).join(" | "));

  reg.forEach((t, i) => {
    const hits = coverage.get(t.name);
    if (!hits) return;
    for (const id of hits) {
      let arr = mutantTests.get(id);
      if (!arr) { arr = []; mutantTests.set(id, arr); }
      arr.push(i);
    }
  });

  // Static-mutant attribution: a static mutant only fires at module load,
  // so per-test runtime coverage misses it. Narrow the attached test set
  // to tests that exercised *the same file* as the static mutant (derived
  // from their runtime hits). Falls back to all tests for mutants whose
  // file no test ever touched.
  const allTestIdxs = reg.map((_, i) => i);
  const metaPath = process.env.STRYKE_MUTANT_META_PATH ?? "";
  const mutantToFile = new Map<number, string>();
  if (metaPath && fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as { mutantFile: Array<[number, string]> };
      for (const [id, file] of meta.mutantFile) mutantToFile.set(id, file);
    } catch (e) {
      console.error("[worker] mutant-meta load failed:", String(e));
    }
  }
  const testFiles: Array<Set<string>> = reg.map(() => new Set<string>());
  reg.forEach((t, i) => {
    const hits = coverage.get(t.name);
    if (!hits) return;
    const seen = testFiles[i]!;
    for (const id of hits) {
      const f = mutantToFile.get(id);
      if (f) seen.add(f);
    }
  });
  for (const id of staticHits) {
    const file = mutantToFile.get(id);
    if (!file) { mutantTests.set(id, allTestIdxs); continue; }
    const tests: number[] = [];
    reg.forEach((_, i) => { if (testFiles[i]!.has(file)) tests.push(i); });
    mutantTests.set(id, tests.length > 0 ? tests : allTestIdxs);
  }

  if (coveragePath) {
    try { fs.writeFileSync(coveragePath, JSON.stringify({ mutantTests: Array.from(mutantTests.entries()) })); }
    catch (e) { console.error("[worker] coverage cache write failed:", String(e)); }
  }
}

const mutantIdsToRun = JSON.parse(process.env.STRYKE_MUTANT_IDS ?? "[]") as number[];
/** Per-test budget — single test cannot exceed this. */
const timeoutMs = Number(process.env.STRYKE_TIMEOUT_MS ?? "400");
/** Per-mutant total budget — entire covering-test loop must finish within
 * this many ms. Caps how much a single slow mutant can drain. */
const mutantBudgetMs = Number(process.env.STRYKE_MUTANT_BUDGET_MS ?? "800");

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | "TIMEOUT"> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("TIMEOUT" as const), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); resolve(e); },
    );
  });
}

let prevWasStatic = true; // first iteration always needs init
for (const id of mutantIdsToRun) {
  if (!mutantTests.has(id)) {
    write("RESULT " + JSON.stringify({ id, status: "no-coverage", durationMs: 0 }) + "\\n");
    continue;
  }
  write("START " + String(id) + "\\n");
  const start = process.hrtime.bigint();
  (globalThis as any).__M__ = id;
  // reinit() re-runs every lifted top-level assignment. Only needed when
  // either the current or the previous mutant lives in lifted state — for
  // long runs of consecutive dynamic mutants we'd otherwise pay ~10-30ms
  // of pointless work per mutant.
  const isStatic = staticHits.has(id);
  let initError: unknown = null;
  if (isStatic || prevWasStatic) {
    try { reinit(); } catch (e) { initError = e; }
  }
  prevWasStatic = isStatic;
  if (initError !== null) {
    (globalThis as any).__M__ = null;
    try { reinit(); } catch {}
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    write("RESULT " + JSON.stringify({
      id,
      status: "killed",
      durationMs,
      killers: ["__stryker_init threw: " + String(initError)],
    }) + "\\n");
    continue;
  }
  const tIdxs = mutantTests.get(id)!;
  let killed = false;
  const killers: string[] = [];
  let timedOut = false;
  for (const i of tIdxs) {
    const t = reg[i];
    if (!t) continue;
    const result = await withTimeout(runTest(t as any), timeoutMs);
    if (result === "TIMEOUT") { timedOut = true; break; }
    if (result !== true) {
      killed = true;
      killers.push(t.name);
      break;
    }
    if (Number(process.hrtime.bigint() - start) / 1e6 > mutantBudgetMs) { timedOut = true; break; }
  }
  const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
  const payload: any = {
    id,
    status: killed ? "killed" : timedOut ? "timeout" : "survived",
    durationMs,
  };
  if (killed) payload.killers = killers;
  write("RESULT " + JSON.stringify(payload) + "\\n");
}
(globalThis as any).__M__ = null;
reinit();
`;
}

if (import.meta.main) {
  await runStryke(loadConfig(process.cwd()));
}
