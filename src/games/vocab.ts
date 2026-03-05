import { initTheme, wireToggle } from "../shared/theme";
import { createTimer } from "../shared/timer";
import { recordSessionScore, todayString } from "../shared/progress";
import { getDueWords, recordAnswer, levenshtein } from "./vocab-srs";
import * as sound from "../shared/sounds";

interface DictEntry {
  word: string;
  pos: string;
  definition: string;
  example: string;
}

const DURATION = 120;
const WRONG_PAUSE_MS = 1500;
const NUM_CHOICES = 4;
const NEW_WORD_RATIO = 0.3;
const SESSION_SIZE = 30;

function getEl(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`Missing #${id} element`);
  return el;
}
const game = getEl("game");

const lang = "no";
let dict: DictEntry[] = [];
let allWords: string[] = [];
let sessionQueue: DictEntry[] = [];
let currentEntry: DictEntry | null = null;
let choices: string[] = [];
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

function speedBonus(elapsedMs: number): number {
  const sec = elapsedMs / 1000;
  if (sec < 3) return 5;
  if (sec < 6) return 3;
  if (sec < 10) return 1;
  return 0;
}

function streakMultiplier(): number {
  if (streak >= 5) return 2;
  if (streak >= 3) return 1.5;
  return 1;
}

async function loadDict(): Promise<void> {
  const base = import.meta.env.BASE_URL;
  const resp = await fetch(`${base}dict-${lang}.json`);
  dict = (await resp.json()) as DictEntry[];
  allWords = dict.map((d) => d.word);
}

function pickDistractors(correctWord: string): string[] {
  const correctLen = correctWord.length;
  const correctLower = correctWord.toLowerCase();
  const scored: Array<{ word: string; dist: number }> = [];

  // Sample a random subset to avoid scanning 22K words every round
  const sampleSize = Math.min(2000, allWords.length);
  const startIdx = Math.floor(Math.random() * Math.max(1, allWords.length - sampleSize));
  const sample = allWords.slice(startIdx, startIdx + sampleSize);

  for (const w of sample) {
    if (w === correctWord) continue;
    if (Math.abs(w.length - correctLen) > 3) continue;
    const dist = levenshtein(w.toLowerCase(), correctLower);
    if (dist > 0 && dist <= 5) {
      scored.push({ word: w, dist });
    }
  }

  scored.sort((a, b) => a.dist - b.dist);
  const picks = scored.slice(0, NUM_CHOICES - 1).map((s) => s.word);

  // Fallback: similar length words
  while (picks.length < NUM_CHOICES - 1) {
    const w = allWords[Math.floor(Math.random() * allWords.length)];
    if (w !== correctWord && !picks.includes(w)) {
      picks.push(w);
    }
  }

  return picks;
}

function getSeenWords(): Set<string> {
  const prefix = `brainbout:vocab:${lang}:`;
  const seen = new Set<string>();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix)) {
      seen.add(key.slice(prefix.length));
    }
  }
  return seen;
}

function buildSessionQueue(): void {
  const today = todayString();
  const seen = getSeenWords();
  const dueStrs = getDueWords(lang, allWords, today);
  const dueSet = new Set(dueStrs);

  const review = shuffleArray(
    dict.filter((d) => seen.has(d.word) && dueSet.has(d.word)),
  );
  const fresh = shuffleArray(
    dict.filter((d) => !seen.has(d.word)),
  );

  const reviewCount = Math.min(
    Math.round(SESSION_SIZE * (1 - NEW_WORD_RATIO)),
    review.length,
  );
  const newCount = Math.min(SESSION_SIZE - reviewCount, fresh.length);

  sessionQueue = shuffleArray([
    ...review.slice(0, reviewCount),
    ...fresh.slice(0, newCount),
  ]);

  if (sessionQueue.length < SESSION_SIZE) {
    const used = new Set(sessionQueue.map((e) => e.word));
    const filler = shuffleArray(dict.filter((d) => !used.has(d.word)));
    sessionQueue.push(...filler.slice(0, SESSION_SIZE - sessionQueue.length));
  }
}

