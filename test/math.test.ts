// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";

// Set up the DOM before importing the module, since math.ts
// runs document.getElementById("game") at the top level on import.
document.body.innerHTML = '<main id="game"></main>';

const { generateProblem } = await import("../src/games/math");

describe("generateProblem", () => {
  it("returns a question with correct answer and 3 wrong choices", () => {
    for (let i = 0; i < 50; i++) {
      const p = generateProblem(1);
      expect(p.choices).toHaveLength(4);
      expect(p.choices).toContain(p.answer);
      // All choices are unique
      expect(new Set(p.choices).size).toBe(4);
    }
  });

  it("scales difficulty with level", () => {
    // Level 1: maxVal=9, so operands are always single digit
    for (let i = 0; i < 20; i++) {
      const easy = generateProblem(1);
      expect(easy.a).toBeLessThanOrEqual(12); // at most 12 for × operands
    }
    // Level 3: maxVal=100, so at least some operands should exceed 9
    let anyLarge = false;
    for (let i = 0; i < 50; i++) {
      const hard = generateProblem(3);
      if (hard.a > 12) anyLarge = true;
    }
    expect(anyLarge).toBe(true);
  });

  it("never divides by zero", () => {
    for (let i = 0; i < 100; i++) {
      const p = generateProblem(1);
      if (p.op === "÷") {
        expect(p.b).not.toBe(0);
      }
    }
  });
});
