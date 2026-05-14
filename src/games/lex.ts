import { defined } from "../shared/assert";
import { BASE } from "../shared/base";
import { mountAppIcon } from "../shared/icons";
import { recordSessionScore, todayString } from "../shared/progress";
import * as sound from "../shared/sounds";
import { recordResult } from "../shared/stages";
import { initTheme, wireToggle } from "../shared/theme";
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

function renderPrompt(): void {
  if (!currentEntry) return;
  const exHtml = currentEntry.example
    ? `<div class="cue-example">&ldquo;${currentEntry.example}&rdquo;</div>`
    : "";
  game.innerHTML = `
    <div class="timer">${String(totalReviews + 1)} reviewed · ${String(sessionQueue.length)} left</div>
    <div class="cue-type">Definition</div>
    <div class="cue-text">${currentEntry.definition}</div>
    ${exHtml}
    <div class="cloze-input-wrap">
      <input class="cloze-input" type="text" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="Type the word, or press Enter to reveal…" id="cloze-input" />
    </div>
    <div class="feedback" id="feedback"></div>
    <button id="quit-btn" class="quit-btn" aria-label="End session">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
    </button>
  `;
  const input = document.querySelector<HTMLInputElement>("#cloze-input");
  input?.focus();
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
  game.innerHTML = `
    <div class="timer">${String(totalReviews + 1)} reviewed · ${String(sessionQueue.length)} left</div>
    <div class="cue-type">Definition</div>
    <div class="cue-text">${currentEntry.definition}</div>
    ${exHtml}
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
    <button id="quit-btn" class="quit-btn" aria-label="End session">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
    </button>
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
  if (grade === "again") totalAgain++;
  if (grade === "again") {
    sound.playWrong();
    // Insert back near the front so the lapsed card returns this session.
    sessionQueue.splice(2, 0, currentEntry);
  } else {
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
      <div class="final-score">${String(totalReviews)}</div>
      <div class="result-label">reviewed · ${String(Math.round(accuracy * 100))}% recalled</div>
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
  } else if (target.id === "quit-btn") {
    if (!gameOver) showResult();
  } else if (target.id === "again-btn") {
    void startGame();
  } else if (target.id === "back-btn") {
    window.location.href = `${BASE}?completed=lex`;
  }
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
