import { initTheme, wireToggle } from "../shared/theme";
import { createTimer } from "../shared/timer";
import { recordScore, todayString, SKIP_SCORE } from "../shared/progress";
import * as sound from "../shared/sounds";

type Op = "+" | "−" | "×" | "÷";
const OPS_BY_LEVEL: Op[][] = [
  ["+", "−"],
  ["+", "−", "×"],
  ["+", "−", "×", "÷"],
];

export interface MathProblem {
  a: number;
  b: number;
  op: Op;
  answer: number;
  choices: number[];
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function generateChoices(answer: number): number[] {
  const choices = new Set<number>([answer]);
  while (choices.size < 4) {
    const offset = rand(1, Math.max(5, Math.abs(answer)));
    const wrong = answer + (Math.random() < 0.5 ? offset : -offset);
    if (wrong !== answer) {
      choices.add(wrong);
    }
  }
  return shuffle([...choices]);
}

export function generateProblem(level: number): MathProblem {
  const ops = OPS_BY_LEVEL[Math.min(level - 1, OPS_BY_LEVEL.length - 1)];
  const op = ops[Math.floor(Math.random() * ops.length)];

  const maxVal = level === 1 ? 9 : level === 2 ? 50 : 100;
  let a: number;
  let b: number;
  let answer: number;

  if (op === "÷") {
    b = rand(2, Math.min(maxVal, 12));
    answer = rand(1, maxVal);
    a = answer * b;
  } else {
    a = rand(1, maxVal);
    b = rand(1, maxVal);
    if (op === "+") answer = a + b;
    else if (op === "−") {
      if (b > a) [a, b] = [b, a];
      answer = a - b;
    } else {
      // ×
      a = rand(1, Math.min(maxVal, 12));
      b = rand(1, Math.min(maxVal, 12));
      answer = a * b;
    }
  }

  const choices = generateChoices(answer);
  return { a, b, op, answer, choices };
}

const DURATION = 60;
const game = document.getElementById("game");
if (!game) throw new Error("Missing #game element");

let score = 0;
let streak = 0;
let level = 1;
let problem: MathProblem;
let currentRemaining = DURATION;

function renderPlaying(): void {
  game.innerHTML = `
    <div class="timer">${String(currentRemaining)}s</div>
    <div class="problem">${String(problem.a)} ${problem.op} ${String(problem.b)}</div>
    <div class="score-display">Score: ${String(score)}</div>
    <div class="choices">
      ${problem.choices.map((c) => `<button class="choice-btn" data-val="${String(c)}">${String(c)}</button>`).join("")}
    </div>
  `;
}

function handleAnswer(chosen: number): void {
  if (chosen === problem.answer) {
    score++;
    streak++;
    if (streak >= 5 && level < 3) {
      level++;
      streak = 0;
    }
    sound.playMove();
  } else {
    streak = 0;
    if (level > 1) level--;
    sound.playCheck();
  }
  problem = generateProblem(level);
  renderPlaying();
}

function showResult(): void {
  recordScore("math", score, todayString());

  game.innerHTML = `
    <div class="result">
      <div class="final-score">${String(score)}</div>
      <div>correct in ${String(DURATION)} seconds</div>
      <button id="back-btn">Back to Hub</button>
    </div>
  `;

  sound.playVictory();

  document.getElementById("back-btn")?.addEventListener("click", () => {
    window.location.href = "../";
  });
}

// Use event delegation to avoid circular reference between renderPlaying and handleAnswer
game.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(
    ".choice-btn",
  );
  if (btn?.dataset.val != null) {
    handleAnswer(Number(btn.dataset.val));
  }
});

problem = generateProblem(level);

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
  recordScore("math", SKIP_SCORE, todayString());
  window.location.href = "../";
});

renderPlaying();
timer.start();

initTheme();
wireToggle();
