import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import process from "node:process";
import fc from "fast-check";
import {
  BPM_DOWN,
  BPM_UP,
  bpmToMs,
  createFluxState,
  DURATION,
  evaluateResponse,
  GOLDEN_BASE_POINTS,
  generateTrial,
  getMultiplier,
  getRuleLabels,
  getSessionAct,
  getStreakLabel,
  STAGE_PARAMS,
  STREAK_THRESHOLDS,
  type Trial,
  updateAdaptation,
  WARM_UP_TRIALS,
} from "../src/games/flux-engine";
import { jitterInterval, levenshtein, maxTypos } from "../src/games/lex-srs";
import { defined } from "../src/shared/assert";
import {
  completeSession,
  getBest,
  getCheckmates,
  getSessionsToday,
  getStreak,
  getTodayBest,
  getTotalSessions,
  recordCheckmate,
  recordSessionScore,
  todayString,
} from "../src/shared/progress";
import { type Rng, resetRng, setRng } from "../src/shared/rng";
import {
  advance,
  getHistory,
  getStage,
  MAX_STAGE,
  readiness,
  recordResult,
  retreat,
} from "../src/shared/stages";

const NUM_RUNS = Number(process.env.FAST_CHECK_NUM_RUNS ?? 200);
const cfg = { numRuns: NUM_RUNS } as const;

/** Deterministic RNG: returns 0.5 always (good for symmetric branch coverage). */
function constRng(v: number): Rng {
  return () => v;
}

/** Mulberry32 deterministic PRNG (seedable). */
function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d_2b_79_f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

// The rng module is a singleton shared across test files in the same Bun
// process. Reset after every test so per-describe `setRng` calls cannot
// leak into other files (e.g., flux.test.ts) that assume Math.random.
afterEach(() => {
  resetRng();
});
/* ====================================================================== */
/* lex-srs                                                                 */
/* ====================================================================== */

describe("property: lex-srs.levenshtein", () => {
  const s = fc.string({ maxLength: 12 });

  it("identity", () => {
    fc.assert(
      fc.property(s, (a) => levenshtein(a, a) === 0),
      cfg,
    );
  });

  it("symmetry", () => {
    fc.assert(
      fc.property(s, s, (a, b) => levenshtein(a, b) === levenshtein(b, a)),
      cfg,
    );
  });

  it("bounded below by length difference", () => {
    fc.assert(
      fc.property(
        s,
        s,
        (a, b) => levenshtein(a, b) >= Math.abs(a.length - b.length),
      ),
      cfg,
    );
  });

  it("bounded above by max length", () => {
    fc.assert(
      fc.property(
        s,
        s,
        (a, b) => levenshtein(a, b) <= Math.max(a.length, b.length),
      ),
      cfg,
    );
  });

  it("triangle inequality", () => {
    fc.assert(
      fc.property(
        s,
        s,
        s,
        (a, b, c) => levenshtein(a, c) <= levenshtein(a, b) + levenshtein(b, c),
      ),
      cfg,
    );
  });

  it("exact: empty vs abc → 3", () => {
    expect(levenshtein("", "abc")).toBe(3);
  });

  it("exact: abc vs abd → 1 (sub)", () => {
    expect(levenshtein("abc", "abd")).toBe(1);
  });

  it("exact: abc vs ac → 1 (del)", () => {
    expect(levenshtein("abc", "ac")).toBe(1);
  });

  it("exact: ac vs abc → 1 (ins)", () => {
    expect(levenshtein("ac", "abc")).toBe(1);
  });

  it("exact: kitten vs sitting → 3", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });

  it("exact: same strings → 0", () => {
    expect(levenshtein("hello", "hello")).toBe(0);
  });

  it("exact: both empty → 0", () => {
    expect(levenshtein("", "")).toBe(0);
  });
});

