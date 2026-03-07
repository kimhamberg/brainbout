import "@lichess-org/chessground/assets/chessground.base.css";
import "@lichess-org/chessground/assets/chessground.brown.css";
import "@lichess-org/chessground/assets/chessground.cburnett.css";
import "../shared/board-theme.css";

import { Chessground } from "@lichess-org/chessground";
import type { Api } from "@lichess-org/chessground/api";
import type { Key, Dests } from "@lichess-org/chessground/types";
import { Chess } from "chessops/chess";
import { parseFen, makeFen } from "chessops/fen";
import { parseUci, makeSquare, parseSquare } from "chessops/util";
import { chessgroundDests } from "chessops/compat";
import { randomChess960 } from "../chess960";
import { StockfishEngine } from "../shared/engine";
import { computeThinkTime, eloToNodes } from "../shared/think-time";
import { recordSessionScore, recordCheckmate } from "../shared/progress";
import { getStage, recordResult } from "../shared/stages";
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
function getEl(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`Missing #${id} element`);
  return el;
}
const game = getEl("game");

let api: Api | undefined;
let pos: Chess;
let startFen: string;
const moves: string[] = [];
const playerColor: "white" | "black" = "white";
let gameOver = false;
let engine: StockfishEngine;
let clock: ChessClock;
let engineClock: ChessClock;
let engineElo: number;
let baseNodes: number;
const positionHistory: string[] = [];
const fenHistory: string[] = [];
let viewPly = 0;
let offerPending = false;
let drawDeclined = false;
let takebackDeclined = false;

// --- Repetition tracking ---

function positionKey(): string {
  // FEN without halfmove and fullmove counters
  return makeFen(pos.toSetup()).split(" ").slice(0, 4).join(" ");
}

function isThreefoldRepetition(): boolean {
  const key = positionKey();
  let count = 0;
  for (const k of positionHistory) {
    if (k === key && ++count >= 3) return true;
  }
  return false;
}

// --- History browsing ---

function isLive(): boolean {
  return viewPly === fenHistory.length - 1;
}

function showPly(ply: number): void {
  if (!api || ply < 0 || ply >= fenHistory.length) return;
  viewPly = ply;
  const live = isLive();
  api.set({
    fen: fenHistory[ply],
    lastMove:
      ply > 0
        ? ([moves[ply - 1].slice(0, 2), moves[ply - 1].slice(2, 4)] as [
            Key,
            Key,
          ])
        : undefined,
    movable: {
      color: live && !gameOver ? playerColor : undefined,
      dests: (live && !gameOver
        ? chessgroundDests(pos, { chess960: true })
        : new Map()) as Dests,
    },
    check: live ? pos.isCheck() : false,
  });
  updateNavButtons();
}

function updateNavButtons(): void {
  const prev = document.getElementById("hist-prev") as HTMLButtonElement | null;
  const next = document.getElementById("hist-next") as HTMLButtonElement | null;
  if (prev) prev.disabled = viewPly === 0;
  if (next) next.disabled = isLive();
}

// --- Game actions (draw, takeback, resign) ---

const EVAL_NODES = 50_000;
const DRAW_THRESHOLD = -100; // Engine accepts draw if eval ≤ this (losing by ≥1 pawn)

function isPlayerTurn(): boolean {
  return !gameOver && pos.turn === playerColor && isLive();
}

function updateActionButtons(): void {
  const draw = document.getElementById(
    "action-draw",
  ) as HTMLButtonElement | null;
  const take = document.getElementById(
    "action-takeback",
  ) as HTMLButtonElement | null;
  const resign = document.getElementById(
    "action-resign",
  ) as HTMLButtonElement | null;
  if (draw) draw.disabled = !isPlayerTurn() || offerPending || drawDeclined;
  if (take)
    take.disabled =
      !isPlayerTurn() || offerPending || takebackDeclined || moves.length < 2;
  if (resign) resign.disabled = gameOver || offerPending;
}

function showOfferResult(btnId: string, accepted: boolean): void {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  const label = btn.querySelector(".action-label");
  if (!label) return;
  const original = label.textContent;
  label.textContent = accepted ? "Accepted" : "Declined";
  btn.classList.add(accepted ? "accepted" : "declined");
  setTimeout(() => {
    label.textContent = original;
    btn.classList.remove("accepted", "declined");
  }, 1500);
}

function onResign(): void {
  if (gameOver || offerPending) return;
  clock.stop();
  engineClock.stop();
  gameOver = true;
  finishGame(0, "You resigned");
}

