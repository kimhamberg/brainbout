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
  generateTrial,
} from "../src/games/flux-engine";
import type { ShapeColor, ShapeForm } from "../src/games/flux-engine";

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

describe("generateTrial", () => {
  describe("shape properties", () => {
    it("generates valid colors (red, peach, blue, lavender)", () => {
      const state = createFluxState(1);
      const validGo: ShapeColor[] = ["red", "peach", "blue", "lavender"];
      for (let i = 0; i < 100; i++) {
        state.trialCount = 0;
        const trial = generateTrial(state);
        if (!trial.isNoGo) {
          expect(validGo).toContain(trial.color);
        }
      }
    });

    it("generates valid shapes (circle, pill, diamond, triangle)", () => {
      const state = createFluxState(1);
      const validGo: ShapeForm[] = ["circle", "pill", "diamond", "triangle"];
      for (let i = 0; i < 100; i++) {
        state.trialCount = 0;
        const trial = generateTrial(state);
        if (!trial.isNoGo) {
          expect(validGo).toContain(trial.shape);
        }
      }
    });

    it("generates valid sizes (big, small)", () => {
      const state = createFluxState(1);
      for (let i = 0; i < 100; i++) {
        state.trialCount = 0;
        const trial = generateTrial(state);
        if (!trial.isNoGo) {
          expect(["big", "small"]).toContain(trial.size);
        }
      }
    });

    it("generates valid fills (solid, hollow)", () => {
      const state = createFluxState(1);
      for (let i = 0; i < 100; i++) {
        state.trialCount = 0;
        const trial = generateTrial(state);
        if (!trial.isNoGo) {
          expect(["solid", "hollow"]).toContain(trial.fill);
        }
      }
    });
  });

  describe("warm-up (first 5 trials)", () => {
    it("never produces no-go trials during warm-up", () => {
      const state = createFluxState(1);
      for (let i = 0; i < WARM_UP_TRIALS; i++) {
        const trial = generateTrial(state);
        expect(trial.isNoGo).toBe(false);
      }
    });

    it("never produces golden shapes during warm-up", () => {
      const state = createFluxState(1);
      for (let i = 0; i < WARM_UP_TRIALS; i++) {
        const trial = generateTrial(state);
        expect(trial.isGolden).toBe(false);
      }
    });

    it("does not switch rules during warm-up", () => {
      const state = createFluxState(1);
      state.trialsUntilSwitch = 1;
      generateTrial(state);
      expect(state.rule).toBe("color");
    });
  });

  describe("rule switching", () => {
    it("switches rule when trialsUntilSwitch reaches 0", () => {
      const state = createFluxState(1);
      state.trialCount = WARM_UP_TRIALS;
      state.trialsUntilSwitch = 1;
      state.rule = "color";
      state.unlockedRuleCount = 2;
      generateTrial(state);
      expect(state.rule).not.toBe("color");
    });

    it("unlocks no-go after first switch", () => {
      const state = createFluxState(1);
      state.trialCount = WARM_UP_TRIALS;
      state.trialsUntilSwitch = 1;
      state.unlockedRuleCount = 2;
      generateTrial(state);
      expect(state.noGoUnlocked).toBe(true);
    });

    it("increments switchCount on each switch", () => {
      const state = createFluxState(1);
      state.trialCount = WARM_UP_TRIALS;
      state.trialsUntilSwitch = 1;
      state.unlockedRuleCount = 2;
      generateTrial(state);
      expect(state.switchCount).toBe(1);
    });

    it("unlocks third rule after 2 switches", () => {
      const state = createFluxState(1);
      state.trialCount = WARM_UP_TRIALS;
      state.switchCount = 1;
      state.trialsUntilSwitch = 1;
      state.unlockedRuleCount = 2;
      generateTrial(state);
      expect(state.unlockedRuleCount).toBe(3);
    });
  });

  describe("no-go trials", () => {
    it("COLOR no-go: yellow color (neither warm nor cool)", () => {
      const state = createFluxState(1);
      state.trialCount = WARM_UP_TRIALS;
      state.noGoUnlocked = true;
      state.rule = "color";
      state.trialsUntilSwitch = 999;
      let sawNoGo = false;
      for (let i = 0; i < 300; i++) {
        const trial = generateTrial(state);
        if (trial.isNoGo) {
          expect(trial.color).toBe("yellow");
          sawNoGo = true;
        }
      }
      expect(sawNoGo).toBe(true);
    });

    it("SHAPE no-go: blob shape (neither round nor angular)", () => {
      const state = createFluxState(1);
      state.trialCount = WARM_UP_TRIALS;
      state.noGoUnlocked = true;
      state.rule = "shape";
      state.trialsUntilSwitch = 999;
      let sawNoGo = false;
      for (let i = 0; i < 300; i++) {
        const trial = generateTrial(state);
        if (trial.isNoGo) {
          expect(trial.shape).toBe("blob");
          sawNoGo = true;
        }
      }
      expect(sawNoGo).toBe(true);
    });

    it("SIZE no-go: oscillating size", () => {
      const state = createFluxState(1);
      state.trialCount = WARM_UP_TRIALS;
      state.noGoUnlocked = true;
      state.rule = "size";
      state.trialsUntilSwitch = 999;
      let sawNoGo = false;
      for (let i = 0; i < 300; i++) {
        const trial = generateTrial(state);
        if (trial.isNoGo) {
          expect(trial.size).toBe("oscillating");
          sawNoGo = true;
        }
      }
      expect(sawNoGo).toBe(true);
    });

    it("FILL no-go: striped fill", () => {
      const state = createFluxState(2); // fill rule available in stage 2
      state.trialCount = WARM_UP_TRIALS;
      state.noGoUnlocked = true;
      state.rule = "fill";
      state.trialsUntilSwitch = 999;
      let sawNoGo = false;
      for (let i = 0; i < 300; i++) {
        const trial = generateTrial(state);
        if (trial.isNoGo) {
          expect(trial.fill).toBe("striped");
          sawNoGo = true;
        }
      }
      expect(sawNoGo).toBe(true);
    });
  });

  describe("NOT rule", () => {
    it("stage 3 can activate NOT on a switch", () => {
      const state = createFluxState(3);
      state.trialCount = WARM_UP_TRIALS;
      state.switchCount = 6; // NOT available after 6 switches
      state.unlockedRuleCount = 4;
      state.trialsUntilSwitch = 1;
      // Run many switches to see if NOT ever activates
      let sawNot = false;
      for (let i = 0; i < 200; i++) {
        state.trialsUntilSwitch = 1;
        generateTrial(state);
        if (state.isNot) {
          sawNot = true;
          break;
        }
      }
      expect(sawNot).toBe(true);
    });

    it("stage 1 never activates NOT", () => {
      const state = createFluxState(1);
      state.trialCount = WARM_UP_TRIALS;
      state.switchCount = 100;
      state.unlockedRuleCount = 3;
      for (let i = 0; i < 200; i++) {
        state.trialsUntilSwitch = 1;
        generateTrial(state);
        expect(state.isNot).toBe(false);
      }
    });
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
