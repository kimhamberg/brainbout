import { beforeEach, describe, expect, it } from "bun:test";
import {
  completeSession,
  GAMES,
  getBest,
  getCheckmates,
  getDaily,
  getDailyHistory,
  getSessionsToday,
  getStreak,
  getTodayBest,
  getTotalSessions,
  recordCheckmate,
  recordDaily,
  recordSessionScore,
  todayString,
} from "../src/shared/progress";

beforeEach(() => {
  localStorage.clear();
});

describe("recordSessionScore", () => {
  it("updates all-time best when higher", () => {
    recordSessionScore("lex", 5);
    recordSessionScore("lex", 8);
    recordSessionScore("lex", 3);
    expect(getBest("lex")).toBe(8);
  });

  it("updates today-best when higher", () => {
    recordSessionScore("lex", 5);
    recordSessionScore("lex", 8);
    recordSessionScore("lex", 3);
    expect(getTodayBest("lex")).toBe(8);
  });

  it("returns null for unplayed games", () => {
    expect(getBest("lex")).toBeNull();
    expect(getTodayBest("lex")).toBeNull();
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
    expect(todayString()).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
  });
});

describe("checkmate tracking", () => {
  it("returns 0 for untracked elo", () => {
    expect(getCheckmates(600)).toBe(0);
  });

  it("increments checkmate count", () => {
    recordCheckmate(1200);
    recordCheckmate(1200);
    expect(getCheckmates(1200)).toBe(2);
  });

  it("tracks different elos independently", () => {
    recordCheckmate(600);
    recordCheckmate(1200);
    recordCheckmate(1200);
    expect(getCheckmates(600)).toBe(1);
    expect(getCheckmates(1200)).toBe(2);
  });
});

describe("GAMES", () => {
  it("has three games", () => {
    expect(GAMES).toEqual(["crown", "flux", "lex"]);
  });
});

describe("recordSessionScore guards against re-writing equal scores", () => {
  it("does NOT re-write today-best when new score equals the current today-best", () => {
    recordSessionScore("flux", 5);
    let todayWrites = 0;
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(
      this: Storage,
      k: string,
      v: string,
    ): void {
      if (k.includes("today-best")) todayWrites++;
      orig.call(this, k, v);
    };
    try {
      recordSessionScore("flux", 5);
      expect(todayWrites).toBe(0);
    } finally {
      Storage.prototype.setItem = orig;
    }
  });

  it("does NOT re-write all-time best when new score equals the current best", () => {
    recordSessionScore("flux", 5);
    let bestWrites = 0;
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(
      this: Storage,
      k: string,
      v: string,
    ): void {
      // `:best:` (no trailing today- prefix) matches only the all-time key.
      if (k.endsWith(":best:flux")) bestWrites++;
      orig.call(this, k, v);
    };
    try {
      recordSessionScore("flux", 5);
      expect(bestWrites).toBe(0);
    } finally {
      Storage.prototype.setItem = orig;
    }
  });
});

describe("storage quota tolerance", () => {
  it("recordSessionScore swallows QuotaExceededError", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(): void {
      throw new DOMException("quota", "QuotaExceededError");
    };
    try {
      expect(() => recordSessionScore("flux", 42)).not.toThrow();
    } finally {
      Storage.prototype.setItem = original;
    }
  });

  it("completeSession swallows QuotaExceededError", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(): void {
      throw new DOMException("quota", "QuotaExceededError");
    };
    try {
      expect(() => completeSession()).not.toThrow();
    } finally {
      Storage.prototype.setItem = original;
    }
  });

  it("recordCheckmate swallows QuotaExceededError", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(): void {
      throw new DOMException("quota", "QuotaExceededError");
    };
    try {
      expect(() => recordCheckmate(600)).not.toThrow();
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});

describe("daily challenge", () => {
  it("getDaily returns null for an unrecorded date", () => {
    expect(getDaily("2026-05-26")).toBeNull();
  });

  it("recordDaily persists score and keeps the best on replay", () => {
    recordDaily("2026-05-26", 100);
    recordDaily("2026-05-26", 150);
    recordDaily("2026-05-26", 80);
    expect(getDaily("2026-05-26")).toBe(150);
  });

  it("getDailyHistory returns newest first, fills gaps with null", () => {
    recordDaily("2026-05-26", 100);
    recordDaily("2026-05-24", 50);
    const hist = getDailyHistory("2026-05-26", 4);
    expect(hist.map((r) => r.date)).toEqual([
      "2026-05-26",
      "2026-05-25",
      "2026-05-24",
      "2026-05-23",
    ]);
    expect(hist[0]?.score).toBe(100);
    expect(hist[1]?.score).toBeNull();
    expect(hist[2]?.score).toBe(50);
    expect(hist[3]?.score).toBeNull();
  });

  it("recordDaily does not pollute other date entries", () => {
    recordDaily("2026-05-26", 100);
    expect(getDaily("2026-05-25")).toBeNull();
    expect(getDaily("2026-05-27")).toBeNull();
  });
});
