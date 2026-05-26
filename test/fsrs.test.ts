import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  type CardState,
  getCard,
  getMasteredCountByPrefix,
  getSeenKeys,
  goodFactor,
  isDue,
  isMastered,
  jitterInterval,
  MASTERY_STABILITY_DAYS,
  PREFIX,
  recordReview,
  updateDifficulty,
  updateStability,
} from "../src/shared/fsrs";
import { resetRng, setRng } from "../src/shared/rng";

beforeEach(() => {
  localStorage.clear();
  setRng(() => 0.5);
});

afterEach(resetRng);

describe("PREFIX", () => {
  it("is brainbout (shared with progress / stages)", () => {
    expect(PREFIX).toBe("brainbout");
  });
});

describe("updateDifficulty", () => {
  it("again bumps d by 1, capped at 10", () => {
    expect(updateDifficulty(5, "again")).toBe(6);
    expect(updateDifficulty(10, "again")).toBe(10);
  });
  it("hard bumps d by 0.5, capped at 10", () => {
    expect(updateDifficulty(5, "hard")).toBe(5.5);
    expect(updateDifficulty(9.8, "hard")).toBe(10);
  });
  it("good leaves d unchanged", () => {
    expect(updateDifficulty(5, "good")).toBe(5);
  });
  it("easy drops d by 0.5, floored at 1", () => {
    expect(updateDifficulty(5, "easy")).toBe(4.5);
    expect(updateDifficulty(1.2, "easy")).toBe(1);
  });
});

describe("goodFactor", () => {
  it("easier cards (low d) grow stability faster", () => {
    expect(goodFactor(1)).toBeGreaterThan(goodFactor(10));
  });
  it("never drops below 1.3 (stability always grows under good)", () => {
    expect(goodFactor(10)).toBeGreaterThanOrEqual(1.3);
  });
});

describe("updateStability", () => {
  it("new card uses INIT_STABILITY seed per grade", () => {
    expect(updateStability(0, 5, "again")).toBe(0.5);
    expect(updateStability(0, 5, "hard")).toBe(1);
    expect(updateStability(0, 5, "good")).toBe(3);
    expect(updateStability(0, 5, "easy")).toBe(7);
  });
  it("again on existing card preserves 20 % of prior stability", () => {
    expect(updateStability(10, 5, "again")).toBe(2);
    expect(updateStability(2, 5, "again")).toBe(0.5);
  });
  it("good multiplies by goodFactor(d)", () => {
    const f = goodFactor(5);
    expect(updateStability(10, 5, "good")).toBeCloseTo(10 * f);
  });
  it("easy multiplies by goodFactor × 1.5", () => {
    const f = goodFactor(5);
    expect(updateStability(10, 5, "easy")).toBeCloseTo(10 * f * 1.5);
  });
});

describe("jitterInterval", () => {
  it("0 stability → 0 days (don't schedule new cards far out)", () => {
    expect(jitterInterval(0)).toBe(0);
  });
  it("factor of 1.0 (rng = 0.5) → round to base days", () => {
    expect(jitterInterval(10, () => 0.5)).toBe(10);
  });
  it("rng=0 → factor 0.85; rng→1 → factor ~1.15", () => {
    expect(jitterInterval(10, () => 0)).toBe(Math.round(10 * 0.85));
    expect(jitterInterval(10, () => 0.999)).toBeGreaterThanOrEqual(11);
  });
  it("base 0.1 day rounds up to minimum 1", () => {
    expect(jitterInterval(0.1, () => 0)).toBe(1);
  });
});

