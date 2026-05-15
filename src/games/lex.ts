import { defined } from "../shared/assert";
import { BASE } from "../shared/base";
import { mountAppIcon, mountQuitButton } from "../shared/icons";
import { recordSessionScore, todayString } from "../shared/progress";
import * as sound from "../shared/sounds";
import { recordResult } from "../shared/stages";
import { initTheme, wireToggle } from "../shared/theme";
import {
  boardLayout,
  letterValue,
  type Multiplier,
  turnScore,
} from "./lex-board";
import { buildQueue, shuffleArray } from "./lex-logic";
import {
  type Grade,
  getDueWords,
  getSeenWords,
  isMastered,
  recordReview,
  suggestGradeFromTyping,
} from "./lex-srs";

interface DictEntry {
  word: string;
  pos: string;
  definition: string;
  example: string;
}

const NEW_WORD_RATIO = 0.3;
const SESSION_CAP = 50;

function getEl(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) {
    throw new Error(`Missing #${id} element`);
  }
  return el;
}
const game = getEl("game");

const lang = "no";
let dict: DictEntry[] = [];
let allWords: string[] = [];
let sessionQueue: DictEntry[] = [];
let currentEntry: DictEntry | null = null;
let revealed = false;
let suggestedGrade: Grade = "good";
let gameOver = false;
let inputLocked = false;
let totalReviews = 0;
let totalAgain = 0;
let masteredAtStart = 0;
let totalScore = 0;
let streak = 0;
let promptShownAt = 0;
let currentLayout: Multiplier[] = [];

async function loadDict(): Promise<void> {
  const resp = await fetch(`${BASE}dict-${lang}.json`);
  dict = (await resp.json()) as DictEntry[];
  allWords = [...new Set(dict.map((d) => d.word))];
}

function buildSessionQueue(): void {
  const today = todayString();
  const seen = getSeenWords(lang);
  const due = new Set(getDueWords(lang, allWords, today));
  sessionQueue = buildQueue(
    dict,
    seen,
    due,
    SESSION_CAP,
    NEW_WORD_RATIO,
    shuffleArray,
  );
}

function countMastered(): number {
  let n = 0;
  const prefix = `brainbout:lex:${lang}:`;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(prefix) === true) {
      const raw = localStorage.getItem(k);
      if (raw !== null) {
        try {
          const parsed = JSON.parse(raw) as { s?: number };
          if (isMastered({ s: parsed.s ?? 0 } as never)) n++;
        } catch {
          /* ignore */
        }
      }
    }
  }
  return n;
}

function renderBoard(typed: string): string {
  if (!currentEntry) return "";
  const target = currentEntry.word;
  const cells: string[] = [];
  for (let i = 0; i < target.length; i++) {
    const m = currentLayout[i] ?? null;
    const ch = typed[i]?.toLowerCase() ?? "";
    const expected = target[i]?.toLowerCase() ?? "";
    const filled = ch !== "";
    const correct = filled && ch === expected;
    const val = filled ? letterValue(ch) : letterValue(expected);
    const multCls = m === null ? "" : ` mult-${m.toLowerCase()}`;
    const stateCls = filled
      ? correct
        ? " filled correct"
        : " filled wrong"
      : "";
    const multLabel = m === null ? "" : `<span class="tile-mult">${m}</span>`;
    const letter = filled ? ch.toUpperCase() : "";
    cells.push(
      `<div class="tile${multCls}${stateCls}"><span class="tile-letter">${letter}</span><span class="tile-val">${String(val)}</span>${multLabel}</div>`,
    );
  }
  return `<div class="board" style="--tile-count:${String(target.length)}">${cells.join("")}</div>`;
}

function renderPrompt(): void {
  if (!currentEntry) return;
  const exHtml = currentEntry.example
    ? `<div class="cue-example">&ldquo;${currentEntry.example}&rdquo;</div>`
    : "";
  game.innerHTML = `
    <div class="hud">
      <div class="timer">${String(totalReviews + 1)} · ${String(sessionQueue.length)} left</div>
      <div class="score-display" id="score">${String(totalScore)} pts</div>
      <div class="streak-display">streak ${String(streak)}</div>
    </div>
    <div class="cue-type">Definition</div>
    <div class="cue-text">${currentEntry.definition}</div>
    ${exHtml}
    ${renderBoard("")}
    <div class="cloze-input-wrap">
      <input class="cloze-input" type="text" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="Type the word…" id="cloze-input" />
    </div>
    <div class="feedback" id="feedback"></div>
  `;
  const input = document.querySelector<HTMLInputElement>("#cloze-input");
  input?.focus();
  input?.addEventListener("input", () => {
    const board = document.querySelector<HTMLElement>(".board");
    if (board) {
      board.outerHTML = renderBoard(input.value);
    }
  });
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      reveal(input.value);
    }
  });
}

function reveal(typed: string): void {
  if (!currentEntry || revealed) return;
  revealed = true;
  suggestedGrade = suggestGradeFromTyping(typed, currentEntry.word);
  const input = document.querySelector<HTMLInputElement>("#cloze-input");
  if (input) input.disabled = true;
  renderReveal(typed);
}

