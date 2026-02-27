import { createTimer } from "../shared/timer";
import { recordScore, todayString, SKIP_SCORE } from "../shared/progress";
import * as sound from "../shared/sounds";

export const SYMBOLS = [
  "\u{1F436}",
  "\u{1F431}",
  "\u{1F438}",
  "\u{1F98A}",
  "\u{1F43B}",
  "\u{1F43C}",
  "\u{1F435}",
  "\u{1F981}",
  "\u{1F414}",
  "\u{1F427}",
  "\u{1F419}",
  "\u{1F98B}",
  "\u{1F422}",
  "\u{1F41D}",
  "\u{1F420}",
] as const;

export interface Card {
  id: number;
  symbol: string;
  faceUp: boolean;
  matched: boolean;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function createBoard(rows: number, cols: number): Card[] {
  const pairCount = (rows * cols) / 2;
  const symbols = shuffle([...SYMBOLS]).slice(0, pairCount);
  const cards = shuffle([...symbols, ...symbols]).map((symbol, i) => ({
    id: i,
    symbol,
    faceUp: false,
    matched: false,
  }));
  return cards;
}

const GRIDS: [number, number][] = [
  [3, 4],
  [4, 4],
  [4, 5],
];

const DURATION = 120;
const PREVIEW_MS = 2000;
const MISMATCH_MS = 500;
const game = document.getElementById("game");
if (!game) throw new Error("Missing #game element");

let score = 0;
let gridIndex = 0;
let cards: Card[] = [];
let flipped: number[] = [];
let locked = false;
let currentRemaining = DURATION;
let timerRef: ReturnType<typeof createTimer> | null = null;

function currentGrid(): [number, number] {
  return GRIDS[Math.min(gridIndex, GRIDS.length - 1)];
}

function renderBoard(): void {
  const [rows, cols] = currentGrid();
  game.innerHTML = `
    <div class="timer">${String(currentRemaining)}s</div>
    <div class="grid-label">${String(rows)}\u00D7${String(cols)}</div>
    <div class="card-grid" style="grid-template-columns: repeat(${String(cols)}, 1fr)">
      ${cards
        .map(
          (card) =>
            `<div class="card${card.faceUp || card.matched ? " face-up" : ""}${card.matched ? " matched" : ""}" data-id="${String(card.id)}">${card.faceUp || card.matched ? card.symbol : ""}</div>`,
        )
        .join("")}
    </div>
    <div class="score-display">Pairs: ${String(score)}</div>
  `;
}

function handleCardClick(id: number): void {
  if (locked) return;
  const card = cards.find((c) => c.id === id);
  if (!card || card.faceUp || card.matched) return;

  card.faceUp = true;
  flipped.push(id);
  renderBoard();

  if (flipped.length === 2) {
    locked = true;
    const [first, second] = flipped;
    const a = cards.find((c) => c.id === first);
    const b = cards.find((c) => c.id === second);

    if (a && b && a.symbol === b.symbol) {
      a.matched = true;
      b.matched = true;
      score++;
      sound.playMove();
      flipped = [];
      locked = false;
      renderBoard();

      if (cards.every((c) => c.matched)) {
        gridIndex++;
        startGrid();
      }
    } else {
      sound.playCheck();
      setTimeout(() => {
        if (a) a.faceUp = false;
        if (b) b.faceUp = false;
        flipped = [];
        locked = false;
        renderBoard();
      }, MISMATCH_MS);
    }
  }
}

function startGrid(): void {
  const [rows, cols] = currentGrid();
  cards = createBoard(rows, cols);
  flipped = [];
  locked = true;

  for (const card of cards) card.faceUp = true;
  renderBoard();

  setTimeout(() => {
    for (const card of cards) card.faceUp = false;
    locked = false;
    renderBoard();
  }, PREVIEW_MS);
}

function showResult(): void {
  recordScore("memory", score, todayString());

  game.innerHTML = `
    <div class="result">
      <div class="final-score">${String(score)}</div>
      <div>pairs found in ${String(DURATION)} seconds</div>
      <button id="back-btn">Back to Hub</button>
    </div>
  `;

  sound.playVictory();

  document.getElementById("back-btn")?.addEventListener("click", () => {
    window.location.href = "/";
  });
}

game.addEventListener("click", (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>(".card");
  if (el?.dataset.id != null) {
    handleCardClick(Number(el.dataset.id));
  }
});

document.getElementById("skip-btn")?.addEventListener("click", () => {
  if (timerRef) timerRef.stop();
  recordScore("memory", SKIP_SCORE, todayString());
  window.location.href = "/";
});

timerRef = createTimer({
  seconds: DURATION,
  onTick: (remaining) => {
    currentRemaining = remaining;
    const el = game.querySelector(".timer");
    if (el) el.textContent = `${String(remaining)}s`;
  },
  onDone: () => {
    showResult();
  },
});

startGrid();
timerRef.start();
