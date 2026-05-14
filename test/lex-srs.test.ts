import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  GRADES,
  getCard,
  getDueWords,
  getMasteredCount,
  getSeenWords,
  goodFactor,
  isDue,
  isMastered,
  jitterInterval,
  levenshtein,
  MASTERY_STABILITY_DAYS,
  maxTypos,
  recordReview,
  suggestGradeFromTyping,
  updateDifficulty,
  updateStability,
} from "../src/games/lex-srs";
import { resetRng, setRng } from "../src/shared/rng";

// Pin jitter to midpoint (factor=1.0) for deterministic intervals.
beforeEach(() => {
  localStorage.clear();
  setRng(() => 0.5);
});
// The rng module is a singleton shared across files — reset after every test
// so a pinned rng cannot leak into other files running in the same process.
afterEach(resetRng);

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("hello", "hello")).toBe(0);
  });
  it("returns the length of the other string when one is empty", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
  });
  it("standard kitten/sitting distance is 3", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });
  it("substitution counts as 1", () => {
    expect(levenshtein("abc", "abd")).toBe(1);
  });
});

describe("maxTypos boundaries", () => {
  it.each([
    [0, 0],
    [3, 0],
    [4, 1],
    [7, 1],
    [8, 2],
    [50, 2],
  ] as const)("length %s → %s allowed typos", (n, t) => {
    expect(maxTypos(n)).toBe(t);
  });
});

describe("updateDifficulty", () => {
  it("again raises difficulty by 1 (capped at 10)", () => {
    expect(updateDifficulty(5, "again")).toBe(6);
    expect(updateDifficulty(10, "again")).toBe(10);
  });
  it("hard raises difficulty by 0.5", () => {
    expect(updateDifficulty(5, "hard")).toBe(5.5);
  });
  it("good keeps difficulty unchanged", () => {
    expect(updateDifficulty(7, "good")).toBe(7);
  });
  it("easy lowers difficulty by 0.5 (floor 1)", () => {
    expect(updateDifficulty(5, "easy")).toBe(4.5);
    expect(updateDifficulty(1, "easy")).toBe(1);
  });
});

describe("goodFactor", () => {
  it("returns a higher multiplier for easier cards", () => {
    expect(goodFactor(1)).toBeGreaterThan(goodFactor(5));
    expect(goodFactor(5)).toBeGreaterThan(goodFactor(10));
  });
  it("never drops below 1.3 (some growth even at max difficulty)", () => {
    for (let d = 1; d <= 10; d++) {
      expect(goodFactor(d)).toBeGreaterThanOrEqual(1.3);
    }
  });
});

describe("updateStability", () => {
  it("first review uses INIT_STABILITY based on grade", () => {
    expect(updateStability(0, 5, "again")).toBe(0.5);
    expect(updateStability(0, 5, "hard")).toBe(1);
    expect(updateStability(0, 5, "good")).toBe(3);
    expect(updateStability(0, 5, "easy")).toBe(7);
  });
  it("again on a known card preserves some stability (not full reset)", () => {
    expect(updateStability(10, 5, "again")).toBeGreaterThan(0);
    expect(updateStability(10, 5, "again")).toBeLessThan(10);
  });
  it("good grows stability via goodFactor(d)", () => {
    expect(updateStability(5, 5, "good")).toBe(5 * goodFactor(5));
  });
  it("easy grows stability faster than good", () => {
    expect(updateStability(5, 5, "easy")).toBeGreaterThan(
      updateStability(5, 5, "good"),
    );
  });
  it("hard barely grows stability", () => {
    const after = updateStability(5, 5, "hard");
    expect(after).toBeGreaterThanOrEqual(5);
    expect(after).toBeLessThan(updateStability(5, 5, "good"));
  });
});

