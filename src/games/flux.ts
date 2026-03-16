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
  DURATION,
  createFluxState,
  generateTrial,
  evaluateResponse,
  updateAdaptation,
  bpmToMs,
  getMultiplier,
  getStreakLabel,
  getRuleLabels,
  getSessionAct,
} from "./flux-engine";

/* ---------- DOM ---------- */

function getEl(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`Missing #${id} element`);
  return el;
}
const game = getEl("game");

/* ---------- state ---------- */

let state: FluxState;
let currentTrial: Trial | null = null;
let trialRule: Rule = "color";
let trialIsNot = false;
let ruleJustSwitched = false;
let currentRemaining = DURATION;
let timerRef: ReturnType<typeof createTimer> | null = null;
let trialTimeout: ReturnType<typeof setTimeout> | null = null;
let inputLocked = false;
let gameOver = false;
let totalTrials = 0;
let correctTrials = 0;
let responded = false;

/* ---------- timer ring constants ---------- */

const RING_RADIUS = 40;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/* ---------- render ---------- */

function shapeClasses(trial: Trial, sizeOverride?: string): string {
  const classes = ["shape"];
  classes.push(`shape-${sizeOverride ?? trial.size}`);
  classes.push(`form-${trial.shape}`);
  classes.push(`color-${trial.color}`);
  classes.push(`fill-${trial.fill}`);
  if (trial.isGolden) classes.push("golden");
  return classes.join(" ");
}

function shapeHtml(trial: Trial): string {
  if (trial.size === "dual") {
    // Two small shapes side by side — clearly "not one big or small"
    const inner = shapeClasses(trial, "small");
    return `<div class="shape shape-dual"><div class="${inner}"></div><div class="${inner}"></div></div>`;
  }
  return `<div class="${shapeClasses(trial)}"></div>`;
}

function streakHtml(): string {
  if (state.streak < 3) return "";
  const label = getStreakLabel(state.streak);
  const mult = getMultiplier(state.streak);
  return `<div class="streak-display streak-${label}">x${String(mult)} ${label}</div>`;
}

function renderPlaying(): void {
  if (!currentTrial) return;

  const [leftLabel, rightLabel] = getRuleLabels(trialRule, trialIsNot);
  const act = getSessionAct(currentRemaining);
  const ruleText = trialIsNot ? `NOT ${trialRule.toUpperCase()}` : trialRule.toUpperCase();
  const ruleCueClass = trialIsNot ? "rule-cue not-active" : "rule-cue";

  const fraction = currentRemaining / DURATION;
  const offset = RING_CIRCUMFERENCE * (1 - fraction);
  const ringClass = act === "climax" ? "timer-ring climax" : currentRemaining <= 15 ? "timer-ring low" : "timer-ring";

  const switchHtml = ruleJustSwitched
    ? `<div class="switch-ring"></div>`
    : "";

  game.innerHTML = `
    <div class="${ringClass}">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle class="track" cx="48" cy="48" r="${String(RING_RADIUS)}" />
        <circle class="progress" cx="48" cy="48" r="${String(RING_RADIUS)}"
          stroke-dasharray="${String(RING_CIRCUMFERENCE)}"
          stroke-dashoffset="${String(offset)}" />
      </svg>
      <div class="timer-text">${String(currentRemaining)}s</div>
    </div>
    <div class="${ruleCueClass}">${ruleText}</div>
    ${switchHtml}
    <div class="shape-stage">
      ${shapeHtml(currentTrial)}
    </div>
    ${streakHtml()}
    <div class="flux-buttons">
      <button class="flux-btn" data-side="left">
        <span class="btn-label">${leftLabel}</span>
      </button>
      <button class="flux-btn" data-side="right">
        <span class="btn-label">${rightLabel}</span>
      </button>
    </div>
    <div class="flux-feedback" id="feedback"></div>
    <div class="score-display">Score: ${String(state.score)}</div>
  `;
}

/* ---------- particles ---------- */

function spawnParticles(color: string): void {
  const container = document.createElement("div");
  container.className = "particles";
  for (let i = 0; i < 5; i++) {
    const p = document.createElement("div");
    p.className = "particle";
    p.style.background = color;
    p.style.left = "50%";
    p.style.top = "50%";
    container.appendChild(p);
  }
  const shape = game.querySelector(".shape");
  if (shape) {
    shape.parentElement?.insertBefore(container, shape.nextSibling);
    setTimeout(() => {
      container.remove();
    }, 500);
  }
}

/* ---------- feedback ---------- */