describe("lex-srs.maxTypos exact boundaries", () => {
  it("length 0 → 0", () => expect(maxTypos(0)).toBe(0));
  it("length 3 → 0", () => expect(maxTypos(3)).toBe(0));
  it("length 4 → 1", () => expect(maxTypos(4)).toBe(1));
  it("length 7 → 1", () => expect(maxTypos(7)).toBe(1));
  it("length 8 → 2", () => expect(maxTypos(8)).toBe(2));
  it("length 50 → 2", () => expect(maxTypos(50)).toBe(2));
});

describe("lex-srs.maxTypos properties", () => {
  it("never exceeds word length", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 50 }), (n) => maxTypos(n) <= n),
      cfg,
    );
  });

  it("monotonic non-decreasing", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 49 }),
        (n) => maxTypos(n + 1) >= maxTypos(n),
      ),
      cfg,
    );
  });
});

describe("lex-srs.jitterInterval", () => {
  it("never jitters box 0 (same-day re-exposure)", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (r) => {
        expect(jitterInterval(0, () => r)).toBe(0);
      }),
      cfg,
    );
  });
  it("jittered interval is within ±25% of base, minimum 1 day", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 365 }),
        fc.double({ min: 0, max: 0.999_999, noNaN: true }),
        (base, r) => {
          const got = jitterInterval(base, () => r);
          expect(got).toBeGreaterThanOrEqual(1);
          expect(got).toBeGreaterThanOrEqual(Math.floor(base * 0.75));
          expect(got).toBeLessThanOrEqual(Math.ceil(base * 1.25));
        },
      ),
      cfg,
    );
  });
});

/* ====================================================================== */
/* flux-engine                                                             */
/* ====================================================================== */

describe("flux-engine.bpmToMs exact", () => {
  it("60 bpm → 1000 ms", () => expect(bpmToMs(60)).toBe(1000));
  it("120 bpm → 500 ms", () => expect(bpmToMs(120)).toBe(500));
  it("30 bpm → 2000 ms", () => expect(bpmToMs(30)).toBe(2000));
  it("strictly decreasing", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 30, max: 240 }),
        (bpm) => bpmToMs(bpm) > bpmToMs(bpm + 1),
      ),
      cfg,
    );
  });
  it("positive", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1000 }), (bpm) => bpmToMs(bpm) > 0),
      cfg,
    );
  });
});

describe("flux-engine.getMultiplier boundaries", () => {
  it("0 → 1", () => expect(getMultiplier(0)).toBe(1));
  it("2 → 1 (just below spark)", () => expect(getMultiplier(2)).toBe(1));
  it("3 → 1.5 (spark)", () => expect(getMultiplier(3)).toBe(1.5));
  it("4 → 1.5", () => expect(getMultiplier(4)).toBe(1.5));
  it("5 → 2 (flame)", () => expect(getMultiplier(5)).toBe(2));
  it("9 → 2", () => expect(getMultiplier(9)).toBe(2));
  it("10 → 3 (blaze)", () => expect(getMultiplier(10)).toBe(3));
  it("14 → 3", () => expect(getMultiplier(14)).toBe(3));
  it("15 → 5 (inferno)", () => expect(getMultiplier(15)).toBe(5));
  it("1000 → 5", () => expect(getMultiplier(1000)).toBe(5));
});

describe("flux-engine.getStreakLabel boundaries", () => {
  it("0 → ''", () => expect(getStreakLabel(0)).toBe(""));
  it("2 → ''", () => expect(getStreakLabel(2)).toBe(""));
  it("3 → 'spark'", () => expect(getStreakLabel(3)).toBe("spark"));
  it("5 → 'flame'", () => expect(getStreakLabel(5)).toBe("flame"));
  it("10 → 'blaze'", () => expect(getStreakLabel(10)).toBe("blaze"));
  it("15 → 'inferno'", () => expect(getStreakLabel(15)).toBe("inferno"));
});

