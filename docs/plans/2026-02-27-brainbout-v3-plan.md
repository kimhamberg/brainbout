# Brainbout v3 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Replace Memory Match and Stroop with Reaction Grid and Word Recall; rename Blitz to Rapid with 15+10 time control.

**Architecture:** Update the progress module for new game IDs (`rapid`, `reaction`, `vocab`, `math`), delete old games, rename blitz→rapid with new constants, create two new game modules following existing patterns (timer-based games with DOM rendering, event delegation, skip support). Word Recall adds a spaced repetition system in localStorage and curated JSON word files.

**Tech Stack:** TypeScript, Vite (multi-page), vitest, Chessground + chessops + Stockfish WASM (rapid), localStorage (spaced repetition)

**Design doc:** `docs/plans/2026-02-27-brainbout-v3-design.md`

---

### Task 1: Update progress module for new game IDs

Change the GAMES array to the new lineup and update all tests.

**Files:**

- Modify: `src/shared/progress.ts`
- Modify: `test/progress.test.ts`

**Step 1: Update `src/shared/progress.ts`**

Change line 1 from:

```typescript
export const GAMES = ["blitz", "memory", "stroop", "math"] as const;
```

to:

```typescript
export const GAMES = ["rapid", "reaction", "vocab", "math"] as const;
```

**Step 2: Update `test/progress.test.ts`**

Replace the entire file with:

```typescript
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import {
  getStreak,
  recordScore,
  getDailyScore,
  getBest,
  isDayComplete,
  isSkipped,
  GAMES,
  SKIP_SCORE,
} from "../src/shared/progress";

beforeEach(() => {
  localStorage.clear();
});

describe("recordScore", () => {
  it("saves a score for a game on a date", () => {
    recordScore("rapid", 1, "2026-02-27");
    expect(getDailyScore("rapid", "2026-02-27")).toBe(1);
  });

  it("returns null for unrecorded scores", () => {
    expect(getDailyScore("rapid", "2026-02-27")).toBeNull();
  });
});

describe("getBest", () => {
  it("returns null when no scores recorded", () => {
    expect(getBest("vocab")).toBeNull();
  });

  it("tracks personal best across sessions", () => {
    recordScore("vocab", 5, "2026-02-27");
    recordScore("vocab", 8, "2026-02-28");
    recordScore("vocab", 3, "2026-03-01");
    expect(getBest("vocab")).toBe(8);
  });

  it("does not update best when score is skip sentinel", () => {
    recordScore("vocab", 5, "2026-02-27");
    recordScore("vocab", SKIP_SCORE, "2026-02-28");
    expect(getBest("vocab")).toBe(5);
  });
});

describe("isDayComplete", () => {
  it("returns false when no games played", () => {
    expect(isDayComplete("2026-02-27")).toBe(false);
  });

  it("returns false when some games played", () => {
    recordScore("rapid", 1, "2026-02-27");
    recordScore("reaction", 3, "2026-02-27");
    expect(isDayComplete("2026-02-27")).toBe(false);
  });

  it("returns true when all four games played", () => {
    for (const game of GAMES) {
      recordScore(game, 5, "2026-02-27");
    }
    expect(isDayComplete("2026-02-27")).toBe(true);
  });

  it("counts skipped games as played", () => {
    recordScore("rapid", SKIP_SCORE, "2026-02-27");
    recordScore("reaction", SKIP_SCORE, "2026-02-27");
    recordScore("vocab", SKIP_SCORE, "2026-02-27");
    recordScore("math", SKIP_SCORE, "2026-02-27");
    expect(isDayComplete("2026-02-27")).toBe(true);
  });
});

describe("isSkipped", () => {
  it("returns true when score is skip sentinel", () => {
    recordScore("vocab", SKIP_SCORE, "2026-02-27");
    expect(isSkipped("vocab", "2026-02-27")).toBe(true);
  });

  it("returns false for real scores", () => {
    recordScore("vocab", 5, "2026-02-27");
    expect(isSkipped("vocab", "2026-02-27")).toBe(false);
  });

  it("returns false when not played", () => {
    expect(isSkipped("vocab", "2026-02-27")).toBe(false);
  });
});

describe("getStreak", () => {
  it("returns 0 with no history", () => {
    expect(getStreak("2026-02-27")).toBe(0);
  });

  it("returns 1 when today is complete", () => {
    for (const game of GAMES) {
      recordScore(game, 5, "2026-02-27");
    }
    expect(getStreak("2026-02-27")).toBe(1);
  });

  it("counts consecutive completed days", () => {
    for (const date of ["2026-02-25", "2026-02-26", "2026-02-27"]) {
      for (const game of GAMES) {
        recordScore(game, 5, date);
      }
    }
    expect(getStreak("2026-02-27")).toBe(3);
  });

  it("breaks streak on missed day", () => {
    for (const date of ["2026-02-25", "2026-02-27"]) {
      for (const game of GAMES) {
        recordScore(game, 5, date);
      }
    }
    expect(getStreak("2026-02-27")).toBe(1);
  });
});
```

