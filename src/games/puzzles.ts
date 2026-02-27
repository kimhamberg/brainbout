import "@lichess-org/chessground/assets/chessground.base.css";
import "@lichess-org/chessground/assets/chessground.brown.css";
import "@lichess-org/chessground/assets/chessground.cburnett.css";

import { Chessground } from "@lichess-org/chessground";
import type { Api } from "@lichess-org/chessground/api";
import type { Key, Dests } from "@lichess-org/chessground/types";
import { Chess } from "chessops/chess";
import { parseFen, makeFen } from "chessops/fen";
import { parseUci, makeSquare } from "chessops/util";
import { chessgroundDests } from "chessops/compat";
import { createTimer } from "../shared/timer";
import { recordScore, todayString } from "../shared/progress";
import * as sound from "../shared/sounds";

export interface Puzzle {
  fen: string;
  moves: string[];
  rating: number;
}

export function pickPuzzle(puzzles: Puzzle[]): Puzzle {
  return puzzles[Math.floor(Math.random() * puzzles.length)];
}

export function validateMove(
  uci: string,
  moves: string[],
  moveIndex: number,
): boolean {
  return uci === moves[moveIndex];
}

const DURATION = 120;
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const game = document.getElementById("game")!;

let api: Api | undefined;
let score = 0;
let remaining = DURATION;
let puzzles: Puzzle[] = [];
let currentPuzzle: Puzzle;
let moveIndex: number;
let pos: Chess;

async function loadPuzzles(): Promise<Puzzle[]> {
  const base = import.meta.env.BASE_URL as string;
  const resp = await fetch(`${base}puzzles.json`);
  return (await resp.json()) as Puzzle[];
}

function updateStatus(text: string): void {
  const el = game.querySelector(".puzzle-status");
  if (el) el.textContent = text;
}

function updateScoreDisplay(): void {
  const el = game.querySelector(".score-display");
  if (el) el.textContent = `Solved: ${String(score)}`;
}

function setupPuzzle(): void {
  currentPuzzle = pickPuzzle(puzzles);
  const setup = parseFen(currentPuzzle.fen).unwrap();
  pos = Chess.fromSetup(setup).unwrap();

  const firstMove = parseUci(currentPuzzle.moves[0]);
  if (firstMove) pos.play(firstMove);
  moveIndex = 1;

  const boardEl = game.querySelector<HTMLElement>(".puzzle-board");
  if (!boardEl) return;

  if (api) api.destroy();

  const playerColor = pos.turn === "white" ? "white" : "black";
  const dests = chessgroundDests(pos);

  api = Chessground(boardEl, {
    fen: makeFen(pos.toSetup()),
    orientation: playerColor,
    turnColor: pos.turn,
    movable: {
      free: false,
      color: playerColor,
      dests: dests as Dests,
      showDests: true,
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      events: { after: onUserMove },
    },
    draggable: { enabled: true, showGhost: true },
    animation: { enabled: true, duration: 200 },
    premovable: { enabled: false },
  });
}

function onUserMove(orig: string, dest: string): void {
  const uci = orig + dest;

  if (!validateMove(uci, currentPuzzle.moves, moveIndex)) {
    sound.playCheck();
    const statusEl = game.querySelector(".puzzle-status");
    if (statusEl) statusEl.textContent = "Wrong! Next puzzle...";
    setTimeout(() => {
      setupPuzzle();
      updateStatus("");
    }, 800);
    return;
  }

  const move = parseUci(uci);
  if (move) pos.play(move);
  moveIndex++;
  sound.playMove();

  if (moveIndex >= currentPuzzle.moves.length) {
    score++;
    const statusEl = game.querySelector(".puzzle-status");
    if (statusEl) statusEl.textContent = "Correct!";
    updateScoreDisplay();
    setTimeout(() => {
      setupPuzzle();
      updateStatus("");
    }, 600);
    return;
  }

  const opponentMove = parseUci(currentPuzzle.moves[moveIndex]);
  if (opponentMove) {
    const from = "from" in opponentMove ? makeSquare(opponentMove.from) : "";
    const to = makeSquare(opponentMove.to);
    pos.play(opponentMove);
    moveIndex++;

    setTimeout(() => {
      if (api) {
        api.move(from as Key, to as Key);
        api.set({
          fen: makeFen(pos.toSetup()),
          turnColor: pos.turn,
          movable: {
            dests: chessgroundDests(pos) as Dests,
          },
        });
      }
    }, 300);
  }
}

function renderPlaying(): void {
  game.innerHTML = `
    <div class="timer">${String(remaining)}s</div>
    <div class="puzzle-board"></div>
    <div class="puzzle-status"></div>
    <div class="score-display">Solved: ${String(score)}</div>
  `;
  setupPuzzle();
}

function showResult(): void {
  if (api) api.destroy();
  recordScore("puzzles", score, todayString());

  game.innerHTML = `
    <div class="result">
      <div class="final-score">${String(score)}</div>
      <div>puzzles solved in ${String(DURATION)} seconds</div>
      <button id="back-btn">Back to Hub</button>
    </div>
  `;

  sound.playVictory();

  document.getElementById("back-btn")?.addEventListener("click", () => {
    window.location.href = "/";
  });
}

async function main(): Promise<void> {
  game.innerHTML = `<div class="puzzle-status">Loading puzzles...</div>`;
  puzzles = await loadPuzzles();

  const timer = createTimer({
    seconds: DURATION,
    onTick: (r) => {
      remaining = r;
      const el = game.querySelector(".timer");
      if (el) el.textContent = `${String(r)}s`;
    },
    onDone: () => {
      showResult();
    },
  });

  renderPlaying();
  timer.start();
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
main().catch(() => {});
