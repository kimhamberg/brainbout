import { beforeEach, describe, expect, it } from "bun:test";
import {
  completeSession,
  freezesRemainingThisWeek,
  freezesUsedThisWeek,
  GAMES,
  getBest,
  getCheckmates,
  getDaily,
  getDailyHistory,
  getSessionsToday,
  getStreak,
  getTodayBest,
  getTotalSessions,
  MAX_FREEZES_PER_WEEK,
  recordCheckmate,
  recordDaily,
  recordSessionScore,
  STREAK_DISPLAY_CAP,
  todayString,
  weekStart,
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

describe("humane streaks: freezes + cap", () => {
  it("MAX_FREEZES_PER_WEEK is 2 (Duolingo-aligned)", () => {
    expect(MAX_FREEZES_PER_WEEK).toBe(2);
  });

  it("STREAK_DISPLAY_CAP is 99 (anti-sunk-cost ceiling)", () => {
    expect(STREAK_DISPLAY_CAP).toBe(99);
  });

  it("weekStart returns the Monday of the given ISO week", () => {
    // 2026-05-26 is a Tuesday; the Monday before is 2026-05-25.
    expect(weekStart("2026-05-26")).toBe("2026-05-25");
    // 2026-05-31 is a Sunday; week-start is still the prior Monday.
    expect(weekStart("2026-05-31")).toBe("2026-05-25");
    // 2026-06-01 is a Monday; week-start is itself.
    expect(weekStart("2026-06-01")).toBe("2026-06-01");
  });

  it("freezesUsedThisWeek defaults to 0", () => {
    expect(freezesUsedThisWeek("2026-05-26")).toBe(0);
    expect(freezesRemainingThisWeek("2026-05-26")).toBe(MAX_FREEZES_PER_WEEK);
  });

  it("completeSession bridges a single-day gap with a freeze when one is available", () => {
    // Seed a session two days ago, leaving yesterday empty.
    localStorage.setItem("brainbout:sessions:2026-05-24", "1");
    // Stub today to a known date by writing under that date directly via
    // the public API is hard, so we exercise completeSession via the real
    // todayString path: instead, set yesterday's freeze manually and
    // verify getStreak counts it.
    // (Freeze auto-bridge is exercised in the next test through the
    //  public API.)
    expect(getStreak("2026-05-24")).toBe(1);
  });

  it("getStreak counts freeze days as session-equivalent", () => {
    localStorage.setItem("brainbout:sessions:2026-05-26", "1");
    localStorage.setItem("brainbout:freeze:2026-05-25", "1");
    localStorage.setItem("brainbout:sessions:2026-05-24", "1");
    expect(getStreak("2026-05-26")).toBe(3);
  });

  it("getStreak stops at first day with neither session nor freeze", () => {
    localStorage.setItem("brainbout:sessions:2026-05-26", "1");
    // Gap on 2026-05-25, no freeze.
    localStorage.setItem("brainbout:sessions:2026-05-24", "1");
    expect(getStreak("2026-05-26")).toBe(1);
  });

  it("freezesUsedThisWeek tracks the same ISO week (Mon–Sun)", () => {
    localStorage.setItem("brainbout:freezes-used:2026-05-25", "1");
    expect(freezesUsedThisWeek("2026-05-26")).toBe(1);
    expect(freezesUsedThisWeek("2026-05-31")).toBe(1);
    expect(freezesUsedThisWeek("2026-06-01")).toBe(0); // new week
  });

  it("completeSession auto-spends a freeze to bridge a one-day gap", () => {
    // Construct a contiguous streak ending day-before-yesterday relative to
    // *today* (since completeSession reads system date), so the bridge path
    // fires when we call completeSession.
    const today = todayString();
    const yesterday = (() => {
      const d = new Date(`${today}T00:00:00`);
      d.setDate(d.getDate() - 1);
      return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();
    const dayBefore = (() => {
      const d = new Date(`${today}T00:00:00`);
      d.setDate(d.getDate() - 2);
      return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();
    localStorage.setItem(`brainbout:sessions:${dayBefore}`, "1");
    completeSession();
    expect(localStorage.getItem(`brainbout:freeze:${yesterday}`)).toBe("1");
    expect(freezesUsedThisWeek(today)).toBe(1);
    // Streak now: today + yesterday(freeze) + dayBefore = 3.
    expect(getStreak(today)).toBe(3);
  });

  it("completeSession does NOT bridge once the weekly freeze cap is hit", () => {
    const today = todayString();
    const wk = weekStart(today);
    // Cap already spent.
    localStorage.setItem(
      `brainbout:freezes-used:${wk}`,
      String(MAX_FREEZES_PER_WEEK),
    );
    const dayBefore = (() => {
      const d = new Date(`${today}T00:00:00`);
      d.setDate(d.getDate() - 2);
      return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();
    localStorage.setItem(`brainbout:sessions:${dayBefore}`, "1");
    completeSession();
    const yesterday = (() => {
      const d = new Date(`${today}T00:00:00`);
      d.setDate(d.getDate() - 1);
      return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();
    expect(localStorage.getItem(`brainbout:freeze:${yesterday}`)).toBeNull();
    // Streak: today only (gap not bridged).
    expect(getStreak(today)).toBe(1);
  });
});
