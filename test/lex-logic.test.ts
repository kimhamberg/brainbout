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
  test("rng=0.5 produces exact expected permutation (i+1 swap bound)", () => {
    // Each step picks j = floor(0.5 * (i + 1)). The expected trace below
    // pins the Fisher–Yates bound so that the +1 vs -1 mutation is caught.
    expect(shuffleArray([1, 2, 3, 4, 5], () => 0.5)).toEqual([1, 4, 2, 5, 3]);
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

  test("length filter is inclusive at boundary (±3 exactly admits)", () => {
    const target = w("abcd"); // length 4
    // Length 1 (diff 3) and length 7 (diff 3): both should be admitted.
    // Length 0 (diff 4) and length 8 (diff 4): both excluded.
    const pool = [w("x"), w("vwxyzzz"), w(""), w("yzabcdefg")];
    const picks = pickDistractors(target, pool, pool, 4);
    expect(picks).toContain("x");
    expect(picks).toContain("vwxyzzz");
    expect(picks).not.toContain("");
    expect(picks).not.toContain("yzabcdefg");
  });

  test("fallback respects count cap when allWords has more than count admissible", () => {
    // pos pool empty → fallback handles all picks. allWords has 5 admissible,
    // count=2 → exactly 2 (kills `>= count` flipped to `>` and to constant false).
    const target = w("apple", "verb");
    const posPool: W[] = [];
    const allWords: W[] = [
      w("plum"),
      w("grape"),
      w("melon"),
      w("peach"),
      w("guava"),
    ];
    expect(pickDistractors(target, posPool, allWords, 2)).toHaveLength(2);
  });

  test("candidates length filter is inclusive at boundary (kills `<= 3 → < 3` on the posPool path)", () => {
    // Force the candidates path to be the ONLY source: allWords only has the
    // target itself, so the fallback can never recover a boundary-length item.
    const target = w("abcd", "n"); // length 4
    const posPool = [w("verbose", "n")]; // length 7 → diff 3 (boundary)
    const allWords = [target];
    const picks = pickDistractors(target, posPool, allWords, 1);
    expect(picks).toEqual(["verbose"]);
  });

  test("fallback length filter is inclusive at boundary (±3 exactly admits)", () => {
    // target length 5; allWords with length 2 (diff 3) and length 8 (diff 3).
    const target = w("apple", "verb");
    const posPool: W[] = [];
    const allWords: W[] = [w("ab"), w("eightlet")];
    const picks = pickDistractors(target, posPool, allWords, 2);
    expect(picks).toContain("ab");
    expect(picks).toContain("eightlet");
  });

  test("hardest-first ordering: most-overlap candidate appears before less-overlap", () => {
    const target = w("abcde"); // len 5
    // 'abcdf' shares 4 letters; 'bxyz_' shares 1 letter.
    // 'bxyz_' has length 5 too so both pass the length filter.
    const pool = [w("bxyzz"), w("abcdf")];
    const picks = pickDistractors(target, pool, pool, 2);
    expect(picks[0]).toBe("abcdf");
    expect(picks[1]).toBe("bxyzz");
  });

  test("pos pool exhausted: falls back to allWords for remaining slots", () => {
    const target = w("apple", "noun");
    const posPool = [w("apply", "noun")]; // only 1 same-pos
    const allWords = [
      w("apply", "noun"),
      w("grape", "verb"),
      w("plumm", "verb"),
    ];
    const picks = pickDistractors(target, posPool, allWords, 3);
    expect(picks).toHaveLength(3);
    expect(picks[0]).toBe("apply"); // from posPool, hardest-first
    expect(picks.slice(1).sort()).toEqual(["grape", "plumm"]);
  });

  test("count 0 yields empty array", () => {
    expect(pickDistractors(w("x"), [w("a")], [w("a")], 0)).toEqual([]);
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

  test("review count = round(sessionSize * (1 - newRatio)) when enough reviews", () => {
    // 20 seen+due cards available, sessionSize=20, newRatio=0.3 → 14 reviews + 6 fresh
    const seen = new Set(dict.slice(0, 20).map((d) => d.word));
    const due = new Set(seen);
    const q = buildQueue(dict, seen, due, 20, 0.3, identity);
    const reviewCount = q.filter((d) => seen.has(d.word)).length;
    expect(reviewCount).toBe(14);
    expect(q.length).toBe(20);
  });

  test("review requires BOTH seen AND due (AND, not OR)", () => {
    // 10 seen-not-due + 10 unseen-but-due-flagged + 30 fresh = no review picks
    const seen = new Set(dict.slice(0, 10).map((d) => d.word));
    const due = new Set(dict.slice(10, 20).map((d) => d.word));
    const q = buildQueue(dict, seen, due, 20, 0.3, identity);
    const reviewCount = q.filter(
      (d) => seen.has(d.word) && due.has(d.word),
    ).length;
    expect(reviewCount).toBe(0);
  });

  test("seen-but-not-due words never enter the queue", () => {
    const seen = new Set(dict.slice(0, 10).map((d) => d.word));
    const due = new Set<string>();
    const q = buildQueue(dict, seen, due, 30, 0.3, identity);
    for (const e of q) {
      expect(seen.has(e.word)).toBe(false);
    }
  });

  test("newRatio=1 yields all-fresh queue (no review picks)", () => {
    const seen = new Set(dict.slice(0, 20).map((d) => d.word));
    const due = new Set(seen);
    const q = buildQueue(dict, seen, due, 20, 1, identity);
    expect(q.filter((d) => seen.has(d.word))).toHaveLength(0);
  });

  test("newRatio=0 yields all-review (when enough due-seen)", () => {
    const seen = new Set(dict.slice(0, 20).map((d) => d.word));
    const due = new Set(seen);
    const q = buildQueue(dict, seen, due, 20, 0, identity);
    expect(q.filter((d) => seen.has(d.word))).toHaveLength(20);
  });

  test("filler caps to the exact deficit (does not flood from a large dict)", () => {
    // 20 dict, 10 seen but none due → reviewCount=0; fresh=10 picked first
    // (newRatio=0 still falls through to `min(sessionSize - 0, fresh.length)`).
    // queue=10. Deficit=2. Filler = the 10 seen-not-due words.
    // The slice(0, 2) is what keeps the final length at exactly 12.
    const big = Array.from({ length: 20 }, (_, i) => ({
      word: `f${String(i)}`,
    }));
    const seen = new Set(big.slice(0, 10).map((d) => d.word));
    const due = new Set<string>();
    const q = buildQueue(big, seen, due, 12, 0, identity);
    expect(q).toHaveLength(12);
  });

  test("undersized review+fresh pool: filler bumps queue back up to sessionSize", () => {
    // 6 due-seen + 4 fresh = 10 total. newRatio=0.5 → reviewCount=min(5, 6)=5;
    // newCount=min(10-5=5, 4)=4. queue = 9. Filler must add 1 more (the
    // unused 6th due word) to reach sessionSize=10.
    const small = dict.slice(0, 10);
    const seen = new Set(small.slice(0, 6).map((d) => d.word));
    const due = new Set(seen);
    const q = buildQueue(small, seen, due, 10, 0.5, identity);
    expect(q).toHaveLength(10);
  });
});
