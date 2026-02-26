// test/engine.test.ts
import { describe, it, expect } from "vitest";
import {
  parseBestMove,
  parseInfoLine,
  DEFAULT_OPTIONS,
  nodesForElo,
  humanDelay,
} from "../src/engine";

describe("parseBestMove", () => {
  it("parses a simple bestmove", () => {
    expect(parseBestMove("bestmove e2e4 ponder e7e5")).toBe("e2e4");
  });

  it("parses bestmove with promotion", () => {
    expect(parseBestMove("bestmove a7a8q")).toBe("a7a8q");
  });

  it("parses chess960 castling move", () => {
    expect(parseBestMove("bestmove e1h1")).toBe("e1h1");
  });

  it("returns null for non-bestmove lines", () => {
    expect(parseBestMove("info depth 10 score cp 30")).toBeNull();
    expect(parseBestMove("readyok")).toBeNull();
  });
});

describe("parseInfoLine", () => {
  it("parses centipawn score", () => {
    const info = parseInfoLine(
      "info depth 15 seldepth 21 score cp 34 nodes 123456 nps 1234567 time 100 pv e2e4 e7e5",
    );
    expect(info).not.toBeNull();
    expect(info?.depth).toBe(15);
    expect(info?.score).toEqual({ type: "cp", value: 34 });
    expect(info?.pv[0]).toBe("e2e4");
  });

  it("parses mate score", () => {
    const info = parseInfoLine(
      "info depth 20 seldepth 20 score mate 3 nodes 500000 nps 5000000 time 100 pv d1h5 g6h5",
    );
    expect(info).not.toBeNull();
    expect(info?.score).toEqual({ type: "mate", value: 3 });
  });

  it("parses negative mate score", () => {
    const info = parseInfoLine("info depth 20 score mate -2 pv e1d1 d8d1");
    expect(info?.score).toEqual({ type: "mate", value: -2 });
  });

  it("returns null for non-info lines", () => {
    expect(parseInfoLine("bestmove e2e4")).toBeNull();
    expect(parseInfoLine("readyok")).toBeNull();
  });
});

describe("DEFAULT_OPTIONS", () => {
  it("has no moveTime, contempt, or skillLevel", () => {
    expect(DEFAULT_OPTIONS).not.toHaveProperty("moveTime");
    expect(DEFAULT_OPTIONS).not.toHaveProperty("contempt");
    expect(DEFAULT_OPTIONS).not.toHaveProperty("skillLevel");
  });
});

describe("nodesForElo", () => {
  it("returns ~10,000 nodes at minimum elo", () => {
    expect(nodesForElo(1320)).toBe(10000);
  });

  it("returns ~1,000,000 nodes at maximum elo", () => {
    expect(nodesForElo(3190)).toBe(1000000);
  });

  it("returns ~100,000 nodes at midpoint elo", () => {
    const mid = nodesForElo(2255);
    expect(mid).toBeGreaterThan(80000);
    expect(mid).toBeLessThan(120000);
  });
});

describe("humanDelay", () => {
  it("resolves after 1-3 seconds", async () => {
    const start = Date.now();
    await humanDelay();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(900);
    expect(elapsed).toBeLessThanOrEqual(3200);
  });
});
