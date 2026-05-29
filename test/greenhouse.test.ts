import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { normalizeVocabDeck, type RawEntry } from "../src/content/deck";
import { sampleWildDue, syncActiveSet } from "../src/games/greenhouse";
import { getCard, recordReview } from "../src/games/lex-srs";
import { isMastered } from "../src/shared/fsrs";
import { resetRng, setRng } from "../src/shared/rng";

beforeEach(() => {
  localStorage.clear();
  setRng(() => 0.5); // deterministic jitter
});
afterEach(resetRng);

// w0..w5 — all 2 chars (band 0) → rank === original index.
const RAW: RawEntry[] = Array.from({ length: 6 }, (_v, i) => ({
  word: `w${String(i)}`,
  pos: "noun",
  definition: "",
  example: "",
}));
const deck = normalizeVocabDeck(RAW, "no");
const ACTIVE_KEY = "brainbout:lex:no:active";

function master(id: string): void {
  for (let i = 0; i < 20 && !isMastered(getCard("no", id)); i++) {
    recordReview(
      "no",
      id,
      "easy",
      `2026-05-${String(10 + i).padStart(2, "0")}`,
    );
  }
}

describe("syncActiveSet", () => {
  test("seeds the lowest-rank entries up to the cap", () => {
    expect(syncActiveSet(deck, "no", 3)).toEqual(["w0", "w1", "w2"]);
  });

  test("a cap larger than the deck admits everything", () => {
    expect(syncActiveSet(deck, "no", 99)).toEqual([
      "w0",
      "w1",
      "w2",
      "w3",
      "w4",
      "w5",
    ]);
  });

  test("persists and is idempotent", () => {
    const a = syncActiveSet(deck, "no", 3);
    expect(localStorage.getItem(ACTIVE_KEY)).toBe(JSON.stringify(a));
    expect(syncActiveSet(deck, "no", 3)).toEqual(a);
  });

  test("a mastered card migrates to the wild and an unseen one refills", () => {
    syncActiveSet(deck, "no", 3); // [w0,w1,w2]
    recordReview("no", "w3", "good", "2026-05-29"); // w3 seen but NOT in the greenhouse
    master("w1");
    // w1 dropped (mastered); w3 skipped (already seen → not promotable as new);
    // w4 is the lowest-rank UNSEEN entry → promoted in.
    expect(syncActiveSet(deck, "no", 3)).toEqual(["w0", "w2", "w4"]);
  });

  test("drops stale ids no longer in the deck", () => {
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(["ghost", "w0"]));
    const a = syncActiveSet(deck, "no", 3);
    expect(a).not.toContain("ghost");
    expect(a[0]).toBe("w0");
    expect(a.length).toBe(3);
  });

  test("recovers from malformed / non-array / dirty storage", () => {
    localStorage.setItem(ACTIVE_KEY, "{not json");
    expect(syncActiveSet(deck, "no", 2)).toEqual(["w0", "w1"]); // catch → reseed

    localStorage.setItem(ACTIVE_KEY, JSON.stringify("a string"));
    expect(syncActiveSet(deck, "no", 2)).toEqual(["w0", "w1"]); // not an array → reseed

    localStorage.setItem(ACTIVE_KEY, JSON.stringify(["w0", 5, null]));
    expect(syncActiveSet(deck, "no", 2)).toEqual(["w0", "w1"]); // non-strings filtered
  });
});

describe("sampleWildDue", () => {
  // review entries on an old date so their nextDue is in the past → due now.
  function makeWild(id: string, reviewDate: string): void {
    recordReview("no", id, "good", reviewDate);
  }

  test("returns only out-of-greenhouse, seen, due entries — capped + most-overdue first", () => {
    const active = syncActiveSet(deck, "no", 2); // [w0,w1]
    makeWild("w3", "2020-01-01"); // most overdue
    makeWild("w4", "2021-01-01");
    makeWild("w5", "2022-01-01"); // least overdue
    const wild = sampleWildDue(deck, "no", "2026-05-29", active, 2);
    expect(wild.map((e) => e.entryId)).toEqual(["w3", "w4"]); // 2, oldest-due first
    for (const e of wild) expect(active).not.toContain(e.entryId);
  });

  test("excludes active members, unseen cards, and not-yet-due cards", () => {
    const active = syncActiveSet(deck, "no", 3); // [w0,w1,w2]
    recordReview("no", "w0", "good", "2020-01-01"); // due but ACTIVE → excluded
    recordReview("no", "w4", "good", "2026-05-29"); // seen but nextDue future → not due
    // w5 left unseen
    const wild = sampleWildDue(deck, "no", "2026-05-29", active, 5);
    expect(wild).toEqual([]);
  });

  test("ties on nextDue break by rank", () => {
    const active = syncActiveSet(deck, "no", 2); // [w0,w1]
    recordReview("no", "w5", "good", "2020-01-01");
    recordReview("no", "w3", "good", "2020-01-01"); // same review date → same nextDue
    const wild = sampleWildDue(deck, "no", "2026-05-29", active, 5);
    expect(wild.map((e) => e.entryId)).toEqual(["w3", "w5"]); // lower rank first
  });
});