describe("flux-engine.getSessionAct boundaries", () => {
  // elapsed = DURATION - remaining; warmup if elapsed < 15; flow if remaining > 15; climax otherwise
  it("remaining=DURATION (elapsed 0) → warmup", () => {
    expect(getSessionAct(DURATION)).toBe("warmup");
  });
  it("remaining=DURATION-14 (elapsed 14) → warmup", () => {
    expect(getSessionAct(DURATION - 14)).toBe("warmup");
  });
  it("remaining=DURATION-15 (elapsed 15) → flow", () => {
    expect(getSessionAct(DURATION - 15)).toBe("flow");
  });
  it("remaining=16 → flow", () => expect(getSessionAct(16)).toBe("flow"));
  it("remaining=15 → climax", () => expect(getSessionAct(15)).toBe("climax"));
  it("remaining=0 → climax", () => expect(getSessionAct(0)).toBe("climax"));
});

describe("flux-engine.getRuleLabels", () => {
  it("color: Warm / Cool", () =>
    expect(getRuleLabels("color", false)).toEqual(["Warm", "Cool"]));
  it("shape: Round / Angular", () =>
    expect(getRuleLabels("shape", false)).toEqual(["Round", "Angular"]));
  it("size: Big / Small", () =>
    expect(getRuleLabels("size", false)).toEqual(["Big", "Small"]));
  it("fill: Solid / Hollow", () =>
    expect(getRuleLabels("fill", false)).toEqual(["Solid", "Hollow"]));
  it("isNot swaps", () =>
    expect(getRuleLabels("color", true)).toEqual(["Cool", "Warm"]));

  it("property: isNot true == swap of isNot false", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("color", "shape", "size", "fill" as const),
        (rule) => {
          const [a, b] = getRuleLabels(rule, false);
          const [a2, b2] = getRuleLabels(rule, true);
          return a === b2 && b === a2;
        },
      ),
      cfg,
    );
  });
});

