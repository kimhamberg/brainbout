import { initTheme, wireToggle } from "../shared/theme";
import { createTimer } from "../shared/timer";
import { recordSessionScore } from "../shared/progress";
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
function getEl(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`Missing #${id} element`);
  return el;
}
const game = getEl("game");

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
    sound.playCorrect();
  } else {
    streak = 0;
    if (level > 1) level--;
    sound.playWrong();
  }
  problem = generateProblem(level);
  renderPlaying();
}

let timer: ReturnType<typeof createTimer> | null = null;

function showResult(): void {
  recordSessionScore("vocab", score); // TODO: remove this file (Task 8)

  game.innerHTML = `
    <div class="result">
      <div class="final-score">${String(score)}</div>
      <div class="result-label">correct in ${String(DURATION)} seconds</div>
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
  streak = 0;
  level = 1;
  currentRemaining = DURATION;

  if (timer !== null) timer.stop();

  problem = generateProblem(level);

  timer = createTimer({
    seconds: DURATION,
    onTick: (remaining) => {
      currentRemaining = remaining;
      renderPlaying();
    },
    onDone: () => {
      showResult();
    },
  });

  renderPlaying();
  timer.start();
}

game.addEventListener("click", (e) => {
  const target = (e.target as HTMLElement).closest<HTMLElement>("button");
  if (!target) return;

  if (target.classList.contains("choice-btn") && target.dataset.val != null) {
    handleAnswer(Number(target.dataset.val));
  } else if (target.id === "again-btn") {
    startGame();
  } else if (target.id === "back-btn") {
    window.location.href = "../?completed=math";
  }
});

startGame();

initTheme();
wireToggle();
