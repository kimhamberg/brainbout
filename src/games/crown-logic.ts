/**
 * Pure game-logic helpers for Crown (chess960 + Stockfish).
 * Nothing in here touches the DOM, the board library, or audio. Everything
 * takes its inputs explicitly so it can be exercised by table-driven tests.
 */

export type PlayerColor = "white" | "black";

export type GameEndKind =
  | "checkmate"
  | "stalemate"
  | "insufficient-material"
  | "fifty-move"
  | "threefold-repetition";

export interface GameEnd {
  kind: GameEndKind;
  /** Player's perspective: 1 = win, 0.5 = draw, 0 = loss. */
  result: 0 | 0.5 | 1;
  message: string;
}

/**
 * Minimal interface our classifier needs from a chess position. Production
 * uses chessops' Chess instance; tests pass a hand-built fake.
 */
export interface PositionLike {
  isCheckmate: () => boolean;
  isStalemate: () => boolean;
  isInsufficientMaterial: () => boolean;
  halfmoves: number;
  turn: PlayerColor;
}

export function classifyGameEnd(
  pos: PositionLike,
  playerColor: PlayerColor,
  isThreefold: boolean,
): GameEnd | null {
  if (pos.isCheckmate()) {
    const winner: PlayerColor = pos.turn === "white" ? "black" : "white";
    const result: 0 | 1 = winner === playerColor ? 1 : 0;
    return {
      kind: "checkmate",
      result,
      message: result === 1 ? "Checkmate — you win!" : "Checkmate — you lose",
    };
  }
  if (pos.isStalemate()) {
    return { kind: "stalemate", result: 0.5, message: "Stalemate — draw" };
  }
  if (pos.isInsufficientMaterial()) {
    return {
      kind: "insufficient-material",
      result: 0.5,
      message: "Insufficient material — draw",
    };
  }
  if (pos.halfmoves >= 100) {
    return { kind: "fifty-move", result: 0.5, message: "50-move rule — draw" };
  }
  if (isThreefold) {
    return {
      kind: "threefold-repetition",
      result: 0.5,
      message: "Threefold repetition — draw",
    };
  }
  return null;
}

/** Truncate a FEN to the side-to-move + castling + ep fields (no clocks). */
export function positionKey(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

/** True when `currentKey` appears 3+ times in `history` (after appending it). */
export function isThreefoldRepetition(
  history: readonly string[],
  currentKey: string,
): boolean {
  let count = 0;
  for (const k of history) {
    if (k === currentKey && ++count >= 3) {
      return true;
    }
  }
  return false;
}

/** Map a stage (1, 2, 3) to a Stockfish ELO ceiling. Out-of-range → 1200. */
export function stageToElo(stage: number): number {
  return [0, 600, 1200, 1600][stage] ?? 1200;
}

/** Accept the player's draw offer when the engine's eval drops to/below threshold. */
export function acceptDraw(engineEvalCp: number, thresholdCp: number): boolean {
  return engineEvalCp <= thresholdCp;
}

/** Accept the player's takeback when the engine's own search agrees with the played move. */
export function acceptTakeback(
  suggestedBestMove: string,
  playerMove: string,
): boolean {
  return suggestedBestMove === playerMove;
}

/**
 * Promotion picker placement. Returns the (left, top) pixel offsets within
 * a square chessboard `boardWidthPx` wide. White at the bottom; black flips.
 */
export function promotionPickerPosition(
  destSquare: string,
  playerColor: PlayerColor,
  boardWidthPx: number,
): { left: number; top: number; squareSize: number } {
  const file = destSquare.charCodeAt(0) - "a".charCodeAt(0);
  const rank = Number(destSquare[1]);
  const squareSize = boardWidthPx / 8;
  const isWhite = playerColor === "white";
  return {
    left: (isWhite ? file : 7 - file) * squareSize,
    top: isWhite ? (8 - rank) * squareSize : (rank - 1) * squareSize,
    squareSize,
  };
}