describe("flux-engine.evaluateResponse", () => {
  beforeEach(() => setRng(constRng(0.5)));
  afterAll(resetRng);

  const baseTrial: Trial = {
    color: "red",
    shape: "circle",
    size: "big",
    fill: "solid",
    isNoGo: false,
    isGolden: false,
  };

  it("no-go + press = incorrect, -1, feedback Don't press!", () => {
    const r = evaluateResponse(
      { ...baseTrial, isNoGo: true },
      "color",
      false,
      0,
      "left",
    );
    expect(r.correct).toBe(false);
    expect(r.basePoints).toBe(-1);
    expect(r.multiplier).toBe(1);
    expect(r.totalPoints).toBe(-1);
    expect(r.noGoFail).toBe(true);
    expect(r.feedback).toBe("Don't press!");
  });

  it("no-go + no press = correct, base 1, multiplier from streak", () => {
    const r = evaluateResponse(
      { ...baseTrial, isNoGo: true },
      "color",
      false,
      5,
      null,
    );
    expect(r.correct).toBe(true);
    expect(r.basePoints).toBe(1);
    expect(r.multiplier).toBe(2);
    expect(r.totalPoints).toBe(2);
  });

  it("go trial null press = correct false, -1, Too slow!", () => {
    const r = evaluateResponse(baseTrial, "color", false, 10, null);
    expect(r.correct).toBe(false);
    expect(r.basePoints).toBe(-1);
    expect(r.multiplier).toBe(1);
    expect(r.totalPoints).toBe(-1);
    expect(r.feedback).toBe("Too slow!");
  });

  it("go trial correct (red→Warm/left, color rule)", () => {
    const r = evaluateResponse(baseTrial, "color", false, 0, "left");
    expect(r.correct).toBe(true);
    expect(r.basePoints).toBe(1);
    expect(r.multiplier).toBe(1);
    expect(r.totalPoints).toBe(1);
  });

  it("go trial wrong side gives feedback with correct label", () => {
    const r = evaluateResponse(baseTrial, "color", false, 0, "right");
    expect(r.correct).toBe(false);
    expect(r.feedback).toBe("It was Warm");
  });

  it("golden trial correct → basePoints = GOLDEN_BASE_POINTS", () => {
    const r = evaluateResponse(
      { ...baseTrial, isGolden: true },
      "color",
      false,
      0,
      "left",
    );
    expect(r.basePoints).toBe(GOLDEN_BASE_POINTS);
    expect(r.totalPoints).toBe(GOLDEN_BASE_POINTS);
    expect(r.isGolden).toBe(true);
  });

  it("golden trial correct streak 15 → 25 points", () => {
    const r = evaluateResponse(
      { ...baseTrial, isGolden: true },
      "color",
      false,
      15,
      "left",
    );
    expect(r.totalPoints).toBe(25);
  });

  it("isNot inverts correct side (red+color+isNot → right)", () => {
    const r = evaluateResponse(baseTrial, "color", true, 0, "right");
    expect(r.correct).toBe(true);
  });

  it("shape rule: circle is round → left", () => {
    const r = evaluateResponse(baseTrial, "shape", false, 0, "left");
    expect(r.correct).toBe(true);
  });

  it("shape rule: diamond is angular → right", () => {
    const r = evaluateResponse(
      { ...baseTrial, shape: "diamond" },
      "shape",
      false,
      0,
      "right",
    );
    expect(r.correct).toBe(true);
  });

  it("size rule: big → left", () => {
    const r = evaluateResponse(baseTrial, "size", false, 0, "left");
    expect(r.correct).toBe(true);
  });

  it("size rule: small → right", () => {
    const r = evaluateResponse(
      { ...baseTrial, size: "small" },
      "size",
      false,
      0,
      "right",
    );
    expect(r.correct).toBe(true);
  });

  it("fill rule: solid → left", () => {
    const r = evaluateResponse(baseTrial, "fill", false, 0, "left");
    expect(r.correct).toBe(true);
  });

  it("fill rule: hollow → right", () => {
    const r = evaluateResponse(
      { ...baseTrial, fill: "hollow" },
      "fill",
      false,
      0,
      "right",
    );
    expect(r.correct).toBe(true);
  });

  it("color rule: peach is warm (left)", () => {
    const r = evaluateResponse(
      { ...baseTrial, color: "peach" },
      "color",
      false,
      0,
      "left",
    );
    expect(r.correct).toBe(true);
  });

  it("color rule: blue is cool (right)", () => {
    const r = evaluateResponse(
      { ...baseTrial, color: "blue" },
      "color",
      false,
      0,
      "right",
    );
    expect(r.correct).toBe(true);
  });

  it("color rule: lavender is cool (right)", () => {
    const r = evaluateResponse(
      { ...baseTrial, color: "lavender" },
      "color",
      false,
      0,
      "right",
    );
    expect(r.correct).toBe(true);
  });

  it("shape rule: pill is round (left)", () => {
    const r = evaluateResponse(
      { ...baseTrial, shape: "pill" },
      "shape",
      false,
      0,
      "left",
    );
    expect(r.correct).toBe(true);
  });

  it("shape rule: triangle is angular (right)", () => {
    const r = evaluateResponse(
      { ...baseTrial, shape: "triangle" },
      "shape",
      false,
      0,
      "right",
    );
    expect(r.correct).toBe(true);
  });
});

describe("flux-engine.updateAdaptation exact", () => {
  it("correct: bpm += BPM_UP", () => {
    const st = createFluxState(1);
    const before = st.bpm;
    updateAdaptation(st, true);
    expect(st.bpm).toBe(before + BPM_UP);
    expect(st.streak).toBe(1);
    expect(st.peakStreak).toBe(1);
  });

  it("incorrect: bpm -= BPM_DOWN; streak reset", () => {
    const st = createFluxState(1);
    // 10 corrects to push bpm well above baseBpm + BPM_DOWN so subtraction isn't clamped.
    for (let i = 0; i < 10; i++) {
      updateAdaptation(st, true);
    }
    const before = st.bpm;
    updateAdaptation(st, false);
    expect(st.bpm).toBeCloseTo(before - BPM_DOWN, 6);
    expect(st.streak).toBe(0);
  });

  it("bpm clamped at floorBpm (max)", () => {
    const st = createFluxState(1);
    for (let i = 0; i < 1000; i++) {
      updateAdaptation(st, true);
    }
    expect(st.bpm).toBe(defined(STAGE_PARAMS[1]).floorBpm);
  });

  it("bpm clamped at baseBpm (min)", () => {
    const st = createFluxState(1);
    for (let i = 0; i < 1000; i++) {
      updateAdaptation(st, false);
    }
    expect(st.bpm).toBe(defined(STAGE_PARAMS[1]).baseBpm);
  });

  it("peakStreak tracks max streak observed", () => {
    const st = createFluxState(1);
    for (let i = 0; i < 7; i++) {
      updateAdaptation(st, true);
    }
    updateAdaptation(st, false);
    for (let i = 0; i < 3; i++) {
      updateAdaptation(st, true);
    }
    expect(st.peakStreak).toBe(7);
    expect(st.streak).toBe(3);
  });
});

