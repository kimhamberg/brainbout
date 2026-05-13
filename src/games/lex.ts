import { defined } from "../shared/assert";
import { BASE } from "../shared/base";
import { mountAppIcon } from "../shared/icons";
import { recordSessionScore, todayString } from "../shared/progress";
import * as sound from "../shared/sounds";
import { getStage, recordResult } from "../shared/stages";
import { initTheme, wireToggle } from "../shared/theme";
import { createTimer } from "../shared/timer";
import {
  buildQueue,
  maxMasteryForStage,
  pickDistractors as pickDistractorsCore,
  shuffleArray,
  speedBonus,
  streakMultiplier as streakMultiplierCore,
} from "./lex-logic";
import {
  getDueWords,
  getMastery,
  levenshtein,
  maxTypos,
  recordAnswer,
} from "./lex-srs";

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
  if (el === null) {
    throw new Error(`Missing #${id} element`);
  }
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
let gameOver = false;
let totalCorrect = 0;
let totalAttempts = 0;

function streakMultiplier(): number {
  return streakMultiplierCore(streak);
}

async function loadDict(): Promise<void> {
  const resp = await fetch(`${BASE}dict-${lang}.json`);
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
  const toPick = (w: string) => ({ word: w, length: w.length, pos: entry.pos });
  const posPool = (wordsByPos.get(entry.pos) ?? allWords).map(toPick);
  return pickDistractorsCore(
    { word: entry.word, length: entry.word.length, pos: entry.pos },
    posPool,
    allWords.map(toPick),
    NUM_CHOICES - 1,
  );
}

function getSeenWords(): Set<string> {
  const prefix = `brainbout:lex:${lang}:`;
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
  const due = new Set(getDueWords(lang, allWords, today));
  sessionQueue = buildQueue(
    dict,
    seen,
    due,
    SESSION_SIZE,
    NEW_WORD_RATIO,
    shuffleArray,
  );
}

function handleClozeSubmit(input: string): void {
  if (gameOver || inputLocked || !currentEntry) {
    return;
  }
  inputLocked = true;
  totalAttempts++;

  const allowed = maxTypos(currentEntry.word.length);
  const correct =
    levenshtein(input.toLowerCase(), currentEntry.word.toLowerCase()) <=
    allowed;
  const elapsed = Date.now() - roundStart;
  const today = todayString();

  const feedback = document.querySelector("#feedback");
  const inputEl = document.querySelector(
    "#cloze-input",
  ) as HTMLInputElement | null;
  if (inputEl) {
    inputEl.disabled = true;
  }

  if (correct) {
    totalCorrect++;
    const bonus = speedBonus(elapsed);
    const mult = streakMultiplier();
    const points = (10 + bonus) * mult;
    score += points;
    streak++;
    recordAnswer(lang, currentEntry.word, true, today);
    sound.playCorrect();
    if (inputEl) {
      inputEl.classList.add("cloze-correct");
    }
    if (feedback) {
      feedback.classList.add("correct");
      feedback.textContent = `+${String(Math.floor(points))}`;
    }
    setTimeout(() => {
      nextRound();
    }, 600);
  } else {
    streak = 0;
    recordAnswer(lang, currentEntry.word, false, today);
    sound.playWrong();
    if (inputEl) {
      inputEl.classList.add("cloze-wrong");
    }
    if (feedback) {
      feedback.classList.add("wrong");
      feedback.textContent = `Answer: ${currentEntry.word}`;
    }
    const reinsert = Math.min(
      3 + Math.floor(Math.random() * 5),
      sessionQueue.length,
    );
    sessionQueue.splice(reinsert, 0, currentEntry);
    setTimeout(() => {
      nextRound();
    }, WRONG_PAUSE_MS);
  }
}

function wireClozeEvents(): void {
  const inputEl = document.querySelector(
    "#cloze-input",
  ) as HTMLInputElement | null;
  if (!inputEl) {
    return;
  }

  inputEl.focus();
  // Move cursor to end (for hinted cloze with pre-filled value)
  const len = inputEl.value.length;
  inputEl.setSelectionRange(len, len);

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleClozeSubmit(inputEl.value.trim());
    }
  });
}

function renderRound(): void {
  if (!currentEntry) {
    return;
  }

  const stage = getStage("lex");
  const wordMastery = getMastery(lang, currentEntry.word);
  const effectiveMastery = Math.min(wordMastery, maxMasteryForStage(stage));

  const exHtml = currentEntry.example
    ? `<div class="cue-example">&ldquo;${currentEntry.example}&rdquo;</div>`
    : "";

  const streakHtml =
    streak >= 3
      ? `Streak: ${String(streak)} (\u00d7${String(streakMultiplier())})`
      : "";

  if (effectiveMastery === 0) {
    // MCQ mode (existing behavior)
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
      <div class="streak-display">${streakHtml}</div>
    `;
  } else {
    // Cloze mode (hinted or naked)
    const hint = effectiveMastery === 1 ? currentEntry.word.slice(0, 2) : "";
    const hintHtml =
      effectiveMastery === 1
        ? `<div class="cloze-hint">Starts with: ${hint}...</div>`
        : "";

    game.innerHTML = `
      <div class="timer">${String(currentRemaining)}s</div>
      <div class="cue-type">Definition</div>
      <div class="cue-text">${currentEntry.definition}</div>
      ${exHtml}
      ${hintHtml}
      <div class="cloze-input-wrap">
        <input class="cloze-input" type="text" autocomplete="off"
          value="${hint}" placeholder="Type the word..." id="cloze-input" />
      </div>
      <div class="feedback" id="feedback"></div>
      <div class="score-display">Score: ${String(Math.floor(score))}</div>
      <div class="streak-display">${streakHtml}</div>
    `;

    wireClozeEvents();
  }
}

function nextRound(): void {
  if (gameOver) {
    return;
  }
  if (sessionQueue.length === 0) {
    buildSessionQueue();
  }
  currentEntry = sessionQueue.shift() ?? defined(dict[0]);
  const distractors = pickDistractors(defined(currentEntry));
  choices = shuffleArray([defined(currentEntry).word, ...distractors]);
  roundStart = Date.now();
  inputLocked = false;
  renderRound();
}

function handleChoice(chosen: string): void {
  if (gameOver || inputLocked || !currentEntry) {
    return;
  }
  inputLocked = true;
  totalAttempts++;

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

  const feedback = document.querySelector("#feedback");

  if (correct) {
    totalCorrect++;
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
  gameOver = true;
  const finalScore = Math.floor(score);
  recordSessionScore("lex", finalScore);
  const accuracy = totalAttempts > 0 ? totalCorrect / totalAttempts : 0;
  recordResult("lex", accuracy);

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
  gameOver = false;
  totalCorrect = 0;
  totalAttempts = 0;

  if (timerRef) {
    timerRef.stop();
  }

  await loadDict();
  buildSessionQueue();

  timerRef = createTimer({
    seconds: DURATION,
    onTick: (remaining) => {
      currentRemaining = remaining;
      const el = game.querySelector(".timer");
      if (el) {
        el.textContent = `${String(remaining)}s`;
      }
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
  if (!target) {
    return;
  }

  if (target.classList.contains("choice-btn")) {
    handleChoice(target.dataset.word ?? "");
  } else if (target.id === "again-btn") {
    void startGame();
  } else if (target.id === "back-btn") {
    window.location.href = `${BASE}?completed=lex`;
  }
});

void startGame();

initTheme();
wireToggle();
mountAppIcon("lex", "var(--ctp-blue)");