function renderReveal(typed: string): void {
  if (!currentEntry) return;
  const target = currentEntry.word;
  const matched = typed.trim().toLowerCase() === target.toLowerCase();
  const exHtml = currentEntry.example
    ? `<div class="cue-example">&ldquo;${currentEntry.example}&rdquo;</div>`
    : "";
  const previewScore = matched
    ? turnScore(target, currentLayout, streak + 1, Date.now() - promptShownAt)
    : 0;
  const previewHtml = matched
    ? `<div class="score-preview">+${String(previewScore)} pts</div>`
    : "";
  game.innerHTML = `
    <div class="hud">
      <div class="timer">${String(totalReviews + 1)} · ${String(sessionQueue.length)} left</div>
      <div class="score-display">${String(totalScore)} pts</div>
      <div class="streak-display">streak ${String(streak)}</div>
    </div>
    <div class="cue-type">Definition</div>
    <div class="cue-text">${currentEntry.definition}</div>
    ${exHtml}
    ${renderBoard(target)}
    ${previewHtml}
    <div class="reveal-answer ${matched ? "matched" : "missed"}">
      <span class="reveal-label">Answer</span>
      <span class="reveal-word">${target}</span>
    </div>
    ${typed.trim() ? `<div class="reveal-typed">You typed: <em>${typed.trim()}</em></div>` : ""}
    <div class="grade-buttons">
      <button class="grade-btn grade-again ${suggestedGrade === "again" ? "suggested" : ""}" data-grade="again">Again</button>
      <button class="grade-btn grade-hard ${suggestedGrade === "hard" ? "suggested" : ""}" data-grade="hard">Hard</button>
      <button class="grade-btn grade-good ${suggestedGrade === "good" ? "suggested" : ""}" data-grade="good">Good</button>
      <button class="grade-btn grade-easy ${suggestedGrade === "easy" ? "suggested" : ""}" data-grade="easy">Easy</button>
    </div>
    <div class="grade-hint">Suggested: <strong>${suggestedGrade}</strong> · press 1/2/3/4 to grade</div>
  `;
}

function applyGrade(grade: Grade): void {
  if (!currentEntry || gameOver || inputLocked) return;
  if (!revealed) {
    // Allow grading without typing — treat empty typed as "skip"
    reveal("");
  }
  inputLocked = true;
  const word = currentEntry.word;
  recordReview(lang, word, grade, todayString());
  totalReviews++;
  if (grade === "again") {
    totalAgain++;
    streak = 0;
    sound.playWrong();
    // Insert back near the front so the lapsed card returns this session.
    sessionQueue.splice(2, 0, currentEntry);
  } else {
    streak++;
    const earned = turnScore(
      word,
      currentLayout,
      streak,
      Date.now() - promptShownAt,
    );
    totalScore += earned;
    sound.playCorrect();
  }
  setTimeout(nextRound, grade === "again" ? 700 : 400);
}

function nextRound(): void {
  if (gameOver) return;
  if (sessionQueue.length === 0) {
    showResult();
    return;
  }
  currentEntry = sessionQueue.shift() ?? defined(dict[0]);
  currentLayout = boardLayout(currentEntry.word);
  promptShownAt = Date.now();
  revealed = false;
  inputLocked = false;
  renderPrompt();
}

function showResult(): void {
  gameOver = true;
  const masteredNow = countMastered();
  const newlyMastered = Math.max(0, masteredNow - masteredAtStart);
  const accuracy = totalReviews === 0 ? 0 : 1 - totalAgain / totalReviews;
  recordSessionScore("lex", totalReviews);
  recordResult("lex", accuracy);
  game.innerHTML = `
    <div class="result">
      <div class="final-score">${String(totalScore)}</div>
      <div class="result-label">pts · ${String(totalReviews)} reviewed · ${String(Math.round(accuracy * 100))}% recalled</div>
      <div class="peak-streak">+${String(newlyMastered)} new mastered word${newlyMastered === 1 ? "" : "s"}</div>
      <div class="result-actions">
        <button id="again-btn">Play Again</button>
        <button id="back-btn" class="secondary">Back to Hub</button>
      </div>
    </div>
  `;
  sound.playVictory();
}

async function startGame(): Promise<void> {
  totalReviews = 0;
  totalAgain = 0;
  totalScore = 0;
  streak = 0;
  revealed = false;
  inputLocked = false;
  gameOver = false;
  await loadDict();
  masteredAtStart = countMastered();
  buildSessionQueue();
  nextRound();
}

game.addEventListener("click", (e) => {
  const target = (e.target as HTMLElement).closest<HTMLElement>("button");
  if (!target) return;
  if (target.classList.contains("grade-btn")) {
    const grade = target.dataset.grade as Grade | undefined;
    if (grade) applyGrade(grade);
  } else if (target.id === "again-btn") {
    void startGame();
  } else if (target.id === "back-btn") {
    window.location.href = `${BASE}?completed=lex`;
  }
});

mountQuitButton(() => {
  if (!gameOver) showResult();
});

document.addEventListener("keydown", (e) => {
  if (gameOver) return;
  // 1=again, 2=hard, 3=good, 4=easy on the reveal screen
  if (revealed && ["1", "2", "3", "4"].includes(e.key)) {
    const map: Record<string, Grade> = {
      "1": "again",
      "2": "hard",
      "3": "good",
      "4": "easy",
    };
    applyGrade(map[e.key] as Grade);
  }
});

void startGame();

initTheme();
wireToggle();
mountAppIcon("lex", "var(--ctp-blue)");