describe("flux-engine.createFluxState defaults", () => {
  beforeEach(() => setRng(seededRng(1)));
  afterAll(resetRng);

  it("stage 1 initial values", () => {
    const st = createFluxState(1);
    expect(st.score).toBe(0);
    expect(st.streak).toBe(0);
    expect(st.peakStreak).toBe(0);
    expect(st.trialCount).toBe(0);
    expect(st.switchCount).toBe(0);
    expect(st.bpm).toBe(defined(STAGE_PARAMS[1]).baseBpm);
    expect(st.rule).toBe("color");
    expect(st.isNot).toBe(false);
    expect(st.noGoUnlocked).toBe(false);
    expect(st.stage).toBe(1);
    expect(st.unlockedRuleCount).toBe(1);
  });

  it("trialsUntilSwitch in [switchMin, switchMax]", () => {
    for (let i = 0; i < 50; i++) {
      const st = createFluxState(1);
      const p = defined(STAGE_PARAMS[1]);
      expect(st.trialsUntilSwitch).toBeGreaterThanOrEqual(p.switchMin);
      expect(st.trialsUntilSwitch).toBeLessThanOrEqual(p.switchMax);
    }
  });
});

describe("flux-engine.generateTrial (seeded RNG)", () => {
  beforeEach(() => setRng(seededRng(42)));
  afterAll(resetRng);

  it("warm-up trials are not no-go or golden", () => {
    const st = createFluxState(1);
    for (let i = 0; i < WARM_UP_TRIALS; i++) {
      const t = generateTrial(st);
      expect(t.isNoGo).toBe(false);
      expect(t.isGolden).toBe(false);
    }
  });

  it("trialCount increments by 1 per call", () => {
    const st = createFluxState(1);
    for (let i = 0; i < 20; i++) {
      generateTrial(st);
    }
    expect(st.trialCount).toBe(20);
  });

  it("generated trial has all properties set", () => {
    const st = createFluxState(2);
    for (let i = 0; i < 30; i++) {
      const t = generateTrial(st);
      expect(["red", "peach", "blue", "lavender", "green"]).toContain(t.color);
      expect(["circle", "pill", "diamond", "triangle", "blob"]).toContain(
        t.shape,
      );
      expect(["big", "small", "dual"]).toContain(t.size);
      expect(["solid", "hollow", "striped"]).toContain(t.fill);
    }
  });

  it("no-go color trial has green color", () => {
    setRng(() => 0); // force noGo path post-warmup; rng=0 triggers all "<" branches
    const st = createFluxState(1);
    for (let i = 0; i < WARM_UP_TRIALS; i++) {
      generateTrial(st);
    }
    // After warmup, force a switch by exhausting trialsUntilSwitch
    let foundNoGo = false;
    for (let i = 0; i < 50 && !foundNoGo; i++) {
      const t = generateTrial(st);
      if (t.isNoGo && st.rule === "color") {
        expect(t.color).toBe("green");
        foundNoGo = true;
      }
    }
  });
});

