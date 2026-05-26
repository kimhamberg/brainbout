import { defined } from "../shared/assert";
import { type Grade, getCard, isDue } from "../shared/fsrs";
import { rng } from "../shared/rng";

export type Rule = "color" | "shape" | "size" | "fill";
export type ButtonSide = "left" | "right";
export type ShapeColor = "red" | "peach" | "blue" | "lavender" | "green";
export type ShapeForm = "circle" | "pill" | "diamond" | "triangle" | "blob";
export type ShapeSize = "big" | "small" | "dual";
export type ShapeFill = "solid" | "hollow" | "striped";

export interface Trial {
  color: ShapeColor;
  shape: ShapeForm;
  size: ShapeSize;
  fill: ShapeFill;
  isNoGo: boolean;
  isGolden: boolean;
}

export const MAX_HP = 5;

export interface FluxState {
  score: number;
  streak: number;
  peakStreak: number;
  trialCount: number;
  switchCount: number;
  bpm: number;
  rule: Rule;
  isNot: boolean;
  trialsUntilSwitch: number;
  noGoUnlocked: boolean;
  stage: number;
  unlockedRuleCount: number;
  hp: number;
  maxHp: number;
}

export interface StageParams {
  baseBpm: number;
  floorBpm: number;
  rules: Rule[];
  notAllowed: boolean;
  switchMin: number;
  switchMax: number;
  noGoRate: number;
  goldenRate: number;
}

export interface ResponseResult {
  correct: boolean;
  basePoints: number;
  multiplier: number;
  totalPoints: number;
  noGoFail?: boolean;
  isGolden?: boolean;
  feedback: string;
}

/* ---------- constants ---------- */

export const DURATION = 75;
export const WARM_UP_TRIALS = 8;
export const GOLDEN_BASE_POINTS = 5;

// Wilson et al. (2019) "The Eighty Five Percent Rule" (Nature Communications):
// Optimal error rate for binary classification learning is
//   ER* = ½(1 − erf(1/√2)) ≈ 15.87%
// Adaptive BPM converges when E[ΔBPM] = 0:
//   accuracy × BPM_UP = (1 − accuracy) × BPM_DOWN
// Solving: accuracy = BPM_DOWN / (BPM_UP + BPM_DOWN)
// For accuracy = 1 − ER* ≈ 0.8413:
//   BPM_DOWN / BPM_UP = (1 − ER*) / ER* ≈ 5.303
const OPTIMAL_ERROR_RATE = 0.158_66; // ½(1 − erf(1/√2))
export const BPM_UP = 1;
export const BPM_DOWN = (1 - OPTIMAL_ERROR_RATE) / OPTIMAL_ERROR_RATE; // ≈ 5.303

export const STREAK_THRESHOLDS = [
  { min: 15, multiplier: 5, label: "inferno" },
  { min: 10, multiplier: 3, label: "blaze" },
  { min: 5, multiplier: 2, label: "flame" },
  { min: 3, multiplier: 1.5, label: "spark" },
] as const;

export const STAGE_PARAMS: StageParams[] = [
  {
    baseBpm: 55,
    floorBpm: 90,
    rules: ["color", "shape", "size"],
    notAllowed: false,
    switchMin: 5,
    switchMax: 7,
    noGoRate: 0.1,
    goldenRate: 0.12,
  }, // placeholder index 0
  {
    baseBpm: 55,
    floorBpm: 90,
    rules: ["color", "shape", "size"],
    notAllowed: false,
    switchMin: 5,
    switchMax: 7,
    noGoRate: 0.1,
    goldenRate: 0.12,
  },
  {
    baseBpm: 70,
    floorBpm: 110,
    rules: ["color", "shape", "size", "fill"],
    notAllowed: false,
    switchMin: 4,
    switchMax: 6,
    noGoRate: 0.15,
    goldenRate: 0.1,
  },
  {
    baseBpm: 90,
    floorBpm: 135,
    rules: ["color", "shape", "size", "fill"],
    notAllowed: true,
    switchMin: 3,
    switchMax: 5,
    noGoRate: 0.2,
    goldenRate: 0.08,
  },
];