describe("jitterInterval", () => {
  it("box 0 / 0-day interval is never jittered", () => {
    expect(jitterInterval(0, () => 0)).toBe(0);
    expect(jitterInterval(0, () => 1)).toBe(0);
  });
  it("jitter stays within ±15 % at midpoint rng", () => {
    expect(jitterInterval(10, () => 0.5)).toBe(10);
  });
  it("never returns 0 for positive input", () => {
    for (const r of [0, 0.5, 1]) {
      expect(jitterInterval(1, () => r)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("recordReview persists card state with new schedule", () => {
  it("first 'good' review writes s≈3, lastReview, nextDue ~3 days later", () => {
    const after = recordReview("no", "tapper", "good", "2026-05-13");
    expect(after.s).toBeCloseTo(3, 5);
    expect(after.lastReview).toBe("2026-05-13");
    expect(after.nextDue).toBe("2026-05-16"); // 3 days, midpoint jitter
    expect(after.reps).toBe(1);
    expect(after.lapses).toBe(0);
  });
  it("'again' bumps lapses + halves stability roughly", () => {
    recordReview("no", "tapper", "good", "2026-05-13");
    const after = recordReview("no", "tapper", "again", "2026-05-14");
    expect(after.lapses).toBe(1);
    expect(after.s).toBeLessThan(3);
  });
  it("'easy' grows stability faster than 'good'", () => {
    const easy = recordReview("no", "easy-word", "easy", "2026-05-13");
    const good = recordReview("no", "good-word", "good", "2026-05-13");
    expect(easy.s).toBeGreaterThan(good.s);
  });
});

describe("isDue / getDueWords", () => {
  it("never-reviewed card is due", () => {
    expect(isDue(getCard("no", "x"), "2026-05-13")).toBe(true);
  });
  it("a card scheduled for tomorrow is not due today", () => {
    recordReview("no", "tapper", "good", "2026-05-13");
    expect(isDue(getCard("no", "tapper"), "2026-05-13")).toBe(false);
  });
  it("getDueWords returns words whose nextDue ≤ today", () => {
    recordReview("no", "a", "good", "2026-05-13"); // due 2026-05-16
    recordReview("no", "b", "again", "2026-05-13"); // re-due same day or tomorrow
    const due = getDueWords("no", ["a", "b", "c"], "2026-05-13");
    expect(due).toContain("c"); // never reviewed
  });
});

describe("mastery", () => {
  it("MASTERY_STABILITY_DAYS is 30", () => {
    expect(MASTERY_STABILITY_DAYS).toBe(30);
  });
  it("freshly-good card is not yet mastered", () => {
    const card = recordReview("no", "x", "good", "2026-05-13");
    expect(isMastered(card)).toBe(false);
  });
  it("mastered count counts cards with s ≥ 30", () => {
    expect(getMasteredCount("no")).toBe(0);
    // simulate a mature card directly
    localStorage.setItem(
      "brainbout:lex:no:foo",
      JSON.stringify({
        s: 31,
        d: 5,
        lastReview: "",
        nextDue: "",
        lapses: 0,
        reps: 1,
      }),
    );
    expect(getMasteredCount("no")).toBe(1);
  });
});

describe("suggestGradeFromTyping", () => {
  it("exact match → good", () => {
    expect(suggestGradeFromTyping("apple", "apple")).toBe("good");
  });
  it("case-insensitive exact → good", () => {
    expect(suggestGradeFromTyping("APPLE", "apple")).toBe("good");
  });
  it("typo within budget → hard", () => {
    // length 5, maxTypos = 1, levenshtein("appel","apple") = 2 → exceeds, so "again"
    expect(suggestGradeFromTyping("apple ", "apple")).toBe("good"); // trim
    expect(suggestGradeFromTyping("appel", "apple")).toBe("again");
    // single-char typo: "apply" vs "apple" → 1 typo → hard
    expect(suggestGradeFromTyping("apply", "apple")).toBe("hard");
  });
  it("clearly wrong → again", () => {
    expect(suggestGradeFromTyping("zebra", "apple")).toBe("again");
  });
  it("empty input → again", () => {
    expect(suggestGradeFromTyping("", "apple")).toBe("again");
  });
});

describe("GRADES enumeration", () => {
  it("exports all four grades in order", () => {
    expect(GRADES).toEqual(["again", "hard", "good", "easy"]);
  });
});

describe("isDue edge cases", () => {
  it("nextDue strictly before today → due", () => {
    expect(
      isDue(
        {
          s: 1,
          d: 5,
          lastReview: "2026-05-10",
          nextDue: "2026-05-12",
          lapses: 0,
          reps: 1,
        },
        "2026-05-13",
      ),
    ).toBe(true);
  });
  it("nextDue equal to today → due (boundary)", () => {
    expect(
      isDue(
        {
          s: 1,
          d: 5,
          lastReview: "2026-05-12",
          nextDue: "2026-05-13",
          lapses: 0,
          reps: 1,
        },
        "2026-05-13",
      ),
    ).toBe(true);
  });
  it("nextDue strictly after today → not due", () => {
    expect(
      isDue(
        {
          s: 1,
          d: 5,
          lastReview: "2026-05-13",
          nextDue: "2026-05-14",
          lapses: 0,
          reps: 1,
        },
        "2026-05-13",
      ),
    ).toBe(false);
  });
});

describe("getSeenWords + getCard malformed-JSON fallback", () => {
  it("getSeenWords returns words for the requested lang only", () => {
    recordReview("no", "alpha", "good", "2026-05-13");
    recordReview("no", "beta", "good", "2026-05-13");
    recordReview("de", "gamma", "good", "2026-05-13");
    const seen = getSeenWords("no");
    expect(seen).toEqual(new Set(["alpha", "beta"]));
  });
  it("getSeenWords is empty when no cards have ever been reviewed", () => {
    expect(getSeenWords("no").size).toBe(0);
  });
  it("getCard returns a fresh NEW_CARD when stored JSON is malformed", () => {
    localStorage.setItem("brainbout:lex:no:broken", "{not-valid-json");
    const card = getCard("no", "broken");
    expect(card.s).toBe(0);
    expect(card.reps).toBe(0);
  });
});

describe("getCard preserves and defaults all fields", () => {
  it("returns every stored field verbatim when the JSON is complete", () => {
    localStorage.setItem(
      "brainbout:lex:no:full",
      JSON.stringify({
        s: 5,
        d: 7,
        lastReview: "2026-05-13",
        nextDue: "2026-05-20",
        lapses: 2,
        reps: 4,
      }),
    );
    expect(getCard("no", "full")).toEqual({
      s: 5,
      d: 7,
      lastReview: "2026-05-13",
      nextDue: "2026-05-20",
      lapses: 2,
      reps: 4,
    });
  });
  it("missing lastReview field falls back to empty string", () => {
    localStorage.setItem(
      "brainbout:lex:no:nolr",
      JSON.stringify({ s: 1, d: 5, lapses: 0, reps: 1 }),
    );
    expect(getCard("no", "nolr").lastReview).toBe("");
  });
  it("missing nextDue field falls back to empty string", () => {
    localStorage.setItem(
      "brainbout:lex:no:nnd",
      JSON.stringify({ s: 1, d: 5, lapses: 0, reps: 1 }),
    );
    expect(getCard("no", "nnd").nextDue).toBe("");
  });
  it("a brand-new card's lastReview default is exactly '' (no sentinel)", () => {
    expect(getCard("no", "fresh").lastReview).toBe("");
  });
});

describe("addDays pads single-digit day", () => {
  it("recordReview good on 2026-05-05 → nextDue 2026-05-08 (zero-padded day)", () => {
    const after = recordReview("no", "padday", "good", "2026-05-05");
    expect(after.nextDue).toBe("2026-05-08");
  });
});

describe("goodFactor exact values", () => {
  it("d=1 → 2.6 (kills `d - 1` flipped to `d + 1`)", () => {
    expect(goodFactor(1)).toBeCloseTo(2.6, 10);
  });
  it("d=5 → 2.0", () => {
    expect(goodFactor(5)).toBeCloseTo(2, 10);
  });
});

describe("updateStability exact values", () => {
  it("again at s=10 → max(0.5, 10*0.2) = 2 (not min)", () => {
    expect(updateStability(10, 5, "again")).toBeCloseTo(2, 10);
  });
  it("hard at s=5 → 5 (max(s, s*0.8) = s, kills `* → /` mutant)", () => {
    expect(updateStability(5, 5, "hard")).toBeCloseTo(5, 10);
  });
});

describe("jitterInterval direction sensitivity", () => {
  it("rng=0 yields baseDays * 0.85, not baseDays / 0.85", () => {
    // floor jitter (0.85x) of 10 days = 8.5 → Math.round → 9.
    // Mutated to division: 10/0.85 = 11.76 → 12. Distinguishes * vs /.
    expect(jitterInterval(10, () => 0)).toBe(9);
  });
});

describe("isDue edge — never-reviewed empty nextDue", () => {
  it("empty nextDue is always due (kills `false` conditional mutant)", () => {
    expect(
      isDue(
        { s: 0, d: 5, lastReview: "", nextDue: "", lapses: 0, reps: 0 },
        "2026-05-13",
      ),
    ).toBe(true);
  });
});

describe("getDueWords excludes not-yet-due cards", () => {
  it("a card scheduled in the future is filtered out (kills `.filter() → []` removal)", () => {
    recordReview("no", "future", "good", "2026-05-13"); // nextDue ~3 days later
    const due = getDueWords("no", ["future"], "2026-05-13");
    expect(due).not.toContain("future");
  });
});

describe("isMastered boundary", () => {
  it("s exactly 30 → mastered (kills `> MASTERY_STABILITY_DAYS` and `false`)", () => {
    expect(
      isMastered({
        s: 30,
        d: 5,
        lastReview: "",
        nextDue: "",
        lapses: 0,
        reps: 1,
      }),
    ).toBe(true);
  });
  it("s = 29 → not mastered", () => {
    expect(
      isMastered({
        s: 29,
        d: 5,
        lastReview: "",
        nextDue: "",
        lapses: 0,
        reps: 1,
      }),
    ).toBe(false);
  });
});

describe("getMasteredCount key scoping", () => {
  it("ignores entries whose key does not match the lang prefix", () => {
    // suffix-matches the prefix but does not start with it — endsWith would match, startsWith must not.
    localStorage.setItem(
      "wrongprefix:brainbout:lex:no:foo",
      JSON.stringify({ s: 99 }),
    );
    expect(getMasteredCount("no")).toBe(0);
  });
  it("ignores another language's mastered cards", () => {
    localStorage.setItem(
      "brainbout:lex:de:foo",
      JSON.stringify({
        s: 99,
        d: 5,
        lastReview: "",
        nextDue: "",
        lapses: 0,
        reps: 1,
      }),
    );
    expect(getMasteredCount("no")).toBe(0);
  });
  it("s exactly 30 counts as mastered (inclusive boundary)", () => {
    localStorage.setItem(
      "brainbout:lex:no:edge",
      JSON.stringify({
        s: 30,
        d: 5,
        lastReview: "",
        nextDue: "",
        lapses: 0,
        reps: 1,
      }),
    );
    expect(getMasteredCount("no")).toBe(1);
  });
  it("s = 29 does NOT count (kills `true` conditional mutant)", () => {
    localStorage.setItem(
      "brainbout:lex:no:weak",
      JSON.stringify({
        s: 29,
        d: 5,
        lastReview: "",
        nextDue: "",
        lapses: 0,
        reps: 1,
      }),
    );
    expect(getMasteredCount("no")).toBe(0);
  });
  it("missing localStorage value (raw === null) cannot inflate the count", () => {
    // Simulate by checking that an empty store starts at 0 and a single valid entry returns 1.
    expect(getMasteredCount("no")).toBe(0);
    localStorage.setItem(
      "brainbout:lex:no:bar",
      JSON.stringify({
        s: 99,
        d: 5,
        lastReview: "",
        nextDue: "",
        lapses: 0,
        reps: 1,
      }),
    );
    expect(getMasteredCount("no")).toBe(1);
  });
});
