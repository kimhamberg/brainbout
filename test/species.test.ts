import { describe, expect, test } from "bun:test";
import { normalizeVocabDeck, type RawEntry } from "../src/content/deck";
import {
  CANON_HUE,
  clusterKey,
  firstContentKeyword,
  hueDeltaFor,
  kingdomForPos,
  speciesFor,
  templateKey,
} from "../src/content/species";
import { resetRng, rng, setRng } from "../src/shared/rng";
import { TEMPLATES_PER_KINGDOM } from "../src/world/limits";

const RAW: RawEntry[] = [
  { word: "å", pos: "verb", definition: "to (infinitive marker)", example: "" },
  { word: "å", pos: "noun", definition: "a small river / stream", example: "" },
  { word: "fugl", pos: "noun", definition: "a bird", example: "" },
  { word: "ørn", pos: "noun", definition: "an eagle", example: "" },
  { word: "løpe", pos: "verb", definition: "to run", example: "" },
  { word: "rød", pos: "adj", definition: "red", example: "" },
  { word: "og", pos: "conj", definition: "and", example: "" },
];
const deck = normalizeVocabDeck(RAW, "no");
const byId = (id: string) =>
  deck.entries.find((e) => e.entryId === id) as (typeof deck.entries)[number];

describe("kingdomForPos", () => {
  test("4-kingdom taxonomy with a STRUCTURE fallback", () => {
    expect(kingdomForPos("noun")).toBe("FLORA");
    expect(kingdomForPos("verb")).toBe("FAUNA");
    expect(kingdomForPos("adj")).toBe("MODIFIER");
    expect(kingdomForPos("adv")).toBe("MODIFIER");
    expect(kingdomForPos("conj")).toBe("STRUCTURE");
    expect(kingdomForPos("anything-else")).toBe("STRUCTURE");
  });
});

describe("speciesFor — deterministic & device-identical", () => {
  test("same (deckId, entry) → byte-identical species across calls", () => {
    const a = speciesFor("no", byId("fugl"), deck.manifest);
    const b = speciesFor("no", byId("fugl"), deck.manifest);
    expect(a).toEqual(b);
  });

  test("homograph senses yield DIFFERENT species", () => {
    const a = speciesFor("no", byId("å"), deck.manifest);
    const b = speciesFor("no", byId("å#1"), deck.manifest);
    expect(a).not.toEqual(b);
  });

  test("templateIdx stays within the kingdom's library", () => {
    for (const e of deck.entries) {
      const sp = speciesFor("no", e, deck.manifest);
      expect(sp.templateIdx).toBeGreaterThanOrEqual(0);
      expect(sp.templateIdx).toBeLessThan(TEMPLATES_PER_KINGDOM[sp.kingdom]);
    }
  });

  test("hue lands in the kingdom's solarpunk band", () => {
    const fugl = speciesFor("no", byId("fugl"), deck.manifest); // FLORA (warm green)
    expect(fugl.baseHue).toBeGreaterThanOrEqual(125);
    expect(fugl.baseHue).toBeLessThanOrEqual(148);
  });

  test("does NOT consume the global rng (partitioned cosmetic stream, guardrail 6)", () => {
    let calls = 0;
    setRng(() => {
      calls++;
      return 0.5;
    });
    speciesFor("no", byId("fugl"), deck.manifest);
    speciesFor("no", byId("ørn"), deck.manifest);
    expect(calls).toBe(0);
    // the global rng is still the injected one, untouched in sequence
    expect(rng()).toBe(0.5);
    resetRng();
  });
});

describe("template binding (Q2)", () => {
  test("templateKey points at the bounded per-kingdom template", () => {
    const sp = speciesFor("no", byId("fugl"), deck.manifest); // FLORA
    expect(templateKey(sp)).toBe(`tmpl:flora:${String(sp.templateIdx)}`);
  });

  test("hueDeltaFor is the offset from the kingdom's canonical hue (small, in-band)", () => {
    for (const e of deck.entries) {
      const sp = speciesFor("no", e, deck.manifest);
      const delta = hueDeltaFor(sp);
      expect(delta).toBeCloseTo(sp.baseHue - CANON_HUE[sp.kingdom], 6);
      // bands are ≤35° wide, so the rotation from the midpoint stays small
      expect(Math.abs(delta)).toBeLessThanOrEqual(20);
    }
  });
});

describe("clusterKey (Q5) — opt-in, graceful fallback", () => {
  test("default deck clusters by entryId", () => {
    expect(clusterKey(byId("fugl"), deck.manifest)).toBe("fugl");
  });

  test("gloss-keyword clustering when opted in + English gloss", () => {
    const en = normalizeVocabDeck(RAW, "no", { clusterBy: "gloss-keyword" });
    // "a bird" → stop-word "a" stripped → "bird"
    expect(clusterKey(byId("fugl"), en.manifest)).toBe("bird");
  });

  test("falls back to entryId for non-English decks", () => {
    const nb = normalizeVocabDeck(RAW, "no", {
      clusterBy: "gloss-keyword",
      glossLang: "nb",
    });
    expect(clusterKey(byId("fugl"), nb.manifest)).toBe("fugl");
  });

  test("firstContentKeyword strips stop words / returns null when empty", () => {
    expect(firstContentKeyword("a bird")).toBe("bird");
    expect(firstContentKeyword("to run")).toBe("run");
    expect(firstContentKeyword("the of and")).toBeNull();
    expect(firstContentKeyword("")).toBeNull();
  });
});
