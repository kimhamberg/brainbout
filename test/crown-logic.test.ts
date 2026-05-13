import { describe, expect, it, test } from "bun:test";
import {
  acceptDraw,
  acceptTakeback,
  classifyGameEnd,
  type GameEnd,
  isThreefoldRepetition,
  type PositionLike,
  positionKey,
  promotionPickerPosition,
  stageToElo,
} from "../src/games/crown-logic";

function pos(over: Partial<PositionLike> = {}): PositionLike {
  return {
    isCheckmate: () => false,
    isStalemate: () => false,
    isInsufficientMaterial: () => false,
    halfmoves: 0,
    turn: "white",
    ...over,
  };
}

describe("classifyGameEnd", () => {
  it("returns null on a live position", () => {
    expect(classifyGameEnd(pos(), "white", false)).toBeNull();
  });

  test("checkmate where it's black's turn → white delivered mate", () => {
    const end = classifyGameEnd(
      pos({ isCheckmate: () => true, turn: "black" }),
      "white",
      false,
    );
    expect(end).toEqual({
      kind: "checkmate",
      result: 1,
      message: "Checkmate — you win!",
    } satisfies GameEnd);
  });

  test("checkmate where it's white's turn → black delivered mate", () => {
    const end = classifyGameEnd(
      pos({ isCheckmate: () => true, turn: "white" }),
      "white",
      false,
    );
    expect(end).toEqual({
      kind: "checkmate",
      result: 0,
      message: "Checkmate — you lose",
    } satisfies GameEnd);
  });

  test("checkmate from black-player perspective", () => {
    expect(
      classifyGameEnd(
        pos({ isCheckmate: () => true, turn: "white" }),
        "black",
        false,
      )?.result,
    ).toBe(1);
    expect(
      classifyGameEnd(
        pos({ isCheckmate: () => true, turn: "black" }),
        "black",
        false,
      )?.result,
    ).toBe(0);
  });

  test("stalemate is a draw", () => {
    expect(
      classifyGameEnd(pos({ isStalemate: () => true }), "white", false),
    ).toEqual({
      kind: "stalemate",
      result: 0.5,
      message: "Stalemate — draw",
    });
  });

  test("insufficient material is a draw", () => {
    expect(
      classifyGameEnd(
        pos({ isInsufficientMaterial: () => true }),
        "white",
        false,
      ),
    ).toEqual({
      kind: "insufficient-material",
      result: 0.5,
      message: "Insufficient material — draw",
    });
  });

  test("halfmoves >= 100 is the 50-move rule (draw)", () => {
    expect(classifyGameEnd(pos({ halfmoves: 100 }), "white", false)).toEqual({
      kind: "fifty-move",
      result: 0.5,
      message: "50-move rule — draw",
    });
    expect(classifyGameEnd(pos({ halfmoves: 99 }), "white", false)).toBeNull();
  });

  test("threefold-repetition flag wins over draw classification", () => {
    expect(classifyGameEnd(pos(), "white", true)).toEqual({
      kind: "threefold-repetition",
      result: 0.5,
      message: "Threefold repetition — draw",
    });
  });

  test("precedence: checkmate beats every draw condition", () => {
    const end = classifyGameEnd(
      pos({
        isCheckmate: () => true,
        isStalemate: () => true,
        isInsufficientMaterial: () => true,
        halfmoves: 200,
        turn: "black",
      }),
      "white",
      true,
    );
    expect(end?.kind).toBe("checkmate");
  });

  test("precedence: stalemate beats insufficient-material/50-move/threefold", () => {
    const end = classifyGameEnd(
      pos({
        isStalemate: () => true,
        isInsufficientMaterial: () => true,
        halfmoves: 200,
      }),
      "white",
      true,
    );
    expect(end?.kind).toBe("stalemate");
  });

  test("precedence: insufficient-material beats 50-move and threefold", () => {
    const end = classifyGameEnd(
      pos({ isInsufficientMaterial: () => true, halfmoves: 200 }),
      "white",
      true,
    );
    expect(end?.kind).toBe("insufficient-material");
  });

  test("precedence: 50-move beats threefold", () => {
    const end = classifyGameEnd(pos({ halfmoves: 100 }), "white", true);
    expect(end?.kind).toBe("fifty-move");
  });
});

