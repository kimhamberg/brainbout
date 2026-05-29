/**
 * GROVE zone (design docs/design/03-04). Typed-recall: a dormant resident shows
 * its gloss + pos; you name it to wake it (target hidden until after the
 * attempt), autograded → FSRS → dormant sprite recolours to awake. Now ramped by
 * the curriculum stage (stages.ts):
 *   stage 1 → MCQ (recognise the seedling — 4 options)
 *   stage 2 → cloze (first-letter + length hint, then type)
 *   stage 3 → typed (free production — the testing-effect keystone)
 * Recognition (MCQ) grades a correct answer as "hard" (lower stability than a
 * typed "good") so the scaffold can't masquerade as full recall. Emits
 * BlockOutcome (kind "lex"). Self-paced; the wake fires only AFTER the grade.
 */

import type { Sprite } from "pixi.js";
import type { VocabDeck } from "../../content/deck";
import { speciesFor } from "../../content/species";
import type {
  BlockEndReason,
  BlockHandle,
  BlockOutcome,
} from "../../engine/block";
import {
  buildGroveQueue,
  canRelearn,
  type GroveMode,
  groveMode,
  groveOptions,
  promotionCredit,
} from "../../games/grove-session";
import { recordReview, suggestGradeFromTyping } from "../../games/lex-srs";
import { seededRng } from "../../shared/rng";
import { getStage } from "../../shared/stages";
import { createStage } from "../pixi-stage";

export interface GroveOptions {
  container: HTMLElement;
  deck: VocabDeck;
  deckId?: string;
  today?: string;
  maxTrials?: number;
  /** Override the curriculum stage (else getStage("lex")). */
  stage?: number;
  onComplete: (outcome: BlockOutcome) => void;
}

interface GroveState {
  trial: number;
  total: number;
  woke: number;
  lastGrade: string;
  mode: GroveMode;
  answer: string; // correct label this resident (test hook)
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
  const mode = groveMode(opts.stage ?? getStage("lex"));
  const queue = buildGroveQueue(opts.deck, deckId, today, cap);

  const stageHost = el(opts.container, "stage");
  const cueEl = el(opts.container, "grove-cue");
  const posEl = el(opts.container, "grove-pos");
  const hintEl = el(opts.container, "grove-hint");
  const input = el(opts.container, "grove-input") as HTMLInputElement;
  const submitEl = el(opts.container, "grove-submit");
  const optionsEl = el(opts.container, "grove-options");
  const revealEl = el(opts.container, "grove-reveal");
  const nextEl = el(opts.container, "grove-next");
  const progressEl = el(opts.container, "grove-progress");

  const state: GroveState = {
    trial: 0,
    total: queue.length,
    woke: 0,
    lastGrade: "",
    mode,
    answer: "",
    phase: "answering",
  };
  let points = 0;
  let promotionCreditSum = 0; // grade-quality-weighted, for stage readiness
  let ended = false;
  // teardown destroys the Pixi app (frees its WebGL context — browsers cap ~16);
  // the AbortController detaches every listener bound to the long-lived
  // input/submit/next nodes so a restarted block can't double-fire on them.
  let cleanup: (() => void) | null = null;
  const ac = new AbortController();
  const { signal } = ac;
  const startMs = performance.now();
  (window as unknown as { __grove?: GroveState }).__grove = state;

  function finish(reason: BlockEndReason): void {
    if (ended) return;
    ended = true;
    state.phase = "done";
    input.disabled = true;
    nextEl.style.display = "none";
    ac.abort();
    cleanup?.();
    // denominators are ATTEMPTS (state.trial), so a relearned card that took two
    // tries honestly lowers accuracy/promotion; `residents` (distinct woken
    // goal) drives the user-facing "woke X/Y" summary.
    opts.onComplete({
      kind: "lex",
      endReason: reason,
      trials: state.trial,
      correct: state.woke,
      points,
      accuracy: state.trial === 0 ? 0 : state.woke / state.trial,
      promotionAccuracy:
        state.trial === 0 ? 0 : promotionCreditSum / state.trial,
      durationMs: performance.now() - startMs,
      meta: { woke: state.woke, deckId, mode, residents: state.total },
    });
  }

