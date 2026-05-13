import { describe, expect, test } from "bun:test";
import {
  buildQueue,
  commonLetters,
  maxMasteryForStage,
  pickDistractors,
  shuffleArray,
  speedBonus,
  streakMultiplier,
} from "../src/games/lex-logic";

describe("maxMasteryForStage", () => {
  test.each([
    [0, 0],
    [1, 0],
    [2, 1],
    [3, 2],
    [4, 2],
    [99, 2],
    [-5, 0],
  ] as const)("stage %s → %s", (stage, expected) => {
    expect(maxMasteryForStage(stage)).toBe(expected);
  });
});

describe("speedBonus", () => {
  test("under 3 seconds → 5", () => {
    expect(speedBonus(0)).toBe(5);
    expect(speedBonus(2999)).toBe(5);
  });
  test("3..6 → 3", () => {
    expect(speedBonus(3000)).toBe(3);
    expect(speedBonus(5999)).toBe(3);
  });
  test("6..10 → 1", () => {
    expect(speedBonus(6000)).toBe(1);
    expect(speedBonus(9999)).toBe(1);
  });
  test(">= 10 → 0", () => {
    expect(speedBonus(10_000)).toBe(0);
    expect(speedBonus(60_000)).toBe(0);
  });
});

describe("streakMultiplier", () => {
  test.each([
    [0, 1],
    [1, 1],
    [2, 1],
    [3, 1.5],
    [4, 1.5],
    [5, 2],
    [10, 2],
  ] as const)("streak %s → ×%s", (s, mult) => {
    expect(streakMultiplier(s)).toBe(mult);
  });
});

describe("commonLetters", () => {
  test("identical words: every letter shared", () => {
    expect(commonLetters("abc", "abc")).toBe(3);
  });
  test("case-insensitive", () => {
    expect(commonLetters("ABC", "abc")).toBe(3);
  });
  test("multiset semantics: 'aa' vs 'a' shares 1", () => {
    expect(commonLetters("aa", "a")).toBe(1);
    expect(commonLetters("a", "aa")).toBe(1);
  });
  test("no overlap → 0", () => {
    expect(commonLetters("abc", "xyz")).toBe(0);
  });
  test("partial overlap", () => {
    expect(commonLetters("kitten", "sitting")).toBe(4); // i, t, t, n
  });
  test("empty strings → 0", () => {
    expect(commonLetters("", "anything")).toBe(0);
    expect(commonLetters("anything", "")).toBe(0);
  });
});

describe("shuffleArray", () => {
  test("returns the same length and same multiset", () => {
    const a = [1, 2, 3, 4, 5];
    const out = shuffleArray([...a], () => 0.5);
    expect(out).toHaveLength(5);
    expect([...out].sort()).toEqual(a);
  });
  test("a deterministic RNG yields a deterministic order", () => {
    const rng = (() => {
      let s = 1;
      return () => {
        s = (s * 9301 + 49297) % 233_280;
        return s / 233_280;
      };
    })();
    const a = shuffleArray([1, 2, 3, 4, 5], rng);
    const rng2 = (() => {
      let s = 1;
      return () => {
        s = (s * 9301 + 49297) % 233_280;
        return s / 233_280;
      };
    })();
    const b = shuffleArray([1, 2, 3, 4, 5], rng2);
    expect(a).toEqual(b);
  });
  test("empty array stays empty", () => {
    expect(shuffleArray([], () => 0)).toEqual([]);
  });
});

interface W {
  word: string;
  length: number;
  pos: string;
}
function w(word: string, pos = "n"): W {
  return { word, length: word.length, pos };
}

describe("pickDistractors", () => {
  test("picks similar-POS, similar-length, hardest-first", () => {
    const target = w("apple");
    const pool = [w("apply"), w("ample"), w("zebra"), w("car"), w("orange")];
    const picks = pickDistractors(target, pool, pool, 3);
    expect(picks).toHaveLength(3);
    expect(picks).not.toContain("apple");
    // apply shares 4 letters; ample shares 4; orange shares 2; etc.
    // The exact ordering depends on stable sort, but no exclusion of close picks.
    expect(picks).toContain("apply");
    expect(picks).toContain("ample");
  });
  test("falls back to general words when pos pool too small", () => {
    const target = w("apple", "verb");
    const posPool: W[] = []; // no verbs available
    const allWords: W[] = [w("plum"), w("grape"), w("melon")];
    const picks = pickDistractors(target, posPool, allWords, 3);
    expect(picks).toHaveLength(3);
    expect(new Set(picks)).toEqual(new Set(["plum", "grape", "melon"]));
  });
  test("never picks the target itself", () => {
    const target = w("apple");
    const pool = [w("apple"), w("apply"), w("ample")];
    const picks = pickDistractors(target, pool, pool, 3);
    expect(picks).not.toContain("apple");
  });
  test("filters by length tolerance (±3)", () => {
    const target = w("ab"); // length 2
    const pool = [
      w("abcdefg"), // 7 — too long
      w("abc"), // 3 — ok
      w("a"), // 1 — ok
      w("abcdefghij"), // 10 — too long
    ];
    const picks = pickDistractors(target, pool, pool, 3);
    expect(picks).toContain("abc");
    expect(picks).toContain("a");
    expect(picks).not.toContain("abcdefg");
    expect(picks).not.toContain("abcdefghij");
  });
  test("count cap honoured even when many candidates exist", () => {
    const target = w("foo");
    const pool = [w("fab"), w("far"), w("for"), w("fox"), w("fun")];
    expect(pickDistractors(target, pool, pool, 2)).toHaveLength(2);
  });
});

describe("buildQueue", () => {
  const identity = <T>(arr: T[]): T[] => arr;
  const dict = Array.from({ length: 50 }, (_, i) => ({
    word: `w${String(i)}`,
  }));

  test("queue is bounded by sessionSize", () => {
    const q = buildQueue(dict, new Set(), new Set(), 30, 0.3, identity);
    expect(q).toHaveLength(30);
  });

  test("contains only entries from the dict", () => {
    const q = buildQueue(dict, new Set(), new Set(), 20, 0.5, identity);
    for (const e of q) {
      expect(dict).toContain(e);
    }
  });

  test("prefers due-seen words (review) up to (1 - newRatio) of sessionSize", () => {
    const seen = new Set(dict.slice(0, 10).map((d) => d.word)); // 10 seen
    const due = new Set(seen); // all due
    const q = buildQueue(dict, seen, due, 20, 0.3, identity);
    // 70% review * 20 = 14 desired, but only 10 review available
    const reviewCount = q.filter((d) => seen.has(d.word)).length;
    expect(reviewCount).toBe(10);
  });

  test("fills with fresh words when fewer reviews available", () => {
    const q = buildQueue(dict, new Set(), new Set(), 25, 0.4, identity);
    expect(q).toHaveLength(25);
  });

  test("does not produce duplicates", () => {
    const q = buildQueue(dict, new Set(), new Set(), 30, 0.3, identity);
    expect(new Set(q.map((d) => d.word)).size).toBe(q.length);
  });

  test("clamps to dict size when sessionSize > dict.length", () => {
    const small = dict.slice(0, 5);
    const q = buildQueue(small, new Set(), new Set(), 30, 0.3, identity);
    expect(q.length).toBeLessThanOrEqual(5);
  });
});
