import '@lichess-org/chessground/assets/chessground.base.css';
import '@lichess-org/chessground/assets/chessground.brown.css';
import '@lichess-org/chessground/assets/chessground.cburnett.css';
import './style.css';

import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Color as CgColor, Key, Dests } from '@lichess-org/chessground/types';
import { randomChess960, chess960Fen } from './chess960';
import { StockfishEngine, DEFAULT_OPTIONS } from './engine';
import { createGame, makeMove, applyUciMove, getGameStatus } from './game';
import type { GameState } from './game';
import type { EngineInfo } from './engine';

let api: Api;
let game: GameState;
let engine: StockfishEngine;
let playerColor: 'white' | 'black' = 'white';
let engineThinking = false;

const sfScript = import.meta.env.BASE_URL + 'stockfish/stockfish-18-lite-single.js';

function getSettings(): { elo: number; skillLevel: number; moveTime: number; positionId: number | undefined; playerColor: 'white' | 'black' } {
  const elo = parseInt((document.getElementById('elo-slider') as HTMLInputElement).value);
  const skillLevel = parseInt((document.getElementById('skill-slider') as HTMLInputElement).value);
  const moveTime = parseInt((document.getElementById('time-slider') as HTMLInputElement).value);
  const posIdInput = (document.getElementById('position-id') as HTMLInputElement).value;
  const positionId = posIdInput ? parseInt(posIdInput) : undefined;
  const colorSelect = (document.getElementById('color-select') as HTMLSelectElement).value;
  const color = colorSelect === 'random'
    ? (Math.random() < 0.5 ? 'white' : 'black')
    : colorSelect as 'white' | 'black';
  return { elo, skillLevel, moveTime, positionId, playerColor: color };
}

function setupSliderLabels(): void {
  const pairs = [
    ['elo-slider', 'elo-value'],
    ['skill-slider', 'skill-value'],
    ['time-slider', 'time-value'],
  ];
  for (const [sliderId, labelId] of pairs) {
    const slider = document.getElementById(sliderId) as HTMLInputElement;
    const label = document.getElementById(labelId)!;
    slider.addEventListener('input', () => { label.textContent = slider.value; });
  }
}

async function startNewGame(positionId?: number): Promise<void> {
  const { fen, id } = positionId !== undefined
    ? chess960Fen(positionId)
    : randomChess960();

  game = createGame(fen);

  const boardEl = document.getElementById('board')!;
  if (api) api.destroy();

  api = Chessground(boardEl, {
    fen: game.currentFen,
    orientation: playerColor,
    turnColor: game.turn as CgColor,
    movable: {
      free: false,
      color: playerColor as CgColor,
      dests: game.dests as Dests,
      showDests: true,
      events: { after: onUserMove },
    },
    draggable: { enabled: true, showGhost: true },
    animation: { enabled: true, duration: 200 },
    premovable: { enabled: false },
  });

  updateStatus(`Chess960 #${id} — Your move`);

  if (playerColor === 'black') {
    engineMove();
  }
}

function onUserMove(orig: string, dest: string): void {
  if (engineThinking) return;

  // Auto-queen promotions for now
  const piece = game.position.board.get(parseSquare(orig));
  const isPromotion = piece?.role === 'pawn' &&
    ((game.turn === 'white' && dest[1] === '8') ||
     (game.turn === 'black' && dest[1] === '1'));

  const promotion = isPromotion ? 'queen' : undefined;
  const newGame = makeMove(game, orig, dest, promotion);
  if (!newGame) {
    api.set({ fen: game.currentFen });
    return;
  }

  game = newGame;
  updateBoard();

  const status = getGameStatus(game);
  if (status.status !== 'playing') {
    showResult(status);
    return;
  }

  engineMove();
}

function engineMove(): void {
  engineThinking = true;
  updateStatus('Engine thinking...');

  api.set({
    movable: { color: undefined, dests: new Map() },
  });

  const moveTime = parseInt((document.getElementById('time-slider') as HTMLInputElement).value);
  engine.goWithMoves(
    game.startFen,
    game.moves,
    moveTime,
    (bestMove: string) => {
      engineThinking = false;
      const newGame = applyUciMove(game, bestMove);
      if (!newGame) return;

      game = newGame;

      if (game.lastMove) {
        api.move(game.lastMove[0] as Key, game.lastMove[1] as Key);
      }
      updateBoard();

      const status = getGameStatus(game);
      if (status.status !== 'playing') {
        showResult(status);
        return;
      }

      updateStatus('Your move');
    },
    (info: EngineInfo) => {
      const evalText = info.score.type === 'cp'
        ? (info.score.value / 100).toFixed(1)
        : `M${info.score.value}`;
      updateEval(`Depth ${info.depth}: ${evalText}`);
    },
  );
}

function updateBoard(): void {
  api.set({
    fen: game.currentFen,
    turnColor: game.turn as CgColor,
    lastMove: game.lastMove as Key[] ?? undefined,
    check: game.isCheck ? (game.turn as CgColor) : undefined,
    movable: {
      color: game.turn === playerColor ? (playerColor as CgColor) : undefined,
      dests: game.turn === playerColor ? game.dests as Dests : new Map(),
    },
  });
}

function showResult(status: ReturnType<typeof getGameStatus>): void {
  let msg: string;
  switch (status.status) {
    case 'checkmate':
      msg = `Checkmate! ${status.winner === playerColor ? 'You win!' : 'Engine wins.'}`;
      break;
    case 'stalemate':
      msg = 'Stalemate — Draw';
      break;
    case 'draw':
      msg = `Draw — ${status.reason}`;
      break;
    default:
      msg = 'Game over';
  }
  updateStatus(msg);
  api.set({ movable: { color: undefined, dests: new Map() } });
}

function updateStatus(text: string): void {
  const el = document.getElementById('status');
  if (el) el.textContent = text;
}

function updateEval(text: string): void {
  const el = document.getElementById('eval');
  if (el) el.textContent = text;
}

function parseSquare(name: string): number {
  return (name.charCodeAt(0) - 97) + (parseInt(name[1]) - 1) * 8;
}

async function main(): Promise<void> {
  engine = new StockfishEngine(sfScript);
  await engine.init(DEFAULT_OPTIONS);

  document.getElementById('new-game')?.addEventListener('click', async () => {
    const settings = getSettings();
    playerColor = settings.playerColor;
    const options = {
      ...DEFAULT_OPTIONS,
      elo: settings.elo,
      skillLevel: settings.skillLevel,
      moveTime: settings.moveTime,
      limitStrength: true,
    };
    engine.destroy();
    engine = new StockfishEngine(sfScript);
    await engine.init(options);
    startNewGame(settings.positionId);
  });

  document.getElementById('flip')?.addEventListener('click', () => {
    playerColor = playerColor === 'white' ? 'black' : 'white';
    api.toggleOrientation();
  });

  setupSliderLabels();
  await startNewGame();
}

main().catch(console.error);
