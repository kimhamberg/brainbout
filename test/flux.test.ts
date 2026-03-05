// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import {
  STAGE_PARAMS,
  WARM_UP_TRIALS,
  SPEED_UP,
  SLOW_DOWN,
  STREAK_TO_SPEED,
  createFluxState,
  generateTrial,
  evaluateResponse,
  updateAdaptation,
} from "../src/games/flux-engine";
import type {
  Rule,
  Trial,
  FluxState,
  StageParams,
  ResponseResult,
} from "../src/games/flux-engine";

describe("STAGE_PARAMS", () => {
  it("has correct values for stage 1", () => {
    expect(STAGE_PARAMS[1]).toEqual({
      startInterval: 2000,
      switchMin: 6,
      switchMax: 6,
      noGoRate: 0.2,
      floorMs: 800,
    });
  });

  it("has correct values for stage 2", () => {
    expect(STAGE_PARAMS[2]).toEqual({
      startInterval: 1500,
      switchMin: 4,
      switchMax: 6,
      noGoRate: 0.2,
      floorMs: 800,
    });
  });

  it("has correct values for stage 3", () => {
    expect(STAGE_PARAMS[3]).toEqual({
      startInterval: 1200,
      switchMin: 3,
      switchMax: 5,
      noGoRate: 0.25,
      floorMs: 800,
    });
  });
});

describe("createFluxState", () => {
  it("returns correct defaults for stage 1", () => {
    const state = createFluxState(1);
    expect(state.score).toBe(0);
    expect(state.streak).toBe(0);
    expect(state.trialCount).toBe(0);
    expect(state.rule).toBe("color");
    expect(state.intervalMs).toBe(2000);
    expect(state.noGoUnlocked).toBe(false);
    expect(state.stage).toBe(1);
  });

  it("uses stage 2 start interval", () => {
    const state = createFluxState(2);
    expect(state.intervalMs).toBe(1500);
    expect(state.stage).toBe(2);
  });

  it("uses stage 3 start interval", () => {
    const state = createFluxState(3);
    expect(state.intervalMs).toBe(1200);
    expect(state.stage).toBe(3);
  });
});

describe("generateTrial", () => {
  it("generates numbers in range 1-9", () => {
    const state = createFluxState(1);
    for (let i = 0; i < 100; i++) {
      // Reset trialCount so it stays in warm-up for simplicity
      state.trialCount = 0;
      const trial = generateTrial(state);
      expect(trial.number).toBeGreaterThanOrEqual(1);
      expect(trial.number).toBeLessThanOrEqual(9);
    }
  });

  it("generates red or blue colors for normal trials", () => {
    const state = createFluxState(1);
    const colors = new Set<string>();
    for (let i = 0; i < 100; i++) {
      state.trialCount = 0;
      const trial = generateTrial(state);
      colors.add(trial.color);
    }
    expect(colors).toContain("red");
    expect(colors).toContain("blue");
    expect(colors).not.toContain("green");
  });

  describe("warm-up (first 5 trials)", () => {
    it("never produces no-go trials during warm-up", () => {
      const state = createFluxState(1);
      for (let i = 0; i < WARM_UP_TRIALS; i++) {
        const trial = generateTrial(state);
        expect(trial.isNoGo).toBe(false);
        expect(trial.color).not.toBe("green");
      }
    });

    it("keeps rule as 'color' during warm-up", () => {
      const state = createFluxState(1);
      for (let i = 0; i < WARM_UP_TRIALS; i++) {
        generateTrial(state);
        expect(state.rule).toBe("color");
      }
    });

    it("does not switch rules during warm-up", () => {
      const state = createFluxState(1);
      // Set trialsUntilSwitch to 1 to test that warm-up prevents switching
      state.trialsUntilSwitch = 1;
      // Generate trial during warm-up
      generateTrial(state);
      expect(state.rule).toBe("color");
    });
  });

  describe("after warm-up", () => {
    it("can produce green (no-go) trials after no-go is unlocked", () => {
      const state = createFluxState(1);
      state.trialCount = WARM_UP_TRIALS;
      state.noGoUnlocked = true;
      let sawGreen = false;
      for (let i = 0; i < 200; i++) {
        // Keep state past warm-up
        const savedCount = state.trialCount;
        const trial = generateTrial(state);
        if (trial.isNoGo) {
          expect(trial.color).toBe("green");
          sawGreen = true;
        }
        // Restore trialCount to stay in post-warm-up
        state.trialCount = savedCount + 1;
      }
      expect(sawGreen).toBe(true);
    });

    it("switches rule when trialsUntilSwitch reaches 0", () => {
      const state = createFluxState(1);
      state.trialCount = WARM_UP_TRIALS;
      state.trialsUntilSwitch = 1;
      state.rule = "color";
      generateTrial(state);
      expect(state.rule).toBe("number");
    });

    it("toggles rule back from number to color", () => {
      const state = createFluxState(1);
      state.trialCount = WARM_UP_TRIALS;
      state.trialsUntilSwitch = 1;
      state.rule = "number";
      generateTrial(state);
      expect(state.rule).toBe("color");
    });

    it("unlocks no-go after first rule switch", () => {
      const state = createFluxState(1);
      state.trialCount = WARM_UP_TRIALS;
      state.trialsUntilSwitch = 1;
      state.noGoUnlocked = false;
      generateTrial(state);
      expect(state.noGoUnlocked).toBe(true);
    });

    it("increments trialCount each call", () => {
      const state = createFluxState(1);
      expect(state.trialCount).toBe(0);
      generateTrial(state);
      expect(state.trialCount).toBe(1);
      generateTrial(state);
      expect(state.trialCount).toBe(2);
    });
  });
});

