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
    const easy = generateProblem(1);
    const hard = generateProblem(3);
    // Level 1 uses single digits, level 3 uses triple digits
    expect(easy.a).toBeLessThan(10);
    expect(hard.a).toBeGreaterThanOrEqual(10);
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
