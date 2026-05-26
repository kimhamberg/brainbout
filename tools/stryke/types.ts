/** Shared types across the stryke pipeline. */

export interface Mutation {
  /** Globally unique mutant id. */
  id: number;
  /** Source file path relative to project root. */
  file: string;
  /** Byte offset (start, end exclusive) in the original source. */
  start: number;
  end: number;
  /** 1-indexed line + col for reporting. */
  line: number;
  col: number;
  /** Mutator name, e.g. "EqualityOperator". */
  mutator: string;
  /** Original substring (debug). */
  original: string;
  /** Replacement code injected when this mutant is active. */
  replacement: string;
}

/**
 * Mutant outcome.
 *
 * - `killed`:     a covering test failed under this mutant.
 * - `survived`:   every covering test passed — mutation is undetectable.
 * - `timeout`:    a covering test exceeded the per-mutant time budget OR
 *                 the runner-side watchdog killed a hung worker. Either way
 *                 the mutant was actually executed and *something* bad
 *                 happened; counts toward the kill score.
 * - `no-coverage`: no test covers this mutant (dry-run never hit it).
 * - `unrun`:      the wall-clock cap fired before the runner could test
 *                 this mutant. Excluded from the score's denominator.
 */
export type MutantStatus =
  | "killed"
  | "survived"
  | "timeout"
  | "no-coverage"
  | "unrun";

export interface MutantResult {
  id: number;
  status: MutantStatus;
  /** Test names that failed (proves the kill). */
  killers?: string[];
  /** Elapsed ms for the per-mutant run. */
  durationMs: number;
}