describe("flux-engine constants", () => {
  it("DURATION = 75", () => expect(DURATION).toBe(75));
  it("WARM_UP_TRIALS = 8", () => expect(WARM_UP_TRIALS).toBe(8));
  it("GOLDEN_BASE_POINTS = 5", () => expect(GOLDEN_BASE_POINTS).toBe(5));
  it("BPM_UP = 1", () => expect(BPM_UP).toBe(1));
  it("BPM_DOWN ≈ 5.303", () => expect(BPM_DOWN).toBeCloseTo(5.303, 2));
  it("STREAK_THRESHOLDS has 4 entries", () =>
    expect(STREAK_THRESHOLDS.length).toBe(4));
  it("STAGE_PARAMS has 4 entries", () => expect(STAGE_PARAMS.length).toBe(4));
});

/* ====================================================================== */
/* stages                                                                  */
/* ====================================================================== */

describe("stages exact", () => {
  beforeEach(() => localStorage.clear());

  it("getStage: 1 for unknown", () => expect(getStage("flux")).toBe(1));

  it("getHistory: [] for unknown", () =>
    expect(getHistory("flux")).toEqual([]));

  it("recordResult appends in order", () => {
    recordResult("flux", 0.5);
    recordResult("flux", 0.7);
    expect(getHistory("flux")).toEqual([0.5, 0.7]);
  });

  it("history exactly 5 after 5 entries", () => {
    for (let i = 0; i < 5; i++) {
      recordResult("flux", i / 10);
    }
    expect(getHistory("flux")).toHaveLength(5);
  });

  it("history exactly 5 after 6 entries (oldest dropped)", () => {
    for (let i = 0; i < 6; i++) {
      recordResult("flux", i / 10);
    }
    expect(getHistory("flux")).toHaveLength(5);
    expect(getHistory("flux")[0]).toBe(0.1);
  });

  it("advance increments by 1", () => {
    advance("flux");
    expect(getStage("flux")).toBe(2);
  });

  it("advance clamped at MAX_STAGE", () => {
    for (let i = 0; i < 10; i++) {
      advance("flux");
    }
    expect(getStage("flux")).toBe(MAX_STAGE);
  });

  it("advance clears history", () => {
    recordResult("flux", 0.5);
    advance("flux");
    expect(getHistory("flux")).toEqual([]);
  });

  it("retreat decrements by 1", () => {
    advance("flux");
    advance("flux");
    retreat("flux");
    expect(getStage("flux")).toBe(2);
  });

  it("retreat clamped at 1", () => {
    retreat("flux");
    retreat("flux");
    expect(getStage("flux")).toBe(1);
  });

  it("retreat does NOT clear history", () => {
    recordResult("flux", 0.5);
    advance("flux");
    recordResult("flux", 0.7);
    retreat("flux");
    expect(getHistory("flux")).toEqual([0.7]);
  });
});

describe("stages.readiness exact", () => {
  beforeEach(() => localStorage.clear());

  it("grey when stage >= MAX_STAGE", () => {
    for (let i = 0; i < MAX_STAGE; i++) {
      advance("flux");
    }
    for (let i = 0; i < 5; i++) {
      recordResult("flux", 1.0);
    }
    expect(readiness("flux", 0.8)).toBe("grey");
  });

  it("grey when history < 5", () => {
    for (let i = 0; i < 4; i++) {
      recordResult("flux", 1.0);
    }
    expect(readiness("flux", 0.8)).toBe("grey");
  });

  it("green when avg === threshold", () => {
    for (let i = 0; i < 5; i++) {
      recordResult("flux", 0.8);
    }
    expect(readiness("flux", 0.8)).toBe("green");
  });

  it("amber when avg === threshold - 0.05", () => {
    for (let i = 0; i < 5; i++) {
      recordResult("flux", 0.75);
    }
    expect(readiness("flux", 0.8)).toBe("amber");
  });

  it("amber when avg just inside (threshold - 0.09)", () => {
    for (let i = 0; i < 5; i++) {
      recordResult("flux", 0.71);
    }
    expect(readiness("flux", 0.8)).toBe("amber");
  });

  it("grey when avg < threshold - 0.1", () => {
    for (let i = 0; i < 5; i++) {
      recordResult("flux", 0.5);
    }
    expect(readiness("flux", 0.8)).toBe("grey");
  });

  it("grey when avg just below (threshold - 0.11)", () => {
    for (let i = 0; i < 5; i++) {
      recordResult("flux", 0.69);
    }
    expect(readiness("flux", 0.8)).toBe("grey");
  });

  it("grey on corrupt JSON", () => {
    localStorage.setItem("brainbout:stage:flux", "{bad");
    expect(readiness("flux", 0.8)).toBe("grey");
  });
});

