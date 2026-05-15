import { describe, expect, test } from "bun:test";
import {
  buildLayout,
  cellKey,
  cellMap,
  cellsFor,
} from "../src/games/lex-crossword";

describe("buildLayout", () => {
  test("empty input → empty layout", () => {
    const out = buildLayout([]);
    expect(out.placements).toEqual([]);
    expect(out.unplaced).toEqual([]);
    expect(out.rows).toBe(0);
  });

  test("places multiple intersecting words", () => {
    const out = buildLayout([
      { clue: "feline", answer: "katt" },
      { clue: "canine", answer: "hund" },
      { clue: "insect", answer: "ant" },
      { clue: "second", answer: "andre" },
      { clue: "night", answer: "natt" },
    ]);
    expect(out.placements.length).toBeGreaterThan(0);
    expect(out.rows).toBeGreaterThan(0);
    expect(out.cols).toBeGreaterThan(0);
    for (const p of out.placements) {
      expect(["across", "down"]).toContain(p.orientation);
      expect(p.startx).toBeGreaterThanOrEqual(1);
      expect(p.starty).toBeGreaterThanOrEqual(1);
    }
  });

  test("placements + unplaced together cover input", () => {
    const input = [
      { clue: "a", answer: "katt" },
      { clue: "b", answer: "hund" },
      { clue: "c", answer: "natt" },
      { clue: "d", answer: "xyzzy" }, // unlikely to intersect → may be unplaced
    ];
    const out = buildLayout(input);
    const all = new Set([
      ...out.placements.map((p) => p.answer),
      ...out.unplaced.map((u) => u.answer),
    ]);
    for (const w of input) expect(all.has(w.answer)).toBe(true);
  });

  test("re-numbers positions starting at 1 in reading order", () => {
    const out = buildLayout([
      { clue: "1", answer: "katt" },
      { clue: "2", answer: "hund" },
      { clue: "3", answer: "natt" },
      { clue: "4", answer: "ant" },
    ]);
    const positions = out.placements.map((p) => p.position);
    expect(positions[0]).toBe(1);
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBe(i + 1);
    }
  });
});

describe("cellsFor", () => {
  test("across runs in +x direction", () => {
    const cells = cellsFor({
      clue: "",
      answer: "abc",
      startx: 2,
      starty: 5,
      orientation: "across",
      position: 1,
    });
    expect(cells).toEqual([
      { x: 2, y: 5 },
      { x: 3, y: 5 },
      { x: 4, y: 5 },
    ]);
  });

  test("down runs in +y direction", () => {
    const cells = cellsFor({
      clue: "",
      answer: "ab",
      startx: 7,
      starty: 1,
      orientation: "down",
      position: 1,
    });
    expect(cells).toEqual([
      { x: 7, y: 1 },
      { x: 7, y: 2 },
    ]);
  });
});

describe("cellMap", () => {
  test("marks intersection where two words cross", () => {
    // "katt" across at (1,1); "natt" down at (2,1) — share 'a' at (2,1)? No.
    // Construct manually: "ABC" across (1,1) and "DEC" down (3,1) cross at (3,1).
    const map = cellMap([
      {
        clue: "",
        answer: "abc",
        startx: 1,
        starty: 1,
        orientation: "across",
        position: 1,
      },
      {
        clue: "",
        answer: "dec",
        startx: 3,
        starty: 1,
        orientation: "down",
        position: 2,
      },
    ]);
    const cross = map.get(cellKey(3, 1));
    expect(cross?.intersection).toBe(true);
    expect(cross?.letter).toBe("c");
    expect(cross?.wordIdxs.length).toBe(2);
  });

  test("non-shared cells are not intersections", () => {
    const map = cellMap([
      {
        clue: "",
        answer: "abc",
        startx: 1,
        starty: 1,
        orientation: "across",
        position: 1,
      },
    ]);
    expect(map.get(cellKey(1, 1))?.intersection).toBe(false);
    expect(map.get(cellKey(2, 1))?.letter).toBe("b");
  });
});