async function onDrawOffer(): Promise<void> {
  if (!isPlayerTurn() || offerPending || drawDeclined) return;
  offerPending = true;
  updateActionButtons();

  const thinkDelay = 1000 + Math.random() * 2000;
  const evalPromise = engine.evalPosition(startFen, moves, EVAL_NODES);
  const [result] = await Promise.all([
    evalPromise,
    new Promise<void>((r) => {
      setTimeout(r, thinkDelay);
    }),
  ]);

  // Score is from engine's perspective (engine plays black = opposite of player)
  // Stockfish reports from side-to-move perspective; it's player's turn, so
  // positive = good for player = bad for engine
  const cp =
    result.score.type === "mate"
      ? result.score.value > 0
        ? 10000
        : -10000
      : result.score.value;
  const engineEval = -cp; // Flip to engine's perspective

  offerPending = false;

  if (engineEval <= DRAW_THRESHOLD) {
    clock.stop();
    engineClock.stop();
    gameOver = true;
    showOfferResult("action-draw", true);
    setTimeout(() => {
      finishGame(0.5, "Draw by agreement");
    }, 800);
  } else {
    drawDeclined = true;
    showOfferResult("action-draw", false);
    updateActionButtons();
  }
}

async function onTakeback(): Promise<void> {
  if (!isPlayerTurn() || offerPending || takebackDeclined || moves.length < 2)
    return;
  offerPending = true;
  updateActionButtons();

  // Evaluate position before the player's last move
  const targetPly = fenHistory.length - 3; // Position before player's last move
  const movesBeforePlayer = moves.slice(0, -2);
  const playerMove = moves[moves.length - 2];

  const thinkDelay = 1500 + Math.random() * 2000;
  const evalPromise = engine.evalPosition(
    startFen,
    movesBeforePlayer,
    EVAL_NODES,
  );
  const [result] = await Promise.all([
    evalPromise,
    new Promise<void>((r) => {
      setTimeout(r, thinkDelay);
    }),
  ]);

  offerPending = false;

  if (result.bestMove === playerMove) {
    // Player made the best move — engine gains nothing, accept takeback
    showOfferResult("action-takeback", true);

    // Undo 2 plies: player's move + engine's response
    moves.splice(-2);
    fenHistory.splice(targetPly + 1);
    positionHistory.splice(targetPly + 1);

    // Restore position
    const setup = parseFen(fenHistory[targetPly]).unwrap();
    pos = Chess.fromSetup(setup).unwrap();
    viewPly = fenHistory.length - 1;

    updateBoard();
    updateNavButtons();
    updateActionButtons();
  } else {
    takebackDeclined = true;
    showOfferResult("action-takeback", false);
    updateActionButtons();
  }
}

// --- Promotion picker ---

const PROMO_ROLES = ["queen", "rook", "bishop", "knight"] as const;
const PROMO_CHARS: Record<string, string> = {
  queen: "q",
  rook: "r",
  bishop: "b",
  knight: "n",
};

function showPromotionPicker(
  _orig: string,
  dest: string,
  callback: (role: string) => void,
): void {
  const wrap = game.querySelector<HTMLElement>(".cg-wrap");
  if (!wrap) return;

  const file = dest.charCodeAt(0) - 97; // 0-7
  const rank = Number(dest[1]); // 1-8
  const isWhite = playerColor === "white";
  const squareSize = wrap.offsetWidth / 8;

  // Position: file determines x, rank determines y (top or bottom)
  const left = (isWhite ? file : 7 - file) * squareSize;
  const top = isWhite ? (8 - rank) * squareSize : (rank - 1) * squareSize;

  const overlay = document.createElement("div");
  overlay.className = "promo-overlay";

  const picker = document.createElement("div");
  picker.className = "promo-picker";
  picker.style.left = `${String(left)}px`;
  picker.style.top = `${String(top)}px`;
  picker.style.width = `${String(squareSize)}px`;

  for (const role of PROMO_ROLES) {
    const btn = document.createElement("button");
    btn.className = "promo-piece";
    btn.style.width = `${String(squareSize)}px`;
    btn.style.height = `${String(squareSize)}px`;

    // Use a piece element so it inherits cburnett piece images
    const piece = document.createElement("piece");
    piece.classList.add(role, playerColor);
    btn.appendChild(piece);

    btn.addEventListener("click", () => {
      overlay.remove();
      callback(role);
    });
    picker.appendChild(btn);
  }

  // Click outside to cancel
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      overlay.remove();
      // Reset the board to undo the visual move chessground already made
      updateBoard();
    }
  });

  overlay.appendChild(picker);
  wrap.appendChild(overlay);
}

// --- Functions (ordered to satisfy no-use-before-define) ---

