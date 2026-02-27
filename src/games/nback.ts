import { createTimer } from "../shared/timer";
import { recordScore, todayString } from "../shared/progress";
import * as sound from "../shared/sounds";

export const GRID_SIZE = 3;
export const LETTERS = ["C", "H", "K", "L", "Q", "R", "S", "T"] as const;

export interface Stimulus {
  position: number;
  letter: string;
}

export function generateStimulus(): Stimulus {
  return {
    position: Math.floor(Math.random() * GRID_SIZE * GRID_SIZE),
    letter: LETTERS[Math.floor(Math.random() * LETTERS.length)],
  };
}

export function checkMatch(
  history: Stimulus[],
  n: number,
): { positionMatch: boolean; letterMatch: boolean } {
  if (history.length < n + 1) {
    return { positionMatch: false, letterMatch: false };
  }
  const current = history[history.length - 1];
  const prev = history[history.length - 1 - n];
  return {
    positionMatch: current.position === prev.position,
    letterMatch: current.letter === prev.letter,
  };
}

const DURATION = 120;
const ROUND_MS = 2500;
const game = document.getElementById("game")!;

let nLevel = 2;
let history: Stimulus[] = [];
let current: Stimulus | null = null;
let correct = 0;
let total = 0;
let roundCorrect = 0;
let roundTotal = 0;
let posPressed = false;
let letterPressed = false;
let roundInterval: ReturnType<typeof setInterval> | null = null;
let maxN = 2;
let remaining = DURATION;

function renderGrid(): string {
  let html = `<div class="grid">`;
  for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
    const active = current !== null && current.position === i ? " active" : "";
    html += `<div class="grid-cell${active}"></div>`;
  }
  html += `</div>`;
  return html;
}

function renderPlaying(): void {
  game.innerHTML = `
    <div class="timer">${String(remaining)}s</div>
    <div class="n-level">${String(nLevel)}-back</div>
    ${renderGrid()}
    <div class="letter-display">${current?.letter ?? ""}</div>
    <div class="match-buttons">
      <button class="match-btn${posPressed ? " pressed" : ""}" id="pos-btn">Position</button>
      <button class="match-btn${letterPressed ? " pressed" : ""}" id="letter-btn">Letter</button>
    </div>
    <div class="score-display">Score: ${String(correct)}/${String(total)}</div>
  `;

  document.getElementById("pos-btn")?.addEventListener("click", () => {
    posPressed = true;
    renderPlaying();
  });

  document.getElementById("letter-btn")?.addEventListener("click", () => {
    letterPressed = true;
    renderPlaying();
  });
}

function evaluateRound(): void {
  if (history.length < nLevel + 1) return;

  const match = checkMatch(history, nLevel);

  if (match.positionMatch === posPressed) correct++;
  total++;

  if (match.letterMatch === letterPressed) correct++;
  total++;

  let roundHits = 0;
  let roundChecks = 0;
  if (match.positionMatch === posPressed) roundHits++;
  roundChecks++;
  if (match.letterMatch === letterPressed) roundHits++;
  roundChecks++;
  roundCorrect += roundHits;
  roundTotal += roundChecks;
}

function nextRound(): void {
  evaluateRound();

  if (roundTotal >= 20) {
    const accuracy = roundCorrect / roundTotal;
    if (accuracy > 0.8 && nLevel < 9) {
      nLevel++;
      if (nLevel > maxN) maxN = nLevel;
    } else if (accuracy < 0.5 && nLevel > 1) {
      nLevel--;
    }
    roundCorrect = 0;
    roundTotal = 0;
  }

  posPressed = false;
  letterPressed = false;
  current = generateStimulus();
  history.push(current);

  sound.playMove();
  renderPlaying();
}

function showResult(): void {
  if (roundInterval !== null) clearInterval(roundInterval);

  recordScore("nback", maxN, todayString());

  game.innerHTML = `
    <div class="result">
      <div class="final-score">${String(maxN)}-back</div>
      <div>highest level reached</div>
      <div class="score-display" style="margin-top: 0.5rem">${String(correct)}/${String(total)} correct</div>
      <button id="back-btn">Back to Hub</button>
    </div>
  `;

  sound.playVictory();

  document.getElementById("back-btn")?.addEventListener("click", () => {
    window.location.href = "/";
  });
}

current = generateStimulus();
history.push(current);

const timer = createTimer({
  seconds: DURATION,
  onTick: (r) => {
    remaining = r;
    renderPlaying();
  },
  onDone: () => {
    showResult();
  },
});

renderPlaying();
timer.start();
roundInterval = setInterval(nextRound, ROUND_MS);