function showFeedback(correct: boolean, message: string): void {
  const feedback = document.getElementById("feedback");
  if (feedback) {
    feedback.classList.add(correct ? "correct" : "wrong");
    feedback.textContent = message;
  }
}

function applyJuice(correct: boolean, side: ButtonSide | null, isNoGo: boolean): void {
  if (isNoGo) {
    if (correct) {
      game.classList.add("juice-nogo-correct");
    } else {
      game.classList.add("juice-nogo-fail");
    }
  } else if (correct && side) {
    game.classList.add(side === "left" ? "juice-correct-left" : "juice-correct-right");
    spawnParticles("var(--ctp-green)");
  } else {
    game.classList.add("juice-wrong");
    game.classList.add("dim-flash");
  }

  setTimeout(() => {
    game.classList.remove(
      "juice-correct-left",
      "juice-correct-right",
      "juice-wrong",
      "juice-nogo-correct",
      "juice-nogo-fail",
      "dim-flash",
    );
  }, 500);
}

/* ---------- response handling ---------- */

function handleResponse(pressed: ButtonSide | null): void {
  if (gameOver || inputLocked || !currentTrial) return;
  inputLocked = true;
  responded = true;

  if (trialTimeout !== null) {
    clearTimeout(trialTimeout);
    trialTimeout = null;
  }

  const result = evaluateResponse(currentTrial, trialRule, trialIsNot, state.streak, pressed);
  state.score += result.totalPoints;
  totalTrials++;

  if (result.correct) {
    correctTrials++;
    if (result.isGolden) {
      sound.playGoldenChime();
    } else if (currentTrial.isNoGo) {
      sound.playNogoDissolve();
    } else {
      sound.playCorrectBurst();
    }
    showFeedback(true, result.feedback || `+${String(result.totalPoints)}`);
    updateAdaptation(state, true);
    if (state.streak >= 3) sound.playStreakUp();
  } else {
    if (result.noGoFail) {
      sound.playNogoFail();
    } else {
      sound.playWrongCrack();
    }
    showFeedback(false, result.feedback);
    updateAdaptation(state, false);
  }

  applyJuice(result.correct, pressed, currentTrial.isNoGo);

  // Update score display
  const scoreEl = game.querySelector(".score-display");
  if (scoreEl) scoreEl.textContent = `Score: ${String(state.score)}`;

  // Advance to next trial after brief feedback delay
  const feedbackMs = result.correct ? 250 : 450;
  advanceTimeout = setTimeout(() => {
    if (!gameOver) nextTrial();
  }, feedbackMs);
}

/* ---------- trial flow ---------- */

let advanceTimeout: ReturnType<typeof setTimeout> | null = null;

function nextTrial(): void {
  if (gameOver) return;

  // Clear stale juice classes so the new shape doesn't inherit exit animations
  game.classList.remove(
    "juice-correct-left",
    "juice-correct-right",
    "juice-wrong",
    "juice-nogo-correct",
    "juice-nogo-fail",
    "dim-flash",
  );

  // Clear any pending advance from a previous trial
  if (advanceTimeout !== null) {
    clearTimeout(advanceTimeout);
    advanceTimeout = null;
  }

  const prevRule = state.rule;
  currentTrial = generateTrial(state);
  trialRule = state.rule;
  trialIsNot = state.isNot;
  ruleJustSwitched = prevRule !== state.rule;
  inputLocked = false;
  responded = false;

  if (ruleJustSwitched) {
    sound.playSwitchWhoosh();
  }

  renderPlaying();

  // Timeout: if no response within the beat window, count as miss
  if (trialTimeout !== null) clearTimeout(trialTimeout);
  trialTimeout = setTimeout(() => {
    if (!responded && !gameOver) {
      handleResponse(null);
    }
  }, bpmToMs(state.bpm));
}

function stopTrials(): void {
  if (trialTimeout !== null) {
    clearTimeout(trialTimeout);
    trialTimeout = null;
  }
  if (advanceTimeout !== null) {
    clearTimeout(advanceTimeout);
    advanceTimeout = null;
  }
}

/* ---------- timer ring update ---------- */

