// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { defined } from "../src/shared/assert";
import {
  STAGE_PARAMS,
  WARM_UP_TRIALS,
  DURATION,
  STREAK_THRESHOLDS,
  GOLDEN_BASE_POINTS,
  createFluxState,
} from "../src/games/flux-engine";

describe("constants", () => {
  it("DURATION is 75 seconds", () => {
    expect(DURATION).toBe(75);
  });

  it("WARM_UP_TRIALS is 5", () => {
    expect(WARM_UP_TRIALS).toBe(5);
  });

  it("GOLDEN_BASE_POINTS is 5", () => {
    expect(GOLDEN_BASE_POINTS).toBe(5);
  });
});

describe("STAGE_PARAMS", () => {
  it("stage 1: baseBpm 75, rules color+shape+size, noGoRate 0.15", () => {
    const p = defined(STAGE_PARAMS[1]);
    expect(p.baseBpm).toBe(75);
    expect(p.floorBpm).toBe(90);
    expect(p.rules).toEqual(["color", "shape", "size"]);
    expect(p.switchMin).toBe(5);
    expect(p.switchMax).toBe(7);
    expect(p.noGoRate).toBe(0.15);
    expect(p.goldenRate).toBe(0.1);
  });

  it("stage 2: baseBpm 90, adds fill rule", () => {
    const p = defined(STAGE_PARAMS[2]);
    expect(p.baseBpm).toBe(90);
    expect(p.floorBpm).toBe(110);
    expect(p.rules).toEqual(["color", "shape", "size", "fill"]);
    expect(p.switchMin).toBe(4);
    expect(p.switchMax).toBe(6);
    expect(p.noGoRate).toBe(0.2);
    expect(p.goldenRate).toBe(0.08);
  });

  it("stage 3: baseBpm 110, adds not variants", () => {
    const p = defined(STAGE_PARAMS[3]);
    expect(p.baseBpm).toBe(110);
    expect(p.floorBpm).toBe(135);
    expect(p.rules).toEqual(["color", "shape", "size", "fill"]);
    expect(p.notAllowed).toBe(true);
    expect(p.switchMin).toBe(3);
    expect(p.switchMax).toBe(5);
    expect(p.noGoRate).toBe(0.25);
    expect(p.goldenRate).toBe(0.08);
  });
});

describe("STREAK_THRESHOLDS", () => {
  it("maps streak ranges to multipliers", () => {
    expect(STREAK_THRESHOLDS).toEqual([
      { min: 15, multiplier: 5, label: "inferno" },
      { min: 10, multiplier: 3, label: "blaze" },
      { min: 5, multiplier: 2, label: "flame" },
      { min: 3, multiplier: 1.5, label: "spark" },
    ]);
  });
});

describe("createFluxState", () => {
  it("returns correct defaults for stage 1", () => {
    const state = createFluxState(1);
    expect(state.score).toBe(0);
    expect(state.streak).toBe(0);
    expect(state.peakStreak).toBe(0);
    expect(state.trialCount).toBe(0);
    expect(state.switchCount).toBe(0);
    expect(state.bpm).toBe(75);
    expect(state.rule).toBe("color");
    expect(state.isNot).toBe(false);
    expect(state.noGoUnlocked).toBe(false);
    expect(state.stage).toBe(1);
  });

  it("uses stage 2 base bpm", () => {
    const state = createFluxState(2);
    expect(state.bpm).toBe(90);
  });

  it("uses stage 3 base bpm", () => {
    const state = createFluxState(3);
    expect(state.bpm).toBe(110);
  });
});
