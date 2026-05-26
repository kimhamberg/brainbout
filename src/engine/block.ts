/**
 * Block widget contract.
 *
 * A *block* is a self-contained run of one game's trials. In solo mode the
 * block IS the session. In Cycle/Daily/Quickdraw modes (Phase 2+) a session
 * stitches multiple blocks together: { lex block } → { crown block } → ...
 *
 * Each game exports a `create<X>Block` factory that conforms to BlockFactory.
 * The factory:
 *   - takes a DOM container + an onComplete callback
 *   - renders its own UI inside the container
 *   - manages its own input/event listeners scoped to that container
 *   - calls onComplete exactly once with a BlockOutcome when the block ends
 *
 * Note: storage side-effects (recordSessionScore, recordResult) and navigation
 * are NOT the block's concern. Whoever owns the block reads the outcome and
 * decides what to persist. Lets us reuse blocks in non-solo contexts later.
 */

export type BlockKind = "lex" | "crown" | "flux";

export type BlockEndReason = "completed" | "failed" | "aborted";

export interface BlockOutcome {
  kind: BlockKind;
  endReason: BlockEndReason;
  /** Total trials the user attempted (including timeouts). */
  trials: number;
  /** Trials judged correct. */
  correct: number;
  /** Cumulative points awarded inside the block. */
  points: number;
  /** correct / trials, or 0 when trials === 0. */
  accuracy: number;
  /** Wall-clock duration of the block in ms. */
  durationMs: number;
  /** Per-game payload (peak streak, mastered count, etc.). */
  meta: Record<string, unknown>;
}

export interface BlockHandle {
  /**
   * Stop the block early. Triggers onComplete with endReason="aborted" if
   * the block had not yet ended. No-op once the block has already ended.
   */
  abort(): void;
}

export interface BlockOptions {
  /** Where to render. The block clears and owns this container's contents. */
  container: HTMLElement;
  /** Called exactly once when the block ends (completed, failed, or aborted). */
  onComplete: (outcome: BlockOutcome) => void;
  /** Max trials before the block auto-ends. Game-specific defaults apply when omitted. */
  maxTrials?: number;
  /** Max wall-clock duration before the block auto-ends. Optional. */
  maxDurationMs?: number;
  /** Difficulty stage 1-3. Defaults to the game's persisted stage. */
  stage?: number;
}

export type BlockFactory = (opts: BlockOptions) => BlockHandle;
