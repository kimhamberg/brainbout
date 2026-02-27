import "@lichess-org/chessground/assets/chessground.base.css";
import "@lichess-org/chessground/assets/chessground.brown.css";
import "@lichess-org/chessground/assets/chessground.cburnett.css";
import "./style.css";

import { Chessground } from "@lichess-org/chessground";
import type { Api } from "@lichess-org/chessground/api";
import type { Key, Dests } from "@lichess-org/chessground/types";
import { randomChess960, chess960Fen } from "./chess960";
import { StockfishEngine, DEFAULT_OPTIONS, humanDelay } from "./engine";
import { createGame, makeMove, applyUciMove, getGameStatus } from "./game";
import type { GameState, GameStatus } from "./game";
import * as sound from "./shared/sounds";

const sfScript = `${String(import.meta.env.BASE_URL)}stockfish/stockfish-18-lite-single.js`;

let api: Api | undefined;
let game: GameState;
let engine: StockfishEngine;
let playerColor: "white" | "black" = "white";
let engineThinking = false;

function parseSquare(name: string): number {
  return name.charCodeAt(0) - 97 + (parseInt(name[1], 10) - 1) * 8;
}

function updateStatus(text: string): void {
  const el = document.getElementById("status");
  if (el) {
    el.textContent = text;
  }
}

function getSettings(): {
  elo: number;
  positionId: number | undefined;
  playerColor: "white" | "black";
} {
  const eloSlider = document.getElementById("elo-slider");
  const posIdEl = document.getElementById("position-id");
  const colorEl = document.getElementById("color-select");

  if (
    !(eloSlider instanceof HTMLInputElement) ||
    !(posIdEl instanceof HTMLInputElement) ||
    !(colorEl instanceof HTMLSelectElement)
  ) {
    return {
      elo: DEFAULT_OPTIONS.elo,
      positionId: undefined,
      playerColor: "white",
    };
  }

  const elo = parseInt(eloSlider.value, 10);
  const positionId =
    posIdEl.value === "" ? undefined : parseInt(posIdEl.value, 10);
  const color =
    colorEl.value === "random"
      ? Math.random() < 0.5
        ? "white"
        : "black"
      : (colorEl.value as "white" | "black");
  return { elo, positionId, playerColor: color };
}

function setupSliderLabels(): void {
  const slider = document.getElementById("elo-slider");
  const label = document.getElementById("elo-value");
  if (slider instanceof HTMLInputElement && label) {
    slider.addEventListener("input", () => {
      label.textContent = slider.value;
    });
  }
}

function playMoveSound(status: GameStatus): void {
  if (status.status === "checkmate") {
    if (status.winner === playerColor) {
      sound.playVictory();
    } else {
      sound.playDefeat();
    }
  } else if (status.status === "stalemate" || status.status === "draw") {
    sound.playDraw();
  } else if (game.isCheck) {
    sound.playCheck();
  } else if (game.isCapture) {
    sound.playCapture();
  } else {
    sound.playMove();
  }
}

function updateBoard(): void {
  api.set({
    fen: game.currentFen,
    turnColor: game.turn,
    lastMove: game.lastMove ?? undefined,
    check: game.isCheck ? game.turn : undefined,
    movable: {
      color: game.turn === playerColor ? playerColor : undefined,
      dests: game.turn === playerColor ? (game.dests as Dests) : new Map(),
    },
  });
}

function showResult(status: GameStatus): void {
  let msg: string;
  switch (status.status) {
    case "checkmate": {
      msg = `Checkmate! ${status.winner === playerColor ? "You win!" : "Engine wins."}`;
      break;
    }
    case "stalemate": {
      msg = "Stalemate — Draw";
      break;
    }
    case "draw": {
      msg = `Draw — ${status.reason}`;
      break;
    }
    case "playing": {
      msg = "Game over";
      break;
    }
  }
  updateStatus(msg);
  api?.set({ movable: { color: undefined, dests: new Map() } });
}

function engineMove(): void {
  engineThinking = true;
  updateStatus("Engine thinking...");

  api.set({
    movable: { color: undefined, dests: new Map() },
  });

  engine.goWithMoves(game.startFen, game.moves, (bestMove: string) => {
    void humanDelay().then(() => {
      engineThinking = false;
      const newGame = applyUciMove(game, bestMove);
      if (!newGame) return;

      game = newGame;

      if (game.lastMove) {
        api.move(game.lastMove[0] as Key, game.lastMove[1] as Key);
      }
      updateBoard();

      const status = getGameStatus(game);
      playMoveSound(status);
      if (status.status !== "playing") {
        showResult(status);
        return;
      }

      updateStatus("Your move");
    });
  });
}

function onUserMove(orig: string, dest: string): void {
  if (engineThinking) return;

  // Auto-queen promotions for now
  const piece = game.position.board.get(parseSquare(orig));
  const isPromotion =
    piece?.role === "pawn" &&
    ((game.turn === "white" && dest[1] === "8") ||
      (game.turn === "black" && dest[1] === "1"));

  const promotion = isPromotion ? "queen" : undefined;
  const newGame = makeMove(game, orig, dest, promotion);
  if (!newGame) {
    api.set({ fen: game.currentFen });
    return;
  }

  game = newGame;
  updateBoard();

  const status = getGameStatus(game);
  playMoveSound(status);
  if (status.status !== "playing") {
    showResult(status);
    return;
  }

  engineMove();
}

function startNewGame(positionId?: number): void {
  const { fen, id } =
    positionId !== undefined ? chess960Fen(positionId) : randomChess960();

  game = createGame(fen);

  const boardEl = document.getElementById("board");
  if (!boardEl) return;
  if (api) api.destroy();

  api = Chessground(boardEl, {
    fen: game.currentFen,
    orientation: playerColor,
    turnColor: game.turn,
    movable: {
      free: false,
      color: playerColor,
      dests: game.dests as Dests,
      showDests: true,
      events: { after: onUserMove },
    },
    draggable: { enabled: true, showGhost: true },
    animation: { enabled: true, duration: 200 },
    premovable: { enabled: false },
  });

  sound.playNewGame();
  updateStatus(`Position #${String(id)} — Your move`);

  if (playerColor === "black") {
    engineMove();
  }
}

async function main(): Promise<void> {
  engine = new StockfishEngine(sfScript);
  await engine.init(DEFAULT_OPTIONS);

  document.getElementById("new-game")?.addEventListener("click", () => {
    const { elo, positionId, playerColor: color } = getSettings();
    playerColor = color;
    const options = {
      ...DEFAULT_OPTIONS,
      elo,
    };
    engine.destroy();
    engine = new StockfishEngine(sfScript);
    void engine.init(options).then(() => {
      startNewGame(positionId);
    });
  });

  document.getElementById("flip")?.addEventListener("click", () => {
    playerColor = playerColor === "white" ? "black" : "white";
    api.toggleOrientation();
  });

  setupSliderLabels();
  startNewGame();
}

void main();
