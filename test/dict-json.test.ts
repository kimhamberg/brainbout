import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface DictEntry {
  word: string;
  pos: string;
  definition: string;
  example: string;
}

function loadDict(lang: string): DictEntry[] {
  const path = resolve(__dirname, `../public/dict-${lang}.json`);
  return JSON.parse(readFileSync(path, "utf-8")) as DictEntry[];
}

describe("dict-no.json", () => {
  const dict = loadDict("no");

  it("has substantial entry count", () => {
    expect(dict.length).toBeGreaterThan(20000);
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
      /^alternative (form|spelling) of /i,
      /^plural of /i,
      /^past tense of /i,
      /^present participle of /i,
      /^inflection of /i,
      /^(definite |indefinite )?(singular|plural) of /i,
      /^(feminine|masculine|neuter) of /i,
      /^imperative of /i,
      /^supine of /i,
      /^gerund of /i,
      /^form removed /i,
      /^(abbreviation|initialism|acronym) of /i,
      /^clipping of /i,
      /^contraction of /i,
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
        const escaped = entry.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = new RegExp(`\\b${escaped}\\b`, "i");
        expect(entry.example).not.toMatch(pattern);
      }
    }
  });
});
