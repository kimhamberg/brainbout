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

import { Container, Graphics, type Sprite } from "pixi.js";
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
import {
  easeOutBack,
  integrate,
  isDead,
  makeBurst,
  type Particle,
  particleAlpha,
} from "../juice";
import { createStage } from "../pixi-stage";
import { drawBackdrop } from "./backdrop";

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
  // honour prefers-reduced-motion: keep recolour/reveal feedback, drop the
  // particle bursts + shake + overshoot pop.
  const reduce =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

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
    let pop = 0; // wake-pop progress (1 → 0)
    let shake = 0; // miss-shake progress (1 → 0)
    const fx: { p: Particle; g: Graphics }[] = []; // post-grade burst particles
    // working queue: a lapsed resident is re-appended for a spaced retry this
    // session (capped per card), so distinct entries can outnumber `total`.
    const pending = [...queue];
    const lapses = new Map<string, number>();

    // living backdrop (behind everything) + a persistent `parked` row where
    // woken residents settle (so the grove visibly fills with life across the
    // session) + a `fg` container the per-trial wipe acts on (so backdrop +
    // parked survive). Grove is self-paced (no TrialClock) so sway/pollen run
    // freely; backdrop honours prefers-reduced-motion internally.
    const groundY = Math.round(H * 0.82) - 2;
    const bd = drawBackdrop(app, atlas, {
      width: W,
      height: H,
      groundY,
      sky: [0x35424a, 0x3a4636],
      trees: 6,
      rng: seededRng(`grove-bd:${deckId}`),
      reduce,
    });
    const parked = new Container();
    const fg = new Container();
    app.stage.addChild(parked);
    app.stage.addChild(fg);
    let parkedCount = 0;

    function clearFx(): void {
      for (const f of fx) f.g.destroy();
      fx.length = 0;
    }

    function spawnWakeBurst(color: number, n: number): void {
      if (!current) return;
      const burst = makeBurst(
        current.x,
        current.y - 16,
        n,
        seededRng(`grove-fx:${deckId}:${String(state.trial)}`),
        { speed: 0.07, life: 680, size: 3 },
      );
      for (const p of burst) {
        const g = new Graphics().circle(0, 0, p.size).fill({ color });
        g.position.set(p.x, p.y);
        fg.addChild(g);
        fx.push({ p, g });
      }
    }

    function place(entryIdx: number, dormant: boolean): void {
      const entry = pending[entryIdx];
      if (!entry) return;
      clearFx();
      fg.removeChildren();
      const sp = atlas.speciesSprite(
        speciesFor(deckId, entry, opts.deck.manifest),
        dormant,
      );
      sp.x = W / 2;
      sp.y = H * 0.82;
      fg.addChild(sp);
      current = sp;
    }

    // Settle the just-woken resident into the persistent back row so the grove
    // fills up over the session. Purely visual — never touches tallies/grades.
    function parkCurrent(): void {
      if (!current || state.lastGrade === "again") return; // still dormant → skip
      const i = parkedCount++;
      const row = Math.floor(i / 8) % 3; // up to 3 stacked rows (matches the 24 cap)
      current.x = 20 + (i % 8) * 38;
      current.y = groundY + 16 - row * 13; // back rows sit higher, so they don't overlap
      current.scale.set(0.7);
      current.rotation = 0;
      parked.addChild(current); // reparent out of fg before the next wipe
      while (parked.children.length > 24) parked.removeChildAt(0).destroy();
      current = null;
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
        place(state.trial, false); // dormant → awake
        if (!reduce) {
          pop = 1; // overshoot wake-pop
          spawnWakeBurst(
            grade === "good" ? 0xe5c890 : 0xa6d189,
            grade === "good" ? 16 : 10,
          );
        }
      } else {
        if (!reduce) shake = 1; // a gentle "still drowsing" wobble
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
      parkCurrent(); // settle the woken resident into the back row before advancing
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
      const dt = t.deltaMS;
      bd.tick(dt); // ambient sway + pollen (self-paced zone — no RT window)
      if (current) {
        if (pop > 0) {
          pop = Math.max(0, pop - dt / 320);
          // grow-in with overshoot: scale 1.4 → 1 (easeOutBack dips <1, settles)
          current.scale.set(1 + 0.4 * (1 - easeOutBack(1 - pop)));
        } else {
          current.scale.set(1);
        }
        if (shake > 0) {
          shake = Math.max(0, shake - dt / 260);
          current.x = W / 2 + Math.sin(shake * 42) * 6 * shake;
        } else {
          current.x = W / 2;
        }
      }
      // post-grade burst particles drift + fade, then retire
      for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i];
        if (!f) continue;
        integrate(f.p, dt, 0.00006);
        f.g.position.set(f.p.x, f.p.y);
        f.g.alpha = particleAlpha(f.p);
        if (isDead(f.p)) {
          f.g.destroy();
          fx.splice(i, 1);
        }
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
