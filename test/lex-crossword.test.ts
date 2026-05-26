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

describe("buildLayout — fixed input", () => {
  const fixed = buildLayout([
    { clue: "feline", answer: "katt" },
    { clue: "insect", answer: "ant" },
    { clue: "second", answer: "andre" },
    { clue: "night", answer: "natt" },
  ]);

  test("unplaced array is populated when generator cannot place a word", () => {
    expect(fixed.unplaced.length).toBeGreaterThan(0);
    for (const u of fixed.unplaced) {
      expect(typeof u.clue).toBe("string");
      expect(typeof u.answer).toBe("string");
    }
  });

  test("placements never use orientation 'none'", () => {
    for (const p of fixed.placements) {
      expect(p.orientation === "across" || p.orientation === "down").toBe(true);
    }
  });

  test("placements sorted in reading order (top→bottom, left→right)", () => {
    for (let i = 1; i < fixed.placements.length; i++) {
      const a = fixed.placements[i - 1];
      const b = fixed.placements[i];
      if (a && b) {
        const aKey = a.starty * 10_000 + a.startx;
        const bKey = b.starty * 10_000 + b.startx;
        expect(aKey).toBeLessThanOrEqual(bKey);
      }
    }
  });

  test("missing startx/starty default to 1 (no NaN coords)", () => {
    for (const p of fixed.placements) {
      expect(Number.isFinite(p.startx)).toBe(true);
      expect(Number.isFinite(p.starty)).toBe(true);
      expect(p.startx).toBeGreaterThanOrEqual(1);
      expect(p.starty).toBeGreaterThanOrEqual(1);
    }
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

  test("covers every cell of every placement (no boundary skip)", () => {
    const placements = [
      {
        clue: "",
        answer: "abcd",
        startx: 1,
        starty: 1,
        orientation: "across" as const,
        position: 1,
      },
      {
        clue: "",
        answer: "efgh",
        startx: 5,
        starty: 1,
        orientation: "down" as const,
        position: 2,
      },
    ];
    const map = cellMap(placements);
    // 4 + 4 = 8 cells; no intersections.
    expect(map.size).toBe(8);
    expect(map.get(cellKey(1, 1))?.letter).toBe("a");
    expect(map.get(cellKey(4, 1))?.letter).toBe("d");
    expect(map.get(cellKey(5, 1))?.letter).toBe("e");
    expect(map.get(cellKey(5, 4))?.letter).toBe("h");
  });

  test("empty placements list → empty map", () => {
    expect(cellMap([]).size).toBe(0);
  });

  test("wordIdxs records every placement covering a shared cell", () => {
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
    expect(cross?.wordIdxs).toEqual([0, 1]);
    // Non-intersection cells should hold only the originating placement index.
    expect(map.get(cellKey(1, 1))?.wordIdxs).toEqual([0]);
    expect(map.get(cellKey(3, 3))?.wordIdxs).toEqual([1]);
  });
});

describe("cellsFor — boundary checks", () => {
  test("length-1 word produces a single cell at start", () => {
    expect(
      cellsFor({
        clue: "",
        answer: "a",
        startx: 5,
        starty: 7,
        orientation: "across",
        position: 1,
      }),
    ).toEqual([{ x: 5, y: 7 }]);
  });
  test("returns exactly answer.length cells (no off-by-one)", () => {
    const cells = cellsFor({
      clue: "",
      answer: "abcde",
      startx: 2,
      starty: 3,
      orientation: "down",
      position: 1,
    });
    expect(cells.length).toBe(5);
    expect(cells[0]).toEqual({ x: 2, y: 3 });
    expect(cells[4]).toEqual({ x: 2, y: 7 });
  });
});
