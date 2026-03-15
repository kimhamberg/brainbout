import { defined } from "../shared/assert";

export type Rule = "color" | "shape" | "size" | "fill";
export type ButtonSide = "left" | "right";
export type ShapeColor = "red" | "peach" | "blue" | "lavender" | "yellow";
export type ShapeForm = "circle" | "pill" | "diamond" | "triangle" | "blob";
export type ShapeSize = "big" | "small" | "oscillating";
export type ShapeFill = "solid" | "hollow" | "striped";

export interface Trial {
  color: ShapeColor;
  shape: ShapeForm;
  size: ShapeSize;
  fill: ShapeFill;
  isNoGo: boolean;
  isGolden: boolean;
}

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
export const WARM_UP_TRIALS = 5;
export const GOLDEN_BASE_POINTS = 5;
export const BPM_INCREASE_PERCENT = 0.05;
export const STREAK_TO_SPEED = 5;

export const STREAK_THRESHOLDS = [
  { min: 15, multiplier: 5, label: "inferno" },
  { min: 10, multiplier: 3, label: "blaze" },
  { min: 5, multiplier: 2, label: "flame" },
  { min: 3, multiplier: 1.5, label: "spark" },
] as const;

export const STAGE_PARAMS: StageParams[] = [
  { baseBpm: 75, floorBpm: 90, rules: ["color", "shape", "size"], notAllowed: false, switchMin: 5, switchMax: 7, noGoRate: 0.15, goldenRate: 0.1 }, // placeholder index 0
  { baseBpm: 75, floorBpm: 90, rules: ["color", "shape", "size"], notAllowed: false, switchMin: 5, switchMax: 7, noGoRate: 0.15, goldenRate: 0.1 },
  { baseBpm: 90, floorBpm: 110, rules: ["color", "shape", "size", "fill"], notAllowed: false, switchMin: 4, switchMax: 6, noGoRate: 0.2, goldenRate: 0.08 },
  { baseBpm: 110, floorBpm: 135, rules: ["color", "shape", "size", "fill"], notAllowed: true, switchMin: 3, switchMax: 5, noGoRate: 0.25, goldenRate: 0.08 },
];

/* ---------- helpers ---------- */

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pick<T>(arr: readonly T[]): T {
  return defined(arr[Math.floor(Math.random() * arr.length)]);
}

function rollSwitchCount(stage: number): number {
  const p = defined(STAGE_PARAMS[stage]);
  return randInt(p.switchMin, p.switchMax);
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
  };
}