function finishGame(result: number, message: string): void {
  recordSessionScore("crown", result);
  recordResult("crown", result);

  const label = result === 1 ? "Won" : result === 0.5 ? "Draw" : "Lost";

  game.innerHTML = `
    <div class="result">
      <div class="final-score">${label}</div>
      <div class="result-label">${message}</div>
      <div class="result-actions">
        <button id="again-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>Play Again</button>
        <button id="back-btn" class="secondary"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>Back to Hub</button>
      </div>
    </div>
  `;

  if (result === 1) sound.playVictory();
  else if (result === 0) sound.playDefeat();
  else sound.playDraw();
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
    engineClock.stop();
    gameOver = true;
    const result = winner === playerColor ? 1 : 0;
    if (result === 1) recordCheckmate(engineElo);
    finishGame(
      result,
      winner === playerColor ? "Checkmate — you win!" : "Checkmate — you lose",
    );
    return true;
  }
  if (pos.isStalemate()) {
    clock.stop();
    engineClock.stop();
    gameOver = true;
    finishGame(0.5, "Stalemate — draw");
    return true;
  }
  if (pos.isInsufficientMaterial()) {
    clock.stop();
    engineClock.stop();
    gameOver = true;
    finishGame(0.5, "Insufficient material — draw");
    return true;
  }
  if (pos.halfmoves >= 100) {
    clock.stop();
    engineClock.stop();
    gameOver = true;
    finishGame(0.5, "50-move rule — draw");
    return true;
  }
  if (isThreefoldRepetition()) {
    clock.stop();
    engineClock.stop();
    gameOver = true;
    finishGame(0.5, "Threefold repetition — draw");
    return true;
  }
  return false;
}

function dimClock(id: string, dim: boolean): void {
  document.getElementById(id)?.classList.toggle("dimmed", dim);
}

function onEngineMove(uci: string): void {
  if (gameOver) return;

  const move = parseUci(uci);
  if (!move) return;

  const from = "from" in move ? makeSquare(move.from) : makeSquare(move.to);
  const to = makeSquare(move.to);
  const isCapture = pos.board.occupied.has(move.to);
  const wasLive = isLive();

  pos.play(move);
  moves.push(uci);
  positionHistory.push(positionKey());
  fenHistory.push(makeFen(pos.toSetup()));
  viewPly = fenHistory.length - 1;

  if (wasLive && api) api.move(from as Key, to as Key);
  updateBoard();
  updateNavButtons();

  if (isCapture) sound.playCapture();
  else sound.playMove();
  if (pos.isCheck()) sound.playCheck();

  if (checkGameEnd()) return;

  drawDeclined = false;
  takebackDeclined = false;
  updateActionButtons();

  clock.start();

  // Execute queued premove
  if (api?.playPremove() === true) return;
}

function commitPlayerMove(orig: string, dest: string, promoChar: string): void {
  const uci = orig + dest + promoChar;
  const move = parseUci(uci);
  if (!move || !pos.isLegal(move)) return;

  const isCapture = pos.board.occupied.has(move.to);
  pos.play(move);
  moves.push(uci);
  positionHistory.push(positionKey());
  fenHistory.push(makeFen(pos.toSetup()));
  viewPly = fenHistory.length - 1;

  clock.stop();
  clock.addIncrement();
  updateBoard();
  updateNavButtons();
  updateActionButtons();

  if (isCapture) sound.playCapture();
  else sound.playMove();
  if (pos.isCheck()) sound.playCheck();

  if (checkGameEnd()) return;

  // Switch clocks: player stops (already stopped above), engine starts
  dimClock("player-clock", true);
  dimClock("engine-clock", false);
  engineClock.start();

  // Compute node count with per-move variance (0.7x-1.3x)
  const timeTroubleMultiplier = engineClock.remaining() < 60_000 ? 0.5 : 1.0;
  const variance = 0.7 + Math.random() * 0.6;
  const nodes = Math.round(baseNodes * variance * timeTroubleMultiplier);

  // Track whether this was a capture (for recapture detection in think time)
  const wasCapture = isCapture;

  // Check if engine has only one legal move (forced)
  let legalMoveCount = 0;
  for (const dests of pos.allDests().values()) {
    legalMoveCount += dests.size();
  }
  const forced = legalMoveCount === 1;

  // Start engine search
  engine.go(
    startFen,
    moves,
    (bestMove: string) => {
      // Compute think time based on search results
      const thinkMs = computeThinkTime({
        remainingMs: engineClock.remaining(),
        moveNumber: moves.length,
        evalSwing: engine.getEvalSwing(),
        isRecapture: wasCapture,
        isForced: forced,
      });

      // Synthetic delay (engine already found the move; we wait to simulate thinking)
      setTimeout(() => {
        engineClock.stop();
        engineClock.addIncrement();
        dimClock("engine-clock", true);
        dimClock("player-clock", false);
        onEngineMove(bestMove);
      }, thinkMs);
    },
    { nodes },
  );
}

