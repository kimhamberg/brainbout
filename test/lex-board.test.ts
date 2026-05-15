import { describe, expect, test } from "bun:test";
import {
  boardLayout,
  letterValue,
  scoreWord,
  TILE_VALUES_NO,
  turnScore,
} from "../src/games/lex-board";

describe("letterValue", () => {
  test("Norwegian commons = 1", () => {
    for (const ch of ["a", "e", "n", "r", "t", "s"]) {
      expect(letterValue(ch)).toBe(1);
    }
  });
  test("å = 4, ø = 5, æ = 6", () => {
    expect(letterValue("å")).toBe(4);
    expect(letterValue("ø")).toBe(5);
    expect(letterValue("æ")).toBe(6);
  });
  test("c = 10 (rare)", () => {
    expect(letterValue("c")).toBe(10);
  });
  test("case insensitive", () => {
    expect(letterValue("Æ")).toBe(6);
  });
  test("unknown char → 0", () => {
    expect(letterValue("!")).toBe(0);
    expect(letterValue(" ")).toBe(0);
  });
  test("tile table covers all NO alphabet letters", () => {
    for (const ch of "abcdefghijklmnopqrstuvwxyzæøå") {
      expect(TILE_VALUES_NO[ch]).toBeGreaterThan(0);
    }
  });
});

describe("boardLayout", () => {
  test("length matches word length", () => {
    expect(boardLayout("hus").length).toBe(3);
    expect(boardLayout("vidunderlig").length).toBe(11);
  });
  test("deterministic per word", () => {
    expect(boardLayout("katt")).toEqual(boardLayout("katt"));
  });
  test("different words usually differ", () => {
    // Not a strict guarantee but extremely likely across the dict.
    const a = JSON.stringify(boardLayout("katt"));
    const b = JSON.stringify(boardLayout("hund"));
    expect(a).not.toBe(b);
  });
  test("case insensitive seed", () => {
    expect(boardLayout("Katt")).toEqual(boardLayout("katt"));
  });
});

describe("scoreWord", () => {
  test("plain layout = sum of letter values", () => {
    // h(3) + u(4) + s(1) = 8
    expect(scoreWord("hus", [null, null, null])).toBe(8);
  });
  test("DL doubles that letter only", () => {
    // 3 + (4*2) + 1 = 12
    expect(scoreWord("hus", [null, "DL", null])).toBe(12);
  });
  test("TL triples that letter only", () => {
    // 3 + (4*3) + 1 = 16
    expect(scoreWord("hus", [null, "TL", null])).toBe(16);
  });
  test("DW doubles the whole word", () => {
    expect(scoreWord("hus", ["DW", null, null])).toBe(16);
  });
  test("TW triples the whole word", () => {
    expect(scoreWord("hus", [null, null, "TW"])).toBe(24);
  });
  test("DW + TL stacks: word mult applies after letter mult", () => {
    // letters: 3 + 4*3 + 1 = 16; word ×2 = 32
    expect(scoreWord("hus", ["DW", "TL", null])).toBe(32);
  });
});

describe("turnScore", () => {
  test("streak 0, slow answer: base score only", () => {
    // hus all plain = 8; streak 0 ⇒ ×1; elapsed 30s ⇒ +0
    expect(turnScore("hus", [null, null, null], 0, 30_000)).toBe(8);
  });
  test("streak 5 doubles base", () => {
    // 8 × 2 = 16; +0 speed
    expect(turnScore("hus", [null, null, null], 5, 30_000)).toBe(16);
  });
  test("fast under 3s adds +5", () => {
    expect(turnScore("hus", [null, null, null], 0, 1000)).toBe(13);
  });
  test("floor applied before speed bonus", () => {
    // streak 3 → ×1.5. base 1+1 = 2, ×1.5 = 3, +5 fast = 8
    expect(turnScore("ai", [null, null], 3, 1000)).toBe(8);
  });
});