describe("evaluateResponse", () => {
  describe("COLOR rule", () => {
    it("correct: red trial, left pressed", () => {
      const trial: Trial = { number: 3, color: "red", isNoGo: false };
      const result = evaluateResponse(trial, "color", "left");
      expect(result.correct).toBe(true);
      expect(result.points).toBe(1);
      expect(result.feedback).toBe("");
    });

    it("correct: blue trial, right pressed", () => {
      const trial: Trial = { number: 4, color: "blue", isNoGo: false };
      const result = evaluateResponse(trial, "color", "right");
      expect(result.correct).toBe(true);
      expect(result.points).toBe(1);
    });

    it("wrong: red trial, right pressed", () => {
      const trial: Trial = { number: 3, color: "red", isNoGo: false };
      const result = evaluateResponse(trial, "color", "right");
      expect(result.correct).toBe(false);
      expect(result.points).toBe(-1);
      expect(result.feedback).toContain("Red");
    });

    it("wrong: blue trial, left pressed", () => {
      const trial: Trial = { number: 4, color: "blue", isNoGo: false };
      const result = evaluateResponse(trial, "color", "left");
      expect(result.correct).toBe(false);
      expect(result.points).toBe(-1);
      expect(result.feedback).toContain("Blue");
    });
  });

  describe("NUMBER rule", () => {
    it("correct: odd number, left pressed", () => {
      const trial: Trial = { number: 7, color: "red", isNoGo: false };
      const result = evaluateResponse(trial, "number", "left");
      expect(result.correct).toBe(true);
      expect(result.points).toBe(1);
    });

    it("correct: even number, right pressed", () => {
      const trial: Trial = { number: 4, color: "blue", isNoGo: false };
      const result = evaluateResponse(trial, "number", "right");
      expect(result.correct).toBe(true);
      expect(result.points).toBe(1);
    });

    it("wrong: odd number, right pressed", () => {
      const trial: Trial = { number: 3, color: "red", isNoGo: false };
      const result = evaluateResponse(trial, "number", "right");
      expect(result.correct).toBe(false);
      expect(result.points).toBe(-1);
      expect(result.feedback).toContain("Odd");
    });

    it("wrong: even number, left pressed", () => {
      const trial: Trial = { number: 8, color: "blue", isNoGo: false };
      const result = evaluateResponse(trial, "number", "left");
      expect(result.correct).toBe(false);
      expect(result.points).toBe(-1);
      expect(result.feedback).toContain("Even");
    });
  });

  describe("no-go trials", () => {
    it("fail: pressing on a no-go trial", () => {
      const trial: Trial = { number: 5, color: "green", isNoGo: true };
      const result = evaluateResponse(trial, "color", "left");
      expect(result.correct).toBe(false);
      expect(result.points).toBe(-1);
      expect(result.noGoFail).toBe(true);
      expect(result.feedback).toBe("Don't press on green!");
    });

    it("success: withholding on a no-go trial", () => {
      const trial: Trial = { number: 5, color: "green", isNoGo: true };
      const result = evaluateResponse(trial, "color", null);
      expect(result.correct).toBe(true);
      expect(result.points).toBe(1);
      expect(result.feedback).toBe("");
    });
  });

  describe("timeout (go trial, no press)", () => {
    it("returns too slow for go trial with no press", () => {
      const trial: Trial = { number: 3, color: "red", isNoGo: false };
      const result = evaluateResponse(trial, "color", null);
      expect(result.correct).toBe(false);
      expect(result.points).toBe(-1);
      expect(result.feedback).toBe("Too slow!");
    });
  });
});

describe("updateAdaptation", () => {
  it("increments streak on correct response", () => {
    const state = createFluxState(1);
    updateAdaptation(state, true);
    expect(state.streak).toBe(1);
    updateAdaptation(state, true);
    expect(state.streak).toBe(2);
  });

  it("resets streak on wrong response", () => {
    const state = createFluxState(1);
    state.streak = 3;
    updateAdaptation(state, false);
    expect(state.streak).toBe(0);
  });

  it("speeds up by 75ms after streak of 5", () => {
    const state = createFluxState(1);
    state.intervalMs = 2000;
    for (let i = 0; i < STREAK_TO_SPEED; i++) {
      updateAdaptation(state, true);
    }
    expect(state.intervalMs).toBe(2000 - SPEED_UP);
    expect(state.streak).toBe(0); // reset after speed up
  });

  it("does not go below floor", () => {
    const state = createFluxState(1);
    state.intervalMs = STAGE_PARAMS[1].floorMs + 10;
    for (let i = 0; i < STREAK_TO_SPEED; i++) {
      updateAdaptation(state, true);
    }
    expect(state.intervalMs).toBe(STAGE_PARAMS[1].floorMs);
  });

  it("slows down by 150ms on wrong response", () => {
    const state = createFluxState(1);
    state.intervalMs = 1000;
    updateAdaptation(state, false);
    expect(state.intervalMs).toBe(1000 + SLOW_DOWN);
  });

  it("does not exceed start interval on slow down", () => {
    const state = createFluxState(1);
    state.intervalMs = STAGE_PARAMS[1].startInterval - 50;
    updateAdaptation(state, false);
    expect(state.intervalMs).toBe(STAGE_PARAMS[1].startInterval);
  });
});
