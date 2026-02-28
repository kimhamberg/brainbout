import { describe, it, expect } from "vitest";
import { computeThinkTime, eloToNodes } from "../src/shared/think-time";

describe("eloToNodes", () => {
  it("returns ~1500 nodes at 1200 Elo", () => {
    const n = eloToNodes(1200);
    expect(n).toBeGreaterThan(1000);
    expect(n).toBeLessThan(3000);
  });

  it("returns ~25000 nodes at 1800 Elo", () => {
    const n = eloToNodes(1800);
    expect(n).toBeGreaterThan(15000);
    expect(n).toBeLessThan(40000);
  });

  it("scales logarithmically", () => {
    const low = eloToNodes(1200);
    const mid = eloToNodes(1500);
    const high = eloToNodes(1800);
    expect(mid / low).toBeLessThan(high / mid);
  });
});

describe("computeThinkTime", () => {
  it("returns time in ms between 1000 and 30000", () => {
    const t = computeThinkTime({
      remainingMs: 600_000,
      moveNumber: 15,
      evalSwing: 50,
      isRecapture: false,
    });
    expect(t).toBeGreaterThanOrEqual(1000);
    expect(t).toBeLessThanOrEqual(30000);
  });

  it("thinks faster on recaptures", () => {
    const base = { remainingMs: 600_000, moveNumber: 15, evalSwing: 50 };
    const normal = computeThinkTime({ ...base, isRecapture: false });
    const recap = computeThinkTime({ ...base, isRecapture: true });
    expect(recap).toBeLessThan(normal);
  });

  it("thinks faster in time trouble", () => {
    const base = { moveNumber: 20, evalSwing: 30, isRecapture: false };
    const relaxed = computeThinkTime({ ...base, remainingMs: 300_000 });
    const trouble = computeThinkTime({ ...base, remainingMs: 30_000 });
    expect(trouble).toBeLessThan(relaxed);
  });

  it("never exceeds remainingMs - 5000", () => {
    const t = computeThinkTime({
      remainingMs: 8000,
      moveNumber: 35,
      evalSwing: 200,
      isRecapture: false,
    });
    expect(t).toBeLessThanOrEqual(3000);
  });

  it("thinks longer in complex positions", () => {
    const base = { remainingMs: 600_000, moveNumber: 15, isRecapture: false };
    const simple = computeThinkTime({ ...base, evalSwing: 5 });
    const complex = computeThinkTime({ ...base, evalSwing: 200 });
    expect(complex).toBeGreaterThan(simple);
  });
});