/* ====================================================================== */
/* progress                                                                */
/* ====================================================================== */

describe("progress.todayString", () => {
  it("returns YYYY-MM-DD with zero-padded month/day", () => {
    const s = todayString();
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
  });
});

describe("progress.recordSessionScore + getBest", () => {
  beforeEach(() => localStorage.clear());

  it("first score sets best", () => {
    recordSessionScore("crown", 100);
    expect(getBest("crown")).toBe(100);
  });

  it("higher score updates best", () => {
    recordSessionScore("crown", 50);
    recordSessionScore("crown", 80);
    expect(getBest("crown")).toBe(80);
  });

  it("equal score does NOT update best", () => {
    recordSessionScore("crown", 80);
    localStorage.setItem("brainbout:best:crown", "80");
    recordSessionScore("crown", 80);
    expect(getBest("crown")).toBe(80);
  });

  it("lower score does NOT update best", () => {
    recordSessionScore("crown", 100);
    recordSessionScore("crown", 50);
    expect(getBest("crown")).toBe(100);
  });

  it("today-best mirrors best within day", () => {
    recordSessionScore("crown", 100);
    expect(getTodayBest("crown")).toBe(100);
  });

  it("getBest returns null when none", () => {
    expect(getBest("crown")).toBeNull();
  });

  it("getTodayBest returns null when none", () => {
    expect(getTodayBest("crown")).toBeNull();
  });

  it("first score of 0 still seeds today-best (covers prevToday-null branch)", () => {
    recordSessionScore("crown", 0);
    expect(getTodayBest("crown")).toBe(0);
  });
});

describe("progress.completeSession + getSessionsToday + getTotalSessions", () => {
  beforeEach(() => localStorage.clear());

  it("starts at 0", () => {
    expect(getSessionsToday()).toBe(0);
    expect(getTotalSessions()).toBe(0);
  });

  it("increments by exactly 1", () => {
    completeSession();
    expect(getSessionsToday()).toBe(1);
    expect(getTotalSessions()).toBe(1);
  });

  it("3 sessions -> 3", () => {
    completeSession();
    completeSession();
    completeSession();
    expect(getSessionsToday()).toBe(3);
    expect(getTotalSessions()).toBe(3);
  });
});

describe("progress.getStreak", () => {
  beforeEach(() => localStorage.clear());

  it("0 when no sessions", () => {
    expect(getStreak("2025-01-10")).toBe(0);
  });

  it("1 when only today", () => {
    localStorage.setItem("brainbout:sessions:2025-01-10", "1");
    expect(getStreak("2025-01-10")).toBe(1);
  });

  it("3 when today, -1, -2 days", () => {
    localStorage.setItem("brainbout:sessions:2025-01-10", "1");
    localStorage.setItem("brainbout:sessions:2025-01-09", "1");
    localStorage.setItem("brainbout:sessions:2025-01-08", "1");
    expect(getStreak("2025-01-10")).toBe(3);
  });

  it("gap breaks streak", () => {
    localStorage.setItem("brainbout:sessions:2025-01-10", "1");
    localStorage.setItem("brainbout:sessions:2025-01-08", "1");
    expect(getStreak("2025-01-10")).toBe(1);
  });

  it("sessions = 0 breaks streak", () => {
    localStorage.setItem("brainbout:sessions:2025-01-10", "0");
    expect(getStreak("2025-01-10")).toBe(0);
  });
});

