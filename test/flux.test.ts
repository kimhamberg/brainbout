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
  evaluateResponse,
  getMultiplier,
  updateAdaptation,
  bpmToMs,
} from "../src/games/flux-engine";
import type { ShapeColor, ShapeForm, Trial } from "../src/games/flux-engine";

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

describe("getMultiplier", () => {
  it("returns 1 for streak 0-2", () => {
    expect(getMultiplier(0)).toBe(1);
    expect(getMultiplier(2)).toBe(1);
  });
  it("returns 1.5 for streak 3-4", () => {
    expect(getMultiplier(3)).toBe(1.5);
    expect(getMultiplier(4)).toBe(1.5);
  });
  it("returns 2 for streak 5-9", () => {
    expect(getMultiplier(5)).toBe(2);
    expect(getMultiplier(9)).toBe(2);
  });
  it("returns 3 for streak 10-14", () => {
    expect(getMultiplier(10)).toBe(3);
    expect(getMultiplier(14)).toBe(3);
  });
  it("returns 5 for streak 15+", () => {
    expect(getMultiplier(15)).toBe(5);
    expect(getMultiplier(100)).toBe(5);
  });
});

describe("evaluateResponse", () => {
  function goTrial(overrides?: Partial<Trial>): Trial {
    return {
      color: "red",
      shape: "circle",
      size: "big",
      fill: "solid",
      isNoGo: false,
      isGolden: false,
      ...overrides,
    };
  }

  describe("COLOR rule", () => {
    it("warm (red) → left is correct", () => {
      const r = evaluateResponse(goTrial({ color: "red" }), "color", false, 0, "left");
      expect(r.correct).toBe(true);
      expect(r.basePoints).toBe(1);
    });

    it("warm (peach) → left is correct", () => {
      const r = evaluateResponse(goTrial({ color: "peach" }), "color", false, 0, "left");
      expect(r.correct).toBe(true);
    });

    it("cool (blue) → right is correct", () => {
      const r = evaluateResponse(goTrial({ color: "blue" }), "color", false, 0, "right");
      expect(r.correct).toBe(true);
    });

    it("cool (lavender) → right is correct", () => {
      const r = evaluateResponse(goTrial({ color: "lavender" }), "color", false, 0, "right");
      expect(r.correct).toBe(true);
    });

    it("warm → right is wrong", () => {
      const r = evaluateResponse(goTrial({ color: "red" }), "color", false, 0, "right");
      expect(r.correct).toBe(false);
      expect(r.basePoints).toBe(-1);
    });
  });

  describe("SHAPE rule", () => {
    it("round (circle) → left is correct", () => {
      const r = evaluateResponse(goTrial({ shape: "circle" }), "shape", false, 0, "left");
      expect(r.correct).toBe(true);
    });

    it("round (pill) → left is correct", () => {
      const r = evaluateResponse(goTrial({ shape: "pill" }), "shape", false, 0, "left");
      expect(r.correct).toBe(true);
    });

    it("angular (diamond) → right is correct", () => {
      const r = evaluateResponse(goTrial({ shape: "diamond" }), "shape", false, 0, "right");
      expect(r.correct).toBe(true);
    });

    it("angular (triangle) → right is correct", () => {
      const r = evaluateResponse(goTrial({ shape: "triangle" }), "shape", false, 0, "right");
      expect(r.correct).toBe(true);
    });
  });

  describe("SIZE rule", () => {
    it("big → left is correct", () => {
      const r = evaluateResponse(goTrial({ size: "big" }), "size", false, 0, "left");
      expect(r.correct).toBe(true);
    });

    it("small → right is correct", () => {
      const r = evaluateResponse(goTrial({ size: "small" }), "size", false, 0, "right");
      expect(r.correct).toBe(true);
    });
  });

  describe("FILL rule", () => {
    it("solid → left is correct", () => {
      const r = evaluateResponse(goTrial({ fill: "solid" }), "fill", false, 0, "left");
      expect(r.correct).toBe(true);
    });

    it("hollow → right is correct", () => {
      const r = evaluateResponse(goTrial({ fill: "hollow" }), "fill", false, 0, "right");
      expect(r.correct).toBe(true);
    });
  });

  describe("NOT rule", () => {
    it("NOT COLOR: warm → right (inverted)", () => {
      const r = evaluateResponse(goTrial({ color: "red" }), "color", true, 0, "right");
      expect(r.correct).toBe(true);
    });

    it("NOT COLOR: cool → left (inverted)", () => {
      const r = evaluateResponse(goTrial({ color: "blue" }), "color", true, 0, "left");
      expect(r.correct).toBe(true);
    });
  });

  describe("no-go trials", () => {
    it("withholding on no-go is correct", () => {
      const trial = goTrial({ isNoGo: true, color: "yellow" });
      const r = evaluateResponse(trial, "color", false, 0, null);
      expect(r.correct).toBe(true);
      expect(r.basePoints).toBe(1);
    });

    it("pressing on no-go is wrong", () => {
      const trial = goTrial({ isNoGo: true, color: "yellow" });
      const r = evaluateResponse(trial, "color", false, 0, "left");
      expect(r.correct).toBe(false);
      expect(r.noGoFail).toBe(true);
    });
  });

  describe("golden shapes", () => {
    it("correct golden gives 5 base points", () => {
      const trial = goTrial({ isGolden: true, color: "red" });
      const r = evaluateResponse(trial, "color", false, 0, "left");
      expect(r.correct).toBe(true);
      expect(r.basePoints).toBe(5);
      expect(r.isGolden).toBe(true);
    });

    it("golden with x3 multiplier gives 15 total", () => {
      const trial = goTrial({ isGolden: true, color: "red" });
      const r = evaluateResponse(trial, "color", false, 10, "left"); // streak 10 = x3
      expect(r.totalPoints).toBe(15);
    });
  });

  describe("multiplier", () => {
    it("applies streak multiplier to base points", () => {
      const r = evaluateResponse(goTrial({ color: "red" }), "color", false, 5, "left"); // streak 5 = x2
      expect(r.totalPoints).toBe(2); // 1 * 2
    });
  });

  describe("timeout", () => {
    it("null press on go trial is wrong", () => {
      const r = evaluateResponse(goTrial(), "color", false, 0, null);
      expect(r.correct).toBe(false);
      expect(r.feedback).toBe("Too slow!");
    });
  });
});

