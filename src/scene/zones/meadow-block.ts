/**
 * MEADOW + WEATHER zone (design docs/design/03 §4-5). One flux-engine block:
 * each beat a stimulus appears; the active RULE sorts it LEFT/RIGHT (the two
 * baskets), and the rule's no-go value means WITHHOLD (Hold / "leave it"). The
 * rule SWITCHES every few beats — a telegraphed WEATHER change (CSI ≈ 700ms) —
 * which is the task-switching demand. trial-clock anchors post-paint onset →
 * real RT (deriveFluxGrade); Wilson-85% adaptive BPM is the beat budget; the
 * genuine −1 no-go/miss cost + 5 HP are preserved. Switch-vs-repeat RT and
 * false-alarms are logged to meta (guardrails 5/7, VH-9). BlockOutcome kind
 * "flux".
 */

import { Graphics } from "pixi.js";
import type {
  BlockEndReason,
  BlockHandle,
  BlockOutcome,
} from "../../engine/block";
import {
  type ButtonSide,
  bpmToMs,
  createFluxState,
  deriveFluxGrade,
  evaluateResponse,
  fluxClassKey,
  generateTrial,
  getRuleLabels,
  type Trial,
  updateAdaptation,
} from "../../games/flux-engine";
import { recordReview } from "../../shared/fsrs";
import { CSI_MS } from "../../world/limits";
import { createStage } from "../pixi-stage";
import { browserScheduler, TrialClock } from "../trial-clock";

export interface MeadowOptions {
  container: HTMLElement;
  stage?: number;
  today?: string;
  maxTrials?: number;
  onComplete: (outcome: BlockOutcome) => void;
}

const W = 220;
const H = 180;

const COLOR: Record<string, number> = {
  red: 0xe78284,
  peach: 0xef9f76,
  blue: 0x8caaee,
  lavender: 0xbabbf1,
  green: 0xa6d189,
};

function el(root: HTMLElement, id: string): HTMLElement {
  const e = root.querySelector<HTMLElement>(`#${id}`);
  if (!e) throw new Error(`Meadow: missing #${id}`);
  return e;
}

interface MeadowState {
  trial: number;
  total: number;
  correct: number;
  hp: number;
  isNoGo: boolean;
  correctSide: ButtonSide | null; // null = withhold (Hold); test hook
  phase: "responding" | "revealed" | "done";
}

function drawShape(g: Graphics, t: Trial, cx: number, cy: number): void {
  const color = COLOR[t.color] ?? 0xffffff;
  const parts: [number, number, number][] =
    t.size === "dual"
      ? [
          [cx - 13, cy, 11],
          [cx + 13, cy, 11],
        ]
      : [[cx, cy, t.size === "big" ? 26 : 15]];
  for (const [x, y, r] of parts) {
    if (t.shape === "circle" || t.shape === "blob") g.circle(x, y, r);
    else if (t.shape === "pill")
      g.roundRect(x - r, y - r * 0.6, r * 2, r * 1.2, r * 0.6);
    else if (t.shape === "diamond")
      g.poly([x, y - r, x + r, y, x, y + r, x - r, y]);
    else g.poly([x, y - r, x + r, y + r, x - r, y + r]); // triangle
    if (t.fill === "hollow") g.stroke({ color, width: 3 });
    else {
      g.fill(color);
      if (t.fill === "striped") {
        for (let yy = y - r; yy < y + r; yy += 4) {
          g.moveTo(x - r, yy)
            .lineTo(x + r, yy)
            .stroke({ color: 0x232634, width: 1 });
        }
      }
    }
  }
  if (t.isGolden) g.circle(cx, cy, 32).stroke({ color: 0xe5c890, width: 2 });
}

