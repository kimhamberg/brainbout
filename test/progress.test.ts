// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import {
  getStreak,
  recordScore,
  getDailyScore,
  getBest,
  isDayComplete,
  GAMES,
} from "../src/shared/progress";

beforeEach(() => {
  localStorage.clear();
});

describe("recordScore", () => {
  it("saves a score for a game on a date", () => {
    recordScore("puzzles", 8, "2026-02-27");
    expect(getDailyScore("puzzles", "2026-02-27")).toBe(8);
  });

  it("returns null for unrecorded scores", () => {
    expect(getDailyScore("puzzles", "2026-02-27")).toBeNull();
  });
});

describe("getBest", () => {
  it("returns null when no scores recorded", () => {
    expect(getBest("puzzles")).toBeNull();
  });

  it("tracks personal best across sessions", () => {
    recordScore("puzzles", 5, "2026-02-27");
    recordScore("puzzles", 8, "2026-02-28");
    recordScore("puzzles", 3, "2026-03-01");
    expect(getBest("puzzles")).toBe(8);
  });
});

describe("isDayComplete", () => {
  it("returns false when no games played", () => {
    expect(isDayComplete("2026-02-27")).toBe(false);
  });

  it("returns false when some games played", () => {
    recordScore("puzzles", 5, "2026-02-27");
    recordScore("nback", 3, "2026-02-27");
    expect(isDayComplete("2026-02-27")).toBe(false);
  });

  it("returns true when all four games played", () => {
    for (const game of GAMES) {
      recordScore(game, 5, "2026-02-27");
    }
    expect(isDayComplete("2026-02-27")).toBe(true);
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
    // Feb 26 missing — streak is only 1 (today)
    expect(getStreak("2026-02-27")).toBe(1);
  });
});
