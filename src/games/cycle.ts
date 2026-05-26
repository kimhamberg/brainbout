import type {
  BlockFactory,
  BlockHandle,
  BlockKind,
  BlockOutcome,
} from "../engine/block";
import { BASE } from "../shared/base";
import { BRAIN_PATHS, iconSvg, mountQuitButton } from "../shared/icons";
import { recordSessionScore } from "../shared/progress";
import * as sound from "../shared/sounds";
import { recordResult } from "../shared/stages";
import { initTheme, wireToggle } from "../shared/theme";
import { createCrownBlock } from "./crown-block";
import { createFluxBlock } from "./flux-block";
import { createLexBlock } from "./lex-block";

interface CycleStep {
  kind: BlockKind;
  label: string;
  accent: string;
  factory: BlockFactory;
  maxTrials: number;
}

const TRANSITION_MS = 800;

/**
 * Fixed order chosen to align with attentional-fatigue evidence:
 *   1. Lex first — recall is most demanding, do it while fresh.
 *   2. Crown second — mental rotation still benefits from focus.
 *   3. Flux last — rapid no-go acts as energising closer.
 *
 * Each block stays blocked-within-game (matches Rohrer interleaving meta:
 * words specifically lose to blocked practice). Cross-block switching
 * trains task-switching incidentally; that is not the headline benefit.
 */
const STEPS: readonly CycleStep[] = [
  {
    kind: "lex",
    label: "Lex",
    accent: "var(--ctp-blue)",
    factory: createLexBlock,
    maxTrials: 8,
  },
  {
    kind: "crown",
    label: "Crown",
    accent: "var(--ctp-green)",
    factory: createCrownBlock,
    maxTrials: 8,
  },
  {
    kind: "flux",
    label: "Flux",
    accent: "var(--ctp-red)",
    factory: createFluxBlock,
    maxTrials: 15,
  },
] as const;

function getEl(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) {
    throw new Error(`Missing #${id} element`);
  }
  return el;
}
const game = getEl("game");

let stepIdx = 0;
let outcomes: BlockOutcome[] = [];
let activeHandle: BlockHandle | null = null;
let cycleAborted = false;
let transitionTimeout: ReturnType<typeof setTimeout> | null = null;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderShell(): void {
  const stepperHtml = STEPS.map((step, i) => {
    const state =
      i < stepIdx ? "is-done" : i === stepIdx ? "is-active" : "is-pending";
    return `<div class="cycle-step ${state}" style="--step-accent:${step.accent}">
      <span class="cycle-step-dot"></span>
      <span class="cycle-step-name">${escapeHtml(step.label)}</span>
    </div>`;
  }).join("");
  game.innerHTML = `
    <div class="cycle-stepper" role="progressbar"
         aria-label="Cycle progress"
         aria-valuemin="0" aria-valuemax="${String(STEPS.length)}" aria-valuenow="${String(stepIdx)}">${stepperHtml}</div>
    <div class="cycle-slot" id="cycle-slot"></div>
  `;
}

function slot(): HTMLElement {
  return getEl("cycle-slot");
}

function setAccent(accent: string): void {
  document.documentElement.style.setProperty("--game-accent", accent);
}

function renderTransition(nextStep: CycleStep): void {
  const s = slot();
  s.innerHTML = `
    <div class="cycle-transition" style="--step-accent:${nextStep.accent}">
      <div class="cycle-transition-label">Next block</div>
      <div class="cycle-transition-name">${escapeHtml(nextStep.label)}</div>
    </div>
  `;
}

function clearTransition(): void {
  if (transitionTimeout !== null) {
    clearTimeout(transitionTimeout);
    transitionTimeout = null;
  }
}

function startStep(): void {
  if (cycleAborted) {
    showSummary();
    return;
  }
  const step = STEPS[stepIdx];
  if (!step) {
    showSummary();
    return;
  }
  setAccent(step.accent);
  renderShell();
  activeHandle = step.factory({
    container: slot(),
    maxTrials: step.maxTrials,
    onComplete: (outcome) => {
      activeHandle = null;
      outcomes.push(outcome);
      recordSessionScore(step.kind, outcome.points);
      recordResult(step.kind, outcome.accuracy);
      stepIdx++;
      if (cycleAborted || stepIdx >= STEPS.length) {
        showSummary();
        return;
      }
      const next = STEPS[stepIdx];
      if (!next) {
        showSummary();
        return;
      }
      // Re-render stepper so the just-finished step flips to "done" and the
      // next step flips to "active" during the transition.
      renderShell();
      renderTransition(next);
      transitionTimeout = setTimeout(() => {
        transitionTimeout = null;
        startStep();
      }, TRANSITION_MS);
    },
  });
}

function showSummary(): void {
  clearTransition();
  const totalPoints = outcomes.reduce((acc, o) => acc + o.points, 0);
  const tiles = STEPS.map((step, i) => {
    const out = outcomes[i];
    const points = out?.points ?? 0;
    const accuracy = out ? Math.round(out.accuracy * 100) : 0;
    const trials = out?.trials ?? 0;
    const metaLine = out
      ? `${String(accuracy)}% · ${String(trials)} trial${trials === 1 ? "" : "s"}`
      : "skipped";
    return `<div class="cycle-block-tile" style="--tile-accent:${step.accent}">
      <div class="cycle-block-tile-name">${escapeHtml(step.label)}</div>
      <div class="cycle-block-tile-points">${String(points)}</div>
      <div class="cycle-block-tile-meta">${escapeHtml(metaLine)}</div>
    </div>`;
  }).join("");

  const lexMeta = outcomes.find((o) => o.kind === "lex")?.meta as
    | { newlyMastered?: number }
    | undefined;
  const mastered = lexMeta?.newlyMastered ?? 0;
  const masteredLine =
    mastered > 0
      ? `<div class="peak-streak">+${String(mastered)} new mastered word${mastered === 1 ? "" : "s"}</div>`
      : "";

  game.innerHTML = `
    <div class="result cycle-summary">
      <div class="cycle-summary-totals">
        <div class="cycle-summary-points">${String(totalPoints)}</div>
        <div class="cycle-summary-points-label">total points</div>
      </div>
      <div class="cycle-block-grid">${tiles}</div>
      ${masteredLine}
      <div class="cycle-summary-actions">
        <button id="again-btn">Play Again</button>
        <button id="back-btn" class="secondary">Back to Hub</button>
      </div>
    </div>
  `;
  sound.playVictory();
}

function startCycle(): void {
  cycleAborted = false;
  stepIdx = 0;
  outcomes = [];
  startStep();
}

game.addEventListener("click", (e) => {
  const target = (e.target as HTMLElement).closest<HTMLElement>("button");
  if (!target) return;
  if (target.id === "again-btn") {
    startCycle();
  } else if (target.id === "back-btn") {
    window.location.href = `${BASE}?completed=cycle`;
  }
});

mountQuitButton(() => {
  cycleAborted = true;
  clearTransition();
  if (activeHandle !== null) {
    activeHandle.abort();
  } else {
    showSummary();
  }
});

startCycle();

initTheme();
wireToggle();

const titleSlot = document.querySelector(".app-title");
if (titleSlot) {
  titleSlot.insertAdjacentHTML(
    "afterbegin",
    iconSvg(BRAIN_PATHS, { size: 20, stroke: "var(--ctp-mauve)" }),
  );
}