describe("positionKey", () => {
  it("strips halfmove and fullmove clocks", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    expect(positionKey(fen)).toBe(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -",
    );
  });

  it("differs when side-to-move differs", () => {
    const a = "8/8/8/8/8/8/8/8 w - - 0 1";
    const b = "8/8/8/8/8/8/8/8 b - - 0 1";
    expect(positionKey(a)).not.toBe(positionKey(b));
  });

  it("collapses identical positions with different clocks", () => {
    const a = "8/8/8/8/8/8/8/8 w KQkq - 5 9";
    const b = "8/8/8/8/8/8/8/8 w KQkq - 99 42";
    expect(positionKey(a)).toBe(positionKey(b));
  });
});

describe("isThreefoldRepetition", () => {
  it("returns false when key appears 0 or 1 times in history", () => {
    expect(isThreefoldRepetition([], "k")).toBe(false);
    expect(isThreefoldRepetition(["k"], "k")).toBe(false);
  });
  it("returns false at exactly 2 occurrences", () => {
    expect(isThreefoldRepetition(["k", "k"], "k")).toBe(false);
  });
  it("returns true at exactly 3 occurrences", () => {
    expect(isThreefoldRepetition(["k", "k", "k"], "k")).toBe(true);
  });
  it("returns true above 3 occurrences", () => {
    expect(isThreefoldRepetition(["k", "k", "k", "k"], "k")).toBe(true);
  });
  it("does not confuse different keys", () => {
    expect(isThreefoldRepetition(["a", "b", "a", "b", "a"], "b")).toBe(false);
    expect(isThreefoldRepetition(["a", "b", "a", "b", "a"], "a")).toBe(true);
  });
});

describe("stageToElo", () => {
  it("maps stage 1 → 600, 2 → 1200, 3 → 1600", () => {
    expect(stageToElo(1)).toBe(600);
    expect(stageToElo(2)).toBe(1200);
    expect(stageToElo(3)).toBe(1600);
  });
  it("maps stage 0 → 0 (sentinel)", () => {
    expect(stageToElo(0)).toBe(0);
  });
  it("out-of-range stage falls back to 1200", () => {
    for (const s of [4, 5, 100, -1, Number.NaN]) {
      expect(stageToElo(s)).toBe(1200);
    }
  });
});

describe("acceptDraw", () => {
  it("accepts when engine eval is at or below threshold (losing)", () => {
    expect(acceptDraw(-100, -100)).toBe(true);
    expect(acceptDraw(-200, -100)).toBe(true);
    expect(acceptDraw(-9999, -100)).toBe(true);
  });
  it("declines when engine is winning or equal", () => {
    expect(acceptDraw(0, -100)).toBe(false);
    expect(acceptDraw(50, -100)).toBe(false);
    expect(acceptDraw(-99, -100)).toBe(false);
  });
});

describe("acceptTakeback", () => {
  it("accepts when engine's own best move equals the played move", () => {
    expect(acceptTakeback("e2e4", "e2e4")).toBe(true);
  });
  it("declines otherwise", () => {
    expect(acceptTakeback("e2e4", "d2d4")).toBe(false);
    expect(acceptTakeback("e2e4", "")).toBe(false);
  });
});

describe("promotionPickerPosition", () => {
  it("places at top of the board for white promotions (rank 8)", () => {
    const { left, top, squareSize } = promotionPickerPosition(
      "e8",
      "white",
      800,
    );
    expect(squareSize).toBe(100);
    expect(left).toBe(400); // file 'e' = 4 → 4 * 100
    expect(top).toBe(0); // rank 8 → (8 - 8) * 100
  });
  it("places at bottom of the board for black promotions (rank 1)", () => {
    const { left, top } = promotionPickerPosition("a1", "black", 800);
    expect(left).toBe(700); // black flipped: (7 - 0) * 100
    expect(top).toBe(0); // (1 - 1) * 100
  });
  it("scales with board size", () => {
    const small = promotionPickerPosition("e8", "white", 400);
    expect(small.squareSize).toBe(50);
    expect(small.left).toBe(200);
  });
  test("every file from a..h returns a unique left for white", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 8; i++) {
      const file = String.fromCharCode("a".charCodeAt(0) + i);
      const { left } = promotionPickerPosition(`${file}8`, "white", 800);
      expect(seen.has(left)).toBe(false);
      seen.add(left);
    }
    expect(seen.size).toBe(8);
  });
});