/* ---------- helpers ---------- */

function randInt(min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function pick<T>(arr: readonly T[]): T {
  return defined(arr[Math.floor(rng() * arr.length)]);
}

function rollSwitchCount(stage: number): number {
  const p = defined(STAGE_PARAMS[stage]);
  return randInt(p.switchMin, p.switchMax);
}

/* ---------- shape generation ---------- */

const GO_COLORS: ShapeColor[] = ["red", "peach", "blue", "lavender"];
const ROUND_SHAPES: ShapeForm[] = ["circle", "pill"];
const ANGULAR_SHAPES: ShapeForm[] = ["diamond", "triangle"];
const GO_SHAPES: ShapeForm[] = [...ROUND_SHAPES, ...ANGULAR_SHAPES];

function generateGoTrial(): Trial {
  return {
    color: pick(GO_COLORS),
    shape: pick(GO_SHAPES),
    size: rng() < 0.5 ? "big" : "small",
    fill: rng() < 0.5 ? "solid" : "hollow",
    isNoGo: false,
    isGolden: false,
  };
}

function generateNoGoTrial(rule: Rule): Trial {
  const base = generateGoTrial();
  base.isNoGo = true;

  switch (rule) {
    case "color":
      base.color = "green";
      break;
    case "shape":
      base.shape = "blob";
      break;
    case "size":
      base.size = "dual";
      break;
    case "fill":
      base.fill = "striped";
      break;
  }

  return base;
}

/* ---------- rule switching ---------- */

// How many switches needed to unlock the Nth rule
const UNLOCK_AT_SWITCH = [0, 0, 0, 2, 4, 6]; // index = unlockedRuleCount after unlock

function pickNextRule(state: FluxState): Rule {
  const p = defined(STAGE_PARAMS[state.stage]);
  const available = p.rules.slice(0, state.unlockedRuleCount);
  const others = available.filter((r) => r !== state.rule);
  return pick(others.length > 0 ? others : available);
}

/* ---------- state factory ---------- */

export function createFluxState(stage: number): FluxState {
  const p = defined(STAGE_PARAMS[stage]);
  return {
    score: 0,
    streak: 0,
    peakStreak: 0,
    trialCount: 0,
    switchCount: 0,
    bpm: p.baseBpm,
    rule: defined(p.rules[0]),
    isNot: false,
    trialsUntilSwitch: rollSwitchCount(stage),
    noGoUnlocked: false,
    stage,
    unlockedRuleCount: 1,
    hp: MAX_HP,
    maxHp: MAX_HP,
  };
}

/* ---------- trial generation ---------- */

export function generateTrial(state: FluxState, today?: string): Trial {
  const isWarmUp = state.trialCount < WARM_UP_TRIALS;

  // Handle rule switching (only after warm-up)
  if (!isWarmUp) {
    state.trialsUntilSwitch--;
    if (state.trialsUntilSwitch <= 0) {
      const dueCtx =
        today !== undefined ? pickDueFluxContext(state, today) : null;
      if (dueCtx !== null) {
        state.rule = dueCtx.rule;
        state.isNot = dueCtx.isNot;
      } else {
        state.rule = pickNextRule(state);
        // NOT activation: only when no due-bias drove rule selection.
        const sp = defined(STAGE_PARAMS[state.stage]);
        state.isNot =
          sp.notAllowed && state.switchCount + 1 >= 6 && rng() < 0.3;
      }
      state.trialsUntilSwitch = rollSwitchCount(state.stage);
      state.noGoUnlocked = true;
      state.switchCount++;

      // Progressive rule unlock (independent of NOT decision)
      const sp = defined(STAGE_PARAMS[state.stage]);
      const maxRules = sp.rules.length;
      if (
        state.unlockedRuleCount < maxRules &&
        state.switchCount >=
          defined(UNLOCK_AT_SWITCH[state.unlockedRuleCount + 1])
      ) {
        state.unlockedRuleCount++;
      }
    }
  }

  state.trialCount++;

  // Determine if golden (not during warm-up)
  const isGolden =
    !isWarmUp && rng() < defined(STAGE_PARAMS[state.stage]).goldenRate;

  // Determine if no-go (not during warm-up, must be unlocked)
  const isNoGo =
    !(isWarmUp || isGolden) && // golden and no-go are mutually exclusive
    state.noGoUnlocked &&
    rng() < defined(STAGE_PARAMS[state.stage]).noGoRate;

  if (isNoGo) {
    return generateNoGoTrial(state.rule);
  }

  const trial = generateGoTrial();
  trial.isGolden = isGolden;
  return trial;
}

/* ---------- multiplier ---------- */

export function getMultiplier(streak: number): number {
  for (const t of STREAK_THRESHOLDS) {
    if (streak >= t.min) {
      return t.multiplier;
    }
  }
  return 1;
}

export function getStreakLabel(streak: number): string {
  for (const t of STREAK_THRESHOLDS) {
    if (streak >= t.min) {
      return t.label;
    }
  }
  return "";
}

/* ---------- correct side ---------- */

function getCorrectSide(trial: Trial, rule: Rule, isNot: boolean): ButtonSide {
  let leftMatch: boolean;

  switch (rule) {
    case "color":
      leftMatch = trial.color === "red" || trial.color === "peach";
      break;
    case "shape":
      leftMatch = trial.shape === "circle" || trial.shape === "pill";
      break;
    case "size":
      leftMatch = trial.size === "big";
      break;
    case "fill":
      leftMatch = trial.fill === "solid";
      break;
  }

  if (isNot) {
    leftMatch = !leftMatch;
  }
  return leftMatch ? "left" : "right";
}

/* ---------- rule labels ---------- */

export function getRuleLabels(rule: Rule, isNot: boolean): [string, string] {
  let left: string;
  let right: string;

  switch (rule) {
    case "color":
      left = "Warm";
      right = "Cool";
      break;
    case "shape":
      left = "Round";
      right = "Angular";
      break;
    case "size":
      left = "Big";
      right = "Small";
      break;
    case "fill":
      left = "Solid";
      right = "Hollow";
      break;
  }

  if (isNot) {
    [left, right] = [right, left];
  }
  return [left, right];
}

/* ---------- response evaluation ---------- */

export function evaluateResponse(
  trial: Trial,
  rule: Rule,
  isNot: boolean,
  streak: number,
  pressed: ButtonSide | null,
): ResponseResult {
  const multiplier = getMultiplier(streak);

  // No-go trial
  if (trial.isNoGo) {
    if (pressed !== null) {
      return {
        correct: false,
        basePoints: -1,
        multiplier: 1,
        totalPoints: -1,
        noGoFail: true,
        feedback: "Don't press!",
      };
    }
    return {
      correct: true,
      basePoints: 1,
      multiplier,
      totalPoints: Math.round(Number(multiplier)),
      feedback: "",
    };
  }

  // Go trial, no press (timeout)
  if (pressed === null) {
    return {
      correct: false,
      basePoints: -1,
      multiplier: 1,
      totalPoints: -1,
      feedback: "Too slow!",
    };
  }

  // Check correctness
  const correctSide = getCorrectSide(trial, rule, isNot);
  const base = trial.isGolden ? GOLDEN_BASE_POINTS : 1;

  if (pressed === correctSide) {
    return {
      correct: true,
      basePoints: base,
      multiplier,
      totalPoints: Math.round(base * multiplier),
      ...(trial.isGolden ? { isGolden: true } : {}),
      feedback: "",
    };
  }

  const [leftLabel, rightLabel] = getRuleLabels(rule, isNot);
  const correctLabel = correctSide === "left" ? leftLabel : rightLabel;
  return {
    correct: false,
    basePoints: -1,
    multiplier: 1,
    totalPoints: -1,
    feedback: `It was ${correctLabel}`,
  };
}

/* ---------- session acts ---------- */

export type SessionAct = "warmup" | "flow" | "climax";

export function getSessionAct(remaining: number): SessionAct {
  const elapsed = DURATION - remaining;
  if (elapsed < 15) {
    return "warmup";
  }
  if (remaining > 15) {
    return "flow";
  }
  return "climax";
}

/* ---------- BPM helpers ---------- */

export function bpmToMs(bpm: number): number {
  return Math.round(60_000 / bpm);
}

/* ---------- FSRS class signatures ---------- */

/**
 * A flux "card" is a rule context (rule + NOT variant), not a specific
 * stimulus. Two trials sharing the same rule context exercise the same
 * task-switching cost even though their colors/shapes differ.
 *
 * 4 rules × 2 NOT variants = 8 classes total.
 */
export function fluxClassKey(rule: Rule, isNot: boolean): string {
  return `flux:${isNot ? "not_" : ""}${rule}`;
}

/* ---------- due-bias rule selection ---------- */

export interface FluxContext {
  rule: Rule;
  isNot: boolean;
}

/**
 * Enumerate every (rule, isNot) context the user can legitimately face
 * at the current stage given their current unlock progress. NOT-variants
 * only appear once the stage allows them.
 */
export function enumerateFluxContexts(state: FluxState): FluxContext[] {
  const sp = defined(STAGE_PARAMS[state.stage]);
  const available = sp.rules.slice(0, state.unlockedRuleCount);
  const out: FluxContext[] = [];
  for (const r of available) {
    out.push({ rule: r, isNot: false });
    if (sp.notAllowed) out.push({ rule: r, isNot: true });
  }
  return out;
}

/**
 * Pick a due (rule, isNot) context from the user's unlocked pool, or
 * null when nothing is currently due. Excludes the active rule so a
 * switch still feels like a switch (no immediate self-repeat).
 */
export function pickDueFluxContext(
  state: FluxState,
  today: string,
): FluxContext | null {
  const candidates = enumerateFluxContexts(state).filter(
    (c) => c.rule !== state.rule,
  );
  const due = candidates.filter((c) =>
    isDue(getCard(fluxClassKey(c.rule, c.isNot)), today),
  );
  if (due.length === 0) return null;
  // Tie-break by overdue distance: smallest nextDue first.
  due.sort((a, b) => {
    const da = getCard(fluxClassKey(a.rule, a.isNot)).nextDue;
    const db = getCard(fluxClassKey(b.rule, b.isNot)).nextDue;
    return da.localeCompare(db);
  });
  return defined(due[0]);
}

/**
 * Map a Flux response to an FSRS grade.
 *
 *   - wrong → "again" (drops stability, ups difficulty)
 *   - correct + very fast (RT < 40 % of beat) → "easy"
 *   - correct + comfortable (RT < 75 % of beat) → "good"
 *   - correct + slow (RT ≥ 75 % of beat) → "hard"
 *
 * The beat budget (`bpmToMs(bpm)`) is the wall-clock deadline the user is
 * already racing in solo mode, so RT/budget is a natural difficulty signal.
 */
export function deriveFluxGrade(
  correct: boolean,
  elapsedMs: number,
  budgetMs: number,
): Grade {
  if (!correct) return "again";
  if (budgetMs <= 0) return "good";
  const frac = elapsedMs / budgetMs;
  if (frac < 0.4) return "easy";
  if (frac < 0.75) return "good";
  return "hard";
}

/* ---------- adaptive difficulty ---------- */

export function updateAdaptation(state: FluxState, correct: boolean): void {
  const p = defined(STAGE_PARAMS[state.stage]);

  if (correct) {
    state.streak++;
    if (state.streak > state.peakStreak) {
      state.peakStreak = state.streak;
    }
    state.bpm = Math.min(p.floorBpm, state.bpm + BPM_UP);
  } else {
    state.streak = 0;
    state.bpm = Math.max(p.baseBpm, state.bpm - BPM_DOWN);
  }
}
