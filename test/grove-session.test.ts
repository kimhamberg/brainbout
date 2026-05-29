import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { normalizeVocabDeck, type RawEntry } from "../src/content/deck";
import {
  buildGroveQueue,
  canRelearn,
  groveMode,
  groveOptions,
  MAX_RELEARN,
  promotionCredit,
} from "../src/games/grove-session";
import { recordReview } from "../src/games/lex-srs";
import { resetRng, seededRng, setRng } from "../src/shared/rng";

beforeEach(() => {
  localStorage.clear();
  setRng(() => 0.5);
});
afterEach(resetRng);

const RAW: RawEntry[] = Array.from({ length: 10 }, (_v, i) => ({
  word: `ord${String(i)}`,
  pos: "noun",
  definition: `gloss ${String(i)}`,
  example: "",
}));
const deck = normalizeVocabDeck(RAW, "no");

describe("buildGroveQueue", () => {
  test("first session: all fresh → first `cap` entries in deck order", () => {
    const q = buildGroveQueue(deck, "no", "2026-05-29", 4);
    expect(q.length).toBe(4);
    expect(q.map((e) => e.entryId)).toEqual(["ord0", "ord1", "ord2", "ord3"]);
  });

  test("cap larger than deck returns the whole deck", () => {
    expect(buildGroveQueue(deck, "no", "2026-05-29", 99).length).toBe(10);
  });

  test("a reviewed-but-due entry surfaces ahead of fresh ones", () => {
    // review ord5 with "again" → due again immediately (nextDue <= today soon)
    recordReview("no", "ord5", "again", "2026-05-29");
    const q = buildGroveQueue(deck, "no", "2030-01-01", 3); // far future → ord5 due
    expect(q[0]?.entryId).toBe("ord5"); // seen+due leads
    expect(q.length).toBe(3);
  });

  test("mastered/not-due seen entries are not re-queued ahead of fresh", () => {
    recordReview("no", "ord2", "easy", "2026-05-29"); // scheduled out
    const q = buildGroveQueue(deck, "no", "2026-05-29", 5);
    // ord2 is seen but not due today → it should not lead; fresh fill the queue
    expect(q[0]?.entryId).not.toBe("ord2");
    expect(q.length).toBe(5);
  });

  test("a seen, still-active, due entry leads the queue (greenhouse seenDue)", () => {
    buildGroveQueue(deck, "no", "2026-05-29", 10); // first build seeds the greenhouse
    recordReview("no", "ord3", "again", "2026-05-29"); // active card lapses → due soon, not mastered
    const q = buildGroveQueue(deck, "no", "2026-06-10", 5); // future → ord3 is due
    expect(q[0]?.entryId).toBe("ord3"); // greenhouse-due leads, ahead of fresh
  });

  test("fresh entries surface by rank (shortest first), not file order", () => {
    const mixed = normalizeVocabDeck(
      [
        { word: "elephant", pos: "noun", definition: "", example: "" }, // band 2
        { word: "ab", pos: "noun", definition: "", example: "" }, // band 0
        { word: "cat", pos: "noun", definition: "", example: "" }, // band 0
        { word: "house", pos: "noun", definition: "", example: "" }, // band 1
      ],
      "no",
    );
    const q = buildGroveQueue(mixed, "no", "2026-05-29", 4);
    expect(q.map((e) => e.entryId)).toEqual(["ab", "cat", "house", "elephant"]);
  });
});

describe("groveMode", () => {
  test("ramps recognition → cloze → typed by stage", () => {
    expect(groveMode(1)).toBe("mcq");
    expect(groveMode(2)).toBe("cloze");
    expect(groveMode(3)).toBe("typed");
  });
  test("clamps below 1 to mcq and above 3 to typed", () => {
    expect(groveMode(0)).toBe("mcq");
    expect(groveMode(-5)).toBe("mcq");
    expect(groveMode(4)).toBe("typed");
    expect(groveMode(99)).toBe("typed");
  });
});

describe("promotionCredit", () => {
  test("exact answer earns full credit in every mode", () => {
    for (const m of ["mcq", "cloze", "typed"] as const) {
      expect(promotionCredit(m, "good")).toBe(1);
      expect(promotionCredit(m, "easy")).toBe(1);
    }
  });
  test("a wrong answer earns nothing", () => {
    for (const m of ["mcq", "cloze", "typed"] as const) {
      expect(promotionCredit(m, "again")).toBe(0);
    }
  });
  test("a correct MCQ pick is full credit; a typo (hard) in cloze/typed is half", () => {
    expect(promotionCredit("mcq", "hard")).toBe(1); // recognition has no partial
    expect(promotionCredit("cloze", "hard")).toBe(0.5);
    expect(promotionCredit("typed", "hard")).toBe(0.5);
  });
});

