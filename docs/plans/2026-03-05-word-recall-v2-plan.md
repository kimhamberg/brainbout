# Word Recall v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Replace Word Recall with a multiple-choice vocabulary game using full Wiktionary dictionary data from kaikki.org, fuzzy distractors, and a 30/70 new/review word split.

**Architecture:** A build-time script downloads kaikki.org JSONL dumps, filters and transforms them into compact JSON dictionaries shipped as static assets. The game loads the dictionary, builds a session mix of new and SRS review words, and presents 4 multiple-choice options with fuzzy distractors per round.

**Tech Stack:** TypeScript (tsx for build script, Vite for game), kaikki.org JSONL data, Vitest for tests

---

### Task 1: Clean up old word list artifacts

Remove files from the previous approach that are being replaced.

**Files:**
- Delete: `scripts/seeds/en.txt`
- Delete: `scripts/seeds/no.txt`
- Delete: `scripts/generate-words.ts`
- Delete: `public/words-en.json`
- Delete: `public/words-no.json`
- Delete: `test/words-json.test.ts` (if it exists)

**Step 1: Delete old files**

```bash
rm -f scripts/seeds/en.txt scripts/seeds/no.txt scripts/generate-words.ts
rm -f public/words-en.json public/words-no.json
rm -f test/words-json.test.ts
rmdir scripts/seeds 2>/dev/null || true
```

**Step 2: Remove the `generate:words` npm script from `package.json`**

In `package.json`, delete the line:
```
"generate:words": "tsx scripts/generate-words.ts"
```

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove old hand-curated word lists and generation script"
```

---

### Task 2: Build the dictionary download script

Create `scripts/download-dictionaries.ts` that downloads kaikki.org JSONL dumps and transforms them into filtered JSON dictionaries.

**Files:**
- Create: `scripts/download-dictionaries.ts`
- Modify: `package.json` (add `"download:dict"` script)

**Step 1: Write the script**

The script must:

1. Download JSONL files from kaikki.org:
   - English: `https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl`
   - Norwegian Bokmal: `https://kaikki.org/dictionary/Norwegian%20Bokm%C3%A5l/kaikki.org-dictionary-NorwegianBokm%C3%A5l.jsonl`
2. Stream-parse line by line (files are too large to load into memory)
3. For each line (JSON object), apply filters:
   - Skip if `senses` array is empty
   - For each sense, check `tags` array for `"form-of"` — skip those senses
   - Check `glosses` for patterns: `"alternative form of"`, `"alternative spelling of"`, `"obsolete form of"`, `"plural of"`, `"past tense of"` etc — skip those senses
   - Keep the first sense that passes filtering
   - Skip entries where no sense passes
4. Extract per entry: `{ word, pos, definition, example }`
   - `word`: from `entry.word`
   - `pos`: from `entry.pos` (map to short form: "noun", "verb", "adj", "adv", etc.)
   - `definition`: first item in `sense.glosses`
   - `example`: first `sense.examples[].text` if available, else `""`
5. Mask target word in examples: replace occurrences of the word (case-insensitive) with `"___"`
6. Deduplicate: if the same `word` appears multiple times (different POS), keep all — they're different senses
7. Write `public/dict-en.json` and `public/dict-no.json`
8. Log stats: total parsed, kept, filtered (by reason), final count