**Step 3: Run tests**

Run: `npx vitest run test/progress.test.ts`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add src/shared/progress.ts test/progress.test.ts
git commit -m "refactor: update progress module for v3 game IDs"
```

---

### Task 2: Delete old games (Memory Match and Stroop)

Remove the game files that are being replaced.

**Files:**

- Delete: `src/games/memory.ts`
- Delete: `src/games/memory.css`
- Delete: `games/memory.html`
- Delete: `test/memory.test.ts`
- Delete: `src/games/stroop.ts`
- Delete: `src/games/stroop.css`
- Delete: `games/stroop.html`
- Delete: `test/stroop.test.ts`

**Step 1: Delete all files**

```bash
rm src/games/memory.ts src/games/memory.css games/memory.html test/memory.test.ts
rm src/games/stroop.ts src/games/stroop.css games/stroop.html test/stroop.test.ts
```

**Step 2: Run tests to verify remaining pass**

Run: `npx vitest run`
Expected: Tests pass (progress, timer, chess960, math, blitz, engine tests remain)

**Step 3: Commit**

```bash
git add -A
git commit -m "refactor: remove Memory Match and Stroop games"
```

---

### Task 3: Rename Blitz to Rapid

Rename all blitz files, update time control constants, and update references.

**Files:**

- Rename: `src/games/blitz.ts` → `src/games/rapid.ts`
- Rename: `src/games/blitz.css` → `src/games/rapid.css`
- Rename: `games/blitz.html` → `games/rapid.html`
- Rename: `test/blitz.test.ts` → `test/rapid.test.ts`
- Modify: `vite.config.ts`

**Step 1: Rename files**

```bash
git mv src/games/blitz.ts src/games/rapid.ts
git mv src/games/blitz.css src/games/rapid.css
git mv games/blitz.html games/rapid.html
git mv test/blitz.test.ts test/rapid.test.ts
```

**Step 2: Update `src/games/rapid.ts`**

Make these changes:

1. Change time constants (line 80-81):

```typescript
const INITIAL_MS = 15 * 60 * 1000;
const INCREMENT_MS = 10 * 1000;
```

2. Change `recordScore("blitz"` to `recordScore("rapid"` (two occurrences — in `finishGame` and skip handler)

3. Change the CSS class `blitz-board` to `rapid-board` (two occurrences — in `renderGame`)

4. Change the low-time threshold from `ms < 30000` to `ms < 60000` (in the `onTick` callback)

**Step 3: Update `src/games/rapid.css`**

Change `.blitz-board` to `.rapid-board` (two occurrences — the rule and the media query).

**Step 4: Update `games/rapid.html`**

Replace with:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0, viewport-fit=cover"
    />
    <title>Brainbout — Chess960 Rapid</title>
    <link rel="stylesheet" href="/src/style.css" />
    <link rel="stylesheet" href="/src/games/rapid.css" />
  </head>
  <body>
    <div id="app">
      <header>
        <h1>Chess960 Rapid</h1>
        <button class="skip-btn" id="skip-btn">Skip</button>
      </header>
      <main id="game"></main>
    </div>
    <script type="module" src="/src/games/rapid.ts"></script>
  </body>
</html>
```

**Step 5: Update `test/rapid.test.ts`**

Change the import path from `"../src/games/blitz"` to `"../src/games/rapid"`.

**Step 6: Run tests**

Run: `npx vitest run test/rapid.test.ts`
Expected: All 3 clock tests PASS

**Step 7: Commit**

```bash
git add -A
git commit -m "refactor: rename blitz to rapid with 15+10 time control"
```

---

### Task 4: Vite config and page skeletons for new games

Update Vite config for the new pages, create placeholder HTML and TS files.

**Files:**

- Modify: `vite.config.ts`
- Create: `games/reaction.html`
- Create: `games/vocab.html`
- Create: `src/games/reaction.ts` (placeholder)
- Create: `src/games/vocab.ts` (placeholder)

**Step 1: Update `vite.config.ts`**

Replace the `input` object with:

```typescript
input: {
  main: resolve(__dirname, "index.html"),
  rapid: resolve(__dirname, "games/rapid.html"),
  reaction: resolve(__dirname, "games/reaction.html"),
  vocab: resolve(__dirname, "games/vocab.html"),
  math: resolve(__dirname, "games/math.html"),
},
```

**Step 2: Create `games/reaction.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0, viewport-fit=cover"
    />
    <title>Brainbout — Reaction Grid</title>
    <link rel="stylesheet" href="/src/style.css" />
  </head>
  <body>
    <div id="app">
      <header>
        <h1>Reaction Grid</h1>
        <button class="skip-btn" id="skip-btn">Skip</button>
      </header>
      <main id="game"></main>
    </div>
    <script type="module" src="/src/games/reaction.ts"></script>
  </body>
</html>
```

**Step 3: Create `games/vocab.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0, viewport-fit=cover"
    />
    <title>Brainbout — Word Recall</title>
    <link rel="stylesheet" href="/src/style.css" />
  </head>
  <body>
    <div id="app">
      <header>
        <h1>Word Recall</h1>
        <button class="skip-btn" id="skip-btn">Skip</button>
      </header>
      <main id="game"></main>
    </div>
    <script type="module" src="/src/games/vocab.ts"></script>
  </body>
</html>
```

**Step 4: Create placeholder entry points**

`src/games/reaction.ts`:

```typescript
console.log("reaction loaded");
```

`src/games/vocab.ts`:

```typescript
console.log("vocab loaded");
```

**Step 5: Verify build**

Run: `npx vite build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add vite.config.ts games/reaction.html games/vocab.html src/games/reaction.ts src/games/vocab.ts
git commit -m "feat: Vite config and page skeletons for reaction and vocab"
```

---

### Task 5: Update hub page for new games

**Files:**

- Modify: `src/hub.ts`

**Step 1: Replace `src/hub.ts`**

```typescript
import {
  GAMES,
  todayString,
  getStreak,
  getDailyScore,
  nextGame,
  isSkipped,
} from "./shared/progress";

const GAME_LABELS: Record<string, string> = {
  rapid: "Chess960 Rapid",
  reaction: "Reaction Grid",
  vocab: "Word Recall",
  math: "Quick Math",
};

const GAME_URLS: Record<string, string> = {
  rapid: "games/rapid.html",
  reaction: "games/reaction.html",
  vocab: "games/vocab.html",
  math: "games/math.html",
};

function formatScore(game: string, score: number): string {
  if (game === "rapid") {
    if (score === 1) return "Won";
    if (score === 0.5) return "Draw";
    return "Lost";
  }
  return `Score: ${String(score)}`;
}

function render(): void {
  const hub = document.getElementById("hub");
  if (!hub) return;

  const today = todayString();
  const streak = getStreak(today);
  const next = nextGame(today);

  let html = "";

  html += `<div id="streak"><strong>${String(streak)}-day streak</strong></div>`;
  html += `<h2>Today's Workout</h2>`;
  html += `<div class="game-list">`;

  for (const game of GAMES) {
    const score = getDailyScore(game, today);
    const done = score !== null;
    const skipped = isSkipped(game, today);
    const current = game === next;
    const cls = done ? "done" : current ? "current" : "";

    html += `<div class="game-card ${cls}">`;
    html += `<span class="game-name">${GAME_LABELS[game]}</span>`;
    if (skipped) {
      html += `<span class="game-score">Skipped</span>`;
    } else if (done) {
      html += `<span class="game-score">${formatScore(game, score)} <span class="game-check">✓</span></span>`;
    }
    html += `</div>`;
  }

  html += `</div>`;

  if (next !== null) {
    html += `<button id="start-btn">${streak === 0 && next === GAMES[0] ? "Start" : "Next"}</button>`;
  } else {
    html += `<div class="summary">All done for today!</div>`;
  }

  hub.innerHTML = html;

  const btn = document.getElementById("start-btn");
  if (btn && next !== null) {
    btn.addEventListener("click", () => {
      window.location.href = GAME_URLS[next];
    });
  }
}

render();
```

**Step 2: Verify build**

Run: `npx vite build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/hub.ts
git commit -m "feat: hub page with v3 game labels and URLs"
```

---

### Task 6: Reaction Grid game

Fast-attention target-clicking game. 60 seconds, 4×4 grid.

**Files:**

- Modify: `src/games/reaction.ts` — full implementation
- Create: `src/games/reaction.css`
- Modify: `games/reaction.html` — add CSS link
- Create: `test/reaction.test.ts`

**Step 1: Write failing tests**

Create `test/reaction.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { pickNextCell, getVisibilityMs } from "../src/games/reaction";

describe("pickNextCell", () => {
  it("returns a number between 0 and gridSize-1", () => {
    for (let i = 0; i < 50; i++) {
      const cell = pickNextCell(16, -1);
      expect(cell).toBeGreaterThanOrEqual(0);
      expect(cell).toBeLessThan(16);
    }
  });

  it("never returns the same cell as previous", () => {
    for (let i = 0; i < 50; i++) {
      const cell = pickNextCell(16, 5);
      expect(cell).not.toBe(5);
    }
  });
});

describe("getVisibilityMs", () => {
  it("starts at 1200ms for 0 hits", () => {
    expect(getVisibilityMs(0)).toBe(1200);
  });

  it("decreases by 50ms every 3 hits", () => {
    expect(getVisibilityMs(3)).toBe(1150);
    expect(getVisibilityMs(6)).toBe(1100);
    expect(getVisibilityMs(9)).toBe(1050);
  });

  it("floors at 400ms", () => {
    expect(getVisibilityMs(100)).toBe(400);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run test/reaction.test.ts`
Expected: FAIL

**Step 3: Create `src/games/reaction.css`**

```css
#game {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding-top: 1rem;
}

.timer {
  font-size: 1.5rem;
  color: var(--ctp-subtext0);
}

.reaction-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  width: 100%;
  max-width: 320px;
}

.reaction-cell {
  aspect-ratio: 1;
  background: var(--ctp-surface0);
  border-radius: 4px;
  cursor: pointer;
  transition: transform 0.1s;
}

.reaction-cell.active {
  background: var(--ctp-blue);
  transform: scale(1.05);
}

.reaction-cell.hit {
  background: var(--ctp-green);
}

.score-display {
  font-size: 1.1rem;
  color: var(--ctp-subtext0);
}

.result {
  text-align: center;
  padding: 2rem 0;
}

.result .final-score {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.result button {
  margin-top: 1rem;
  padding: 0.75rem 2rem;
  background: var(--ctp-blue);
  color: var(--ctp-mantle);
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
}
```

**Step 4: Add CSS link to `games/reaction.html`**

In the `<head>` section, add after the existing stylesheet link:

```html
<link rel="stylesheet" href="/src/games/reaction.css" />
```

**Step 5: Implement `src/games/reaction.ts`**

```typescript
import { createTimer } from "../shared/timer";
import { recordScore, todayString, SKIP_SCORE } from "../shared/progress";
import * as sound from "../shared/sounds";

const GRID_SIZE = 16;
const INITIAL_VISIBILITY_MS = 1200;
const RAMP_INTERVAL = 3;
const RAMP_STEP_MS = 50;
const FLOOR_MS = 400;
const HIT_FLASH_MS = 100;

export function pickNextCell(gridSize: number, previous: number): number {
  let next: number;
  do {
    next = Math.floor(Math.random() * gridSize);
  } while (next === previous);
  return next;
}

export function getVisibilityMs(hits: number): number {
  const reduction = Math.floor(hits / RAMP_INTERVAL) * RAMP_STEP_MS;
  return Math.max(FLOOR_MS, INITIAL_VISIBILITY_MS - reduction);
}

const DURATION = 60;
const game = document.getElementById("game");
if (!game) throw new Error("Missing #game element");

let score = 0;
let activeCell = -1;
let targetTimeout: ReturnType<typeof setTimeout> | null = null;
let currentRemaining = DURATION;
let timerRef: ReturnType<typeof createTimer> | null = null;
let gameActive = false;

function renderGrid(): void {
  game.innerHTML = `
    <div class="timer">${String(currentRemaining)}s</div>
    <div class="reaction-grid">
      ${Array.from(
        { length: GRID_SIZE },
        (_, i) =>
          `<div class="reaction-cell${i === activeCell ? " active" : ""}" data-cell="${String(i)}"></div>`,
      ).join("")}
    </div>
    <div class="score-display">Score: ${String(score)}</div>
  `;
}

function clearTarget(): void {
  if (targetTimeout !== null) {
    clearTimeout(targetTimeout);
    targetTimeout = null;
  }
}

function showTarget(): void {
  if (!gameActive) return;
  activeCell = pickNextCell(GRID_SIZE, activeCell);
  renderGrid();

  const visMs = getVisibilityMs(score);
  targetTimeout = setTimeout(() => {
    activeCell = -1;
    renderGrid();
    setTimeout(showTarget, 200);
  }, visMs);
}

function handleCellClick(cellIndex: number): void {
  if (!gameActive || cellIndex !== activeCell) return;

  clearTarget();
  score++;
  sound.playMove();

  const cell = game.querySelector(`[data-cell="${String(cellIndex)}"]`);
  if (cell) {
    cell.classList.remove("active");
    cell.classList.add("hit");
  }

  const scoreEl = game.querySelector(".score-display");
  if (scoreEl) scoreEl.textContent = `Score: ${String(score)}`;

  setTimeout(() => {
    showTarget();
  }, HIT_FLASH_MS);
}

function showResult(): void {
  recordScore("reaction", score, todayString());

  game.innerHTML = `
    <div class="result">
      <div class="final-score">${String(score)}</div>
      <div>hits in ${String(DURATION)} seconds</div>
      <button id="back-btn">Back to Hub</button>
    </div>
  `;

  sound.playVictory();

  document.getElementById("back-btn")?.addEventListener("click", () => {
    window.location.href = "../";
  });
}

game.addEventListener("click", (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>(".reaction-cell");
  if (el?.dataset.cell != null) {
    handleCellClick(Number(el.dataset.cell));
  }
});

document.getElementById("skip-btn")?.addEventListener("click", () => {
  gameActive = false;
  clearTarget();
  if (timerRef) timerRef.stop();
  recordScore("reaction", SKIP_SCORE, todayString());
  window.location.href = "../";
});

timerRef = createTimer({
  seconds: DURATION,
  onTick: (remaining) => {
    currentRemaining = remaining;
    const el = game.querySelector(".timer");
    if (el) el.textContent = `${String(remaining)}s`;
  },
  onDone: () => {
    gameActive = false;
    clearTarget();
    showResult();
  },
});

gameActive = true;
renderGrid();
showTarget();
timerRef.start();
```

**Step 6: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 7: Commit**

```bash
git add src/games/reaction.ts src/games/reaction.css games/reaction.html test/reaction.test.ts
git commit -m "feat: Reaction Grid game with adaptive speed ramp"
```

---

### Task 7: Create word list JSON files

Create the curated word lists for Norwegian and English.

**Files:**

- Create: `public/words-no.json` — ~50 Norwegian words (starter set, expandable)
- Create: `public/words-en.json` — ~50 English words (starter set, expandable)

**Step 1: Create `public/words-no.json`**

Create the file with ~50 advanced Norwegian vocabulary words. Each entry has: `word`, `definition`, `cloze`, `synonyms`. Example format:

```json
[
  {
    "word": "tapper",
    "definition": "Som viser mot og standhaftighet i farlige situasjoner",
    "cloze": "Soldaten var svært ___ i kamp.",
    "synonyms": ["modig", "djerv"]
  },
  {
    "word": "vedvarende",
    "definition": "Som fortsetter over lang tid uten avbrudd",
    "cloze": "Regnet var ___ gjennom hele natten.",
    "synonyms": ["langvarig", "kontinuerlig"]
  }
]
```

Include 50 words covering varied difficulty and domains. Words should be real Norwegian words that educated speakers would benefit from knowing. Ensure every cloze sentence has exactly one `___` placeholder.

**Step 2: Create `public/words-en.json`**

Same format but with ~50 advanced English vocabulary words (GRE/SAT level). Example:

```json
[
  {
    "word": "ephemeral",
    "definition": "Lasting for a very short time",
    "cloze": "The beauty of cherry blossoms is ___.",
    "synonyms": ["fleeting", "transient"]
  }
]
```

**Step 3: Add to `.prettierignore`**

Add these lines to `.prettierignore`:

```
public/words-no.json
public/words-en.json
```

**Step 4: Commit**

```bash
git add public/words-no.json public/words-en.json .prettierignore
git commit -m "feat: curated word lists for Norwegian and English"
```

---

### Task 8: Word Recall game — spaced repetition module

Create the Leitner spaced repetition logic as testable pure functions, separate from the game UI.

**Files:**

- Create: `src/games/vocab-srs.ts` — spaced repetition logic
- Create: `test/vocab-srs.test.ts`

**Step 1: Write failing tests**

Create `test/vocab-srs.test.ts`:

```typescript
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import {
  getWordState,
  recordAnswer,
  getDueWords,
  levenshtein,
  BOX_INTERVALS,
} from "../src/games/vocab-srs";

beforeEach(() => {
  localStorage.clear();
});

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("hello", "hello")).toBe(0);
  });

  it("returns the length of the other string when one is empty", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
  });

  it("returns 1 for single character difference", () => {
    expect(levenshtein("cat", "bat")).toBe(1);
    expect(levenshtein("cat", "cats")).toBe(1);
    expect(levenshtein("cat", "ca")).toBe(1);
  });

  it("returns 2 for two character differences", () => {
    expect(levenshtein("kitten", "mitten")).toBe(1);
    expect(levenshtein("hello", "hallo")).toBe(1);
  });
});