export function createMeadowBlock(opts: MeadowOptions): BlockHandle {
  const stage = opts.stage ?? 1;
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const total = opts.maxTrials ?? 12;
  const flux = createFluxState(stage);

  const stageHost = el(opts.container, "stage");
  const ruleEl = el(opts.container, "meadow-rule");
  const leftBtn = el(opts.container, "meadow-left") as HTMLButtonElement;
  const rightBtn = el(opts.container, "meadow-right") as HTMLButtonElement;
  const holdBtn = el(opts.container, "meadow-hold") as HTMLButtonElement;
  const revealEl = el(opts.container, "meadow-reveal");
  const hpEl = el(opts.container, "meadow-hp");
  const progressEl = el(opts.container, "meadow-progress");

  const state: MeadowState = {
    trial: 0,
    total,
    correct: 0,
    hp: flux.maxHp,
    isNoGo: false,
    correctSide: null,
    phase: "responding",
  };
  let points = 0;
  let ended = false;
  let stopTicker: (() => void) | null = null;
  const switchRts: number[] = [];
  const repeatRts: number[] = [];
  let falseAlarms = 0;
  const startMs = performance.now();
  (window as unknown as { __meadow?: MeadowState }).__meadow = state;

  function setButtons(on: boolean): void {
    leftBtn.disabled = !on;
    rightBtn.disabled = !on;
    holdBtn.disabled = !on;
  }

  function finish(reason: BlockEndReason): void {
    if (ended) return;
    ended = true;
    state.phase = "done";
    setButtons(false);
    stopTicker?.();
    opts.onComplete({
      kind: "flux",
      endReason: reason,
      trials: state.trial,
      correct: state.correct,
      points,
      accuracy: state.trial === 0 ? 0 : state.correct / state.trial,
      durationMs: performance.now() - startMs,
      meta: { switchRts, repeatRts, falseAlarms, hp: state.hp },
    });
  }

  void (async () => {
    const { app } = await createStage(stageHost, { width: W, height: H });
    stopTicker = () => {
      app.ticker.stop();
    };
    let clock: TrialClock | null = null;
    let current: Trial | null = null;
    let isSwitch = false;
    let beatTimer: ReturnType<typeof setTimeout> | null = null;

    function showBeat(): void {
      const prevRule = flux.rule;
      const prevNot = flux.isNot;
      const t = generateTrial(flux, today); // may switch the rule
      current = t;
      isSwitch = flux.rule !== prevRule || flux.isNot !== prevNot;

      const [l, r] = getRuleLabels(flux.rule, flux.isNot);
      leftBtn.textContent = `◀ ${l}`;
      rightBtn.textContent = `${r} ▶`;
      ruleEl.textContent = isSwitch
        ? `⛅ the weather turned — sort by ${flux.rule}${flux.isNot ? " (inverted)" : ""}`
        : `sort by ${flux.rule}${flux.isNot ? " (inverted)" : ""}`;
      // test hooks: what the correct action is this beat
      state.isNoGo = t.isNoGo;
      state.correctSide = t.isNoGo
        ? null
        : evaluateResponse(t, flux.rule, flux.isNot, 0, "left").correct
          ? "left"
          : "right";
      revealEl.textContent = "";
      revealEl.dataset.grade = "";
      progressEl.textContent = `${String(state.trial + 1)} / ${String(state.total)}`;
      setButtons(false);

      const render = (): void => {
        app.stage.removeChildren();
        const g = new Graphics();
        drawShape(g, t, W / 2, H / 2);
        app.stage.addChild(g);
      };
      const arm = (): void => {
        setButtons(true);
        const budget = Math.max(bpmToMs(flux.bpm), 1800);
        beatTimer = setTimeout(() => {
          respond(null);
        }, budget);
      };

      // A switch is telegraphed (CSI) BEFORE the stimulus paints, so the cue's
      // prep time isn't charged as RT.
      if (isSwitch) {
        setTimeout(() => {
          clock = new TrialClock(browserScheduler());
          clock.armTrial(render, arm);
        }, CSI_MS);
      } else {
        clock = new TrialClock(browserScheduler());
        clock.armTrial(render, arm);
      }
    }

    function respond(pressed: ButtonSide | null): void {
      if (state.phase !== "responding" || !clock?.armed || !current) return;
      if (beatTimer !== null) {
        clearTimeout(beatTimer);
        beatTimer = null;
      }
      const rt = clock.recordResponse();
      const res = evaluateResponse(
        current,
        flux.rule,
        flux.isNot,
        flux.streak,
        pressed,
      );
      const grade = deriveFluxGrade(res.correct, rt, bpmToMs(flux.bpm));
      recordReview(fluxClassKey(flux.rule, flux.isNot), grade, today);
      updateAdaptation(flux, res.correct);
      (isSwitch ? switchRts : repeatRts).push(Math.round(rt));
      if (current.isNoGo && pressed !== null) falseAlarms++;
      if (res.correct) {
        state.correct++;
        points += res.totalPoints;
      } else {
        state.hp -= 1;
      }
      hpEl.textContent = "♥".repeat(Math.max(0, state.hp));
      revealEl.textContent = res.correct
        ? `✓ +${String(res.totalPoints)}`
        : `✗ ${res.feedback || "missed"}`;
      revealEl.dataset.grade = grade;
      clock.settle();
      state.phase = "revealed";
      if (state.hp <= 0) finish("failed");
    }

    function step(): void {
      if (state.phase !== "revealed") return;
      state.trial++;
      if (state.trial >= state.total) finish("completed");
      else {
        state.phase = "responding";
        showBeat();
      }
    }

    leftBtn.addEventListener("click", () => {
      respond("left");
    });
    rightBtn.addEventListener("click", () => {
      respond("right");
    });
    holdBtn.addEventListener("click", () => {
      respond(null);
    });
    revealEl.addEventListener("click", step);
    el(opts.container, "meadow-next").addEventListener("click", step);

    hpEl.textContent = "♥".repeat(state.hp);
    showBeat();
    (window as unknown as { __meadowReady?: boolean }).__meadowReady = true;
  })();

  return {
    abort: () => {
      finish("aborted");
    },
  };
}
