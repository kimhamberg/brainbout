// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import {
  GAMES,
  recordSessionScore,
  completeSession,
  getBest,
  getTodayBest,
  getSessionsToday,
  getTotalSessions,
  getStreak,
  todayString,
} from "../src/shared/progress";

beforeEach(() => {
  localStorage.clear();
});

describe("recordSessionScore", () => {
  it("updates all-time best when higher", () => {
    recordSessionScore("math", 5);
    recordSessionScore("math", 8);
    recordSessionScore("math", 3);
    expect(getBest("math")).toBe(8);
  });

  it("updates today-best when higher", () => {
    recordSessionScore("math", 5);
    recordSessionScore("math", 8);
    recordSessionScore("math", 3);
    expect(getTodayBest("math")).toBe(8);
  });

  it("returns null for unplayed games", () => {
    expect(getBest("math")).toBeNull();
    expect(getTodayBest("math")).toBeNull();
  });
});

describe("completeSession", () => {
  it("increments sessions today", () => {
    expect(getSessionsToday()).toBe(0);
    completeSession();
    expect(getSessionsToday()).toBe(1);
    completeSession();
    expect(getSessionsToday()).toBe(2);
  });

  it("increments total sessions", () => {
    expect(getTotalSessions()).toBe(0);
    completeSession();
    completeSession();
    expect(getTotalSessions()).toBe(2);
  });
});

describe("getStreak", () => {
  it("returns 0 with no history", () => {
    expect(getStreak("2026-02-27")).toBe(0);
  });

  it("returns 1 when today has a session", () => {
    localStorage.setItem("brainbout:sessions:2026-02-27", "1");
    expect(getStreak("2026-02-27")).toBe(1);
  });

  it("counts consecutive days", () => {
    localStorage.setItem("brainbout:sessions:2026-02-25", "2");
    localStorage.setItem("brainbout:sessions:2026-02-26", "1");
    localStorage.setItem("brainbout:sessions:2026-02-27", "3");
    expect(getStreak("2026-02-27")).toBe(3);
  });

  it("breaks on missed day", () => {
    localStorage.setItem("brainbout:sessions:2026-02-25", "1");
    localStorage.setItem("brainbout:sessions:2026-02-27", "1");
    expect(getStreak("2026-02-27")).toBe(1);
  });
});

describe("todayString", () => {
  it("returns YYYY-MM-DD format", () => {
    expect(todayString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("GAMES", () => {
  it("has four games", () => {
    expect(GAMES).toEqual(["rapid", "reaction", "vocab", "math"]);
  });
});