```typescript
import { createReadStream, writeFileSync, existsSync, mkdirSync } from "fs";
import { createInterface } from "readline";
import { join } from "path";
import { Writable } from "stream";
import { pipeline } from "stream/promises";

const ROOT = join(import.meta.dirname, "..");
const PUBLIC_DIR = join(ROOT, "public");
const DATA_DIR = join(ROOT, ".dict-cache");

interface DictEntry {
  word: string;
  pos: string;
  definition: string;
  example: string;
}

interface KaikkiSense {
  glosses?: string[];
  raw_glosses?: string[];
  tags?: string[];
  examples?: Array<{ text?: string }>;
}

interface KaikkiEntry {
  word: string;
  pos: string;
  lang_code: string;
  senses?: KaikkiSense[];
}

const FORM_OF_GLOSS_PATTERNS = [
  /^alternative (form|spelling) of /i,
  /^obsolete (form|spelling) of /i,
  /^(plural|singular) of /i,
  /^(past|present) (tense |participle )?of /i,
  /^(comparative|superlative) of /i,
  /^(diminutive|augmentative) of /i,
  /^(feminine|masculine|neuter) of /i,
  /^inflection of /i,
  /^(misspelling|misconstruction) of /i,
  /^(eye|nonstandard) dialect (form |spelling )?of /i,
  /^archaic (form|spelling) of /i,
  /^dated (form|spelling) of /i,
  /^rare (form|spelling) of /i,
];

function isFormOfSense(sense: KaikkiSense): boolean {
  if (sense.tags?.includes("form-of")) return true;
  const gloss = sense.glosses?.[0] ?? "";
  return FORM_OF_GLOSS_PATTERNS.some((p) => p.test(gloss));
}

function maskWord(text: string, word: string): string {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(escaped, "gi"), "___");
}

const POS_MAP: Record<string, string> = {
  noun: "noun",
  verb: "verb",
  adj: "adj",
  adv: "adv",
  prep: "prep",
  pron: "pron",
  conj: "conj",
  intj: "intj",
  det: "det",
  num: "num",
  particle: "part",
  phrase: "phrase",
  affix: "affix",
  suffix: "suffix",
  prefix: "prefix",
  name: "name",
};

function shortPos(pos: string): string {
  return POS_MAP[pos] ?? pos;
}

async function downloadFile(url: string, dest: string): Promise<void> {
  if (existsSync(dest)) {
    console.log(`  Cached: ${dest}`);
    return;
  }
  console.log(`  Downloading: ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Failed to download ${url}: ${res.status}`);

  const fileStream = new (await import("fs")).createWriteStream(dest);
  // @ts-expect-error -- ReadableStream to Node stream
  await pipeline(res.body, fileStream);
}

async function processJsonl(
  inputPath: string,
  outputPath: string,
  langCode: string,
): Promise<void> {
  const results: DictEntry[] = [];
  let total = 0;
  let noSenses = 0;
  let allFormOf = 0;
  let noGloss = 0;
  let kept = 0;

  const rl = createInterface({
    input: createReadStream(inputPath, "utf-8"),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    total++;

    let entry: KaikkiEntry;
    try {
      entry = JSON.parse(line) as KaikkiEntry;
    } catch {
      continue;
    }

    // Filter by language code for the raw dump
    if (langCode && entry.lang_code !== langCode) continue;

    const senses = entry.senses ?? [];
    if (senses.length === 0) {
      noSenses++;
      continue;
    }

    // Find first non-form-of sense with a gloss
    let bestSense: KaikkiSense | null = null;
    for (const sense of senses) {
      if (isFormOfSense(sense)) continue;
      if (!sense.glosses?.length || !sense.glosses[0]) continue;
      bestSense = sense;
      break;
    }

    if (!bestSense) {
      allFormOf++;
      continue;
    }

    const definition = bestSense.glosses![0];
    if (!definition) {
      noGloss++;
      continue;
    }

    let example = "";
    if (bestSense.examples?.length) {
      for (const ex of bestSense.examples) {
        if (ex.text) {
          example = maskWord(ex.text, entry.word);
          break;
        }
      }
    }

    results.push({
      word: entry.word,
      pos: shortPos(entry.pos),
      definition,
      example,
    });
    kept++;

    if (total % 50000 === 0) {
      console.log(`  ... processed ${total} entries, kept ${kept}`);
    }
  }

  writeFileSync(outputPath, JSON.stringify(results, null, 0) + "\n");
  const sizeMB = (Buffer.byteLength(JSON.stringify(results)) / 1024 / 1024).toFixed(1);

  console.log(`\n  Stats for ${outputPath}:`);
  console.log(`    Total parsed:  ${total}`);
  console.log(`    No senses:     ${noSenses}`);
  console.log(`    All form-of:   ${allFormOf}`);
  console.log(`    No gloss:      ${noGloss}`);
  console.log(`    Kept:          ${kept}`);
  console.log(`    Output size:   ${sizeMB} MB`);
}

async function main(): Promise<void> {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  const langs = [
    {
      name: "English",
      code: "en",
      url: "https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl",
      file: "english.jsonl",
      output: "dict-en.json",
    },
    {
      name: "Norwegian Bokmal",
      code: "nb",
      url: "https://kaikki.org/dictionary/Norwegian%20Bokm%C3%A5l/kaikki.org-dictionary-NorwegianBokm%C3%A5l.jsonl",
      file: "norwegian.jsonl",
      output: "dict-no.json",
    },
  ];

  for (const lang of langs) {
    console.log(`\n=== ${lang.name} ===`);
    const cachedPath = join(DATA_DIR, lang.file);
    await downloadFile(lang.url, cachedPath);
    await processJsonl(cachedPath, join(PUBLIC_DIR, lang.output), lang.code);
  }

  console.log("\nDone!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

**Step 2: Add npm script**

In `package.json` scripts, add:
```json
"download:dict": "tsx scripts/download-dictionaries.ts"
```

**Step 3: Add `.dict-cache/` to `.gitignore`**

Append to `.gitignore`:
```
.dict-cache/
```

**Step 4: Run the script**

```bash
npm run download:dict
```

This will take a while (downloading ~3 GB). Verify:
- `public/dict-en.json` exists and has >100K entries
- `public/dict-no.json` exists and has >30K entries
- No form-of entries leaked through (spot check)

**Step 5: Add dict files to `.prettierignore`**

These files are too large for prettier. Add to `.prettierignore`:
```
public/dict-en.json
public/dict-no.json
```

**Step 6: Commit**

```bash
git add scripts/download-dictionaries.ts package.json .gitignore .prettierignore
git add public/dict-en.json public/dict-no.json
git commit -m "feat: download and process full Wiktionary dictionaries from kaikki.org"
```

Note: The dict JSON files are large. If git push rejects, consider adding them to `.gitignore` and documenting the download step in README instead.

---

### Task 3: Write dictionary validation tests

Create tests that validate the generated dictionary JSON files have the right shape and filtering was done correctly.

**Files:**
- Create: `test/dict-json.test.ts`

**Step 1: Write the tests**

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface DictEntry {
  word: string;
  pos: string;
  definition: string;
  example: string;
}

function loadDict(lang: string): DictEntry[] {
  const path = resolve(__dirname, `../public/dict-${lang}.json`);
  return JSON.parse(readFileSync(path, "utf-8")) as DictEntry[];
}

describe.each(["en", "no"])("dict-%s.json", (lang) => {
  const dict = loadDict(lang);

  it("has substantial entry count", () => {
    if (lang === "en") {
      expect(dict.length).toBeGreaterThan(100000);
    } else {
      expect(dict.length).toBeGreaterThan(20000);
    }
  });

  it("every entry has required string fields", () => {
    for (const entry of dict.slice(0, 1000)) {
      expect(typeof entry.word).toBe("string");
      expect(entry.word.length).toBeGreaterThan(0);
      expect(typeof entry.pos).toBe("string");
      expect(entry.pos.length).toBeGreaterThan(0);
      expect(typeof entry.definition).toBe("string");
      expect(entry.definition.length).toBeGreaterThan(0);
      expect(typeof entry.example).toBe("string");
    }
  });

  it("has no form-of definitions in first 1000 entries", () => {
    const formOfPatterns = [
      /^alternative (form|spelling) of /i,
      /^plural of /i,
      /^past tense of /i,
      /^present participle of /i,
      /^inflection of /i,
    ];
    for (const entry of dict.slice(0, 1000)) {
      for (const pattern of formOfPatterns) {
        expect(entry.definition).not.toMatch(pattern);
      }
    }
  });

  it("examples do not contain the target word unmasked", () => {
    for (const entry of dict.slice(0, 1000)) {
      if (entry.example && entry.example !== "") {
        const lower = entry.example.toLowerCase();
        const word = entry.word.toLowerCase();
        // Allow partial matches in other words but not standalone
        const pattern = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
        expect(entry.example).not.toMatch(pattern);
      }
    }
  });
});
```