function handleChoice(chosen: string): void {
  if (inputLocked || !currentEntry) return;
  inputLocked = true;

  const correct = chosen === currentEntry.word;
  const elapsed = Date.now() - roundStart;
  const today = todayString();

  const buttons = game.querySelectorAll<HTMLButtonElement>(".choice-btn");
  for (const btn of buttons) {
    btn.disabled = true;
    if (btn.dataset.word === currentEntry.word) {
      btn.classList.add("correct");
    } else if (btn.dataset.word === chosen && !correct) {
      btn.classList.add("wrong");
    }
  }

  const feedback = document.getElementById("feedback");

  if (correct) {
    const bonus = speedBonus(elapsed);
    const mult = streakMultiplier();
    const points = (10 + bonus) * mult;
    score += points;
    streak++;
    recordAnswer(lang, currentEntry.word, true, today);
    sound.playCorrect();
    if (feedback) {
      feedback.classList.add("correct");
      feedback.textContent = `+${String(Math.floor(points))}`;
    }
    setTimeout(nextRound, 600); // eslint-disable-line @typescript-eslint/no-use-before-define -- mutual recursion
  } else {
    streak = 0;
    recordAnswer(lang, currentEntry.word, false, today);
    sound.playWrong();
    if (feedback) {
      feedback.classList.add("wrong");
      feedback.textContent = `Answer: ${currentEntry.word}`;
    }
    setTimeout(nextRound, WRONG_PAUSE_MS); // eslint-disable-line @typescript-eslint/no-use-before-define -- mutual recursion
  }
}

function renderRound(): void {
  if (!currentEntry) return;

  const exHtml = currentEntry.example
    ? `<div class="cue-example">&ldquo;${currentEntry.example}&rdquo;</div>`
    : "";

  const buttonsHtml = choices
    .map(
      (word) =>
        `<button class="choice-btn" data-word="${word}">${word}</button>`,
    )
    .join("");

  game.innerHTML = `
    <div class="timer">${String(currentRemaining)}s</div>
    <div class="cue-type">Definition</div>
    <div class="cue-text">${currentEntry.definition}</div>
    ${exHtml}
    <div class="choices">${buttonsHtml}</div>
    <div class="feedback" id="feedback"></div>
    <div class="score-display">Score: ${String(Math.floor(score))}</div>
    <div class="streak-display">${streak >= 3 ? `Streak: ${String(streak)} (\u00d7${String(streakMultiplier())})` : ""}</div>
  `;

  const buttons = game.querySelectorAll<HTMLButtonElement>(".choice-btn");
  for (const btn of buttons) {
    btn.addEventListener("click", () => {
      handleChoice(btn.dataset.word ?? "");
    });
  }
}

function nextRound(): void {
  if (sessionQueue.length === 0) {
    buildSessionQueue();
  }
  currentEntry = sessionQueue.shift() ?? dict[0];
  const distractors = pickDistractors(currentEntry.word);
  choices = shuffleArray([currentEntry.word, ...distractors]);
  roundStart = Date.now();
  inputLocked = false;
  renderRound();
}

function showResult(): void {
  const finalScore = Math.floor(score);
  recordSessionScore("vocab", finalScore);

  game.innerHTML = `
    <div class="result">
      <div class="final-score">${String(finalScore)}</div>
      <div class="result-label">points in ${String(DURATION)} seconds</div>
      <button id="back-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>Back to Hub</button>
    </div>
  `;

  sound.playVictory();

  document.getElementById("back-btn")?.addEventListener("click", () => {
    window.location.href = "../?completed=vocab";
  });
}

async function startGame(): Promise<void> {
  score = 0;
  streak = 0;
  currentRemaining = DURATION;
  inputLocked = false;

  if (timerRef) timerRef.stop();

  await loadDict();
  buildSessionQueue();

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

void startGame();

initTheme();
wireToggle();