describe("canRelearn", () => {
  test("allows a spaced retry until the per-session cap, then gives up", () => {
    expect(canRelearn(0)).toBe(true);
    expect(canRelearn(MAX_RELEARN - 1)).toBe(true);
    expect(canRelearn(MAX_RELEARN)).toBe(false);
    expect(canRelearn(MAX_RELEARN + 3)).toBe(false);
  });
  test("honours a custom cap", () => {
    expect(canRelearn(0, 1)).toBe(true);
    expect(canRelearn(1, 1)).toBe(false);
  });
});

describe("groveOptions", () => {
  const target = deck.entries[0];
  if (!target) throw new Error("deck empty");

  test("returns 4 distinct options including the correct label", () => {
    const opts = groveOptions(target, deck, seededRng("seed-a"));
    expect(opts.length).toBe(4);
    expect(opts).toContain(target.label);
    expect(new Set(opts).size).toBe(4); // no dupes
  });

  test("same seed → same order; membership stable across seeds", () => {
    const a1 = groveOptions(target, deck, seededRng("seed-a"));
    const a2 = groveOptions(target, deck, seededRng("seed-a"));
    expect(a1).toEqual(a2);
    const b = groveOptions(target, deck, seededRng("seed-z"));
    expect(new Set(b)).toEqual(new Set(a1)); // same members
  });

  test("shuffle actually consumes the rng — seeds produce >1 distinct order", () => {
    const orders = new Set(
      Array.from({ length: 16 }, (_v, i) =>
        groveOptions(target, deck, seededRng(`s${String(i)}`)).join("|"),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  test("prefers same-pos distractors when available", () => {
    const mixed = normalizeVocabDeck(
      [
        { word: "fugl", pos: "noun", definition: "bird", example: "" },
        { word: "skog", pos: "noun", definition: "forest", example: "" },
        { word: "fjell", pos: "noun", definition: "mountain", example: "" },
        { word: "elv", pos: "noun", definition: "river", example: "" },
        { word: "løpe", pos: "verb", definition: "to run", example: "" },
        { word: "hoppe", pos: "verb", definition: "to jump", example: "" },
      ],
      "no",
    );
    const noun = mixed.entries[0];
    if (!noun) throw new Error("no entry");
    const opts = groveOptions(noun, mixed, seededRng("s"));
    const byLabel = new Map(mixed.entries.map((e) => [e.label, e.pos]));
    for (const o of opts) expect(byLabel.get(o)).toBe("noun");
  });

  test("tops up across pos to reach 4 when same-pos peers are scarce", () => {
    // one adjective among nouns → pos pool can't fill 3; must borrow nouns.
    const skewed = normalizeVocabDeck(
      [
        { word: "rød", pos: "adj", definition: "red", example: "" },
        { word: "fugl", pos: "noun", definition: "bird", example: "" },
        { word: "skog", pos: "noun", definition: "forest", example: "" },
        { word: "blomst", pos: "noun", definition: "flower", example: "" },
        { word: "katt", pos: "noun", definition: "cat", example: "" },
      ],
      "no",
    );
    const adj = skewed.entries[0];
    if (!adj) throw new Error("no entry");
    const opts = groveOptions(adj, skewed, seededRng("s"));
    expect(opts.length).toBe(4); // full choice despite a 1-member pos pool
    expect(opts).toContain("rød");
    expect(new Set(opts).size).toBe(4);
  });

  test("returns fewer than 4 only when the deck lacks distinct words", () => {
    const tiny = normalizeVocabDeck(
      [
        { word: "fugl", pos: "noun", definition: "bird", example: "" },
        { word: "skog", pos: "noun", definition: "forest", example: "" },
        { word: "elv", pos: "noun", definition: "river", example: "" },
      ],
      "no",
    );
    const t0 = tiny.entries[0];
    if (!t0) throw new Error("no entry");
    const opts = groveOptions(t0, tiny, seededRng("s"));
    expect(opts.length).toBe(3); // target + 2 — all the deck can offer
    expect(opts).toContain("fugl");
    expect(new Set(opts).size).toBe(3); // never duplicates
  });

  test("drops a distractor that is only a case/diacritic variant of the target", () => {
    const dup = normalizeVocabDeck(
      [
        { word: "Bibel", pos: "noun", definition: "Bible", example: "" },
        { word: "bibel", pos: "noun", definition: "bible", example: "" },
        { word: "fugl", pos: "noun", definition: "bird", example: "" },
        { word: "skog", pos: "noun", definition: "forest", example: "" },
        { word: "elv", pos: "noun", definition: "river", example: "" },
      ],
      "no",
    );
    const cap = dup.entries[0]; // "Bibel"
    if (!cap) throw new Error("no entry");
    const opts = groveOptions(cap, dup, seededRng("s"));
    expect(opts).toContain("Bibel");
    expect(opts).not.toContain("bibel"); // case-variant of the answer excluded
  });
});
