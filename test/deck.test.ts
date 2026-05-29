import { describe, expect, test } from "bun:test";
import {
  lengthBand,
  normalizeVocabDeck,
  type RawEntry,
} from "../src/content/deck";

// 20-entry hand-picked subset that deliberately includes: a homograph (4× "å"),
// an æøå word, a multiword phrase ("ad hoc"), and empty-example words.
const SUBSET: RawEntry[] = [
  { word: "å", pos: "verb", definition: "to (infinitive marker)", example: "" },
  { word: "å", pos: "noun", definition: "a small river / stream", example: "" },
  { word: "å", pos: "intj", definition: "oh! (exclamation)", example: "" },
  { word: "å", pos: "prep", definition: "on / at (dialectal)", example: "" },
  { word: "være", pos: "verb", definition: "to be", example: "å ___ glad" },
  { word: "være", pos: "noun", definition: "weather / air", example: "" },
  { word: "fugl", pos: "noun", definition: "a bird", example: "" },
  { word: "ørn", pos: "noun", definition: "an eagle", example: "" },
  { word: "skog", pos: "noun", definition: "a forest", example: "" },
  { word: "blomst", pos: "noun", definition: "a flower", example: "" },
  { word: "løpe", pos: "verb", definition: "to run", example: "" },
  { word: "rød", pos: "adj", definition: "red", example: "" },
  { word: "fjell", pos: "noun", definition: "a mountain", example: "" },
  { word: "sjø", pos: "noun", definition: "a sea / lake", example: "" },
  { word: "og", pos: "conj", definition: "and", example: "" },
  {
    word: "ad hoc",
    pos: "phrase",
    definition: "for this purpose",
    example: "",
  },
  { word: "hus", pos: "noun", definition: "a house", example: "" },
  { word: "katt", pos: "noun", definition: "a cat", example: "" },
  { word: "lys", pos: "noun", definition: "light", example: "" },
  { word: "vann", pos: "noun", definition: "water", example: "" },
];

describe("normalizeVocabDeck — senseIdx / entryId / NFC", () => {
  const deck = normalizeVocabDeck(SUBSET, "no");

  test("homograph senses get distinct entryIds, shared label", () => {
    const aa = deck.entries.filter((e) => e.label === "å");
    expect(aa.length).toBe(4);
    expect(aa.map((e) => e.senseIdx).sort()).toEqual([0, 1, 2, 3]);
    expect(aa.map((e) => e.entryId).sort()).toEqual(["å", "å#1", "å#2", "å#3"]);
    expect(new Set(aa.map((e) => e.label))).toEqual(new Set(["å"]));
  });

  test("labels are NFC-normalized (æøå single code point)", () => {
    const orn = deck.entries.find((e) => e.entryId.startsWith("ørn"));
    expect(orn).toBeDefined();
    expect([...(orn as { label: string }).label.normalize("NFC")]).toEqual([
      ...(orn as { label: string }).label,
    ]);
  });

  test("empty examples are preserved, never synthesized", () => {
    const fugl = deck.entries.find((e) => e.entryId === "fugl");
    expect(fugl?.example).toBe("");
  });

  test("manifest reflects the deck", () => {
    expect(deck.manifest.entryCount).toBe(20);
    expect(deck.manifest.deckId).toBe("no");
    expect(deck.manifest.clusterBy).toBe("entryId");
  });
});

describe("rank seeding (Q1)", () => {
  const deck = normalizeVocabDeck(SUBSET, "no");

  test("ranks are a 0-based permutation", () => {
    const ranks = deck.entries.map((e) => e.rank).sort((a, b) => a - b);
    expect(ranks).toEqual(Array.from({ length: 20 }, (_v, i) => i));
  });

  test("phrases (space in label) are forced to the trailing band → ranked last", () => {
    const adhoc = deck.entries.find((e) => e.label === "ad hoc");
    const others = deck.entries.filter((e) => e.label !== "ad hoc");
    expect(adhoc?.rank).toBeGreaterThan(Math.max(...others.map((e) => e.rank)));
  });

  test("shorter words rank before longer ones (length-graded)", () => {
    const short = deck.entries.find((e) => e.entryId === "og"); // 2 chars → band 0
    const long = deck.entries.find((e) => e.entryId === "blomst"); // 6 chars → band 1
    expect((short as { rank: number }).rank).toBeLessThan(
      (long as { rank: number }).rank,
    );
  });

  test("lengthBand: short→0, mid→1, phrase→trailing", () => {
    expect(lengthBand("å")).toBe(0);
    expect(lengthBand("og")).toBe(0);
    expect(lengthBand("blomst")).toBe(1);
    expect(lengthBand("ad hoc")).toBe(7);
  });
});

describe("determinism", () => {
  test("same input → byte-identical output across runs", () => {
    const a = normalizeVocabDeck(SUBSET, "no");
    const b = normalizeVocabDeck(SUBSET, "no");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