**Step 2: Run tests**

```bash
npx vitest run test/dict-json.test.ts
```

Expected: All pass.

**Step 3: Commit**

```bash
git add test/dict-json.test.ts
git commit -m "test: add dictionary JSON validation tests"
```

---

### Task 4: Rewrite game code for multiple choice

Replace the text-input game with a multiple-choice game using the new dictionary format.

**Files:**
- Rewrite: `src/games/vocab.ts`

**Step 1: Write the new `vocab.ts`**

Key changes from the old version:
- `WordEntry` becomes `DictEntry` with `{word, pos, definition, example}`
- Load `dict-{lang}.json` instead of `words-{lang}.json`
- `CueType` is just `"definition"` (examples are optional bonus)
- Replace `handleSubmit` text matching with `handleChoice` button click
- New `buildSessionQueue` with 30% new / 70% review split
- New `pickDistractors` using Levenshtein from `vocab-srs.ts`
- `renderRound` shows 4 buttons instead of text input

```typescript
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

let lang = localStorage.getItem("brainbout:vocab-lang") ?? "no";
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
  const url = `${base}dict-${lang}.json`;
  const resp = await fetch(url);
  dict = (await resp.json()) as DictEntry[];
  allWords = dict.map((d) => d.word);
}

function pickDistractors(correctWord: string): string[] {
  // Find words with low edit distance to the correct word
  const scored: Array<{ word: string; dist: number }> = [];
  const correctLen = correctWord.length;

  for (const w of allWords) {
    if (w === correctWord) continue;
    // Quick length filter: skip words too different in length
    if (Math.abs(w.length - correctLen) > 3) continue;
    const dist = levenshtein(w.toLowerCase(), correctWord.toLowerCase());
    if (dist > 0 && dist <= 5) {
      scored.push({ word: w, dist });
    }
    // Stop early once we have enough candidates
    if (scored.length >= 50) break;
  }

  // Sort by distance (closest first), take 3
  scored.sort((a, b) => a.dist - b.dist);
  const picks = scored.slice(0, NUM_CHOICES - 1).map((s) => s.word);

  // Fallback: if not enough fuzzy matches, pick random words of similar length
  while (picks.length < NUM_CHOICES - 1) {
    const candidates = allWords.filter(
      (w) =>
        w !== correctWord &&
        !picks.includes(w) &&
        Math.abs(w.length - correctLen) <= 2,
    );
    if (candidates.length === 0) break;
    picks.push(candidates[Math.floor(Math.random() * candidates.length)]);
  }

  // Last resort: any random words
  while (picks.length < NUM_CHOICES - 1) {
    const w = allWords[Math.floor(Math.random() * allWords.length)];
    if (w !== correctWord && !picks.includes(w)) {
      picks.push(w);
    }
  }

  return picks;
}

function buildSessionQueue(): void {
  const today = todayString();
  const dueStrs = getDueWords(lang, allWords, today);
  const dueSet = new Set(dueStrs);

  // Separate into review (seen & due) and new (never seen)
  const review = shuffleArray(
    dict.filter((d) => dueSet.has(d.word) && getSeenWords().has(d.word)),
  );
  const fresh = shuffleArray(
    dict.filter((d) => !getSeenWords().has(d.word)),
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

  // If still not enough, fill with any due words
  if (sessionQueue.length < SESSION_SIZE) {
    const used = new Set(sessionQueue.map((e) => e.word));
    const filler = shuffleArray(dict.filter((d) => !used.has(d.word)));
    sessionQueue.push(...filler.slice(0, SESSION_SIZE - sessionQueue.length));
  }
}

function getSeenWords(): Set<string> {
  const seen = new Set<string>();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(`brainbout:vocab:${lang}:`)) {
      seen.add(key.slice(`brainbout:vocab:${lang}:`.length));
    }
  }
  return seen;
}

function getCueText(entry: DictEntry): string {
  if (entry.example) {
    return `${entry.definition}\n\n"${entry.example}"`;
  }
  return entry.definition;
}

function handleChoice(chosen: string): void {
  if (inputLocked || !currentEntry) return;
  inputLocked = true;

  const correct = chosen === currentEntry.word;
  const elapsed = Date.now() - roundStart;
  const today = todayString();

  // Highlight buttons
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
    setTimeout(nextRound, WRONG_PAUSE_MS);
  }
}

function renderRound(): void {
  if (!currentEntry) return;

  const cueText = getCueText(currentEntry);
  const cueLines = cueText.split("\n\n");
  const defHtml = cueLines[0];
  const exHtml = cueLines[1] ? `<div class="cue-example">${cueLines[1]}</div>` : "";

  const buttonsHtml = choices
    .map(
      (word) =>
        `<button class="choice-btn" data-word="${word}">${word}</button>`,
    )
    .join("");

  game.innerHTML = `
    <div class="timer">${String(currentRemaining)}s</div>
    <div class="cue-type">Definition</div>
    <div class="cue-text">${defHtml}</div>
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