  void (async () => {
    const { app, atlas } = await createStage(stageHost, {
      width: W,
      height: H,
    });
    if (ended) {
      // aborted while createStage was in flight — tear down, don't wire up.
      app.destroy({ removeView: true }, { children: true });
      return;
    }
    cleanup = () => {
      app.ticker.stop();
      app.destroy({ removeView: true }, { children: true });
    };
    let current: Sprite | null = null;
    let pop = 0;
    // working queue: a lapsed resident is re-appended for a spaced retry this
    // session (capped per card), so distinct entries can outnumber `total`.
    const pending = [...queue];
    const lapses = new Map<string, number>();

    function place(entryIdx: number, dormant: boolean): void {
      const entry = pending[entryIdx];
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
      const entry = pending[state.trial];
      if (!entry) {
        finish("completed");
        return;
      }
      place(state.trial, true);
      cueEl.textContent = entry.gloss;
      posEl.textContent = entry.pos;
      revealEl.textContent = "";
      revealEl.dataset.grade = "";
      state.answer = entry.label;
      progressEl.textContent = `${String(state.trial + 1)} / ${String(pending.length)}`;
      state.phase = "answering";

      // configure UI per mode
      const showInput = mode !== "mcq";
      input.style.display = showInput ? "" : "none";
      submitEl.style.display = showInput ? "" : "none";
      optionsEl.style.display = mode === "mcq" ? "" : "none";
      hintEl.style.display = mode === "cloze" ? "" : "none";
      nextEl.style.display = "none"; // shown only once an answer is revealed

      if (mode === "mcq") {
        optionsEl.replaceChildren();
        const options = groveOptions(
          entry,
          opts.deck,
          // salt with today so option positions reshuffle each session — a
          // returning learner can't memorise "the answer is always button 2".
          seededRng(`${deckId}:grove-opt:${entry.entryId}:${today}`),
        );
        let firstOption: HTMLButtonElement | null = null;
        for (const label of options) {
          const b = document.createElement("button");
          b.className = "grove-option";
          b.type = "button";
          b.textContent = label;
          b.addEventListener(
            "click",
            () => {
              if (state.phase === "answering") submitAnswer(label);
            },
            { signal },
          );
          optionsEl.appendChild(b);
          firstOption ??= b;
        }
        firstOption?.focus(); // keyboard users land on a control
      } else {
        input.value = "";
        input.disabled = false;
        if (mode === "cloze") {
          const chars = [...entry.label];
          // length-gate the leading-letter reveal: the typo budget is 0 for
          // len<=3, so leaking the first letter of a short word degenerates to
          // copying. Words <4 chars get length-only dots, no letter.
          hintEl.textContent =
            chars.length >= 4
              ? `${chars[0] ?? ""}${"·".repeat(chars.length - 1)}`
              : "·".repeat(chars.length);
        }
        input.focus();
      }
    }

    function submitAnswer(picked: string): void {
      const entry = pending[state.trial];
      if (!entry || state.phase !== "answering") return;
      const grade =
        mode === "mcq"
          ? picked === entry.label
            ? "hard" // recognition < production
            : "again"
          : suggestGradeFromTyping(picked, entry.label);
      recordReview(deckId, entry.entryId, grade, today); // grade before cosmetics
      promotionCreditSum += promotionCredit(mode, grade);
      state.lastGrade = grade;
      const woke = grade !== "again";
      if (woke) {
        state.woke++;
        points += grade === "good" ? 3 : grade === "hard" ? 2 : 1;
        place(state.trial, false);
        pop = 1;
      } else {
        // intra-session relearning: re-queue the lapsed resident for a spaced
        // retry later this session (capped), so a miss isn't lost until tomorrow.
        const prior = lapses.get(entry.entryId) ?? 0;
        if (canRelearn(prior)) pending.push(entry);
        lapses.set(entry.entryId, prior + 1);
      }
      const tag =
        grade === "good"
          ? " — wide awake!"
          : grade === "hard"
            ? " — stirring"
            : " — still drowsing";
      revealEl.textContent = `${woke ? "✿" : "💤"} ${entry.label}${tag}`;
      revealEl.dataset.grade = grade;
      state.phase = "revealed";
      input.disabled = true; // freeze the attempt; advance only via Next
      nextEl.style.display = "inline-block"; // overrides the CSS `display:none`
      nextEl.focus(); // Enter/Space on the focused button advances
    }

    function next(): void {
      if (state.phase !== "revealed") return;
      state.trial++;
      if (state.trial >= pending.length) finish("completed");
      else showResident();
    }

    input.addEventListener(
      "keydown",
      (ev) => {
        const ke = ev as KeyboardEvent;
        if (ke.key !== "Enter" || ke.repeat) return; // ignore key autorepeat
        ev.preventDefault();
        if (state.phase === "answering") submitAnswer(input.value);
      },
      { signal },
    );
    submitEl.addEventListener(
      "click",
      () => {
        if (state.phase === "answering") submitAnswer(input.value);
      },
      { signal },
    );
    nextEl.addEventListener("click", next, { signal });

    app.ticker.add((t) => {
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
