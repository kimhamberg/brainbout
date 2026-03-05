export type Rule = "color" | "number";
export type ButtonSide = "left" | "right";
export type TrialColor = "red" | "blue" | "green";

export interface Trial {
  number: number;
  color: TrialColor;
  isNoGo: boolean;
}

export interface FluxState {
  score: number;
  streak: number;
  trialCount: number;
  intervalMs: number;
  rule: Rule;
  trialsUntilSwitch: number;
  noGoUnlocked: boolean;
  stage: number;
}

export interface StageParams {
  startInterval: number;
  switchMin: number;
  switchMax: number;
  noGoRate: number;
  floorMs: number;
}

export interface ResponseResult {
  correct: boolean;
  points: number;
  noGoFail?: boolean;
  feedback: string;
}

/* ---------- constants ---------- */

export const WARM_UP_TRIALS = 5;
export const SPEED_UP = 75;
export const SLOW_DOWN = 150;
export const STREAK_TO_SPEED = 5;

export const STAGE_PARAMS: StageParams[] = [
  {
    startInterval: 2000,
    switchMin: 6,
    switchMax: 6,
    noGoRate: 0.2,
    floorMs: 800,
  }, // placeholder for index 0
  {
    startInterval: 2000,
    switchMin: 6,
    switchMax: 6,
    noGoRate: 0.2,
    floorMs: 800,
  },
  {
    startInterval: 1500,
    switchMin: 4,
    switchMax: 6,
    noGoRate: 0.2,
    floorMs: 800,
  },
  {
    startInterval: 1200,
    switchMin: 3,
    switchMax: 5,
    noGoRate: 0.25,
    floorMs: 800,
  },
];

/* ---------- helpers ---------- */

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function rollSwitchCount(stage: number): number {
  const p = STAGE_PARAMS[stage];
  return randInt(p.switchMin, p.switchMax);
}

/* ---------- state factory ---------- */

export function createFluxState(stage: number): FluxState {
  const p = STAGE_PARAMS[stage];
  return {
    score: 0,
    streak: 0,
    trialCount: 0,
    intervalMs: p.startInterval,
    rule: "color",
    trialsUntilSwitch: rollSwitchCount(stage),
    noGoUnlocked: false,
    stage,
  };
}

/* ---------- trial generation ---------- */

export function generateTrial(state: FluxState): Trial {
  const isWarmUp = state.trialCount < WARM_UP_TRIALS;

  // Handle rule switching (only after warm-up)
  if (!isWarmUp) {
    state.trialsUntilSwitch--;
    if (state.trialsUntilSwitch <= 0) {
      state.rule = state.rule === "color" ? "number" : "color";
      state.trialsUntilSwitch = rollSwitchCount(state.stage);
      state.noGoUnlocked = true;
    }
  }

  state.trialCount++;

  const num = randInt(1, 9);

  // Determine if no-go
  const isNoGo =
    !isWarmUp &&
    state.noGoUnlocked &&
    Math.random() < STAGE_PARAMS[state.stage].noGoRate;

  let color: TrialColor;
  if (isNoGo) {
    color = "green";
  } else {
    color = Math.random() < 0.5 ? "red" : "blue";
  }

  return { number: num, color, isNoGo };
}

/* ---------- response evaluation ---------- */

export function evaluateResponse(
  trial: Trial,
  rule: Rule,
  pressed: ButtonSide | null,
): ResponseResult {
  // No-go trial
  if (trial.isNoGo) {
    if (pressed !== null) {
      return {
        correct: false,
        points: -1,
        noGoFail: true,
        feedback: "Don't press on green!",
      };
    }
    return { correct: true, points: 1, feedback: "" };
  }

  // Go trial, no press
  if (pressed === null) {
    return { correct: false, points: -1, feedback: "Too slow!" };
  }

  // Determine correct side
  let correctSide: ButtonSide;
  let correctLabel: string;

  if (rule === "color") {
    correctSide = trial.color === "red" ? "left" : "right";
    correctLabel = trial.color === "red" ? "Red" : "Blue";
  } else {
    correctSide = trial.number % 2 === 1 ? "left" : "right";
    correctLabel = trial.number % 2 === 1 ? "Odd" : "Even";
  }

  if (pressed === correctSide) {
    return { correct: true, points: 1, feedback: "" };
  }

  return { correct: false, points: -1, feedback: `It was ${correctLabel}` };
}

/* ---------- adaptive difficulty ---------- */

export function updateAdaptation(state: FluxState, correct: boolean): void {
  const p = STAGE_PARAMS[state.stage];

  if (correct) {
    state.streak++;
    if (state.streak >= STREAK_TO_SPEED) {
      state.intervalMs = Math.max(p.floorMs, state.intervalMs - SPEED_UP);
      state.streak = 0;
    }
  } else {
    state.streak = 0;
    state.intervalMs = Math.min(p.startInterval, state.intervalMs + SLOW_DOWN);
  }
}