document.getElementById("lang-btn")?.addEventListener("click", () => {
  lang = lang === "no" ? "en" : "no";
  localStorage.setItem("brainbout:vocab-lang", lang);
  updateLangButton();
  void startGame();
});

updateLangButton();
void startGame();

initTheme();
wireToggle();
```

**Step 2: Verify build**

```bash
npx vite build
```

Expected: Build succeeds with no type errors.

**Step 3: Commit**

```bash
git add src/games/vocab.ts
git commit -m "feat: rewrite Word Recall as multiple-choice with full dictionary"
```

---

### Task 5: Rewrite CSS for multiple-choice buttons

Replace the text input styles with a multiple-choice button grid.

**Files:**
- Rewrite: `src/games/vocab.css`

**Step 1: Rewrite the CSS**

Keep: `.game`, `.timer`, `.cue-type`, `.cue-text`, `.feedback`, `.score-display`, `.streak-display`, `.lang-toggle`, `.result`, `@keyframes fade-in-up`

Remove: `.vocab-input` and its states (`.correct`, `.close`, `.wrong`)

Add: `.choices` grid, `.choice-btn` with `.correct`/`.wrong` states, `.cue-example`

```css
@keyframes fade-in-up {
  from {
    transform: translateY(8px);
    opacity: 0;
  }
}

