// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";

// Set up the DOM before importing the module, since reaction.ts
// runs document.getElementById("game") at the top level on import.
document.body.innerHTML = '<main id="game"></main>';

const { pickNextCell, getVisibilityMs } = await import(
  "../src/games/reaction"
);

describe("pickNextCell", () => {
  it("returns a number between 0 and gridSize-1", () => {
    for (let i = 0; i < 50; i++) {
      const cell = pickNextCell(16, -1);
      expect(cell).toBeGreaterThanOrEqual(0);
      expect(cell).toBeLessThan(16);
    }
  });

  it("never returns the same cell as previous", () => {
    for (let i = 0; i < 50; i++) {
      const cell = pickNextCell(16, 5);
      expect(cell).not.toBe(5);
    }
  });
});

describe("getVisibilityMs", () => {
  it("starts at 1200ms for 0 hits", () => {
    expect(getVisibilityMs(0)).toBe(1200);
  });

  it("decreases by 50ms every 3 hits", () => {
    expect(getVisibilityMs(3)).toBe(1150);
    expect(getVisibilityMs(6)).toBe(1100);
    expect(getVisibilityMs(9)).toBe(1050);
  });

  it("floors at 400ms", () => {
    expect(getVisibilityMs(100)).toBe(400);
  });
});
