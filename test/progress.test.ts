// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import {
  getStreak,
  recordScore,
  getDailyScore,
  getBest,
  isDayComplete,
  isSkipped,
  GAMES,
  SKIP_SCORE,
} from "../src/shared/progress";

beforeEach(() => {
  localStorage.clear();
});

describe("recordScore", () => {
  it("saves a score for a game on a date", () => {
    recordScore("blitz", 1, "2026-02-27");
    expect(getDailyScore("blitz", "2026-02-27")).toBe(1);
  });

  it("returns null for unrecorded scores", () => {
    expect(getDailyScore("blitz", "2026-02-27")).toBeNull();
  });
});

describe("getBest", () => {
  it("returns null when no scores recorded", () => {
    expect(getBest("stroop")).toBeNull();
  });

  it("tracks personal best across sessions", () => {
    recordScore("stroop", 5, "2026-02-27");
    recordScore("stroop", 8, "2026-02-28");
    recordScore("stroop", 3, "2026-03-01");
    expect(getBest("stroop")).toBe(8);
  });

  it("does not update best when score is skip sentinel", () => {
    recordScore("stroop", 5, "2026-02-27");
    recordScore("stroop", SKIP_SCORE, "2026-02-28");
    expect(getBest("stroop")).toBe(5);
  });
});

describe("isDayComplete", () => {
  it("returns false when no games played", () => {
    expect(isDayComplete("2026-02-27")).toBe(false);
  });

  it("returns false when some games played", () => {
    recordScore("blitz", 1, "2026-02-27");
    recordScore("memory", 3, "2026-02-27");
    expect(isDayComplete("2026-02-27")).toBe(false);
  });

  it("returns true when all four games played", () => {
    for (const game of GAMES) {
      recordScore(game, 5, "2026-02-27");
    }
    expect(isDayComplete("2026-02-27")).toBe(true);
  });

  it("counts skipped games as played", () => {
    recordScore("blitz", SKIP_SCORE, "2026-02-27");
    recordScore("memory", SKIP_SCORE, "2026-02-27");
    recordScore("stroop", SKIP_SCORE, "2026-02-27");
    recordScore("math", SKIP_SCORE, "2026-02-27");
    expect(isDayComplete("2026-02-27")).toBe(true);
  });
});

describe("isSkipped", () => {
  it("returns true when score is skip sentinel", () => {
    recordScore("stroop", SKIP_SCORE, "2026-02-27");
    expect(isSkipped("stroop", "2026-02-27")).toBe(true);
  });

  it("returns false for real scores", () => {
    recordScore("stroop", 5, "2026-02-27");
    expect(isSkipped("stroop", "2026-02-27")).toBe(false);
  });

  it("returns false when not played", () => {
    expect(isSkipped("stroop", "2026-02-27")).toBe(false);
  });
});

describe("getStreak", () => {
  it("returns 0 with no history", () => {
    expect(getStreak("2026-02-27")).toBe(0);
  });

  it("returns 1 when today is complete", () => {
    for (const game of GAMES) {
      recordScore(game, 5, "2026-02-27");
    }
    expect(getStreak("2026-02-27")).toBe(1);
  });

  it("counts consecutive completed days", () => {
    for (const date of ["2026-02-25", "2026-02-26", "2026-02-27"]) {
      for (const game of GAMES) {
        recordScore(game, 5, date);
      }
    }
    expect(getStreak("2026-02-27")).toBe(3);
  });

  it("breaks streak on missed day", () => {
    for (const date of ["2026-02-25", "2026-02-27"]) {
      for (const game of GAMES) {
        recordScore(game, 5, date);
      }
    }
    expect(getStreak("2026-02-27")).toBe(1);
  });
});
