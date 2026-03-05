import { initTheme, wireToggle } from "../shared/theme";
import { createTimer } from "../shared/timer";
import { recordSessionScore } from "../shared/progress";
import { getStage, recordResult } from "../shared/stages";
import * as sound from "../shared/sounds";
import {
  type FluxState,
  type Trial,
  type Rule,
  type ButtonSide,
  createFluxState,
  generateTrial,
  evaluateResponse,
  updateAdaptation,
} from "./flux-engine";

const DURATION = 60;

function getEl(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`Missing #${id} element`);
  return el;
}
const game = getEl("game");

let state: FluxState;
let currentTrial: Trial | null = null;
let trialRule: Rule = "color";
let ruleJustSwitched = false;
let currentRemaining = DURATION;
let timerRef: ReturnType<typeof createTimer> | null = null;
let trialTimeout: ReturnType<typeof setTimeout> | null = null;
let advanceTimeout: ReturnType<typeof setTimeout> | null = null;
let inputLocked = false;
let gameOver = false;
let totalTrials = 0;
let correctTrials = 0;

function clearTrialTimeout(): void {
  if (trialTimeout !== null) {
    clearTimeout(trialTimeout);
    trialTimeout = null;
  }
}

function clearAdvanceTimeout(): void {
  if (advanceTimeout !== null) {
    clearTimeout(advanceTimeout);
    advanceTimeout = null;
  }
}

function renderPlaying(): void {
  if (!currentTrial) return;

  const ruleCue = trialRule === "color" ? "COLOR" : "NUMBER";
  const switchHtml = ruleJustSwitched
    ? `<div class="switch-label">SWITCH</div>`
    : "";

  // Button labels depend on current rule
  // Left = Red/Odd, Right = Blue/Even
  let leftActive: string;
  let leftInactive: string;
  let rightActive: string;
  let rightInactive: string;

  if (trialRule === "color") {
    leftActive = "Red";
    leftInactive = "Odd";
    rightActive = "Blue";
    rightInactive = "Even";
  } else {
    leftActive = "Odd";
    leftInactive = "Red";
    rightActive = "Even";
    rightInactive = "Blue";
  }

  game.innerHTML = `
    <div class="timer">${String(currentRemaining)}s</div>
    <div class="rule-cue">${ruleCue}</div>
    ${switchHtml}
    <div class="stimulus color-${currentTrial.color}">${String(currentTrial.number)}</div>
    <div class="flux-buttons">
      <button class="flux-btn" data-side="left">
        <span class="btn-label-active">${leftActive}</span>
        <span class="btn-label-inactive">${leftInactive}</span>
      </button>
      <button class="flux-btn" data-side="right">
        <span class="btn-label-active">${rightActive}</span>
        <span class="btn-label-inactive">${rightInactive}</span>
      </button>
    </div>
    <div class="flux-feedback" id="feedback"></div>
    <div class="score-display">Score: ${String(state.score)}</div>
  `;
}

function showFeedback(correct: boolean, message: string): void {
  const feedback = document.getElementById("feedback");
  if (feedback) {
    feedback.classList.add(correct ? "correct" : "wrong");
    feedback.textContent = message;
  }

  const stimulus = game.querySelector(".stimulus");
  if (stimulus) {
    stimulus.classList.add(correct ? "flash-correct" : "flash-wrong");
  }
}

function handleResponse(pressed: ButtonSide | null): void {
  if (gameOver || inputLocked || !currentTrial) return;
  inputLocked = true;
  clearTrialTimeout();

  const result = evaluateResponse(currentTrial, trialRule, pressed);
  state.score += result.points;
  totalTrials++;

  if (result.correct) {
    correctTrials++;
    sound.playCorrect();
    showFeedback(true, result.feedback || "+1");
    updateAdaptation(state, true);
    advanceTimeout = setTimeout(() => {
      if (!gameOver) nextTrial();
    }, 400);
  } else {
    sound.playWrong();
    showFeedback(false, result.feedback);
    updateAdaptation(state, false);
    advanceTimeout = setTimeout(() => {
      if (!gameOver) nextTrial();
    }, 800);
  }

  // Update score display immediately
  const scoreEl = game.querySelector(".score-display");
  if (scoreEl) scoreEl.textContent = `Score: ${String(state.score)}`;
}

function nextTrial(): void {
  if (gameOver) return;
  clearTrialTimeout();
  clearAdvanceTimeout();

  const prevRule = state.rule;
  currentTrial = generateTrial(state);
  trialRule = state.rule;
  ruleJustSwitched = prevRule !== state.rule;
  inputLocked = false;

  renderPlaying();

  // Auto-advance on timeout (counts as null press)
  trialTimeout = setTimeout(() => {
    handleResponse(null);
  }, state.intervalMs);
}

function showResult(): void {
  gameOver = true;
  clearTrialTimeout();
  clearAdvanceTimeout();

  const finalScore = state.score;
  recordSessionScore("flux", finalScore);

  const accuracy = totalTrials > 0 ? correctTrials / totalTrials : 0;
  recordResult("flux", accuracy);

  game.innerHTML = `
    <div class="result">
      <div class="final-score">${String(finalScore)}</div>
      <div class="result-label">points in ${String(DURATION)} seconds</div>
      <div class="result-actions">
        <button id="again-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>Play Again</button>
        <button id="back-btn" class="secondary"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>Back to Hub</button>
      </div>
    </div>
  `;

  sound.playVictory();
}

function startGame(): void {
  const stage = getStage("flux");
  state = createFluxState(stage);
  currentTrial = null;
  currentRemaining = DURATION;
  inputLocked = false;
  gameOver = false;
  totalTrials = 0;
  correctTrials = 0;

  if (timerRef !== null) timerRef.stop();
  clearTrialTimeout();
  clearAdvanceTimeout();

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

  timerRef.start();
  nextTrial();
}

game.addEventListener("click", (e) => {
  const target = (e.target as HTMLElement).closest<HTMLElement>("button");
  if (!target) return;

  if (target.classList.contains("flux-btn")) {
    const side = target.dataset.side as ButtonSide | undefined;
    if (side) handleResponse(side);
  } else if (target.id === "again-btn") {
    startGame();
  } else if (target.id === "back-btn") {
    window.location.href = "../?completed=flux";
  }
});

startGame();

initTheme();
wireToggle();
