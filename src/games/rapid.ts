import "@lichess-org/chessground/assets/chessground.base.css";
import "@lichess-org/chessground/assets/chessground.brown.css";
import "@lichess-org/chessground/assets/chessground.cburnett.css";
import "../shared/board-theme.css";

import { Chessground } from "@lichess-org/chessground";
import type { Api } from "@lichess-org/chessground/api";
import type { Key, Dests } from "@lichess-org/chessground/types";
import { Chess } from "chessops/chess";
import { parseFen, makeFen } from "chessops/fen";
import { parseUci, makeSquare } from "chessops/util";
import { chessgroundDests } from "chessops/compat";
import { randomChess960 } from "../chess960";
import { StockfishEngine } from "../shared/engine";
import { recordScore, todayString, SKIP_SCORE } from "../shared/progress";
import { initTheme, wireToggle } from "../shared/theme";
import * as sound from "../shared/sounds";

// --- Chess clock ---

export interface ClockOptions {
  initialMs: number;
  incrementMs: number;
  onTick: (remainingMs: number) => void;
  onFlag: () => void;
}

export interface ChessClock {
  start: () => void;
  stop: () => void;
  addIncrement: () => void;
  remaining: () => number;
}

export function createClock(options: ClockOptions): ChessClock {
  let remainingMs = options.initialMs;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let lastTick = 0;

  function stop(): void {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function start(): void {
    lastTick = Date.now();
    intervalId = setInterval(() => {
      const now = Date.now();
      remainingMs -= now - lastTick;
      lastTick = now;
      if (remainingMs <= 0) {
        remainingMs = 0;
        stop();
        options.onFlag();
      }
      options.onTick(remainingMs);
    }, 100);
  }

  function addIncrement(): void {
    remainingMs += options.incrementMs;
  }

  function remaining(): number {
    return remainingMs;
  }

  return { start, stop, addIncrement, remaining };
}

function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min)}:${String(sec).padStart(2, "0")}`;
}

// --- Game state ---

const INITIAL_MS = 15 * 60 * 1000;
const INCREMENT_MS = 10 * 1000;
const game = document.getElementById("game");
if (!game) throw new Error("Missing #game element");

let api: Api | undefined;
let pos: Chess;
let startFen: string;
const moves: string[] = [];
const playerColor: "white" | "black" = "white";
let gameOver = false;
let engine: StockfishEngine;
let clock: ChessClock;

// --- Functions (ordered to satisfy no-use-before-define) ---

function updateStatus(text: string): void {
  const el = game.querySelector(".game-status");
  if (el) el.textContent = text;
}

function finishGame(result: number, message: string): void {
  recordScore("rapid", result, todayString());

  const label = result === 1 ? "Won" : result === 0.5 ? "Draw" : "Lost";

  game.innerHTML = `
    <div class="result">
      <div class="final-score">${label}</div>
      <div>${message}</div>
      <button id="back-btn">Back to Hub</button>
    </div>
  `;

  if (result === 1) sound.playVictory();
  else if (result === 0) sound.playDefeat();
  else sound.playDraw();

  document.getElementById("back-btn")?.addEventListener("click", () => {
    window.location.href = "../";
  });
}

function updateBoard(): void {
  if (!api) return;
  api.set({
    fen: makeFen(pos.toSetup()),
    turnColor: pos.turn,
    movable: {
      color: gameOver ? undefined : playerColor,
      dests: (gameOver
        ? new Map()
        : chessgroundDests(pos, { chess960: true })) as Dests,
    },
    check: pos.isCheck(),
  });
}

function checkGameEnd(): boolean {
  if (pos.isCheckmate()) {
    const winner = pos.turn === "white" ? "black" : "white";
    clock.stop();
    gameOver = true;
    const result = winner === playerColor ? 1 : 0;
    finishGame(
      result,
      winner === playerColor ? "Checkmate — you win!" : "Checkmate — you lose",
    );
    return true;
  }
  if (pos.isStalemate()) {
    clock.stop();
    gameOver = true;
    finishGame(0.5, "Stalemate — draw");
    return true;
  }
  if (pos.isInsufficientMaterial()) {
    clock.stop();
    gameOver = true;
    finishGame(0.5, "Insufficient material — draw");
    return true;
  }
  if (pos.halfmoves >= 100) {
    clock.stop();
    gameOver = true;
    finishGame(0.5, "50-move rule — draw");
    return true;
  }
  return false;
}

function onEngineMove(uci: string): void {
  if (gameOver) return;

  const move = parseUci(uci);
  if (!move) return;

  const from = "from" in move ? makeSquare(move.from) : makeSquare(move.to);
  const to = makeSquare(move.to);
  const isCapture = pos.board.occupied.has(move.to);

  pos.play(move);
  moves.push(uci);

  if (api) api.move(from as Key, to as Key);
  updateBoard();

  if (isCapture) sound.playCapture();
  else sound.playMove();
  if (pos.isCheck()) sound.playCheck();

  if (checkGameEnd()) return;

  clock.start();
  updateStatus("Your move");
}

function onPlayerMove(orig: string, dest: string): void {
  if (gameOver) return;

  const uci = orig + dest;
  const move = parseUci(uci);
  if (!move || !pos.isLegal(move)) return;

  const isCapture = pos.board.occupied.has(move.to);
  pos.play(move);
  moves.push(uci);

  clock.stop();
  clock.addIncrement();
  updateBoard();

  if (isCapture) sound.playCapture();
  else sound.playMove();
  if (pos.isCheck()) sound.playCheck();

  if (checkGameEnd()) return;

  updateStatus("Engine thinking...");
  engine.go(startFen, moves, onEngineMove);
}

function onFlag(): void {
  gameOver = true;
  finishGame(0, "Time's up — you lose");
}

function renderGame(): void {
  game.innerHTML = `
    <div class="clock" id="player-clock">${formatClock(INITIAL_MS)}</div>
    <div class="rapid-board"></div>
    <div class="game-status">Loading engine...</div>
  `;

  const boardEl = game.querySelector<HTMLElement>(".rapid-board");
  if (!boardEl) return;

  api = Chessground(boardEl, {
    fen: makeFen(pos.toSetup()),
    orientation: playerColor,
    turnColor: pos.turn,
    movable: {
      free: false,
      color: playerColor,
      dests: chessgroundDests(pos, { chess960: true }) as Dests,
      showDests: true,
      events: { after: onPlayerMove },
    },
    draggable: { enabled: true, showGhost: true },
    animation: { enabled: true, duration: 200 },
    premovable: { enabled: false },
  });
}

async function main(): Promise<void> {
  const { fen } = randomChess960();
  startFen = fen;
  const setup = parseFen(fen).unwrap();
  pos = Chess.fromSetup(setup).unwrap();

  clock = createClock({
    initialMs: INITIAL_MS,
    incrementMs: INCREMENT_MS,
    onTick: (ms) => {
      const el = document.getElementById("player-clock");
      if (el) {
        el.textContent = formatClock(ms);
        el.classList.toggle("low", ms < 60000);
      }
    },
    onFlag,
  });

  renderGame();

  engine = new StockfishEngine();
  await engine.init();
  engine.newGame();

  updateStatus("Your move");
  clock.start();
}

document.getElementById("skip-btn")?.addEventListener("click", () => {
  gameOver = true;
  clock.stop();
  engine.destroy();
  recordScore("rapid", SKIP_SCORE, todayString());
  window.location.href = "../";
});

void main();

initTheme();
wireToggle();
