// src/game.ts
import { Chess } from "chessops/chess";
import { parseFen, makeFen } from "chessops/fen";
import { parseUci, makeSquare } from "chessops/util";
import { chessgroundDests } from "chessops/compat";

export interface GameState {
  startFen: string;
  currentFen: string;
  moves: string[]; // UCI strings: ['e2e4', 'e7e5', ...]
  turn: "white" | "black";
  isOver: boolean;
  isCheck: boolean;
  isCapture: boolean;
  lastMove: [string, string] | null;
  dests: Map<string, string[]>; // legal move destinations for chessground
  position: Chess; // internal chessops position
}

export type GameStatus =
  | { status: "playing" }
  | { status: "checkmate"; winner: "white" | "black" }
  | { status: "stalemate" }
  | { status: "draw"; reason: string };

export function createGame(fen: string): GameState {
  const setup = parseFen(fen).unwrap();
  const pos = Chess.fromSetup(setup).unwrap();

  return {
    startFen: fen,
    currentFen: fen,
    moves: [],
    turn: pos.turn,
    isOver: pos.isEnd(),
    isCheck: pos.isCheck(),
    isCapture: false,
    lastMove: null,
    dests: chessgroundDests(pos, { chess960: true }),
    position: pos,
  };
}

export function makeMove(
  game: GameState,
  orig: string,
  dest: string,
  promotion?: "queen" | "rook" | "bishop" | "knight",
): GameState | null {
  const uciStr = orig + dest + (promotion ? promotion[0] : "");
  const move = parseUci(uciStr);
  if (!move) return null;

  const pos = game.position.clone();
  if (!pos.isLegal(move)) return null;

  const isCapture =
    "from" in move &&
    (pos.board.occupied.has(move.to) ||
      (pos.board.get(move.from)?.role === "pawn" && move.to === pos.epSquare));
  pos.play(move);
  const newFen = makeFen(pos.toSetup());

  return {
    startFen: game.startFen,
    currentFen: newFen,
    moves: [...game.moves, uciStr],
    turn: pos.turn,
    isOver: pos.isEnd(),
    isCheck: pos.isCheck(),
    isCapture,
    lastMove: [orig, dest],
    dests: chessgroundDests(pos, { chess960: true }),
    position: pos,
  };
}

export function applyUciMove(
  game: GameState,
  uciStr: string,
): GameState | null {
  const move = parseUci(uciStr);
  if (!move) return null;

  const pos = game.position.clone();
  if (!pos.isLegal(move)) return null;

  const orig = "from" in move ? makeSquare(move.from) : makeSquare(move.to);
  const dest = "from" in move ? makeSquare(move.to) : orig;

  const isCapture =
    "from" in move &&
    (pos.board.occupied.has(move.to) ||
      (pos.board.get(move.from)?.role === "pawn" && move.to === pos.epSquare));
  pos.play(move);
  const newFen = makeFen(pos.toSetup());

  return {
    startFen: game.startFen,
    currentFen: newFen,
    moves: [...game.moves, uciStr],
    turn: pos.turn,
    isOver: pos.isEnd(),
    isCheck: pos.isCheck(),
    isCapture,
    lastMove: [orig, dest],
    dests: chessgroundDests(pos, { chess960: true }),
    position: pos,
  };
}

export function getGameStatus(game: GameState): GameStatus {
  const pos = game.position;
  if (pos.isCheckmate()) {
    const winner = pos.turn === "white" ? "black" : "white";
    return { status: "checkmate", winner };
  }
  if (pos.isStalemate()) {
    return { status: "stalemate" };
  }
  if (pos.isInsufficientMaterial()) {
    return { status: "draw", reason: "insufficient material" };
  }
  if (pos.halfmoves >= 100) {
    return { status: "draw", reason: "50-move rule" };
  }
  return { status: "playing" };
}