describe("progress.checkmates", () => {
  beforeEach(() => localStorage.clear());

  it("returns 0 when none", () => {
    expect(getCheckmates(1500)).toBe(0);
  });

  it("records and increments", () => {
    recordCheckmate(1500);
    expect(getCheckmates(1500)).toBe(1);
    recordCheckmate(1500);
    expect(getCheckmates(1500)).toBe(2);
  });

  it("scoped by elo", () => {
    recordCheckmate(1500);
    recordCheckmate(2000);
    expect(getCheckmates(1500)).toBe(1);
    expect(getCheckmates(2000)).toBe(1);
  });
});

/* ====================================================================== */
/* assert                                                                  */
/* ====================================================================== */

describe("assert.defined", () => {
  it("returns value when defined", () => {
    expect(defined(42)).toBe(42);
    expect(defined("x")).toBe("x");
    expect(defined(0)).toBe(0);
    expect(defined(null)).toBeNull();
    expect(defined(false)).toBe(false);
  });

  it("throws default message", () => {
    expect(() => defined(undefined)).toThrow("unexpected undefined");
  });

  it("throws custom message", () => {
    expect(() => defined(undefined, "boom")).toThrow("boom");
  });
});

/* ====================================================================== */
/* RNG injection                                                           */
/* ====================================================================== */

describe("rng module", () => {
  it("setRng + resetRng work", () => {
    setRng(() => 0.123);
    setRng(() => 0.456);
    resetRng();
    // After resetRng, jitterInterval falls back to Math.random; both calls
    // produce values within the documented ±25% band, proving the default
    // rng is wired up.
    const a = jitterInterval(10);
    const b = jitterInterval(10);
    expect(a).toBeGreaterThanOrEqual(7);
    expect(a).toBeLessThanOrEqual(13);
    expect(b).toBeGreaterThanOrEqual(7);
    expect(b).toBeLessThanOrEqual(13);
  });
});

/* ====================================================================== */
/* hub: robust against malformed sessionStorage / URL params               */
/* ====================================================================== */

describe("property: hub init resists garbage state", () => {
  // Each iteration mounts DOM + runs init(); cap at a sane budget regardless
  // of FAST_CHECK_NUM_RUNS so the fuzz suite doesn't blow up to tens of
  // minutes when other properties are pushed to 100k.
  const hubCfg = { numRuns: Math.min(NUM_RUNS, 500) } as const;

  function seedDom(): void {
    document.body.innerHTML = `
      <div id="app" class="app">
        <header class="hub-header">
          <button id="theme-btn" aria-label="Toggle theme"></button>
          <span class="hub-icon-slot"></span>
        </header>
        <main id="hub"></main>
      </div>
    `;
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.search = "";
    seedDom();
  });

  it("any string in sessionStorage:current-session is non-fatal", async () => {
    const { init } = await import("../src/hub");
    fc.assert(
      fc.property(fc.string(), (junk) => {
        seedDom();
        sessionStorage.setItem("brainbout:current-session", junk);
        expect(() => init()).not.toThrow();
      }),
      hubCfg,
    );
  });

  it("any string in ?completed= URL param is non-fatal", async () => {
    const { init } = await import("../src/hub");
    fc.assert(
      fc.property(fc.string(), (junk) => {
        seedDom();
        window.location.search = `?completed=${encodeURIComponent(junk)}`;
        expect(() => init()).not.toThrow();
      }),
      hubCfg,
    );
  });

  it("arbitrary JSON arrays in sessionStorage filter down to known game ids", async () => {
    const { init } = await import("../src/hub");
    fc.assert(
      fc.property(fc.array(fc.string()), (arr) => {
        seedDom();
        sessionStorage.setItem(
          "brainbout:current-session",
          JSON.stringify(arr),
        );
        init();
        // Every rendered done card must correspond to a real game id
        const doneCards = document.querySelectorAll<HTMLElement>(
          "#hub .game-card.done .game-name",
        );
        for (const el of doneCards) {
          expect(["Crown", "Flux", "Lex"]).toContain(el.textContent);
        }
      }),
      hubCfg,
    );
  });
});

/* keep the variable referenced so import isn't dead */
void seededRng;
