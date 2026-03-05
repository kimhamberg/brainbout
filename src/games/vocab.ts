import { initTheme, wireToggle } from "../shared/theme";
import { createTimer } from "../shared/timer";
import { recordSessionScore, todayString } from "../shared/progress";
import { getDueWords, recordAnswer } from "./vocab-srs";
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
let wordsByPos = new Map<string, string[]>();
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
  allWords = [...new Set(dict.map((d) => d.word))];

  // Build per-POS index for distractor selection
  wordsByPos = new Map();
  for (const d of dict) {
    const list = wordsByPos.get(d.pos);
    if (list) {
      list.push(d.word);
    } else {
      wordsByPos.set(d.pos, [d.word]);
    }
  }
  // Deduplicate each POS list
  for (const [pos, words] of wordsByPos) {
    wordsByPos.set(pos, [...new Set(words)]);
  }
}

function pickDistractors(entry: DictEntry): string[] {
  const picks: string[] = [];
  const used = new Set([entry.word]);

  // Prefer same-POS words with similar length (harder: semantically plausible)
  const posPool = wordsByPos.get(entry.pos) ?? allWords;
  const candidates = posPool.filter(
    (w) => !used.has(w) && Math.abs(w.length - entry.word.length) <= 3,
  );
  shuffleArray(candidates);

  for (const w of candidates) {
    if (picks.length >= NUM_CHOICES - 1) break;
    picks.push(w);
    used.add(w);
  }

  // Fallback: any word with similar length
  if (picks.length < NUM_CHOICES - 1) {
    const fallback = allWords.filter(
      (w) => !used.has(w) && Math.abs(w.length - entry.word.length) <= 3,
    );
    shuffleArray(fallback);
    for (const w of fallback) {
      if (picks.length >= NUM_CHOICES - 1) break;
      picks.push(w);
      used.add(w);
    }
  }

  return picks;
}

function getSeenWords(): Set<string> {
  const prefix = `brainbout:vocab:${lang}:`;
  const seen = new Set<string>();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix) === true) {
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
}

function nextRound(): void {
  if (sessionQueue.length === 0) {
    buildSessionQueue();
  }
  currentEntry = sessionQueue.shift() ?? dict[0];
  const distractors = pickDistractors(currentEntry);
  choices = shuffleArray([currentEntry.word, ...distractors]);
  roundStart = Date.now();
  inputLocked = false;
  renderRound();
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
    setTimeout(nextRound, 600);
  } else {
    streak = 0;
    recordAnswer(lang, currentEntry.word, false, today);
    sound.playWrong();
    if (feedback) {
      feedback.classList.add("wrong");
      feedback.textContent = `Answer: ${currentEntry.word}`;
    }
    // Re-queue wrong word 3-7 rounds ahead so it comes back soon
    const reinsert = Math.min(
      3 + Math.floor(Math.random() * 5),
      sessionQueue.length,
    );
    sessionQueue.splice(reinsert, 0, currentEntry);
    setTimeout(nextRound, WRONG_PAUSE_MS);
  }
}

function showResult(): void {
  const finalScore = Math.floor(score);
  recordSessionScore("vocab", finalScore);

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

game.addEventListener("click", (e) => {
  const target = (e.target as HTMLElement).closest<HTMLElement>("button");
  if (!target) return;

  if (target.classList.contains("choice-btn")) {
    handleChoice(target.dataset.word ?? "");
  } else if (target.id === "again-btn") {
    void startGame();
  } else if (target.id === "back-btn") {
    window.location.href = "../?completed=vocab";
  }
});

void startGame();

initTheme();
wireToggle();
