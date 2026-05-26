/**
 * Test harness loaded by every stryke worker.
 *
 * Responsibilities:
 *   1. Mock `bun:test` so `test()` calls register into a registry rather
 *      than execute immediately.
 *   2. Expose `$stryker_M(id)` to instrumented source. While we record
 *      hits (for perTest coverage) and return whether `__M__ === id`.
 *   3. Provide programmatic test invocation with arbitrary `__M__` values.
 *
 * The worker imports the (instrumented) source-under-test and test files
 * AFTER this preload runs.
 */

import { mock } from "bun:test";

interface RegisteredTest {
  name: string;
  fn: () => unknown | Promise<unknown>;
  /** beforeEach/afterEach hooks captured at registration time. */
  beforeEach: Array<() => unknown | Promise<unknown>>;
  afterEach: Array<() => unknown | Promise<unknown>>;
  beforeAll: Array<() => unknown | Promise<unknown>>;
  afterAll: Array<() => unknown | Promise<unknown>>;
}

declare global {
  // biome-ignore lint/style/noVar: globals
  var __M__: number | null;
  // biome-ignore lint/style/noVar: globals
  var __stryker_hits__: Set<number> | null;
  // biome-ignore lint/style/noVar: globals
  var __stryke_registry__: RegisteredTest[];
  // biome-ignore lint/style/noVar: globals
  var $stryker_M: (id: number) => boolean;
}

globalThis.__M__ = null;
globalThis.__stryker_hits__ = null;
globalThis.__stryke_registry__ = [];

globalThis.$stryker_M = (id: number): boolean => {
  const hits = globalThis.__stryker_hits__;
  if (hits !== null) hits.add(id);
  return globalThis.__M__ === id;
};

// State stacks captured at module-load time during the "registration" pass.
const beforeEachStack: Array<() => unknown | Promise<unknown>> = [];
const afterEachStack: Array<() => unknown | Promise<unknown>> = [];
const beforeAllStack: Array<() => unknown | Promise<unknown>> = [];
const afterAllStack: Array<() => unknown | Promise<unknown>> = [];
const descStack: string[] = [];

function formatName(template: string, args: readonly unknown[]): string {
  let i = 0;
  return template.replace(/%[sdjofi%]/g, (token) => {
    if (token === "%%") return "%";
    const v = args[i++];
    if (token === "%j") return JSON.stringify(v);
    return String(v);
  });
}

interface BunTestModule {
  test: ((name: string, fn: () => unknown) => void) & {
    each: <T extends readonly unknown[]>(rows: readonly T[]) => (
      name: string,
      fn: (...row: T) => unknown,
    ) => void;
    skip: (name: string, fn?: () => unknown) => void;
    only: (name: string, fn: () => unknown) => void;
    todo: (name: string, fn?: () => unknown) => void;
  };
  it: BunTestModule["test"];
  describe: ((name: string, fn: () => void) => void) & {
    each: <T extends readonly unknown[]>(rows: readonly T[]) => (
      name: string,
      fn: (...row: T) => void,
    ) => void;
    skip: (name: string, fn: () => void) => void;
  };
  beforeEach: (fn: () => unknown) => void;
  afterEach: (fn: () => unknown) => void;
  beforeAll: (fn: () => unknown) => void;
  afterAll: (fn: () => unknown) => void;
}

mock.module("bun:test", () => {
  const real = require("bun:test");

  const register = (name: string, fn: () => unknown): void => {
    const full = [...descStack, name].join(" > ");
    globalThis.__stryke_registry__.push({
      name: full,
      fn,
      beforeEach: [...beforeEachStack],
      afterEach: [...afterEachStack],
      beforeAll: [...beforeAllStack],
      afterAll: [...afterAllStack],
    });
  };

  const eachTest = <T extends readonly unknown[]>(rows: readonly T[]) => (
    name: string,
    fn: (...row: T) => unknown,
  ): void => {
    for (const row of rows) {
      const args = (Array.isArray(row) ? row : [row]) as unknown as T;
      const formatted = formatName(name, args);
      register(formatted, () => fn(...args));
    }
  };

  const testFn = ((name: string, fn: () => unknown) => register(name, fn)) as BunTestModule["test"];
  testFn.each = eachTest as BunTestModule["test"]["each"];
  testFn.skip = (_name: string, _fn?: () => unknown) => {};
  testFn.only = (name: string, fn: () => unknown) => register(name, fn);
  testFn.todo = (_name: string, _fn?: () => unknown) => {};

  const describeFn = ((name: string, fn: () => void) => {
    descStack.push(name);
    const beLen = beforeEachStack.length;
    const aeLen = afterEachStack.length;
    const baLen = beforeAllStack.length;
    const aaLen = afterAllStack.length;
    try {
      fn();
    } finally {
      descStack.pop();
      beforeEachStack.length = beLen;
      afterEachStack.length = aeLen;
      beforeAllStack.length = baLen;
      afterAllStack.length = aaLen;
    }
  }) as BunTestModule["describe"];
  describeFn.each = <T extends readonly unknown[]>(rows: readonly T[]) => (
    name: string,
    fn: (...row: T) => void,
  ): void => {
    for (const row of rows) {
      const args = (Array.isArray(row) ? row : [row]) as unknown as T;
      const formatted = formatName(name, args);
      describeFn(formatted, () => fn(...args));
    }
  };
  describeFn.skip = (_name: string, _fn: () => void) => {};

  return {
    ...real,
    test: testFn,
    it: testFn,
    describe: describeFn,
    beforeEach: (fn: () => unknown) => beforeEachStack.push(fn),
    afterEach: (fn: () => unknown) => afterEachStack.push(fn),
    beforeAll: (fn: () => unknown) => beforeAllStack.push(fn),
    afterAll: (fn: () => unknown) => afterAllStack.push(fn),
  };
});

/**
 * Tracks which `beforeAll` hooks have already been invoked so we don't run
 * them twice while iterating tests. The corresponding `afterAll` hooks are
 * collected and replayed in reverse order at the end of the worker via
 * `runFinalize()`.
 */
const ranBeforeAll = new WeakSet<() => unknown>();
const pendingAfterAll: Array<() => unknown | Promise<unknown>> = [];

export async function runTest(t: RegisteredTest): Promise<true | Error> {
  try {
    for (const h of t.beforeAll) {
      if (!ranBeforeAll.has(h)) {
        ranBeforeAll.add(h);
        await h();
      }
    }
    for (const h of t.afterAll) {
      if (!pendingAfterAll.includes(h)) pendingAfterAll.push(h);
    }
    for (const h of t.beforeEach) await h();
    await t.fn();
    for (const h of t.afterEach) await h();
    return true;
  } catch (e) {
    return e instanceof Error ? e : new Error(String(e));
  }
}

export async function runFinalize(): Promise<void> {
  for (let i = pendingAfterAll.length - 1; i >= 0; i--) {
    const h = pendingAfterAll[i];
    if (!h) continue;
    try {
      await h();
    } catch {
      /* swallow — finalize errors aren't useful per-mutant signal */
    }
  }
  pendingAfterAll.length = 0;
}
