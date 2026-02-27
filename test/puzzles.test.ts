// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";

// Set up the DOM before importing the module, since puzzles.ts
// runs document.getElementById("game") at the top level on import.
document.body.innerHTML = '<main id="game"></main>';

const { pickPuzzle, validateMove } = await import("../src/games/puzzles");

const TEST_PUZZLES = [
  {
    fen: "r1bqkbnr/pppppppp/2n5/4N3/4P3/8/PPPP1PPP/RNBQKB1R b KQkq - 0 1",
    moves: ["d7d5", "e5c6", "b7c6"],
    rating: 1200,
  },
  {
    fen: "rnbqkb1r/pppppppp/5n2/4N3/4P3/8/PPPP1PPP/RNBQKB1R b KQkq - 0 1",
    moves: ["d7d5", "e5f7"],
    rating: 1800,
  },
];

describe("pickPuzzle", () => {
  it("returns a puzzle from the set", () => {
    const puzzle = pickPuzzle(TEST_PUZZLES);
    expect(TEST_PUZZLES).toContain(puzzle);
  });
});

describe("validateMove", () => {
  it("returns true for the correct next move", () => {
    expect(validateMove("e5c6", ["d7d5", "e5c6", "b7c6"], 1)).toBe(true);
  });

  it("returns false for an incorrect move", () => {
    expect(validateMove("a2a3", ["d7d5", "e5c6", "b7c6"], 1)).toBe(false);
  });
});
