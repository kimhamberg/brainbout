import { initTheme, wireToggle } from "../shared/theme";
import { createTimer } from "../shared/timer";
import { recordScore, todayString, SKIP_SCORE } from "../shared/progress";
import { getDueWords, recordAnswer, levenshtein } from "./vocab-srs";
import * as sound from "../shared/sounds";

interface WordEntry {
  word: string;
  definition: string;
  cloze: string;
  synonyms: string[];
}

type CueType = "definition" | "cloze" | "synonym";

const DURATION = 120;
const WRONG_PAUSE_MS = 2000;
const CLOSE_THRESHOLD = 2;

const game = document.getElementById("game");
if (!game) throw new Error("Missing #game element");

let lang = localStorage.getItem("brainbout:vocab-lang") ?? "no";
let words: WordEntry[] = [];
let dueQueue: WordEntry[] = [];
let currentWord: WordEntry | null = null;
let currentCue: CueType = "definition";
let score = 0;
let streak = 0;
let currentRemaining = DURATION;
let timerRef: ReturnType<typeof createTimer> | null = null;
let roundStart = 0;
let inputLocked = false;

function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickCue(entry: WordEntry): CueType {
  const types: CueType[] = ["definition", "cloze"];
  if (entry.synonyms.length > 0) types.push("synonym");
  return types[Math.floor(Math.random() * types.length)];
}

function getCueText(entry: WordEntry, cue: CueType): string {
  if (cue === "definition") return entry.definition;
  if (cue === "cloze") return entry.cloze;
  return `Synonym: ${entry.synonyms[Math.floor(Math.random() * entry.synonyms.length)]}`;
}

function getCueLabel(cue: CueType): string {
  if (cue === "definition") return "Definition";
  if (cue === "cloze") return "Fill in the blank";
  return "Synonym";
}

function speedBonus(elapsedMs: number): number {
  const sec = elapsedMs / 1000;
  if (sec < 5) return 5;
  if (sec < 10) return 3;
  if (sec < 15) return 1;
  return 0;
}

function streakMultiplier(): number {
  if (streak >= 5) return 2;
  if (streak >= 3) return 1.5;
  return 1;
}

async function loadWords(): Promise<void> {
  const base = import.meta.env.BASE_URL as string;
  const url = `${base}words-${lang}.json`;
  const resp = await fetch(url);
  words = (await resp.json()) as WordEntry[];
}

function buildQueue(): void {
  const today = todayString();
  const allWordStrs = words.map((w) => w.word);
  const dueStrs = getDueWords(lang, allWordStrs, today);
  const dueSet = new Set(dueStrs);
  dueQueue = shuffleArray(words.filter((w) => dueSet.has(w.word)));
  if (dueQueue.length === 0) {
    dueQueue = shuffleArray([...words]);
  }
}

function handleSubmit(answer: string): void {
  if (inputLocked || !currentWord) return;
  inputLocked = true;

  const trimmed = answer.trim().toLowerCase();
  const target = currentWord.word.toLowerCase();
  const elapsed = Date.now() - roundStart;
  const input = document.getElementById("vocab-input") as HTMLInputElement;
  const feedback = document.getElementById("feedback");
  const today = todayString();

  if (trimmed === target) {
    const bonus = speedBonus(elapsed);
    const mult = streakMultiplier();
    const points = (10 + bonus) * mult;
    score += points;
    streak++;
    recordAnswer(lang, currentWord.word, true, today);
    sound.playMove();
    input.classList.add("correct");
    if (feedback) {
      feedback.classList.add("correct");
      feedback.textContent = `+${String(Math.floor(points))}`;
    }
    setTimeout(nextRound, 500); // eslint-disable-line @typescript-eslint/no-use-before-define -- mutual recursion via setTimeout
  } else if (levenshtein(trimmed, target) <= CLOSE_THRESHOLD) {
    const bonus = speedBonus(elapsed);
    const mult = streakMultiplier();
    const points = (5 + bonus) * mult;
    score += points;
    sound.playMove();
    input.classList.add("close");
    input.value = "";
    input.placeholder = `Type: ${currentWord.word}`;
    if (feedback) {
      feedback.classList.add("close");
      feedback.textContent = `Close! +${String(Math.floor(points))} — retype correctly`;
    }
    inputLocked = false;
  } else {
    streak = 0;
    recordAnswer(lang, currentWord.word, false, today);
    sound.playCheck();
    input.classList.add("wrong");
    input.disabled = true;
    if (feedback) {
      feedback.classList.add("wrong");
      feedback.textContent = `Answer: ${currentWord.word}`;
    }
    setTimeout(nextRound, WRONG_PAUSE_MS); // eslint-disable-line @typescript-eslint/no-use-before-define -- mutual recursion via setTimeout
  }
}

function renderRound(): void {
  if (!currentWord) return;
  game.innerHTML = `
    <div class="timer">${String(currentRemaining)}s</div>
    <div class="cue-type">${getCueLabel(currentCue)}</div>
    <div class="cue-text">${getCueText(currentWord, currentCue)}</div>
    <input class="vocab-input" id="vocab-input" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" />
    <div class="feedback" id="feedback"></div>
    <div class="score-display">Score: ${String(Math.floor(score))}</div>
    <div class="streak-display">${streak >= 3 ? `Streak: ${String(streak)} (×${String(streakMultiplier())})` : ""}</div>
  `;

  const input = document.getElementById("vocab-input") as HTMLInputElement;
  input.focus();
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      handleSubmit(input.value);
    }
  });
}

function nextRound(): void {
  if (dueQueue.length === 0) {
    buildQueue();
  }
  currentWord = dueQueue.shift() ?? words[0];
  currentCue = pickCue(currentWord);
  roundStart = Date.now();
  inputLocked = false;
  renderRound();
}

function showResult(): void {
  const finalScore = Math.floor(score);
  recordScore("vocab", finalScore, todayString());

  game.innerHTML = `
    <div class="result">
      <div class="final-score">${String(finalScore)}</div>
      <div>points in ${String(DURATION)} seconds</div>
      <button id="back-btn">Back to Hub</button>
    </div>
  `;

  sound.playVictory();

  document.getElementById("back-btn")?.addEventListener("click", () => {
    window.location.href = "../";
  });
}

function updateLangButton(): void {
  const btn = document.getElementById("lang-btn");
  if (btn) btn.textContent = lang.toUpperCase();
}

async function startGame(): Promise<void> {
  score = 0;
  streak = 0;
  currentRemaining = DURATION;
  inputLocked = false;

  if (timerRef) timerRef.stop();

  await loadWords();
  buildQueue();

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

  nextRound();
  timerRef.start();
}

document.getElementById("lang-btn")?.addEventListener("click", () => {
  lang = lang === "no" ? "en" : "no";
  localStorage.setItem("brainbout:vocab-lang", lang);
  updateLangButton();
  void startGame();
});

document.getElementById("skip-btn")?.addEventListener("click", () => {
  if (timerRef) timerRef.stop();
  recordScore("vocab", SKIP_SCORE, todayString());
  window.location.href = "../";
});

updateLangButton();
void startGame();

initTheme();
wireToggle();
