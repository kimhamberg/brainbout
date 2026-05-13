import type { SessionAct, Trial } from "./flux-engine";

export type { SessionAct };

export const RING_RADIUS = 40;
export const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function shapeClasses(trial: Trial, sizeOverride?: string): string {
  const classes = ["shape"];
  classes.push(`shape-${sizeOverride ?? trial.size}`);
  classes.push(`form-${trial.shape}`);
  classes.push(`color-${trial.color}`);
  classes.push(`fill-${trial.fill}`);
  if (trial.isGolden) {
    classes.push("golden");
  }
  return classes.join(" ");
}

export function shapeHtml(trial: Trial): string {
  if (trial.size === "dual") {
    const inner = shapeClasses(trial, "small");
    return `<div class="shape shape-dual"><div class="${inner}"></div><div class="${inner}"></div></div>`;
  }
  return `<div class="${shapeClasses(trial)}"></div>`;
}

export function streakBadgeHtml(
  streak: number,
  mult: number,
  label: string,
): string {
  if (streak < 3) {
    return "";
  }
  return `<div class="streak-display streak-${label}">x${String(mult)} ${label}</div>`;
}

/** CSS class for the timer ring at a given remaining-seconds + session-act. */
export function ringClass(remaining: number, act: SessionAct): string {
  if (act === "climax") {
    return "timer-ring climax";
  }
  if (remaining <= 15) {
    return "timer-ring low";
  }
  return "timer-ring";
}

/** Stroke-dashoffset to render the remaining progress on the ring. */
export function ringOffset(remaining: number, duration: number): number {
  const fraction = remaining / duration;
  return RING_CIRCUMFERENCE * (1 - fraction);
}

export interface ResultViewModel {
  finalScore: number;
  isNewBest: boolean;
  /** When set, shows "Only N from your best!" */
  nearMiss: false | { gap: number };
  subtitle: string;
  peakStreak: number;
  peakStreakLabel: string;
  peakStreakMult: number;
  correctTrials: number;
  totalTrials: number;
}

export function computeResultVm(input: {
  finalScore: number;
  previousBest: number | null;
  subtitle: string;
  peakStreak: number;
  peakStreakLabel: string;
  peakStreakMult: number;
  correctTrials: number;
  totalTrials: number;
}): ResultViewModel {
  const { finalScore, previousBest } = input;
  const isNewBest = previousBest === null || finalScore > previousBest;
  const nearMiss: false | { gap: number } =
    !isNewBest && previousBest !== null && finalScore >= previousBest * 0.9
      ? { gap: previousBest - finalScore }
      : false;
  return {
    finalScore,
    isNewBest,
    nearMiss,
    subtitle: input.subtitle,
    peakStreak: input.peakStreak,
    peakStreakLabel: input.peakStreakLabel,
    peakStreakMult: input.peakStreakMult,
    correctTrials: input.correctTrials,
    totalTrials: input.totalTrials,
  };
}

export function renderResultHtml(vm: ResultViewModel): string {
  const streakSuffix = vm.peakStreakLabel
    ? ` (x${String(vm.peakStreakMult)} ${vm.peakStreakLabel})`
    : "";
  return `
    <div class="result">
      <div class="final-score" data-target="${String(vm.finalScore)}">0</div>
      ${vm.isNewBest ? '<div class="new-best">NEW BEST</div>' : ""}
      ${vm.nearMiss ? `<div class="near-miss">Only ${String(vm.nearMiss.gap)} from your best!</div>` : ""}
      <div class="result-label">${vm.subtitle}</div>
      <div class="peak-streak">Best streak: ${String(vm.peakStreak)}${streakSuffix}</div>
      <div class="accuracy">${String(vm.correctTrials)}/${String(vm.totalTrials)} correct</div>
      <div class="result-actions">
        <button id="again-btn">Play Again</button>
        <button id="back-btn" class="secondary">Back to Hub</button>
      </div>
    </div>
  `;
}
