import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface DictEntry {
  word: string;
  pos: string;
  definition: string;
  example: string;
}

function loadDict(lang: string): DictEntry[] {
  const path = resolve(import.meta.dirname, `../public/dict-${lang}.json`);
  return JSON.parse(readFileSync(path, "utf-8")) as DictEntry[];
}

describe("dict-no.json", () => {
  const dict = loadDict("no");

  it("has substantial entry count", () => {
    expect(dict.length).toBeGreaterThan(20_000);
  });

  it("every entry has required string fields", () => {
    for (const entry of dict.slice(0, 1000)) {
      expect(typeof entry.word).toBe("string");
      expect(entry.word.length).toBeGreaterThan(0);
      expect(typeof entry.pos).toBe("string");
      expect(entry.pos.length).toBeGreaterThan(0);
      expect(typeof entry.definition).toBe("string");
      expect(entry.definition.length).toBeGreaterThan(0);
      expect(typeof entry.example).toBe("string");
    }
  });

  it("has no form-of definitions in first 1000 entries", () => {
    const formOfPatterns = [
      /^alternative (form|spelling) of /iu,
      /^plural of /iu,
      /^past tense of /iu,
      /^present participle of /iu,
      /^inflection of /iu,
      /^(definite |indefinite )?(singular|plural) of /iu,
      /^(feminine|masculine|neuter) of /iu,
      /^imperative of /iu,
      /^supine of /iu,
      /^gerund of /iu,
      /^form removed /iu,
      /^(abbreviation|initialism|acronym) of /iu,
      /^clipping of /iu,
      /^contraction of /iu,
    ];
    for (const entry of dict.slice(0, 1000)) {
      for (const pattern of formOfPatterns) {
        expect(entry.definition).not.toMatch(pattern);
      }
    }
  });

  it("examples do not contain the target word unmasked", () => {
    for (const entry of dict.slice(0, 1000)) {
      if (entry.example && entry.example !== "") {
        const escaped = entry.word.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
        const pattern = new RegExp(`\\b${escaped}\\b`, "iu");
        expect(entry.example).not.toMatch(pattern);
      }
    }
  });
});
