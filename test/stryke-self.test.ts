import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import { instrumentFile } from "../tools/stryke/instrument";
import {
  type Config,
  runStryke,
  type StrykeReport,
} from "../tools/stryke/runner";

function makeFixture(
  src: string,
  testSrc: string,
): {
  root: string;
  cleanup: () => void;
} {
  const root = mkdtempSync(path.join(os.tmpdir(), "stryke-self-"));
  mkdirSync(path.join(root, "src"));
  mkdirSync(path.join(root, "test"));
  writeFileSync(path.join(root, "src/target.ts"), src);
  writeFileSync(path.join(root, "test/target.test.ts"), testSrc);
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function fixtureConfig(root: string, overrides?: Partial<Config>): Config {
  return {
    root,
    mutate: ["src/target.ts"],
    testFiles: [path.join(root, "test/target.test.ts")],
    tmpDir: path.join(root, ".stryke-tmp"),
    timeoutMs: 300,
    heartbeatMs: 500,
    perMutantBudgetMs: 1000,
    wallclockMs: 10_000,
    maxRespawns: 4,
    quiet: true,
    ...overrides,
  };
}

test("stryke finishes within wallclock when a mutant infinite-loops", async () => {
  const { root, cleanup } = makeFixture(
    `export function countdown(n: number): number {
  let i = n;
  while (i > 0) i--;
  return i;
}
`,
    "",
  );
  try {
    writeFileSync(
      path.join(root, "test/target.test.ts"),
      `import { test, expect } from "bun:test";
import { countdown } from "../src/target.ts";
test("countdown(0) === 0", () => { expect(countdown(0)).toBe(0); });
test("countdown(3) === 0", () => { expect(countdown(3)).toBe(0); });
`,
    );
    const t0 = Date.now();
    const report: StrykeReport = await runStryke(fixtureConfig(root));
    const elapsed = Date.now() - t0;

    expect(elapsed).toBeLessThan(15_000);
    // Loop-guard instrumentation throws STRYKE_LOOP_LIMIT once the iteration
    // counter overflows, so an infinite-loop mutant gets `killed`, not
    // `timeout`. Either status is acceptable proof the runner doesn't hang.
    expect(report.byStatus.killed + report.byStatus.timeout).toBeGreaterThan(0);
    expect(report.mutations.length).toBeGreaterThan(0);
    const total =
      report.byStatus.killed +
      report.byStatus.survived +
      report.byStatus.timeout +
      report.byStatus["no-coverage"];
    expect(total).toBe(report.mutations.length);
  } finally {
    cleanup();
  }
}, 20_000);

test("stryke loop-guard instrumentation accounts for every mutant", async () => {
  // With loop-guards, sync infinite-loop mutants throw immediately rather
  // than hanging — so wallclock-cap dynamics are hard to exercise from a
  // pure-loop fixture. We instead verify the runner returns a status for
  // every mutant under a tight wallclock, which is the property we actually
  // care about for "no infinite loops".
  const { root, cleanup } = makeFixture(
    `export function loops(n: number): number {
  let a = n;
  while (a > 0) a--;
  let b = n;
  while (b > 0) b--;
  return a + b;
}
`,
    "",
  );
  try {
    writeFileSync(
      path.join(root, "test/target.test.ts"),
      `import { test, expect } from "bun:test";
import { loops } from "../src/target.ts";
test("loops(0) === 0", () => { expect(loops(0)).toBe(0); });
`,
    );
    const t0 = Date.now();
    const report = await runStryke(
      fixtureConfig(root, { wallclockMs: 5_000, maxRespawns: 2 }),
    );
    const elapsed = Date.now() - t0;

    expect(elapsed).toBeLessThan(8_000);
    const accounted =
      report.byStatus.killed +
      report.byStatus.survived +
      report.byStatus.timeout +
      report.byStatus["no-coverage"] +
      report.byStatus.unrun;
    expect(accounted).toBe(report.mutations.length);
  } finally {
    cleanup();
  }
}, 15_000);

test("instrumented files always reparse cleanly (round-trip)", () => {
  // Catches the "Unexpected &&" / "Unexpected token" class of bugs where the
  // emitter produces invalid TypeScript. Iterates every file the production
  // config mutates and re-parses the instrumented output.
  const root = process.cwd();
  const mutate = [
    "src/games/lex-logic.ts",
    "src/games/lex-srs.ts",
    "src/games/crown-rotation.ts",
    "src/games/flux-engine.ts",
    "src/shared/assert.ts",
    "src/shared/base.ts",
    "src/shared/rng.ts",
    "src/shared/theme.ts",
    "src/shared/timer.ts",
    "src/shared/stages.ts",
    "src/shared/sounds.ts",
    "src/shared/progress.ts",
    "src/shared/icons.ts",
    "src/hub.ts",
    "src/hub-render.ts",
  ];
  let nextId = 0;
  for (const rel of mutate) {
    const abs = path.join(root, rel);
    const { result, nextId: nextIdAfter } = instrumentFile(abs, root, nextId);
    nextId = nextIdAfter;
    const reparsed = ts.createSourceFile(
      rel,
      result.code,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const diagnostics =
      (reparsed as unknown as { parseDiagnostics?: ts.Diagnostic[] })
        .parseDiagnostics ?? [];
    if (diagnostics.length > 0) {
      const msg = diagnostics
        .map(
          (d) =>
            `${rel}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`,
        )
        .join("\n");
      throw new Error(`Instrumented output failed to re-parse:\n${msg}`);
    }
  }
});

test("loop-guard catches sync infinite loops from every loop construct", async () => {
  const { root, cleanup } = makeFixture(
    `export function whileLoop(n: number): number {
  let i = n;
  while (i > 0) i--;
  return i;
}
export function doLoop(n: number): number {
  let i = n;
  do { i--; } while (i > 0);
  return i;
}
export function forLoop(n: number): number {
  let s = 0;
  for (let i = 0; i < n; i++) s += i;
  return s;
}
export function forOfLoop(arr: number[]): number {
  let s = 0;
  for (const x of arr) s += x;
  return s;
}
`,
    "",
  );
  try {
    writeFileSync(
      path.join(root, "test/target.test.ts"),
      `import { test, expect } from "bun:test";
import { whileLoop, doLoop, forLoop, forOfLoop } from "../src/target.ts";
test("while", () => { expect(whileLoop(3)).toBe(0); });
test("do", () => { expect(doLoop(3)).toBe(0); });
test("for", () => { expect(forLoop(4)).toBe(6); });
test("for-of", () => { expect(forOfLoop([1,2,3])).toBe(6); });
`,
    );
    const t0 = Date.now();
    const report = await runStryke(
      fixtureConfig(root, { wallclockMs: 10_000 }),
    );
    const elapsed = Date.now() - t0;

    expect(elapsed).toBeLessThan(12_000);
    // No mutant should escape as "hung" — wallclock-marked timeouts have
    // durationMs === 0 (the runner stamps them after the cap fires).
    // Loop-guard-killed ones have positive durationMs and status "killed".
    const escapedHangs = report.mutations.filter(
      (m) =>
        m.result?.status === "timeout" && (m.result?.durationMs ?? 0) === 0,
    );
    expect(escapedHangs.length).toBe(0);
  } finally {
    cleanup();
  }
}, 15_000);

test("stryke kills mutants and reports them", async () => {
  const { root, cleanup } = makeFixture(
    `export function add(a: number, b: number): number {
  return a + b;
}
`,
    "",
  );
  try {
    writeFileSync(
      path.join(root, "test/target.test.ts"),
      `import { test, expect } from "bun:test";
import { add } from "../src/target.ts";
test("add", () => { expect(add(2, 3)).toBe(5); });
test("add neg", () => { expect(add(-1, 1)).toBe(0); });
`,
    );
    const report = await runStryke(fixtureConfig(root));
    expect(report.byStatus.killed).toBeGreaterThan(0);
    expect(report.byStatus.timeout).toBe(0);
  } finally {
    cleanup();
  }
}, 15_000);
