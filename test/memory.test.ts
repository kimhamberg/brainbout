// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";

// Set up the DOM before importing the module, since memory.ts
// runs document.getElementById("game") at the top level on import.
document.body.innerHTML = '<main id="game"></main>';

const { createBoard, SYMBOLS } = await import("../src/games/memory");

describe("createBoard", () => {
  it("creates a board with the correct number of cards", () => {
    const board = createBoard(3, 4);
    expect(board).toHaveLength(12);
  });

  it("has exactly 2 of each symbol", () => {
    const board = createBoard(3, 4);
    const counts = new Map<string, number>();
    for (const card of board) {
      counts.set(card.symbol, (counts.get(card.symbol) ?? 0) + 1);
    }
    for (const count of counts.values()) {
      expect(count).toBe(2);
    }
  });

  it("all symbols are from the SYMBOLS pool", () => {
    const board = createBoard(4, 5);
    for (const card of board) {
      expect(SYMBOLS).toContain(card.symbol);
    }
  });

  it("cards start face down", () => {
    const board = createBoard(3, 4);
    for (const card of board) {
      expect(card.faceUp).toBe(false);
      expect(card.matched).toBe(false);
    }
  });
});
