import { initTheme, wireToggle } from "../shared/theme";
import { createTimer } from "../shared/timer";
import { recordSessionScore } from "../shared/progress";
import * as sound from "../shared/sounds";

const GRID_SIZE = 16;
const INITIAL_VISIBILITY_MS = 1200;
const RAMP_INTERVAL = 3;
const RAMP_STEP_MS = 50;
const FLOOR_MS = 400;
const HIT_FLASH_MS = 100;

export function pickNextCell(gridSize: number, previous: number): number {
  let next: number;
  do {
    next = Math.floor(Math.random() * gridSize);
  } while (next === previous);
  return next;
}

export function getVisibilityMs(hits: number): number {
  const reduction = Math.floor(hits / RAMP_INTERVAL) * RAMP_STEP_MS;
  return Math.max(FLOOR_MS, INITIAL_VISIBILITY_MS - reduction);
}

const DURATION = 60;
function getEl(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`Missing #${id} element`);
  return el;
}
const game = getEl("game");

let score = 0;
let activeCell = -1;
let targetTimeout: ReturnType<typeof setTimeout> | null = null;
let currentRemaining = DURATION;
let timerRef: ReturnType<typeof createTimer> | null = null;
let gameActive = false;

function renderGrid(): void {
  game.innerHTML = `
    <div class="timer">${String(currentRemaining)}s</div>
    <div class="reaction-grid">
      ${Array.from(
        { length: GRID_SIZE },
        (_, i) =>
          `<div class="reaction-cell${i === activeCell ? " active" : ""}" data-cell="${String(i)}"></div>`,
      ).join("")}
    </div>
    <div class="score-display">Score: ${String(score)}</div>
  `;
}

function clearTarget(): void {
  if (targetTimeout !== null) {
    clearTimeout(targetTimeout);
    targetTimeout = null;
  }
}

function showTarget(): void {
  if (!gameActive) return;
  activeCell = pickNextCell(GRID_SIZE, activeCell);
  renderGrid();

  const visMs = getVisibilityMs(score);
  targetTimeout = setTimeout(() => {
    activeCell = -1;
    renderGrid();
    setTimeout(showTarget, 200);
  }, visMs);
}

function handleCellClick(cellIndex: number): void {
  if (!gameActive || cellIndex !== activeCell) return;

  clearTarget();
  score++;
  sound.playCorrect();

  const cell = game.querySelector(`[data-cell="${String(cellIndex)}"]`);
  if (cell) {
    cell.classList.remove("active");
    cell.classList.add("hit");
  }

  const scoreEl = game.querySelector(".score-display");
  if (scoreEl) scoreEl.textContent = `Score: ${String(score)}`;

  setTimeout(() => {
    showTarget();
  }, HIT_FLASH_MS);
}

function showResult(): void {
  recordSessionScore("reaction", score);

  game.innerHTML = `
    <div class="result">
      <div class="final-score">${String(score)}</div>
      <div class="result-label">hits in ${String(DURATION)} seconds</div>
      <div class="result-actions">
        <button id="again-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>Play Again</button>
        <button id="back-btn" class="secondary"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>Back to Hub</button>
      </div>
    </div>
  `;

  sound.playVictory();
}

function startGame(): void {
  score = 0;
  activeCell = -1;
  currentRemaining = DURATION;

  if (timerRef !== null) timerRef.stop();
  clearTarget();

  timerRef = createTimer({
    seconds: DURATION,
    onTick: (remaining) => {
      currentRemaining = remaining;
      const el = game.querySelector(".timer");
      if (el) el.textContent = `${String(remaining)}s`;
    },
    onDone: () => {
      gameActive = false;
      clearTarget();
      showResult();
    },
  });

  gameActive = true;
  renderGrid();
  showTarget();
  timerRef.start();
}

game.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;

  const cell = target.closest<HTMLElement>(".reaction-cell");
  if (cell?.dataset.cell != null) {
    handleCellClick(Number(cell.dataset.cell));
    return;
  }

  const btn = target.closest<HTMLElement>("button");
  if (btn?.id === "again-btn") {
    startGame();
  } else if (btn?.id === "back-btn") {
    window.location.href = "../?completed=reaction";
  }
});

startGame();

initTheme();
wireToggle();