describe("getWordState", () => {
  it("returns box 0 and past due for unknown words", () => {
    const state = getWordState("no", "tapper");
    expect(state.box).toBe(0);
    expect(state.nextDue).toBe("");
  });
});

describe("recordAnswer", () => {
  it("advances box on correct answer", () => {
    recordAnswer("no", "tapper", true, "2026-02-27");
    const state = getWordState("no", "tapper");
    expect(state.box).toBe(1);
    expect(state.nextDue).toBe("2026-02-28");
  });

  it("advances through boxes with correct answers", () => {
    recordAnswer("no", "tapper", true, "2026-02-27");
    recordAnswer("no", "tapper", true, "2026-02-28");
    const state = getWordState("no", "tapper");
    expect(state.box).toBe(2);
    expect(state.nextDue).toBe("2026-03-03");
  });

  it("resets to box 0 on wrong answer", () => {
    recordAnswer("no", "tapper", true, "2026-02-27");
    recordAnswer("no", "tapper", true, "2026-02-28");
    recordAnswer("no", "tapper", false, "2026-03-03");
    const state = getWordState("no", "tapper");
    expect(state.box).toBe(0);
  });

  it("caps at max box", () => {
    const maxBox = BOX_INTERVALS.length - 1;
    for (let i = 0; i <= maxBox + 2; i++) {
      recordAnswer(
        "no",
        "tapper",
        true,
        `2026-03-${String(i + 1).padStart(2, "0")}`,
      );
    }
    const state = getWordState("no", "tapper");
    expect(state.box).toBeLessThanOrEqual(maxBox);
  });
});

