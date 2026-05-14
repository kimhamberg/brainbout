import "@lichess-org/chessground/assets/chessground.base.css";
import "@lichess-org/chessground/assets/chessground.brown.css";
import "@lichess-org/chessground/assets/chessground.cburnett.css";
import "../shared/board-theme.css";

import { Chessground } from "@lichess-org/chessground";
import type { Api } from "@lichess-org/chessground/api";
import { BASE } from "../shared/base";
import { mountAppIcon, mountQuitButton } from "../shared/icons";
import { recordSessionScore } from "../shared/progress";
import * as sound from "../shared/sounds";
import { getStage, recordResult } from "../shared/stages";
import { initTheme, wireToggle } from "../shared/theme";
import {
  classifyResponse,
  generateTrial,
  piecesToFen,
  type ResultVm,
  renderResultHtml,
  type Trial,
  type TrialKind,
  transformLabel,
} from "./crown-rotation";

/* ─── DOM ──────────────────────────────────────────────────────────── */

function getEl(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) {
    throw new Error(`Missing #${id} element`);
  }
  return el;
}
const game = getEl("game");

/* ─── session state ────────────────────────────────────────────────── */

const SESSION_TRIALS = 20;
const TRIAL_BUDGET_MS = 8000;
const FEEDBACK_MS = 600;
const POINTS_BASE = 10;
const SPEED_THRESHOLD_MS = 2500;

let currentTrial: Trial | null = null;
let trialStartMs = 0;
let trialIndex = 0;
let totalCorrect = 0;
let totalResponseMs = 0;
let streak = 0;
let peakStreak = 0;
let score = 0;
let inputLocked = false;
let gameOver = false;
let boardA: Api | null = null;
let boardB: Api | null = null;
let trialTimeout: ReturnType<typeof setTimeout> | null = null;
let advanceTimeout: ReturnType<typeof setTimeout> | null = null;

/* ─── render ───────────────────────────────────────────────────────── */

function renderPlaying(): void {
  if (!currentTrial) return;
  game.innerHTML = `
    <div class="trial-header">
      <div class="trial-count">Trial ${String(trialIndex + 1)} / ${String(SESSION_TRIALS)}</div>
      <div class="transform-label">${transformLabel(currentTrial.transform)}</div>
    </div>
    <div class="rotate-boards">
      <div class="rotate-board" id="board-a"></div>
      <div class="rotate-divider">vs</div>
      <div class="rotate-board" id="board-b"></div>
    </div>
    <div class="rotate-buttons">
      <button class="rotate-btn" data-press="same">Same</button>
      <button class="rotate-btn" data-press="different">Different</button>
    </div>
    <div class="rotate-feedback" id="feedback"></div>
    <div class="score-display">Score: ${String(score)}</div>
  `;
  const elA = getEl("board-a");
  const elB = getEl("board-b");
  boardA = Chessground(elA, {
    fen: piecesToFen(currentTrial.a),
    viewOnly: true,
    coordinates: false,
    drawable: { enabled: false },
  });
  boardB = Chessground(elB, {
    fen: piecesToFen(currentTrial.b),
    viewOnly: true,
    coordinates: false,
    drawable: { enabled: false },
  });
}

/* ─── trial flow ───────────────────────────────────────────────────── */

function clearTimers(): void {
  if (trialTimeout !== null) {
    clearTimeout(trialTimeout);
    trialTimeout = null;
  }
  if (advanceTimeout !== null) {
    clearTimeout(advanceTimeout);
    advanceTimeout = null;
  }
}

function nextTrial(): void {
  if (gameOver) return;
  clearTimers();
  if (trialIndex >= SESSION_TRIALS) {
    showResult();
    return;
  }
  currentTrial = generateTrial(getStage("crown"));
  trialStartMs = Date.now();
  inputLocked = false;
  renderPlaying();
  trialTimeout = setTimeout(() => {
    if (!inputLocked && !gameOver) {
      // Treat timeout as a wrong-by-omission answer to the opposite kind.
      handleResponse(currentTrial?.kind === "same" ? "different" : "same");
    }
  }, TRIAL_BUDGET_MS);
}

function showFeedback(correct: boolean, message: string): void {
  const fb = document.querySelector("#feedback");
  if (!fb) return;
  fb.classList.add(correct ? "correct" : "wrong");
  fb.textContent = message;
}

function handleResponse(pressed: TrialKind): void {
  if (inputLocked || gameOver || !currentTrial) return;
  inputLocked = true;
  if (trialTimeout !== null) {
    clearTimeout(trialTimeout);
    trialTimeout = null;
  }

  const elapsed = Date.now() - trialStartMs;
  const { correct } = classifyResponse(currentTrial, pressed);
  totalResponseMs += elapsed;

  if (correct) {
    totalCorrect++;
    streak++;
    if (streak > peakStreak) peakStreak = streak;
    const fast = elapsed < SPEED_THRESHOLD_MS;
    const points = POINTS_BASE + (fast ? 5 : 0) + Math.min(streak, 10);
    score += points;
    sound.playCorrect();
    showFeedback(true, `+${String(points)}`);
  } else {
    streak = 0;
    sound.playWrong();
    showFeedback(false, `Was ${currentTrial.kind}`);
  }

  const scoreEl = game.querySelector(".score-display");
  if (scoreEl) {
    scoreEl.textContent = `Score: ${String(score)}`;
  }

  trialIndex++;
  advanceTimeout = setTimeout(() => {
    if (!gameOver) nextTrial();
  }, FEEDBACK_MS);
}

/* ─── result ───────────────────────────────────────────────────────── */

function showResult(): void {
  gameOver = true;
  clearTimers();
  const total = trialIndex;
  const accuracy = total === 0 ? 0 : totalCorrect / total;
  recordSessionScore("crown", score);
  recordResult("crown", accuracy);

  const vm: ResultVm = {
    finalScore: score,
    totalTrials: total,
    correctTrials: totalCorrect,
    avgResponseMs: total === 0 ? 0 : totalResponseMs / total,
    peakStreak,
  };
  game.innerHTML = renderResultHtml(vm);
  sound.playVictory();
}

/* ─── game start ───────────────────────────────────────────────────── */

function startGame(): void {
  trialIndex = 0;
  totalCorrect = 0;
  totalResponseMs = 0;
  streak = 0;
  peakStreak = 0;
  score = 0;
  inputLocked = false;
  gameOver = false;
  currentTrial = null;
  clearTimers();
  nextTrial();
}

game.addEventListener("click", (e) => {
  const target = (e.target as HTMLElement).closest<HTMLElement>("button");
  if (!target) return;
  if (target.classList.contains("rotate-btn")) {
    const pressed = target.dataset.press as TrialKind | undefined;
    if (pressed === "same" || pressed === "different") {
      handleResponse(pressed);
    }
  } else if (target.id === "again-btn") {
    startGame();
  } else if (target.id === "back-btn") {
    window.location.href = `${BASE}?completed=crown`;
  }
});

mountQuitButton(() => {
  if (!gameOver) showResult();
});

startGame();

initTheme();
wireToggle();
mountAppIcon("crown", "var(--ctp-green)");

void boardA;
void boardB;