function onPlayerMove(orig: string, dest: string): void {
  if (gameOver || !isLive()) return;

  // Detect promotion: pawn reaching the back rank
  const from = parseSquare(orig);
  const to = parseSquare(dest);
  if (from === undefined || to === undefined) return;
  const isPawn = pos.board.pawn.has(from);
  const backRank = pos.turn === "white" ? 7 : 0;

  if (isPawn && to >> 3 === backRank) {
    // Show promotion picker — clock keeps running for tension
    showPromotionPicker(orig, dest, (role) => {
      commitPlayerMove(orig, dest, PROMO_CHARS[role]);
    });
    return;
  }

  commitPlayerMove(orig, dest, "");
}

function onFlag(): void {
  gameOver = true;
  finishGame(0, "Time's up — you lose");
}

function onEngineFlag(): void {
  gameOver = true;
  finishGame(1, "Opponent flagged — you win!");
}

function renderGame(): void {
  game.innerHTML = `
    <div class="clock dimmed" id="engine-clock">${formatClock(INITIAL_MS)}</div>
    <div class="crown-board"></div>
    <div class="clock-row">
      <button class="hist-btn" id="hist-prev" disabled aria-label="Previous move">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
      </button>
      <div class="clock" id="player-clock">${formatClock(INITIAL_MS)}</div>
      <button class="hist-btn" id="hist-next" disabled aria-label="Next move">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </button>
    </div>
    <div class="action-row">
      <button class="action-btn" id="action-takeback" disabled aria-label="Offer takeback">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
        <span class="action-label">Takeback</span>
      </button>
      <button class="action-btn" id="action-draw" disabled aria-label="Offer draw">
        <span class="draw-symbol">½</span>
        <span class="action-label">Draw</span>
      </button>
      <button class="action-btn action-resign" id="action-resign" aria-label="Resign">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>
        <span class="action-label">Resign</span>
      </button>
    </div>
  `;

  const boardEl = game.querySelector<HTMLElement>(".crown-board");
  if (!boardEl) return;

  api = Chessground(boardEl, {
    fen: makeFen(pos.toSetup()),
    orientation: playerColor,
    turnColor: pos.turn,
    coordinates: false,
    movable: {
      free: false,
      color: playerColor,
      dests: chessgroundDests(pos, { chess960: true }) as Dests,
      showDests: true,
      rookCastle: true,
      events: { after: onPlayerMove },
    },
    draggable: { enabled: true, showGhost: true },
    animation: { enabled: true, duration: 200 },
    premovable: { enabled: true },
  });

  document.getElementById("hist-prev")?.addEventListener("click", () => {
    if (viewPly > 0) showPly(viewPly - 1);
  });
  document.getElementById("hist-next")?.addEventListener("click", () => {
    if (!isLive()) showPly(viewPly + 1);
  });
  document.getElementById("action-takeback")?.addEventListener("click", () => {
    void onTakeback();
  });
  document.getElementById("action-draw")?.addEventListener("click", () => {
    void onDrawOffer();
  });
  document.getElementById("action-resign")?.addEventListener("click", onResign);
}

function onHistoryKey(e: KeyboardEvent): void {
  if (gameOver) return;
  if (e.key === "ArrowLeft" && viewPly > 0) {
    e.preventDefault();
    showPly(viewPly - 1);
  } else if (e.key === "ArrowRight" && !isLive()) {
    e.preventDefault();
    showPly(viewPly + 1);
  }
}

async function main(): Promise<void> {
  gameOver = false;
  moves.length = 0;
  positionHistory.length = 0;
  fenHistory.length = 0;
  offerPending = false;
  drawDeclined = false;
  takebackDeclined = false;

  const { fen } = randomChess960();
  startFen = fen;
  const setup = parseFen(fen).unwrap();
  pos = Chess.fromSetup(setup).unwrap();
  positionHistory.push(positionKey());
  fenHistory.push(makeFen(pos.toSetup()));
  viewPly = 0;

  // Stage-based Elo tiers
  const stage = getStage("crown");
  const eloByStage = [0, 600, 1200, 1600];
  engineElo = eloByStage[stage] ?? 1200;
  baseNodes = eloToNodes(engineElo);

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

  engineClock = createClock({
    initialMs: INITIAL_MS,
    incrementMs: INCREMENT_MS,
    onTick: (ms) => {
      const el = document.getElementById("engine-clock");
      if (el) {
        el.textContent = formatClock(ms);
        el.classList.toggle("low", ms < 60000);
      }
    },
    onFlag: onEngineFlag,
  });

  renderGame();

  engine = new StockfishEngine();
  await engine.init(engineElo);
  engine.newGame();

  clock.start();
  dimClock("engine-clock", true);
  dimClock("player-clock", false);
}

game.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>("button");
  if (btn?.id === "again-btn") {
    void main();
  } else if (btn?.id === "back-btn") {
    window.location.href = "/index.html?completed=crown";
  }
});

document.addEventListener("keydown", onHistoryKey);

void main();

initTheme();
wireToggle();