@media (--motion-reduce) {
  @keyframes fade-in-up {
    from {
      opacity: 0;
    }
  }
}

.game {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: center;

  padding-top: 1rem;
}

.timer {
  padding: 0.25rem 0.75rem;
  border-radius: 6px;

  font-size: 1.5rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--ctp-text);

  background: var(--ctp-surface0);
  box-shadow: var(--ctp-shadow);

  transition:
    color 0.3s ease,
    background-color 0.25s ease;
}

.cue-type {
  font-size: 0.875rem;
  color: var(--ctp-subtext0);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.cue-text {
  max-width: 360px;
  min-height: 3rem;

  font-size: 1.125rem;
  line-height: 1.5;
  text-align: center;
}

.cue-example {
  max-width: 360px;

  font-size: 0.95rem;
  font-style: italic;
  line-height: 1.4;
  color: var(--ctp-subtext0);
  text-align: center;
}

.choices {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;

  width: 100%;
  max-width: 360px;
}

.choice-btn {
  cursor: pointer;

  padding: 0.625rem 0.75rem;
  border: 2px solid var(--ctp-surface1);
  border-radius: 6px;

  font-size: 1rem;
  color: var(--ctp-text);
  text-align: center;
  word-break: break-word;

  background: var(--ctp-surface0);
  box-shadow: var(--ctp-shadow);

  transition:
    border-color 0.15s ease,
    background-color 0.15s ease,
    transform 0.1s ease;

  &:hover:not(:disabled) {
    border-color: var(--game-accent, var(--ctp-blue));
    transform: translateY(-1px);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &:focus-visible {
    outline: none;
    box-shadow: var(--ctp-focus-ring);
  }

  &:disabled {
    cursor: default;
    opacity: 0.7;
  }

  &.correct {
    border-color: var(--ctp-green);
    color: var(--ctp-green);
    background: color-mix(in srgb, var(--ctp-green) 10%, var(--ctp-surface0));
    opacity: 1;
  }

  &.wrong {
    border-color: var(--ctp-red);
    color: var(--ctp-red);
    background: color-mix(in srgb, var(--ctp-red) 10%, var(--ctp-surface0));
    opacity: 1;
  }
}

.feedback {
  min-height: 1.5rem;
  font-size: 1rem;

  &.correct {
    color: var(--ctp-green);
  }

  &.wrong {
    color: var(--ctp-red);
  }
}

.score-display {
  font-size: 1.125rem;
  color: var(--ctp-subtext0);
  transition: color 0.25s ease;
}

.streak-display {
  font-size: 0.875rem;
  color: var(--ctp-subtext0);
  transition: color 0.25s ease;
}

.lang-toggle {
  cursor: pointer;

  padding: 0.25rem 0.5rem;
  border: 1px solid var(--ctp-surface1);
  border-radius: 6px;

  font-size: 0.75rem;
  color: var(--ctp-subtext0);

  background: none;

  transition:
    border-color 0.15s ease,
    color 0.15s ease,
    background-color 0.15s ease;

  &:hover {
    border-color: var(--game-accent, var(--ctp-blue));
    color: var(--ctp-text);
  }

  &:active {
    background: var(--ctp-surface0);
  }

  &:focus-visible {
    outline: none;
    box-shadow: var(--ctp-focus-ring);
  }
}

.result {
  padding: 2rem 0;
  text-align: center;

  & .final-score {
    margin-bottom: 0.5rem;

    font-size: 2rem;
    font-weight: 700;
    color: var(--ctp-green);

    animation: fade-in-up 0.4s ease both;
  }

  & .result-label {
    color: var(--ctp-subtext0);
    animation: fade-in-up 0.4s ease 0.1s both;
  }

  & button {
    cursor: pointer;

    display: inline-flex;
    gap: 0.5rem;
    align-items: center;

    margin-top: 1rem;
    padding: 0.75rem 2rem;
    border: none;
    border-radius: 6px;

    font-size: 1rem;
    font-weight: 600;
    color: var(--ctp-mantle);

    background: var(--game-accent, var(--ctp-blue));
    box-shadow: var(--ctp-shadow);

    transition:
      box-shadow 0.15s ease,
      transform 0.1s ease;
    animation: fade-in-up 0.4s ease 0.2s both;
  }

  & button:hover {
    transform: translateY(-1px);
    box-shadow: var(--ctp-shadow-lg);
  }

  & button:active {
    transform: translateY(0);
    box-shadow: none;
  }

  & button:focus-visible {
    outline: none;
    box-shadow: var(--ctp-focus-ring);
  }
}
```

**Step 2: Verify build**

```bash
npx vite build
```

Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/games/vocab.css
git commit -m "feat: multiple-choice button grid CSS for Word Recall"
```

---

### Task 6: Update README

Update the Word Recall description in README to reflect the new multiple-choice format and data source.

**Files:**
- Modify: `README.md`

**Step 1: Update the Word Recall line**

Change:
```markdown
- <img src="docs/icons/book-open.svg" width="16" /> **Word Recall** — vocabulary with spaced repetition (120s)
```

To:
```markdown
- <img src="docs/icons/book-open.svg" width="16" /> **Word Recall** — multiple-choice vocabulary with spaced repetition (120s)
```

**Step 2: Add data attribution section**

After the "Quick start" section, add:

```markdown
## Data sources

- **Word Recall dictionaries** — [Wiktionary](https://en.wiktionary.org/) via [kaikki.org/wiktextract](https://kaikki.org/), licensed under [CC-BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) and [GFDL](https://www.gnu.org/licenses/fdl-1.3.html)
```

**Step 3: Update "No internet required" claim**

The tagline says "No accounts, no ads, no internet required." This remains true since dictionaries are shipped as static assets. No change needed.

**Step 4: Commit**

```bash
git add README.md
git commit -m "docs: update README for Word Recall v2 and data attribution"
```

---

### Task 7: Final verification

**Step 1: Run all tests**

```bash
npx vitest run
```

Expected: All pass (SRS tests + dict validation tests).

**Step 2: Run linting**

```bash
npm run lint && npm run lint:css
```

Expected: No errors.

**Step 3: Build**

```bash
npx vite build
```

Expected: Build succeeds.

**Step 4: Manual smoke test**

```bash
npm run dev
```

Open Word Recall in browser. Verify:
- Dictionary loads (may take a moment for EN)
- Definition shows as cue
- 4 multiple-choice buttons appear with similar-looking words
- Clicking correct word: green highlight, score increases, streak counts
- Clicking wrong word: red highlight on chosen, green on correct, streak resets
- Timer counts down, game ends at 0
- Language toggle works (EN/NO)
- Score displays on result screen

**Step 5: Commit any remaining fixes**

```bash
git add -A
git commit -m "chore: final verification for Word Recall v2"
```
