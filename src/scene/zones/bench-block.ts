/**
 * PROPAGATION BENCH zone (design docs/design/03 §3). Mental rotation: a grown
 * specimen (board B) sits rotated/mirrored beside its parent footprint (board A).
 * You judge SAME / MOVED under RT pressure — committed BEFORE any cosmetic drag
 * (guardrail 4) — and the trial-clock anchors onset POST-PAINT so RT is clean
 * (guardrail 1). The crown-rotation engine is reused verbatim; RT-by-transform
 * is logged to meta for empirical validity (VH-9). Emits BlockOutcome (kind
 * "crown").
 */

import { Graphics, type Sprite } from "pixi.js";
import type {
  BlockEndReason,
  BlockHandle,
  BlockOutcome,
} from "../../engine/block";
import {
  classifyResponse,
  crownClassKey,
  deriveCrownGrade,
  generateTrial,
  type Piece,
  squareToFileRank,
  type Trial,
  type TrialKind,
  transformLabel,
} from "../../games/crown-rotation";
import { recordReview } from "../../shared/fsrs";
import { seededRng } from "../../shared/rng";
import { createStage } from "../pixi-stage";
import { browserScheduler, TrialClock } from "../trial-clock";

export interface BenchOptions {
  container: HTMLElement;
  stage?: number;
  today?: string;
  maxTrials?: number;
  seed?: string;
  onComplete: (outcome: BlockOutcome) => void;
}

const CELL = 17;
const BOARD = CELL * 8;
const GAP = 28;
const W = BOARD * 2 + GAP + 16;
const H = BOARD + 16;
const PIECE_SCALE = (CELL * 0.95) / 48;

function el(root: HTMLElement, id: string): HTMLElement {
  const e = root.querySelector<HTMLElement>(`#${id}`);
  if (!e) throw new Error(`Bench: missing #${id}`);
  return e;
}

interface BenchState {
  trial: number;
  total: number;
  correct: number;
  phase: "judging" | "revealed" | "done";
}

export function createBenchBlock(opts: BenchOptions): BlockHandle {
  const stage = opts.stage ?? 1;
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const total = opts.maxTrials ?? 6;
  const seedBase = opts.seed ?? "bench";

  const stageHost = el(opts.container, "stage");
  const cueEl = el(opts.container, "bench-cue");
  const sameBtn = el(opts.container, "bench-same") as HTMLButtonElement;
  const movedBtn = el(opts.container, "bench-moved") as HTMLButtonElement;
  const revealEl = el(opts.container, "bench-reveal");
  const progressEl = el(opts.container, "bench-progress");

  const state: BenchState = { trial: 0, total, correct: 0, phase: "judging" };
  let points = 0;
  let ended = false;
  let stopTicker: (() => void) | null = null;
  const rtByTransform: Record<string, number[]> = {};
  const startMs = performance.now();
  (window as unknown as { __bench?: BenchState }).__bench = state;

  function finish(reason: BlockEndReason): void {
    if (ended) return;
    ended = true;
    state.phase = "done";
    sameBtn.disabled = true;
    movedBtn.disabled = true;
    stopTicker?.();
    opts.onComplete({
      kind: "crown",
      endReason: reason,
      trials: state.trial,
      correct: state.correct,
      points,
      accuracy: state.total === 0 ? 0 : state.correct / state.total,
      durationMs: performance.now() - startMs,
      meta: { rtByTransform },
    });
  }

  void (async () => {
    const { app, atlas } = await createStage(stageHost, {
      width: W,
      height: H,
    });
    stopTicker = () => {
      app.ticker.stop();
    };

    function renderBoard(pieces: readonly Piece[], x0: number): void {
      const frame = new Graphics()
        .rect(x0, 8, BOARD, BOARD)
        .fill({ color: 0x232634 })
        .stroke({ color: 0x51576d, width: 1 });
      app.stage.addChild(frame);
      for (const p of pieces) {
        const { file, rank } = squareToFileRank(p.sq);
        const sp: Sprite = atlas.sprite(`bench:${p.role}`, 0.5, 0.5);
        sp.scale.set(PIECE_SCALE);
        sp.x = x0 + file * CELL + CELL / 2;
        sp.y = 8 + (7 - rank) * CELL + CELL / 2;
        if (p.color === "b") sp.tint = 0x8aa0d0; // cool tint distinguishes black
        app.stage.addChild(sp);
      }
    }

    function renderTrial(t: Trial): void {
      app.stage.removeChildren();
      renderBoard(t.a, 8); // parent footprint
      renderBoard(t.b, 8 + BOARD + GAP); // grown specimen (already transformed)
    }

    let clock: TrialClock | null = null;
    let currentTrial: Trial | null = null;

    function showTrial(): void {
      const t = generateTrial(
        stage,
        seededRng(`${seedBase}:${String(state.trial)}`),
      );
      cueEl.textContent = `Parent → ${transformLabel(t.transform)} → specimen. Same arrangement, or a plant moved?`;
      revealEl.textContent = "";
      revealEl.dataset.grade = "";
      sameBtn.disabled = true;
      movedBtn.disabled = true;
      progressEl.textContent = `${String(state.trial + 1)} / ${String(state.total)}`;

      clock = new TrialClock(browserScheduler());
      clock.armTrial(
        () => {
          renderTrial(t);
        },
        () => {
          sameBtn.disabled = false;
          movedBtn.disabled = false;
        },
      );
      currentTrial = t;
    }

    function judge(pressed: TrialKind, ev?: Event): void {
      if (state.phase !== "judging" || !clock?.armed || !currentTrial) return;
      const rt = clock.recordResponse(ev as { timeStamp?: number } | undefined);
      const { correct } = classifyResponse(currentTrial, pressed);
      const grade = deriveCrownGrade(correct, rt);
      recordReview(crownClassKey(currentTrial), grade, today); // grade before cosmetics
      const rts = rtByTransform[currentTrial.transform] ?? [];
      rts.push(Math.round(rt));
      rtByTransform[currentTrial.transform] = rts;
      if (correct) {
        state.correct++;
        points += grade === "easy" ? 5 : grade === "good" ? 3 : 1;
      }
      revealEl.textContent = correct
        ? `✓ ${currentTrial.kind === "same" ? "Same — true to its parent" : "Moved — well spotted"} (${String(Math.round(rt))} ms)`
        : `✗ it was ${currentTrial.kind === "same" ? "the SAME" : "MOVED"}`;
      revealEl.dataset.grade = grade;
      clock.settle();
      state.phase = "revealed";
    }

    function step(): void {
      if (state.phase !== "revealed") return;
      state.trial++;
      if (state.trial >= state.total) finish("completed");
      else {
        state.phase = "judging";
        showTrial();
      }
    }

    sameBtn.addEventListener("click", (ev) => {
      if (state.phase === "judging") judge("same", ev);
    });
    movedBtn.addEventListener("click", (ev) => {
      if (state.phase === "judging") judge("different", ev);
    });
    revealEl.addEventListener("click", step);
    el(opts.container, "bench-next").addEventListener("click", step);

    showTrial();
    (window as unknown as { __benchReady?: boolean }).__benchReady = true;
  })();

  return {
    abort: () => {
      finish("aborted");
    },
  };
}
