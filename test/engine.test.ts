import { describe, it, expect } from "vitest";
import {
  parseBestMove,
  parseInfoLine,
  computeEvalSwing,
} from "../src/shared/engine";

describe("parseBestMove", () => {
  it("parses a bestmove line", () => {
    expect(parseBestMove("bestmove e2e4 ponder e7e5")).toBe("e2e4");
  });

  it("parses bestmove with promotion", () => {
    expect(parseBestMove("bestmove a7a8q")).toBe("a7a8q");
  });

  it("returns null for non-bestmove lines", () => {
    expect(parseBestMove("info depth 10 score cp 30")).toBeNull();
  });
});

describe("parseInfoLine", () => {
  it("parses an info line with centipawn score", () => {
    const info = parseInfoLine("info depth 12 score cp 35 pv e2e4 e7e5 g1f3");
    expect(info).toEqual({
      depth: 12,
      score: { type: "cp", value: 35 },
      pv: ["e2e4", "e7e5", "g1f3"],
    });
  });

  it("parses a mate score", () => {
    const info = parseInfoLine("info depth 20 score mate 3 pv d1h5 f7f6");
    expect(info?.score).toEqual({ type: "mate", value: 3 });
  });

  it("returns null for non-info lines", () => {
    expect(parseInfoLine("bestmove e2e4")).toBeNull();
  });
});

describe("computeEvalSwing", () => {
  it("computes eval swing from successive info lines", () => {
    expect(
      computeEvalSwing(
        { depth: 4, score: { type: "cp", value: 30 }, pv: [] },
        { depth: 5, score: { type: "cp", value: 80 }, pv: [] },
      ),
    ).toBe(50);
  });

  it("returns 0 swing when scores are equal", () => {
    expect(
      computeEvalSwing(
        { depth: 4, score: { type: "cp", value: 30 }, pv: [] },
        { depth: 5, score: { type: "cp", value: 30 }, pv: [] },
      ),
    ).toBe(0);
  });

  it("returns large swing for mate vs cp", () => {
    const swing = computeEvalSwing(
      { depth: 4, score: { type: "cp", value: 30 }, pv: [] },
      { depth: 5, score: { type: "mate", value: 3 }, pv: [] },
    );
    expect(swing).toBeGreaterThan(500);
  });
});