describe("getDueWords", () => {
  it("returns all words as due when none have state", () => {
    const allWords = ["tapper", "modig", "djerv"];
    const due = getDueWords("no", allWords, "2026-02-27");
    expect(due).toEqual(allWords);
  });

  it("excludes words not yet due", () => {
    recordAnswer("no", "tapper", true, "2026-02-27");
    const due = getDueWords("no", ["tapper", "modig"], "2026-02-27");
    expect(due).toEqual(["modig"]);
  });

  it("includes words that are due", () => {
    recordAnswer("no", "tapper", true, "2026-02-27");
    const due = getDueWords("no", ["tapper", "modig"], "2026-02-28");
    expect(due).toContain("tapper");
    expect(due).toContain("modig");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run test/vocab-srs.test.ts`
Expected: FAIL

**Step 3: Implement `src/games/vocab-srs.ts`**

```typescript
export const BOX_INTERVALS = [0, 1, 3, 7, 14, 30];

const PREFIX = "brainbout:vocab";

interface WordState {
  box: number;
  nextDue: string;
}

function stateKey(lang: string, word: string): string {
  return `${PREFIX}:${lang}:${word}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getWordState(lang: string, word: string): WordState {
  const raw = localStorage.getItem(stateKey(lang, word));
  if (raw === null) return { box: 0, nextDue: "" };
  return JSON.parse(raw) as WordState;
}

export function recordAnswer(
  lang: string,
  word: string,
  correct: boolean,
  today: string,
): void {
  if (correct) {
    const state = getWordState(lang, word);
    const newBox = Math.min(state.box + 1, BOX_INTERVALS.length - 1);
    const interval = BOX_INTERVALS[newBox];
    const nextDue = addDays(today, interval);
    localStorage.setItem(
      stateKey(lang, word),
      JSON.stringify({ box: newBox, nextDue }),
    );
  } else {
    localStorage.setItem(
      stateKey(lang, word),
      JSON.stringify({ box: 0, nextDue: "" }),
    );
  }
}

export function getDueWords(
  lang: string,
  allWords: string[],
  today: string,
): string[] {
  return allWords.filter((word) => {
    const state = getWordState(lang, word);
    return state.nextDue === "" || state.nextDue <= today;
  });
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => 0),
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[m][n];
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run test/vocab-srs.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/games/vocab-srs.ts test/vocab-srs.test.ts
git commit -m "feat: spaced repetition module with Leitner boxes"
```

---

### Task 9: Word Recall game — UI

Full Word Recall game implementation with cue display, text input, scoring, and language toggle.

**Files:**

- Modify: `src/games/vocab.ts` — full implementation
- Create: `src/games/vocab.css`
- Modify: `games/vocab.html` — add CSS link

**Step 1: Create `src/games/vocab.css`**

```css
#game {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding-top: 1rem;
}

.timer {
  font-size: 1.5rem;
  color: var(--ctp-subtext0);
}

.cue-type {
  font-size: 0.85rem;
  color: var(--ctp-subtext0);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.cue-text {
  font-size: 1.3rem;
  text-align: center;
  max-width: 320px;
  min-height: 3rem;
  line-height: 1.4;
}

.vocab-input {
  width: 100%;
  max-width: 280px;
  padding: 0.6rem 0.75rem;
  font-size: 1.1rem;
  background: var(--ctp-surface0);
  border: 2px solid var(--ctp-surface1);
  border-radius: 4px;
  color: var(--ctp-text);
  text-align: center;
  outline: none;
}

.vocab-input:focus {
  border-color: var(--ctp-blue);
}

.vocab-input.correct {
  border-color: var(--ctp-green);
}

.vocab-input.close {
  border-color: var(--ctp-yellow);
}

.vocab-input.wrong {
  border-color: var(--ctp-red);
}

.feedback {
  font-size: 1rem;
  min-height: 1.5rem;
}

.feedback.correct {
  color: var(--ctp-green);
}

.feedback.close {
  color: var(--ctp-yellow);
}

.feedback.wrong {
  color: var(--ctp-red);
}

.score-display {
  font-size: 1.1rem;
  color: var(--ctp-subtext0);
}

.streak-display {
  font-size: 0.9rem;
  color: var(--ctp-subtext0);
}

.lang-toggle {
  font-size: 0.75rem;
  color: var(--ctp-subtext0);
  background: none;
  border: 1px solid var(--ctp-surface1);
  border-radius: 4px;
  padding: 0.2rem 0.5rem;
  cursor: pointer;
}

.lang-toggle:hover {
  border-color: var(--ctp-blue);
  color: var(--ctp-text);
}

.result {
  text-align: center;
  padding: 2rem 0;
}

.result .final-score {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.result button {
  margin-top: 1rem;
  padding: 0.75rem 2rem;
  background: var(--ctp-blue);
  color: var(--ctp-mantle);
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
}
```

**Step 2: Add CSS link to `games/vocab.html`**

In the `<head>` section, add after the existing stylesheet link:

```html
<link rel="stylesheet" href="/src/games/vocab.css" />
```

Also add a language toggle button in the header, next to the skip button. Replace the `<header>` block:

```html
<header>
  <h1>Word Recall</h1>
  <div>
    <button class="lang-toggle" id="lang-btn">NO</button>
    <button class="skip-btn" id="skip-btn">Skip</button>
  </div>
</header>
```

**Step 3: Implement `src/games/vocab.ts`**

```typescript
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
    if (input) input.classList.add("correct");
    if (feedback) {
      feedback.classList.add("correct");
      feedback.textContent = `+${String(Math.floor(points))}`;
    }
    setTimeout(nextRound, 500);
  } else if (levenshtein(trimmed, target) <= CLOSE_THRESHOLD) {
    const bonus = speedBonus(elapsed);
    const mult = streakMultiplier();
    const points = (5 + bonus) * mult;
    score += points;
    sound.playMove();
    if (input) {
      input.classList.add("close");
      input.value = "";
      input.placeholder = `Type: ${currentWord.word}`;
    }
    if (feedback) {
      feedback.classList.add("close");
      feedback.textContent = `Close! +${String(Math.floor(points))} — retype correctly`;
    }
    inputLocked = false;
  } else {
    streak = 0;
    recordAnswer(lang, currentWord.word, false, today);
    sound.playCheck();
    if (input) {
      input.classList.add("wrong");
      input.disabled = true;
    }
    if (feedback) {
      feedback.classList.add("wrong");
      feedback.textContent = `Answer: ${currentWord.word}`;
    }
    setTimeout(nextRound, WRONG_PAUSE_MS);
  }
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

updateLangButton();
void startGame();
```

**Step 4: Verify build and tests**

Run: `npx vite build && npx vitest run`
Expected: Build succeeds, all tests pass

**Step 5: Commit**

```bash
git add src/games/vocab.ts src/games/vocab.css games/vocab.html
git commit -m "feat: Word Recall game with spaced repetition and language toggle"
```

---

### Task 10: Update README and clean up

**Files:**

- Modify: `README.md`

**Step 1: Update game descriptions**

Replace the game list with:

```
- **Chess960 Rapid** — 15+10 vs Stockfish
- **Reaction Grid** — fast-attention target clicking (60s)
- **Word Recall** — vocabulary with spaced repetition (120s)
- **Quick Math** — adaptive arithmetic (60s)
```

Update test count to reflect current number. Update stack section to mention Stockfish for rapid (not puzzles).

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README for v3 games"
```

---

### Task 11: Lint, format, and final verification

**Step 1: Run full lint suite**

```bash
npx eslint .
npx stylelint "src/**/*.css"
npx prettier --check "src/**/*.ts" "test/**/*.ts" "*.ts" "**/*.html" "**/*.css" --ignore-path .prettierignore
```

Fix any issues.

**Step 2: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass

**Step 3: Verify build**

```bash
npx vite build
```

Expected: Build succeeds

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "chore: lint, format, and final verification"
```
