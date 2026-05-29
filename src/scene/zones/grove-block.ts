/**
 * GROVE zone (design docs/design/03). Typed-recall: a dormant resident needs
 * you; its gloss + pos are the cue; you TYPE its Norwegian name to wake it
 * (target hidden until after the attempt). Autograded by suggestGradeFromTyping,
 * recorded through FSRS. Produces a BlockOutcome (kind "lex") so it composes
 * behind the engine seam. The cozy art is a per-species hue-rotated template
 * (atlas.speciesSprite) — dormant→awake on a successful wake (grade ≥ hard).
 *
 * Self-paced (typed recall is not RT-graded — Roediger/Karpicke): no trial-clock
 * RT, but the wake animation only fires AFTER the grade is recorded.
 */

import type { Sprite, Ticker } from "pixi.js";
import type { VocabDeck } from "../../content/deck";
import { speciesFor } from "../../content/species";
import type {
  BlockEndReason,
  BlockHandle,
  BlockOutcome,
} from "../../engine/block";
import { buildGroveQueue } from "../../games/grove-session";
import { recordReview, suggestGradeFromTyping } from "../../games/lex-srs";
import { createStage } from "../pixi-stage";

export interface GroveOptions {
  container: HTMLElement;
  deck: VocabDeck;
  deckId?: string;
  today?: string;
  maxTrials?: number;
  onComplete: (outcome: BlockOutcome) => void;
}

interface GroveState {
  trial: number;
  total: number;
  woke: number;
  lastGrade: string;
  phase: "answering" | "revealed" | "done";
}

const W = 320;
const H = 240;

function el(root: HTMLElement, id: string): HTMLElement {
  const e = root.querySelector<HTMLElement>(`#${id}`);
  if (!e) throw new Error(`Grove: missing #${id}`);
  return e;
}

export function createGroveBlock(opts: GroveOptions): BlockHandle {
  const deckId = opts.deckId ?? "no";
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const cap = opts.maxTrials ?? 6;
  const queue = buildGroveQueue(opts.deck, deckId, today, cap);

  const stageHost = el(opts.container, "stage");
  const cueEl = el(opts.container, "grove-cue");
  const posEl = el(opts.container, "grove-pos");
  const input = el(opts.container, "grove-input") as HTMLInputElement;
  const revealEl = el(opts.container, "grove-reveal");
  const progressEl = el(opts.container, "grove-progress");
  const submitEl = el(opts.container, "grove-submit");

  const state: GroveState = {
    trial: 0,
    total: queue.length,
    woke: 0,
    lastGrade: "",
    phase: "answering",
  };
  let points = 0;
  let ended = false;
  let stopTicker: (() => void) | null = null;
  const startMs = performance.now();
  (window as unknown as { __grove?: GroveState }).__grove = state;

  function finish(reason: BlockEndReason): void {
    if (ended) return;
    ended = true;
    state.phase = "done";
    input.disabled = true;
    stopTicker?.();
    opts.onComplete({
      kind: "lex",
      endReason: reason,
      trials: state.trial,
      correct: state.woke,
      points,
      accuracy: state.total === 0 ? 0 : state.woke / state.total,
      durationMs: performance.now() - startMs,
      meta: { woke: state.woke, deckId },
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
    let current: Sprite | null = null;
    let pop = 0;

    function place(entryIdx: number, dormant: boolean): void {
      const entry = queue[entryIdx];
      if (!entry) return;
      app.stage.removeChildren();
      const sp = atlas.speciesSprite(
        speciesFor(deckId, entry, opts.deck.manifest),
        dormant,
      );
      sp.x = W / 2;
      sp.y = H * 0.82;
      app.stage.addChild(sp);
      current = sp;
    }

    function showResident(): void {
      const entry = queue[state.trial];
      if (!entry) {
        finish("completed");
        return;
      }
      place(state.trial, true);
      cueEl.textContent = entry.gloss;
      posEl.textContent = entry.pos;
      revealEl.textContent = "";
      revealEl.dataset.grade = "";
      input.value = "";
      input.disabled = false;
      input.focus();
      state.phase = "answering";
      progressEl.textContent = `${String(state.trial + 1)} / ${String(state.total)}`;
    }

    function answer(): void {
      const entry = queue[state.trial];
      if (!entry || state.phase !== "answering") return;
      const grade = suggestGradeFromTyping(input.value, entry.label);
      recordReview(deckId, entry.entryId, grade, today); // grade before cosmetics
      state.lastGrade = grade;
      const woke = grade !== "again";
      if (woke) {
        state.woke++;
        points += grade === "good" ? 3 : 1;
        place(state.trial, false); // dormant → awake
        pop = 1;
      }
      const tag =
        grade === "good"
          ? " — wide awake!"
          : grade === "hard"
            ? " — stirring"
            : " — still drowsing";
      revealEl.textContent = `${woke ? "✿" : "💤"} ${entry.label}${tag}`;
      revealEl.dataset.grade = grade;
      state.phase = "revealed"; // input stays enabled so Enter advances
    }

    function step(): void {
      if (state.phase === "answering") answer();
      else if (state.phase === "revealed") {
        state.trial++;
        if (state.trial >= state.total) finish("completed");
        else showResident();
      }
    }

    input.addEventListener("keydown", (ev) => {
      if ((ev as KeyboardEvent).key === "Enter") {
        ev.preventDefault();
        step();
      }
    });
    submitEl.addEventListener("click", step);

    app.ticker.add((t: Ticker) => {
      if (current && pop > 0) {
        pop = Math.max(0, pop - t.deltaMS / 220);
        current.scale.set(1 + 0.18 * pop);
      }
    });

    showResident();
    (window as unknown as { __groveReady?: boolean }).__groveReady = true;
  })();

  return {
    abort: () => {
      finish("aborted");
    },
  };
}