describe("recordReview + getCard storage", () => {
  it("first review on a fresh key persists stability + difficulty", () => {
    const c = recordReview("crown:few:rot180", "good", "2026-05-26");
    expect(c.s).toBe(3);
    expect(c.d).toBe(5);
    expect(c.lastReview).toBe("2026-05-26");
    expect(c.reps).toBe(1);
    expect(c.lapses).toBe(0);
  });
  it("again increments lapses + ups difficulty", () => {
    const a = recordReview("flux:color", "again", "2026-05-26");
    expect(a.lapses).toBe(1);
    expect(a.d).toBe(6);
    const b = recordReview("flux:color", "again", "2026-05-26");
    expect(b.lapses).toBe(2);
  });
  it("getCard returns NEW_CARD shape for keys never seen", () => {
    const c = getCard("crown:mid:rot90");
    expect(c).toEqual({
      s: 0,
      d: 5,
      lastReview: "",
      nextDue: "",
      lapses: 0,
      reps: 0,
    });
  });
  it("getCard recovers from malformed JSON gracefully", () => {
    localStorage.setItem(`${PREFIX}:flux:color`, "{not json");
    expect(getCard("flux:color").d).toBe(5);
  });
  it("getCard fills missing fields with defaults (partial JSON)", () => {
    localStorage.setItem(
      `${PREFIX}:flux:color`,
      JSON.stringify({ s: 4 } satisfies Partial<CardState>),
    );
    const c = getCard("flux:color");
    expect(c.s).toBe(4);
    expect(c.d).toBe(5);
  });
});

describe("isDue", () => {
  it("never scheduled (empty nextDue) is due today", () => {
    const c: CardState = {
      s: 0,
      d: 5,
      lastReview: "",
      nextDue: "",
      lapses: 0,
      reps: 0,
    };
    expect(isDue(c, "2026-05-26")).toBe(true);
  });
  it("nextDue in the past → due", () => {
    const c = { ...getCard("x"), nextDue: "2026-05-20" };
    expect(isDue(c, "2026-05-26")).toBe(true);
  });
  it("nextDue in the future → not due", () => {
    const c = { ...getCard("x"), nextDue: "2026-06-01" };
    expect(isDue(c, "2026-05-26")).toBe(false);
  });
  it("nextDue == today → due", () => {
    const c = { ...getCard("x"), nextDue: "2026-05-26" };
    expect(isDue(c, "2026-05-26")).toBe(true);
  });
});

describe("isMastered + MASTERY_STABILITY_DAYS", () => {
  it("threshold is 30 days (1 month of resilience proxy)", () => {
    expect(MASTERY_STABILITY_DAYS).toBe(30);
  });
  it("s >= 30 → mastered", () => {
    expect(isMastered({ ...getCard("x"), s: 30 })).toBe(true);
    expect(isMastered({ ...getCard("x"), s: 100 })).toBe(true);
  });
  it("s < 30 → not mastered", () => {
    expect(isMastered({ ...getCard("x"), s: 29.99 })).toBe(false);
    expect(isMastered({ ...getCard("x"), s: 0 })).toBe(false);
  });
});

describe("getSeenKeys", () => {
  it("returns sub-keys (without the brainbout: prefix) matching subPrefix", () => {
    recordReview("crown:few:rot180", "good", "2026-05-26");
    recordReview("crown:mid:rot90", "easy", "2026-05-26");
    recordReview("flux:color", "good", "2026-05-26");
    const seen = getSeenKeys("crown:");
    expect(seen).toEqual(new Set(["few:rot180", "mid:rot90"]));
  });
  it("returns empty set when no key matches", () => {
    expect(getSeenKeys("nope:")).toEqual(new Set());
  });
});

describe("getMasteredCountByPrefix", () => {
  it("counts only cards with stability >= 30 under prefix", () => {
    localStorage.setItem(
      `${PREFIX}:crown:few:rot180`,
      JSON.stringify({ s: 35 }),
    );
    localStorage.setItem(
      `${PREFIX}:crown:mid:rot90`,
      JSON.stringify({ s: 10 }),
    );
    localStorage.setItem(`${PREFIX}:flux:color`, JSON.stringify({ s: 50 }));
    expect(getMasteredCountByPrefix("crown:")).toBe(1);
    expect(getMasteredCountByPrefix("flux:")).toBe(1);
  });
  it("ignores malformed JSON without crashing", () => {
    localStorage.setItem(`${PREFIX}:crown:few:rot180`, "{not json");
    expect(getMasteredCountByPrefix("crown:")).toBe(0);
  });
});
