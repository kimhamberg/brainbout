import { createTimer } from "../shared/timer";
import { recordScore, todayString, SKIP_SCORE } from "../shared/progress";
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
const game = document.getElementById("game");
if (!game) throw new Error("Missing #game element");

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
  sound.playMove();

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
  recordScore("reaction", score, todayString());

  game.innerHTML = `
    <div class="result">
      <div class="final-score">${String(score)}</div>
      <div>hits in ${String(DURATION)} seconds</div>
      <button id="back-btn">Back to Hub</button>
    </div>
  `;

  sound.playVictory();

  document.getElementById("back-btn")?.addEventListener("click", () => {
    window.location.href = "../";
  });
}

game.addEventListener("click", (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>(".reaction-cell");
  if (el?.dataset.cell != null) {
    handleCellClick(Number(el.dataset.cell));
  }
});

document.getElementById("skip-btn")?.addEventListener("click", () => {
  gameActive = false;
  clearTarget();
  if (timerRef) timerRef.stop();
  recordScore("reaction", SKIP_SCORE, todayString());
  window.location.href = "../";
});

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
