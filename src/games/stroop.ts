import { createTimer } from "../shared/timer";
import { recordScore, todayString, SKIP_SCORE } from "../shared/progress";
import * as sound from "../shared/sounds";

export const COLORS = ["red", "blue", "green", "yellow"] as const;
type Color = (typeof COLORS)[number];

const COLOR_HEX: Record<Color, string> = {
  red: "var(--ctp-red)",
  blue: "var(--ctp-blue)",
  green: "var(--ctp-green)",
  yellow: "var(--ctp-yellow)",
};

export interface StroopRound {
  word: Color;
  ink: Color;
}

export function generateRound(): StroopRound {
  const word = COLORS[Math.floor(Math.random() * COLORS.length)];
  let ink: Color;
  do {
    ink = COLORS[Math.floor(Math.random() * COLORS.length)];
  } while (ink === word);
  return { word, ink };
}

const DURATION = 60;
const game = document.getElementById("game");
if (!game) throw new Error("Missing #game element");

let score = 0;
let round: StroopRound;
let currentRemaining = DURATION;

function renderPlaying(): void {
  game.innerHTML = `
    <div class="timer">${String(currentRemaining)}s</div>
    <div class="stroop-word" style="color: ${COLOR_HEX[round.ink]}">${round.word}</div>
    <div class="score-display">Score: ${String(score)}</div>
    <div class="color-buttons">
      ${COLORS.map(
        (c) =>
          `<button class="color-btn" data-color="${c}" style="color: ${COLOR_HEX[c]}">${c}</button>`,
      ).join("")}
    </div>
  `;
}

function handleAnswer(chosen: Color): void {
  if (chosen === round.ink) {
    score++;
    sound.playMove();
  } else {
    sound.playCheck();
  }
  round = generateRound();
  renderPlaying();
}

function showResult(): void {
  recordScore("stroop", score, todayString());

  game.innerHTML = `
    <div class="result">
      <div class="final-score">${String(score)}</div>
      <div>correct in ${String(DURATION)} seconds</div>
      <button id="back-btn">Back to Hub</button>
    </div>
  `;

  sound.playVictory();

  document.getElementById("back-btn")?.addEventListener("click", () => {
    window.location.href = "/";
  });
}

// Use event delegation to avoid circular reference between renderPlaying and handleAnswer
game.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(
    ".color-btn",
  );
  if (btn?.dataset.color != null) {
    handleAnswer(btn.dataset.color as Color);
  }
});

round = generateRound();

const timer = createTimer({
  seconds: DURATION,
  onTick: (remaining) => {
    currentRemaining = remaining;
    renderPlaying();
  },
  onDone: () => {
    showResult();
  },
});

document.getElementById("skip-btn")?.addEventListener("click", () => {
  timer.stop();
  recordScore("stroop", SKIP_SCORE, todayString());
  window.location.href = "/";
});

renderPlaying();
timer.start();
