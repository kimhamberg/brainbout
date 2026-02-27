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
    recordScore("rapid", 1, "2026-02-27");
    expect(getDailyScore("rapid", "2026-02-27")).toBe(1);
  });

  it("returns null for unrecorded scores", () => {
    expect(getDailyScore("rapid", "2026-02-27")).toBeNull();
  });
});

describe("getBest", () => {
  it("returns null when no scores recorded", () => {
    expect(getBest("vocab")).toBeNull();
  });

  it("tracks personal best across sessions", () => {
    recordScore("vocab", 5, "2026-02-27");
    recordScore("vocab", 8, "2026-02-28");
    recordScore("vocab", 3, "2026-03-01");
    expect(getBest("vocab")).toBe(8);
  });

  it("does not update best when score is skip sentinel", () => {
    recordScore("vocab", 5, "2026-02-27");
    recordScore("vocab", SKIP_SCORE, "2026-02-28");
    expect(getBest("vocab")).toBe(5);
  });
});

describe("isDayComplete", () => {
  it("returns false when no games played", () => {
    expect(isDayComplete("2026-02-27")).toBe(false);
  });

  it("returns false when some games played", () => {
    recordScore("rapid", 1, "2026-02-27");
    recordScore("reaction", 3, "2026-02-27");
    expect(isDayComplete("2026-02-27")).toBe(false);
  });

  it("returns true when all four games played", () => {
    for (const game of GAMES) {
      recordScore(game, 5, "2026-02-27");
    }
    expect(isDayComplete("2026-02-27")).toBe(true);
  });

  it("counts skipped games as played", () => {
    recordScore("rapid", SKIP_SCORE, "2026-02-27");
    recordScore("reaction", SKIP_SCORE, "2026-02-27");
    recordScore("vocab", SKIP_SCORE, "2026-02-27");
    recordScore("math", SKIP_SCORE, "2026-02-27");
    expect(isDayComplete("2026-02-27")).toBe(true);
  });
});

describe("isSkipped", () => {
  it("returns true when score is skip sentinel", () => {
    recordScore("vocab", SKIP_SCORE, "2026-02-27");
    expect(isSkipped("vocab", "2026-02-27")).toBe(true);
  });

  it("returns false for real scores", () => {
    recordScore("vocab", 5, "2026-02-27");
    expect(isSkipped("vocab", "2026-02-27")).toBe(false);
  });

  it("returns false when not played", () => {
    expect(isSkipped("vocab", "2026-02-27")).toBe(false);
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
