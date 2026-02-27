// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";

// Set up the DOM before importing the module, since nback.ts
// runs document.getElementById("game") at the top level on import.
document.body.innerHTML = '<main id="game"></main>';

const { generateStimulus, checkMatch, LETTERS, GRID_SIZE } = await import(
  "../src/games/nback"
);

describe("generateStimulus", () => {
  it("returns a position (0-8) and a letter", () => {
    const s = generateStimulus();
    expect(s.position).toBeGreaterThanOrEqual(0);
    expect(s.position).toBeLessThan(GRID_SIZE * GRID_SIZE);
    expect(LETTERS).toContain(s.letter);
  });
});

describe("checkMatch", () => {
  it("detects position match", () => {
    const history = [
      { position: 4, letter: "A" },
      { position: 2, letter: "B" },
      { position: 4, letter: "C" },
    ];
    const result = checkMatch(history, 2);
    expect(result.positionMatch).toBe(true);
    expect(result.letterMatch).toBe(false);
  });

  it("detects letter match", () => {
    const history = [
      { position: 0, letter: "A" },
      { position: 3, letter: "B" },
      { position: 7, letter: "A" },
    ];
    const result = checkMatch(history, 2);
    expect(result.positionMatch).toBe(false);
    expect(result.letterMatch).toBe(true);
  });

  it("detects dual match", () => {
    const history = [
      { position: 4, letter: "A" },
      { position: 2, letter: "B" },
      { position: 4, letter: "A" },
    ];
    const result = checkMatch(history, 2);
    expect(result.positionMatch).toBe(true);
    expect(result.letterMatch).toBe(true);
  });

  it("returns no match when history too short", () => {
    const history = [{ position: 4, letter: "A" }];
    const result = checkMatch(history, 2);
    expect(result.positionMatch).toBe(false);
    expect(result.letterMatch).toBe(false);
  });
});
