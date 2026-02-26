// test/chess960.test.ts
import { describe, it, expect } from "vitest";
import { chess960Backrank, chess960Fen } from "../src/chess960";

describe("chess960Backrank", () => {
  it("returns standard chess position for id 518", () => {
    expect(chess960Backrank(518)).toEqual([
      "R",
      "N",
      "B",
      "Q",
      "K",
      "B",
      "N",
      "R",
    ]);
  });

  it("returns position 0 correctly", () => {
    const rank = chess960Backrank(0);
    expect(rank).toHaveLength(8);
    expect(rank).toEqual(["B", "B", "Q", "N", "N", "R", "K", "R"]);
  });

  it("returns position 959 correctly", () => {
    const rank = chess960Backrank(959);
    expect(rank).toHaveLength(8);
    expect(rank).toEqual(["R", "K", "R", "N", "N", "Q", "B", "B"]);
  });

  it("always has exactly one king between two rooks", () => {
    for (let id = 0; id < 960; id++) {
      const rank = chess960Backrank(id);
      const rookIndices = rank.reduce<number[]>(
        (acc, p, i) => (p === "R" ? [...acc, i] : acc),
        [],
      );
      const kingIndex = rank.indexOf("K");
      expect(rookIndices).toHaveLength(2);
      expect(kingIndex).toBeGreaterThan(rookIndices[0]);
      expect(kingIndex).toBeLessThan(rookIndices[1]);
    }
  });

  it("always has bishops on opposite-colored squares", () => {
    for (let id = 0; id < 960; id++) {
      const rank = chess960Backrank(id);
      const bishopIndices = rank.reduce<number[]>(
        (acc, p, i) => (p === "B" ? [...acc, i] : acc),
        [],
      );
      expect(bishopIndices).toHaveLength(2);
      expect(bishopIndices[0] % 2).not.toBe(bishopIndices[1] % 2);
    }
  });

  it("produces 960 unique positions", () => {
    const positions = new Set<string>();
    for (let id = 0; id < 960; id++) {
      positions.add(chess960Backrank(id).join(""));
    }
    expect(positions.size).toBe(960);
  });
});

describe("chess960Fen", () => {
  it("returns valid FEN for standard position", () => {
    const { fen } = chess960Fen(518);
    expect(fen).toContain("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR");
    expect(fen).toContain(" w ");
    expect(fen.endsWith(" 0 1")).toBe(true);
  });

  it("includes Shredder-style castling rights", () => {
    const { fen } = chess960Fen(518);
    expect(fen).toContain("HAha");
  });

  it("returns correct id", () => {
    const { id } = chess960Fen(42);
    expect(id).toBe(42);
  });
});