function updateTimerRing(remaining: number): void {
  currentRemaining = remaining;
  const act = getSessionAct(remaining);

  const progress = game.querySelector<SVGCircleElement>(".timer-ring .progress");
  const text = game.querySelector(".timer-text");
  const ring = game.querySelector(".timer-ring");

  if (progress) {
    const fraction = remaining / DURATION;
    const offset = RING_CIRCUMFERENCE * (1 - fraction);
    progress.setAttribute("stroke-dashoffset", String(offset));
  }

  if (text) {
    text.textContent = `${String(remaining)}s`;
  }

  if (ring) {
    ring.classList.toggle("low", remaining <= 15 && act !== "climax");
    ring.classList.toggle("climax", act === "climax");
  }

  // Beat tick sound based on act
  if (act === "climax") {
    sound.playBeatTickUrgent();
  } else if (act === "flow") {
    sound.playBeatTickAccent();
  } else {
    sound.playBeatTick();
  }
}

/* ---------- result screen ---------- */

function animateCountUp(el: HTMLElement, target: number): void {
  const duration = 1500;
  const start = performance.now();
  function frame(now: number): void {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    el.textContent = String(Math.round(target * eased));
    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      // Add pulse to Play Again button
      const btn = game.querySelector("#again-btn");
      if (btn) btn.classList.add("pulse");
    }
  }
  requestAnimationFrame(frame);
}

function getBest(key: string): number | null {
  const val = localStorage.getItem(`brainbout:${key}:best`);
  if (val === null) return null;
  const n = parseInt(val, 10);
  return isNaN(n) ? null : n;
}

function saveBest(key: string, score: number): void {
  const prev = getBest(key);
  if (prev === null || score > prev) {
    localStorage.setItem(`brainbout:${key}:best`, String(score));
  }
}

function showResult(): void {
  gameOver = true;
  stopTrials();
  sound.stopBgm();

  const finalScore = state.score;
  recordSessionScore("flux", finalScore);

  const accuracy = totalTrials > 0 ? correctTrials / totalTrials : 0;
  recordResult("flux", accuracy);

  const best = getBest("flux");
  const isNewBest = best === null || finalScore > best;
  const nearMiss = !isNewBest && best !== null && finalScore >= best * 0.9;
  const diff = best !== null ? best - finalScore : 0;

  saveBest("flux", finalScore);

  const streakLabel = getStreakLabel(state.peakStreak);
  const streakMult = getMultiplier(state.peakStreak);

  game.innerHTML = `
    <div class="result">
      <div class="final-score" data-target="${String(finalScore)}">0</div>
      ${isNewBest ? '<div class="new-best">NEW BEST</div>' : ""}
      ${nearMiss ? `<div class="near-miss">Only ${String(diff)} from your best!</div>` : ""}
      <div class="result-label">points in ${String(DURATION)} seconds</div>
      <div class="peak-streak">Best streak: ${String(state.peakStreak)}${streakLabel ? ` (x${String(streakMult)} ${streakLabel})` : ""}</div>
      <div class="accuracy">${String(correctTrials)}/${String(totalTrials)} correct</div>
      <div class="result-actions">
        <button id="again-btn">Play Again</button>
        <button id="back-btn" class="secondary">Back to Hub</button>
      </div>
    </div>
  `;

  const scoreEl = game.querySelector<HTMLElement>(".final-score");
  if (scoreEl) animateCountUp(scoreEl, finalScore);

  sound.playVictory();
}

/* ---------- game start ---------- */

function startGame(): void {
  const stage = getStage("flux");
  state = createFluxState(stage);
  currentTrial = null;
  currentRemaining = DURATION;
  inputLocked = false;
  gameOver = false;
  totalTrials = 0;
  correctTrials = 0;
  responded = false;

  if (timerRef !== null) timerRef.stop();
  stopTrials();

  timerRef = createTimer({
    seconds: DURATION,
    onTick: (remaining) => {
      updateTimerRing(remaining);
    },
    onDone: () => {
      showResult();
    },
  });

  timerRef.start();
  nextTrial();
  sound.startBgm();
}

/* ---------- input ---------- */

game.addEventListener("click", (e) => {
  const target = (e.target as HTMLElement).closest<HTMLElement>("button");
  if (!target) return;

  if (target.classList.contains("flux-btn")) {
    const side = target.dataset["side"] as ButtonSide | undefined;
    if (side) handleResponse(side);
  } else if (target.id === "again-btn") {
    startGame();
  } else if (target.id === "back-btn") {
    window.location.href = "/index.html?completed=flux";
  }
});

document.addEventListener("keydown", (e) => {
  if (gameOver || inputLocked) return;
  if (e.key === "ArrowLeft") {
    e.preventDefault();
    handleResponse("left");
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    handleResponse("right");
  }
});

/* ---------- init ---------- */

startGame();
initTheme();
wireToggle();
