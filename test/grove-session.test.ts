import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { normalizeVocabDeck, type RawEntry } from "../src/content/deck";
import { buildGroveQueue } from "../src/games/grove-session";
import { recordReview } from "../src/games/lex-srs";
import { resetRng, setRng } from "../src/shared/rng";

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
});
