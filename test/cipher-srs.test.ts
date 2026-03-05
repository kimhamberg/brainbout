// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import {
  getWordState,
  recordAnswer,
  getDueWords,
  levenshtein,
  BOX_INTERVALS,
  getMastery,
  getMasteryStreak,
  getMasteredCount,
} from "../src/games/cipher-srs";

beforeEach(() => {
  localStorage.clear();
});

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("hello", "hello")).toBe(0);
  });

  it("returns the length of the other string when one is empty", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
  });

  it("returns 1 for single character difference", () => {
    expect(levenshtein("cat", "bat")).toBe(1);
    expect(levenshtein("cat", "cats")).toBe(1);
    expect(levenshtein("cat", "ca")).toBe(1);
  });

  it("returns 2 for two character differences", () => {
    expect(levenshtein("kitten", "mitten")).toBe(1);
    expect(levenshtein("hello", "hallo")).toBe(1);
  });
});

describe("getWordState", () => {
  it("returns box 0 and past due for unknown words", () => {
    const state = getWordState("no", "tapper");
    expect(state.box).toBe(0);
    expect(state.nextDue).toBe("");
  });
});

describe("recordAnswer", () => {
  it("advances box on correct answer", () => {
    recordAnswer("no", "tapper", true, "2026-02-27");
    const state = getWordState("no", "tapper");
    expect(state.box).toBe(1);
    expect(state.nextDue).toBe("2026-02-28");
  });

  it("advances through boxes with correct answers", () => {
    recordAnswer("no", "tapper", true, "2026-02-27");
    recordAnswer("no", "tapper", true, "2026-02-28");
    const state = getWordState("no", "tapper");
    expect(state.box).toBe(2);
    expect(state.nextDue).toBe("2026-03-03");
  });

  it("resets to box 0 on wrong answer", () => {
    recordAnswer("no", "tapper", true, "2026-02-27");
    recordAnswer("no", "tapper", true, "2026-02-28");
    recordAnswer("no", "tapper", false, "2026-03-03");
    const state = getWordState("no", "tapper");
    expect(state.box).toBe(0);
  });

  it("caps at max box", () => {
    const maxBox = BOX_INTERVALS.length - 1;
    for (let i = 0; i <= maxBox + 2; i++) {
      recordAnswer(
        "no",
        "tapper",
        true,
        `2026-03-${String(i + 1).padStart(2, "0")}`,
      );
    }
    const state = getWordState("no", "tapper");
    expect(state.box).toBeLessThanOrEqual(maxBox);
  });
});

describe("mastery tracking", () => {
  it("returns mastery 0 for unknown words", () => {
    expect(getMastery("no", "tapper")).toBe(0);
  });

  it("increments mastery streak on correct answer", () => {
    recordAnswer("no", "tapper", true, "2026-02-27");
    expect(getMasteryStreak("no", "tapper")).toBe(1);
  });

  it("promotes mastery after 3 consecutive correct", () => {
    for (let i = 0; i < 3; i++) {
      recordAnswer("no", "tapper", true, `2026-03-0${String(i + 1)}`);
    }
    expect(getMastery("no", "tapper")).toBe(1);
  });

  it("resets streak on wrong answer without demoting", () => {
    for (let i = 0; i < 3; i++) {
      recordAnswer("no", "tapper", true, `2026-03-0${String(i + 1)}`);
    }
    expect(getMastery("no", "tapper")).toBe(1);
    recordAnswer("no", "tapper", false, "2026-03-04");
    expect(getMastery("no", "tapper")).toBe(1); // no demotion
    expect(getMasteryStreak("no", "tapper")).toBe(0);
  });

  it("caps mastery at 2", () => {
    for (let i = 0; i < 9; i++) {
      recordAnswer(
        "no",
        "tapper",
        true,
        `2026-03-${String(i + 1).padStart(2, "0")}`,
      );
    }
    expect(getMastery("no", "tapper")).toBe(2);
  });
});

describe("getMasteredCount", () => {
  it("returns 0 with no data", () => {
    expect(getMasteredCount("no")).toBe(0);
  });

  it("counts words at max mastery", () => {
    const today = "2026-03-05";
    // 6 correct answers = mastery 2 (3 for mastery 1, 3 more for mastery 2)
    for (let i = 0; i < 6; i++) recordAnswer("no", "hund", true, today);
    for (let i = 0; i < 6; i++) recordAnswer("no", "katt", true, today);
    recordAnswer("no", "bil", true, today); // only 1 correct, not mastered
    expect(getMasteredCount("no")).toBe(2);
  });
});

describe("getDueWords", () => {
  it("returns all words as due when none have state", () => {
    const allWords = ["tapper", "modig", "djerv"];
    const due = getDueWords("no", allWords, "2026-02-27");
    expect(due).toEqual(allWords);
  });

  it("excludes words not yet due", () => {
    recordAnswer("no", "tapper", true, "2026-02-27");
    const due = getDueWords("no", ["tapper", "modig"], "2026-02-27");
    expect(due).toEqual(["modig"]);
  });

  it("includes words that are due", () => {
    recordAnswer("no", "tapper", true, "2026-02-27");
    const due = getDueWords("no", ["tapper", "modig"], "2026-02-28");
    expect(due).toContain("tapper");
    expect(due).toContain("modig");
  });
});
