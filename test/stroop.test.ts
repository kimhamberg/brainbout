// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";

// Set up the DOM before importing the module, since stroop.ts
// runs document.getElementById("game") at the top level on import.
document.body.innerHTML = '<main id="game"></main>';

const { generateRound, COLORS } = await import("../src/games/stroop");

describe("generateRound", () => {
  it("returns a word and ink color that differ", () => {
    for (let i = 0; i < 50; i++) {
      const round = generateRound();
      expect(COLORS).toContain(round.word);
      expect(COLORS).toContain(round.ink);
      expect(round.word).not.toBe(round.ink);
    }
  });

  it("returns an ink color property", () => {
    const round = generateRound();
    expect(round).toHaveProperty("ink");
    expect(round).toHaveProperty("word");
  });
});