describe("bpmToMs", () => {
  it("converts 75 BPM to 800ms", () => {
    expect(bpmToMs(75)).toBe(800);
  });

  it("converts 120 BPM to 500ms", () => {
    expect(bpmToMs(120)).toBe(500);
  });
});

describe("updateAdaptation", () => {
  it("increments streak on correct", () => {
    const state = createFluxState(1);
    updateAdaptation(state, true);
    expect(state.streak).toBe(1);
  });

  it("resets streak on wrong", () => {
    const state = createFluxState(1);
    state.streak = 10;
    updateAdaptation(state, false);
    expect(state.streak).toBe(0);
  });

  it("tracks peakStreak", () => {
    const state = createFluxState(1);
    for (let i = 0; i < 8; i++) updateAdaptation(state, true);
    expect(state.peakStreak).toBe(8);
    updateAdaptation(state, false);
    expect(state.peakStreak).toBe(8); // preserved
  });

  it("increases BPM by ~5% after streak of 5", () => {
    const state = createFluxState(1);
    state.bpm = 75;
    for (let i = 0; i < 5; i++) updateAdaptation(state, true);
    expect(state.bpm).toBe(79); // Math.round(75 * 1.05)
  });

  it("does not exceed floor BPM", () => {
    const state = createFluxState(1);
    state.bpm = 89; // close to floor of 90
    for (let i = 0; i < 5; i++) updateAdaptation(state, true);
    expect(state.bpm).toBe(90); // capped at floorBpm
  });

  it("resets BPM to base on wrong", () => {
    const state = createFluxState(1);
    state.bpm = 85;
    updateAdaptation(state, false);
    expect(state.bpm).toBe(75); // back to baseBpm
  });
});
