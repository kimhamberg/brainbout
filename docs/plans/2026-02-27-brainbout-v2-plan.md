# Brainbout v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Replace puzzles with Chess960 blitz vs Stockfish, replace dual N-back with Memory Match, add skip button to all games.

**Architecture:** Swap two game modules (puzzles→blitz, nback→memory), update shared progress module for new game IDs and skip sentinel, add skip UI to all game pages, re-add Stockfish WASM for the blitz game.

**Tech Stack:** TypeScript, Vite (multi-page), Chessground + chessops (blitz), Stockfish WASM (blitz), vitest

**Design doc:** `docs/plans/2026-02-27-brainbout-v2-design.md`

---

### Task 1: Update progress module for new game IDs and skip support

Change the GAMES array and add skip sentinel support.

**Files:**

- Modify: `src/shared/progress.ts`
- Modify: `test/progress.test.ts`

**Step 1: Update tests**

Replace `test/progress.test.ts` with:

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
    recordScore("blitz", 1, "2026-02-27");
    expect(getDailyScore("blitz", "2026-02-27")).toBe(1);
  });

  it("returns null for unrecorded scores", () => {
    expect(getDailyScore("blitz", "2026-02-27")).toBeNull();
  });
});

describe("getBest", () => {
  it("returns null when no scores recorded", () => {
    expect(getBest("stroop")).toBeNull();
  });

  it("tracks personal best across sessions", () => {
    recordScore("stroop", 5, "2026-02-27");
    recordScore("stroop", 8, "2026-02-28");
    recordScore("stroop", 3, "2026-03-01");
    expect(getBest("stroop")).toBe(8);
  });

  it("does not update best when score is skip sentinel", () => {
    recordScore("stroop", 5, "2026-02-27");
    recordScore("stroop", SKIP_SCORE, "2026-02-28");
    expect(getBest("stroop")).toBe(5);
  });
});

describe("isDayComplete", () => {
  it("returns false when no games played", () => {
    expect(isDayComplete("2026-02-27")).toBe(false);
  });

  it("returns false when some games played", () => {
    recordScore("blitz", 1, "2026-02-27");
    recordScore("memory", 3, "2026-02-27");
    expect(isDayComplete("2026-02-27")).toBe(false);
  });

  it("returns true when all four games played", () => {
    for (const game of GAMES) {
      recordScore(game, 5, "2026-02-27");
    }
    expect(isDayComplete("2026-02-27")).toBe(true);
  });

  it("counts skipped games as played", () => {
    recordScore("blitz", SKIP_SCORE, "2026-02-27");
    recordScore("memory", SKIP_SCORE, "2026-02-27");
    recordScore("stroop", SKIP_SCORE, "2026-02-27");
    recordScore("math", SKIP_SCORE, "2026-02-27");
    expect(isDayComplete("2026-02-27")).toBe(true);
  });
});

describe("isSkipped", () => {
  it("returns true when score is skip sentinel", () => {
    recordScore("stroop", SKIP_SCORE, "2026-02-27");
    expect(isSkipped("stroop", "2026-02-27")).toBe(true);
  });

  it("returns false for real scores", () => {
    recordScore("stroop", 5, "2026-02-27");
    expect(isSkipped("stroop", "2026-02-27")).toBe(false);
  });

  it("returns false when not played", () => {
    expect(isSkipped("stroop", "2026-02-27")).toBe(false);
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

**Step 2: Run tests to verify they fail**

Run: `npx vitest run test/progress.test.ts`
Expected: FAIL — `isSkipped` and `SKIP_SCORE` not exported, game IDs don't match

**Step 3: Update progress module**

Replace `src/shared/progress.ts` with:

```typescript
export const GAMES = ["blitz", "memory", "stroop", "math"] as const;
export type GameId = (typeof GAMES)[number];

export const SKIP_SCORE = -1;

const PREFIX = "brainbout";

function key(...parts: string[]): string {
  return `${PREFIX}:${parts.join(":")}`;
}

function formatDate(d: Date): string {
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getBest(game: GameId): number | null {
  const val = localStorage.getItem(key("best", game));
  return val === null ? null : Number(val);
}

export function recordScore(game: GameId, score: number, date: string): void {
  localStorage.setItem(key("daily", date, game), String(score));

  if (score !== SKIP_SCORE) {
    const prev = getBest(game);
    if (prev === null || score > prev) {
      localStorage.setItem(key("best", game), String(score));
    }
  }
}

export function getDailyScore(game: GameId, date: string): number | null {
  const val = localStorage.getItem(key("daily", date, game));
  return val === null ? null : Number(val);
}

export function isSkipped(game: GameId, date: string): boolean {
  return getDailyScore(game, date) === SKIP_SCORE;
}

export function isDayComplete(date: string): boolean {
  return GAMES.every((game) => getDailyScore(game, date) !== null);
}

export function getStreak(today: string): number {
  let streak = 0;
  const d = new Date(today + "T00:00:00");
  while (isDayComplete(formatDate(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export function todayString(): string {
  return formatDate(new Date());
}

export function nextGame(date: string): GameId | null {
  for (const game of GAMES) {
    if (getDailyScore(game, date) === null) {
      return game;
    }
  }
  return null;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run test/progress.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/shared/progress.ts test/progress.test.ts
git commit -m "refactor: update progress module for new game IDs and skip support"
```

---

### Task 2: Remove puzzles and nback games

Delete the old game files that are being replaced.

**Files:**

- Delete: `src/games/puzzles.ts`
- Delete: `src/games/puzzles.css`
- Delete: `games/puzzles.html`
- Delete: `test/puzzles.test.ts`
- Delete: `src/games/nback.ts`
- Delete: `src/games/nback.css`
- Delete: `games/nback.html`
- Delete: `test/nback.test.ts`
- Delete: `public/puzzles.json`
- Delete: `scripts/extract-puzzles.ts`

**Step 1: Delete all files**

```bash
rm src/games/puzzles.ts src/games/puzzles.css games/puzzles.html test/puzzles.test.ts
rm src/games/nback.ts src/games/nback.css games/nback.html test/nback.test.ts
rm public/puzzles.json scripts/extract-puzzles.ts
```

**Step 2: Verify remaining tests pass**

Run: `npx vitest run`
Expected: Tests pass (progress, timer, chess960, stroop, math — nback and puzzles tests deleted)

**Step 3: Commit**

```bash
git add -A
git commit -m "refactor: remove puzzles and nback games"
```

---

### Task 3: Vite multi-page config update and game page skeletons

Replace puzzles/nback page entries with blitz/memory, create HTML pages and placeholder TS files.

**Files:**

- Modify: `vite.config.ts`
- Create: `games/blitz.html`
- Create: `games/memory.html`
- Create: `src/games/blitz.ts` (placeholder)
- Create: `src/games/memory.ts` (placeholder)

**Step 1: Update `vite.config.ts`**

Replace with:

```typescript
import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        blitz: resolve(__dirname, "games/blitz.html"),
        memory: resolve(__dirname, "games/memory.html"),
        stroop: resolve(__dirname, "games/stroop.html"),
        math: resolve(__dirname, "games/math.html"),
      },
    },
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
```

Note: COOP/COEP headers added back for Stockfish WASM SharedArrayBuffer support in dev server.

**Step 2: Create `games/blitz.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0, viewport-fit=cover"
    />
    <title>Brainbout — Chess960 Blitz</title>
    <link rel="stylesheet" href="/src/style.css" />
  </head>
  <body>
    <div id="app">
      <header>
        <h1>Chess960 Blitz</h1>
      </header>
      <main id="game"></main>
    </div>
    <script type="module" src="/src/games/blitz.ts"></script>
  </body>
</html>
```

**Step 3: Create `games/memory.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0, viewport-fit=cover"
    />
    <title>Brainbout — Memory Match</title>
    <link rel="stylesheet" href="/src/style.css" />
  </head>
  <body>
    <div id="app">
      <header>
        <h1>Memory Match</h1>
      </header>
      <main id="game"></main>
    </div>
    <script type="module" src="/src/games/memory.ts"></script>
  </body>
</html>
```

**Step 4: Create placeholder entry points**

`src/games/blitz.ts`:
```typescript
console.log("blitz loaded");
```

`src/games/memory.ts`:
```typescript
console.log("memory loaded");
```

**Step 5: Verify build**

Run: `npx vite build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add vite.config.ts games/blitz.html games/memory.html src/games/blitz.ts src/games/memory.ts
git commit -m "feat: Vite config and page skeletons for blitz and memory"
```

---

### Task 4: Update hub page for new games, skip display, and blitz score format

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
  blitz: "Chess960 Blitz",
  memory: "Memory Match",
  stroop: "Stroop",
  math: "Quick Math",
};

const GAME_URLS: Record<string, string> = {
  blitz: "games/blitz.html",
  memory: "games/memory.html",
  stroop: "games/stroop.html",
  math: "games/math.html",
};

function formatScore(game: string, score: number): string {
  if (game === "blitz") {
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
    } else if (done && score !== null) {
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
git commit -m "feat: hub page with new game labels, skip display, blitz score format"
```

---

### Task 5: Add skip button to all game pages

Add a "Skip" link to every game page header. When clicked, it records SKIP_SCORE and navigates to hub.

**Files:**

- Modify: `games/stroop.html`
- Modify: `games/math.html`
- Modify: `games/blitz.html`
- Modify: `games/memory.html`
- Modify: `src/games/stroop.ts`
- Modify: `src/games/math.ts`
- Modify: `src/style.css` — add skip button style

**Step 1: Add skip button CSS to `src/style.css`**

Append to the end of `src/style.css`:

```css
header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.skip-btn {
  font-size: 0.85rem;
  color: var(--ctp-subtext0);
  background: none;
  border: 1px solid var(--ctp-surface1);
  border-radius: 4px;
  padding: 0.25rem 0.75rem;
  cursor: pointer;
}

.skip-btn:hover {
  border-color: var(--ctp-blue);
  color: var(--ctp-text);
}
```

**Step 2: Add skip button to each game HTML page**

In each game HTML page (`games/stroop.html`, `games/math.html`, `games/blitz.html`, `games/memory.html`), replace the `<header>` block with:

For `games/stroop.html`:
```html
      <header>
        <h1>Stroop</h1>
        <button class="skip-btn" id="skip-btn">Skip</button>
      </header>
```

For `games/math.html`:
```html
      <header>
        <h1>Quick Math</h1>
        <button class="skip-btn" id="skip-btn">Skip</button>
      </header>
```

For `games/blitz.html`:
```html
      <header>
        <h1>Chess960 Blitz</h1>
        <button class="skip-btn" id="skip-btn">Skip</button>
      </header>
```

For `games/memory.html`:
```html
      <header>
        <h1>Memory Match</h1>
        <button class="skip-btn" id="skip-btn">Skip</button>
      </header>
```

**Step 3: Add skip handler to stroop.ts**

Add these lines at the end of `src/games/stroop.ts` (before `timer.start()`):

```typescript
document.getElementById("skip-btn")?.addEventListener("click", () => {
  timer.stop();
  recordScore("stroop", SKIP_SCORE, todayString());
  window.location.href = "/";
});
```

Also add `SKIP_SCORE` to the import from progress:

```typescript
import { recordScore, todayString, SKIP_SCORE } from "../shared/progress";
```

**Step 4: Add skip handler to math.ts**

Same pattern — add `SKIP_SCORE` to import, add skip button listener at end (before `timer.start()`):

```typescript
import { recordScore, todayString, SKIP_SCORE } from "../shared/progress";
```

```typescript
document.getElementById("skip-btn")?.addEventListener("click", () => {
  timer.stop();
  recordScore("math", SKIP_SCORE, todayString());
  window.location.href = "/";
});
```

**Step 5: Verify build and tests**

Run: `npx vite build && npx vitest run`
Expected: All pass

**Step 6: Commit**

```bash
git add src/style.css games/stroop.html games/math.html games/blitz.html games/memory.html src/games/stroop.ts src/games/math.ts
git commit -m "feat: skip button on all game pages"
```

---

### Task 6: Memory Match game

Card-flip concentration game. 120 seconds, progressive grid sizes.

**Files:**

- Modify: `src/games/memory.ts` — full implementation
- Create: `src/games/memory.css`
- Modify: `games/memory.html` — link CSS
- Create: `test/memory.test.ts`

**Step 1: Write failing tests**

Create `test/memory.test.ts`:

```typescript
// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { createBoard, SYMBOLS } from "../src/games/memory";

describe("createBoard", () => {
  it("creates a board with the correct number of cards", () => {
    const board = createBoard(3, 4);
    expect(board).toHaveLength(12);
  });

  it("has exactly 2 of each symbol", () => {
    const board = createBoard(3, 4);
    const counts = new Map<string, number>();
    for (const card of board) {
      counts.set(card.symbol, (counts.get(card.symbol) ?? 0) + 1);
    }
    for (const count of counts.values()) {
      expect(count).toBe(2);
    }
  });

  it("all symbols are from the SYMBOLS pool", () => {
    const board = createBoard(4, 5);
    for (const card of board) {
      expect(SYMBOLS).toContain(card.symbol);
    }
  });

  it("cards start face down", () => {
    const board = createBoard(3, 4);
    for (const card of board) {
      expect(card.faceUp).toBe(false);
      expect(card.matched).toBe(false);
    }
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run test/memory.test.ts`
Expected: FAIL

**Step 3: Create `src/games/memory.css`**

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

.card-grid {
  display: grid;
  gap: 6px;
  width: 100%;
  max-width: 360px;
}

.card {
  aspect-ratio: 1;
  background: var(--ctp-surface0);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.8rem;
  cursor: pointer;
  transition: background 0.15s;
  user-select: none;
}

.card.face-up {
  background: var(--ctp-surface1);
}

.card.matched {
  background: var(--ctp-surface2);
  opacity: 0.5;
  cursor: default;
}

.card.preview {
  background: var(--ctp-surface1);
}

.score-display {
  font-size: 1.1rem;
  color: var(--ctp-subtext0);
}

.grid-label {
  font-size: 0.9rem;
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

**Step 4: Update `games/memory.html`**

Add CSS link in `<head>`:
```html
    <link rel="stylesheet" href="/src/games/memory.css" />
```

**Step 5: Implement `src/games/memory.ts`**

```typescript
import { createTimer } from "../shared/timer";
import { recordScore, todayString, SKIP_SCORE } from "../shared/progress";
import * as sound from "../shared/sounds";

export const SYMBOLS = [
  "🐶",
  "🐱",
  "🐸",
  "🦊",
  "🐻",
  "🐼",
  "🐵",
  "🦁",
  "🐔",
  "🐧",
  "🐙",
  "🦋",
  "🐢",
  "🐝",
  "🐠",
] as const;

export interface Card {
  id: number;
  symbol: string;
  faceUp: boolean;
  matched: boolean;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function createBoard(rows: number, cols: number): Card[] {
  const pairCount = (rows * cols) / 2;
  const symbols = shuffle([...SYMBOLS]).slice(0, pairCount);
  const cards = shuffle([...symbols, ...symbols]).map((symbol, i) => ({
    id: i,
    symbol,
    faceUp: false,
    matched: false,
  }));
  return cards;
}

const GRIDS: [number, number][] = [
  [3, 4],
  [4, 4],
  [4, 5],
];

const DURATION = 120;
const PREVIEW_MS = 2000;
const MISMATCH_MS = 500;
const game = document.getElementById("game");
if (!game) throw new Error("Missing #game element");

let score = 0;
let gridIndex = 0;
let cards: Card[] = [];
let flipped: number[] = [];
let locked = false;
let currentRemaining = DURATION;
let timerRef: ReturnType<typeof createTimer> | null = null;

function currentGrid(): [number, number] {
  return GRIDS[Math.min(gridIndex, GRIDS.length - 1)];
}

function renderBoard(): void {
  const [rows, cols] = currentGrid();
  game.innerHTML = `
    <div class="timer">${String(currentRemaining)}s</div>
    <div class="grid-label">${String(rows)}×${String(cols)}</div>
    <div class="card-grid" style="grid-template-columns: repeat(${String(cols)}, 1fr)">
      ${cards
        .map(
          (card) =>
            `<div class="card${card.faceUp || card.matched ? " face-up" : ""}${card.matched ? " matched" : ""}" data-id="${String(card.id)}">${card.faceUp || card.matched ? card.symbol : ""}</div>`,
        )
        .join("")}
    </div>
    <div class="score-display">Pairs: ${String(score)}</div>
  `;
}

function handleCardClick(id: number): void {
  if (locked) return;
  const card = cards.find((c) => c.id === id);
  if (!card || card.faceUp || card.matched) return;

  card.faceUp = true;
  flipped.push(id);
  renderBoard();

  if (flipped.length === 2) {
    locked = true;
    const [first, second] = flipped;
    const a = cards.find((c) => c.id === first);
    const b = cards.find((c) => c.id === second);

    if (a && b && a.symbol === b.symbol) {
      a.matched = true;
      b.matched = true;
      score++;
      sound.playMove();
      flipped = [];
      locked = false;
      renderBoard();

      if (cards.every((c) => c.matched)) {
        gridIndex++;
        startGrid();
      }
    } else {
      sound.playCheck();
      setTimeout(() => {
        if (a) a.faceUp = false;
        if (b) b.faceUp = false;
        flipped = [];
        locked = false;
        renderBoard();
      }, MISMATCH_MS);
    }
  }
}

function startGrid(): void {
  const [rows, cols] = currentGrid();
  cards = createBoard(rows, cols);
  flipped = [];
  locked = true;

  for (const card of cards) card.faceUp = true;
  renderBoard();

  setTimeout(() => {
    for (const card of cards) card.faceUp = false;
    locked = false;
    renderBoard();
  }, PREVIEW_MS);
}

function showResult(): void {
  recordScore("memory", score, todayString());

  game.innerHTML = `
    <div class="result">
      <div class="final-score">${String(score)}</div>
      <div>pairs found in ${String(DURATION)} seconds</div>
      <button id="back-btn">Back to Hub</button>
    </div>
  `;

  sound.playVictory();

  document.getElementById("back-btn")?.addEventListener("click", () => {
    window.location.href = "/";
  });
}

game.addEventListener("click", (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>(".card");
  if (el?.dataset.id != null) {
    handleCardClick(Number(el.dataset.id));
  }
});

document.getElementById("skip-btn")?.addEventListener("click", () => {
  if (timerRef) timerRef.stop();
  recordScore("memory", SKIP_SCORE, todayString());
  window.location.href = "/";
});

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

startGrid();
timerRef.start();
```

**Step 6: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 7: Commit**

```bash
git add src/games/memory.ts src/games/memory.css games/memory.html test/memory.test.ts
git commit -m "feat: Memory Match game with progressive grid sizes"
```

---

### Task 7: Re-add Stockfish and create engine module

**Files:**

- Modify: `package.json` — add stockfish dependency
- Create: `src/shared/engine.ts` — Stockfish Web Worker wrapper
- Create: `test/engine.test.ts` — UCI parsing tests

**Step 1: Install stockfish**

```bash
npm install stockfish
```

**Step 2: Copy Stockfish WASM files**

```bash
mkdir -p public/stockfish
cp node_modules/stockfish/bin/stockfish-18-lite-single.js public/stockfish/
cp node_modules/stockfish/bin/stockfish-18-lite-single.wasm public/stockfish/
```

**Step 3: Write failing tests**

Create `test/engine.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseBestMove, parseInfoLine } from "../src/shared/engine";

describe("parseBestMove", () => {
  it("parses a bestmove line", () => {
    expect(parseBestMove("bestmove e2e4 ponder e7e5")).toBe("e2e4");
  });

  it("parses bestmove with promotion", () => {
    expect(parseBestMove("bestmove a7a8q")).toBe("a7a8q");
  });

  it("returns null for non-bestmove lines", () => {
    expect(parseBestMove("info depth 10 score cp 30")).toBeNull();
  });
});

describe("parseInfoLine", () => {
  it("parses an info line with centipawn score", () => {
    const info = parseInfoLine(
      "info depth 12 score cp 35 pv e2e4 e7e5 g1f3",
    );
    expect(info).toEqual({
      depth: 12,
      score: { type: "cp", value: 35 },
      pv: ["e2e4", "e7e5", "g1f3"],
    });
  });

  it("parses a mate score", () => {
    const info = parseInfoLine("info depth 20 score mate 3 pv d1h5 f7f6");
    expect(info?.score).toEqual({ type: "mate", value: 3 });
  });

  it("returns null for non-info lines", () => {
    expect(parseInfoLine("bestmove e2e4")).toBeNull();
  });
});
```

**Step 4: Run tests to verify they fail**

Run: `npx vitest run test/engine.test.ts`
Expected: FAIL

**Step 5: Implement engine module**

Create `src/shared/engine.ts`:

```typescript
export interface EngineInfo {
  depth: number;
  score: { type: "cp" | "mate"; value: number };
  pv: string[];
}

export function parseBestMove(line: string): string | null {
  const match = /^bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/.exec(line);
  return match?.[1] ?? null;
}

export function parseInfoLine(line: string): EngineInfo | null {
  const depthMatch = /^info\s.*?\bdepth\s+(\d+)/.exec(line);
  if (!depthMatch) return null;

  const scoreMatch = /score\s+(cp|mate)\s+(-?\d+)/.exec(line);
  if (!scoreMatch) return null;

  const pvMatch = /\bpv\s+(.+)$/.exec(line);
  const pv = pvMatch ? pvMatch[1].trim().split(/\s+/) : [];

  return {
    depth: parseInt(depthMatch[1], 10),
    score: {
      type: scoreMatch[1] as "cp" | "mate",
      value: parseInt(scoreMatch[2], 10),
    },
    pv,
  };
}

type BestMoveCallback = (move: string) => void;

export class StockfishEngine {
  private worker: Worker | null = null;
  private onBestMove: BestMoveCallback | null = null;
  private ready = false;

  public get isReady(): boolean {
    return this.ready;
  }

  public async init(): Promise<void> {
    const base = import.meta.env.BASE_URL as string;
    return new Promise((resolve) => {
      this.worker = new Worker(
        `${base}stockfish/stockfish-18-lite-single.js`,
      );
      this.worker.addEventListener(
        "message",
        (e: MessageEvent<string>): void => {
          this.handleLine(e.data);
        },
      );

      const origHandler = this.handleLine.bind(this);
      this.handleLine = (line: string): void => {
        if (line === "readyok") {
          this.ready = true;
          this.handleLine = origHandler;
          resolve();
        }
      };

      this.send("uci");
      this.send("setoption name UCI_Chess960 value true");
      this.send("setoption name UCI_LimitStrength value true");
      this.send("setoption name UCI_Elo value 1500");
      this.send("isready");
    });
  }

  public go(startFen: string, moves: string[], callback: BestMoveCallback): void {
    this.onBestMove = callback;
    const movesStr = moves.length > 0 ? ` moves ${moves.join(" ")}` : "";
    this.send(`position fen ${startFen}${movesStr}`);
    this.send("go depth 8");
  }

  public newGame(): void {
    this.send("ucinewgame");
    this.send("isready");
  }

  public stop(): void {
    this.send("stop");
  }

  public destroy(): void {
    this.worker?.terminate();
    this.worker = null;
  }

  private send(cmd: string): void {
    this.worker?.postMessage(cmd);
  }

  private handleLine(line: string): void {
    const bestMove = parseBestMove(line);
    if (bestMove !== null) {
      this.onBestMove?.(bestMove);
    }
  }
}
```

**Step 6: Run tests to verify they pass**

Run: `npx vitest run test/engine.test.ts`
Expected: All tests PASS

**Step 7: Commit**

```bash
git add package.json package-lock.json public/stockfish/ src/shared/engine.ts test/engine.test.ts
git commit -m "feat: re-add Stockfish WASM and engine wrapper"
```

---

### Task 8: Chess960 Blitz game

Full Chess960 blitz game with chess clock, Chessground board, and Stockfish engine.

**Files:**

- Modify: `src/games/blitz.ts` — full implementation
- Create: `src/games/blitz.css`
- Modify: `games/blitz.html` — link Chessground CSS + game CSS
- Create: `test/blitz.test.ts`

**Step 1: Write failing tests**

Create `test/blitz.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createClock } from "../src/games/blitz";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createClock", () => {
  it("starts at the given time and counts down", () => {
    const ticks: number[] = [];
    const clock = createClock({
      initialMs: 3000,
      incrementMs: 0,
      onTick: (ms) => {
        ticks.push(ms);
      },
      onFlag: () => {
        /* noop */
      },
    });
    clock.start();

    vi.advanceTimersByTime(100);
    vi.advanceTimersByTime(100);

    expect(ticks.length).toBeGreaterThanOrEqual(2);
    expect(ticks[0]).toBeLessThan(3000);
    clock.stop();
  });

  it("calls onFlag when time runs out", () => {
    const onFlag = vi.fn();
    const clock = createClock({
      initialMs: 500,
      incrementMs: 0,
      onTick: () => {
        /* noop */
      },
      onFlag,
    });
    clock.start();

    vi.advanceTimersByTime(600);

    expect(onFlag).toHaveBeenCalledOnce();
  });

  it("adds increment on addIncrement()", () => {
    let lastMs = 0;
    const clock = createClock({
      initialMs: 3000,
      incrementMs: 2000,
      onTick: (ms) => {
        lastMs = ms;
      },
      onFlag: () => {
        /* noop */
      },
    });
    clock.start();

    vi.advanceTimersByTime(1000);
    clock.stop();
    clock.addIncrement();
    // Should be roughly 2000 (3000 - 1000) + 2000 increment = 4000
    clock.start();
    vi.advanceTimersByTime(100);
    expect(lastMs).toBeGreaterThan(3500);
    clock.stop();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run test/blitz.test.ts`
Expected: FAIL

**Step 3: Create `src/games/blitz.css`**

```css
#game {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding-top: 0.5rem;
}

.clock {
  font-size: 1.5rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--ctp-text);
  padding: 0.25rem 0.75rem;
  background: var(--ctp-surface0);
  border-radius: 4px;
}

.clock.low {
  color: var(--ctp-red);
}

.blitz-board {
  width: 320px;
  height: 320px;
}

@media (width >= 480px) {
  .blitz-board {
    width: 400px;
    height: 400px;
  }
}

.game-status {
  font-size: 1rem;
  color: var(--ctp-subtext0);
  min-height: 1.5rem;
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

**Step 4: Update `games/blitz.html`**

Replace with full version including Chessground CSS:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0, viewport-fit=cover"
    />
    <title>Brainbout — Chess960 Blitz</title>
    <link rel="stylesheet" href="/src/style.css" />
    <link rel="stylesheet" href="/src/games/blitz.css" />
  </head>
  <body>
    <div id="app">
      <header>
        <h1>Chess960 Blitz</h1>
        <button class="skip-btn" id="skip-btn">Skip</button>
      </header>
      <main id="game"></main>
    </div>
    <script type="module" src="/src/games/blitz.ts"></script>
  </body>
</html>
```

**Step 5: Implement `src/games/blitz.ts`**

```typescript
import "@lichess-org/chessground/assets/chessground.base.css";
import "@lichess-org/chessground/assets/chessground.brown.css";
import "@lichess-org/chessground/assets/chessground.cburnett.css";

import { Chessground } from "@lichess-org/chessground";
import type { Api } from "@lichess-org/chessground/api";
import type { Key, Dests } from "@lichess-org/chessground/types";
import { Chess } from "chessops/chess";
import { parseFen, makeFen } from "chessops/fen";
import { parseUci, makeSquare } from "chessops/util";
import { chessgroundDests } from "chessops/compat";
import { randomChess960 } from "../chess960";
import { StockfishEngine } from "../shared/engine";
import { recordScore, todayString, SKIP_SCORE } from "../shared/progress";
import * as sound from "../shared/sounds";

// --- Chess clock ---

export interface ClockOptions {
  initialMs: number;
  incrementMs: number;
  onTick: (remainingMs: number) => void;
  onFlag: () => void;
}

export interface ChessClock {
  start: () => void;
  stop: () => void;
  addIncrement: () => void;
  remaining: () => number;
}

export function createClock(options: ClockOptions): ChessClock {
  let remainingMs = options.initialMs;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let lastTick = 0;

  function start(): void {
    lastTick = Date.now();
    intervalId = setInterval(() => {
      const now = Date.now();
      remainingMs -= now - lastTick;
      lastTick = now;
      if (remainingMs <= 0) {
        remainingMs = 0;
        stop();
        options.onFlag();
      }
      options.onTick(remainingMs);
    }, 100);
  }

  function stop(): void {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function addIncrement(): void {
    remainingMs += options.incrementMs;
  }

  function remaining(): number {
    return remainingMs;
  }

  return { start, stop, addIncrement, remaining };
}

function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min)}:${String(sec).padStart(2, "0")}`;
}

// --- Game state ---

const INITIAL_MS = 3 * 60 * 1000;
const INCREMENT_MS = 2 * 1000;
const game = document.getElementById("game");
if (!game) throw new Error("Missing #game element");

let api: Api | undefined;
let pos: Chess;
let startFen: string;
let moves: string[] = [];
let playerColor: "white" | "black" = "white";
let gameOver = false;
let engine: StockfishEngine;
let clock: ChessClock;

function updateBoard(): void {
  if (!api) return;
  api.set({
    fen: makeFen(pos.toSetup()),
    turnColor: pos.turn,
    movable: {
      color: gameOver ? undefined : playerColor,
      dests: (gameOver ? new Map() : chessgroundDests(pos, { chess960: true })) as Dests,
    },
    check: pos.isCheck(),
  });
}

function checkGameEnd(): boolean {
  if (pos.isCheckmate()) {
    const winner = pos.turn === "white" ? "black" : "white";
    clock.stop();
    gameOver = true;
    const result = winner === playerColor ? 1 : 0;
    finishGame(result, winner === playerColor ? "Checkmate — you win!" : "Checkmate — you lose");
    return true;
  }
  if (pos.isStalemate()) {
    clock.stop();
    gameOver = true;
    finishGame(0.5, "Stalemate — draw");
    return true;
  }
  if (pos.isInsufficientMaterial()) {
    clock.stop();
    gameOver = true;
    finishGame(0.5, "Insufficient material — draw");
    return true;
  }
  if (pos.halfmoves >= 100) {
    clock.stop();
    gameOver = true;
    finishGame(0.5, "50-move rule — draw");
    return true;
  }
  return false;
}

function onPlayerMove(orig: string, dest: string): void {
  if (gameOver) return;

  const uci = orig + dest;
  const move = parseUci(uci);
  if (!move || !pos.isLegal(move)) return;

  const isCapture = pos.board.occupied.has(move.to);
  pos.play(move);
  moves.push(uci);

  clock.stop();
  clock.addIncrement();
  updateBoard();

  if (isCapture) sound.playCapture();
  else sound.playMove();
  if (pos.isCheck()) sound.playCheck();

  if (checkGameEnd()) return;

  updateStatus("Engine thinking...");
  engine.go(startFen, moves, onEngineMove);
}

function onEngineMove(uci: string): void {
  if (gameOver) return;

  const move = parseUci(uci);
  if (!move) return;

  const from = "from" in move ? makeSquare(move.from) : makeSquare(move.to);
  const to = makeSquare(move.to);
  const isCapture = pos.board.occupied.has(move.to);

  pos.play(move);
  moves.push(uci);

  if (api) api.move(from as Key, to as Key);
  updateBoard();

  if (isCapture) sound.playCapture();
  else sound.playMove();
  if (pos.isCheck()) sound.playCheck();

  if (checkGameEnd()) return;

  clock.start();
  updateStatus("Your move");
}

function onFlag(): void {
  gameOver = true;
  finishGame(0, "Time's up — you lose");
}

function finishGame(result: number, message: string): void {
  recordScore("blitz", result, todayString());

  const label = result === 1 ? "Won" : result === 0.5 ? "Draw" : "Lost";

  game.innerHTML = `
    <div class="result">
      <div class="final-score">${label}</div>
      <div>${message}</div>
      <button id="back-btn">Back to Hub</button>
    </div>
  `;

  if (result === 1) sound.playVictory();
  else if (result === 0) sound.playDefeat();
  else sound.playDraw();

  document.getElementById("back-btn")?.addEventListener("click", () => {
    window.location.href = "/";
  });
}

function updateStatus(text: string): void {
  const el = game.querySelector(".game-status");
  if (el) el.textContent = text;
}

function renderGame(): void {
  game.innerHTML = `
    <div class="clock" id="player-clock">${formatClock(INITIAL_MS)}</div>
    <div class="blitz-board"></div>
    <div class="game-status">Loading engine...</div>
  `;

  const boardEl = game.querySelector<HTMLElement>(".blitz-board");
  if (!boardEl) return;

  api = Chessground(boardEl, {
    fen: makeFen(pos.toSetup()),
    orientation: playerColor,
    turnColor: pos.turn,
    movable: {
      free: false,
      color: playerColor,
      dests: chessgroundDests(pos, { chess960: true }) as Dests,
      showDests: true,
      events: { after: onPlayerMove },
    },
    draggable: { enabled: true, showGhost: true },
    animation: { enabled: true, duration: 200 },
    premovable: { enabled: false },
  });
}

async function main(): Promise<void> {
  const { fen } = randomChess960();
  startFen = fen;
  const setup = parseFen(fen).unwrap();
  pos = Chess.fromSetup(setup).unwrap();
  playerColor = "white";

  clock = createClock({
    initialMs: INITIAL_MS,
    incrementMs: INCREMENT_MS,
    onTick: (ms) => {
      const el = document.getElementById("player-clock");
      if (el) {
        el.textContent = formatClock(ms);
        el.classList.toggle("low", ms < 30000);
      }
    },
    onFlag,
  });

  renderGame();

  engine = new StockfishEngine();
  await engine.init();
  engine.newGame();

  updateStatus("Your move");
  clock.start();
}

document.getElementById("skip-btn")?.addEventListener("click", () => {
  gameOver = true;
  clock?.stop();
  engine?.destroy();
  recordScore("blitz", SKIP_SCORE, todayString());
  window.location.href = "/";
});

void main();
```

**Step 6: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 7: Commit**

```bash
git add src/games/blitz.ts src/games/blitz.css games/blitz.html test/blitz.test.ts
git commit -m "feat: Chess960 blitz game with 3+2 clock vs Stockfish"
```

---

### Task 9: Update README and clean up

**Files:**

- Modify: `README.md` — update game descriptions
- Modify: `.prettierignore` — add `public/stockfish` back

**Step 1: Update `.prettierignore`**

Add `public/stockfish` line back since the Stockfish files are unformatted vendor code.

**Step 2: Update `README.md`**

Update the game descriptions to list:
- Chess960 Blitz (3+2 vs Stockfish)
- Memory Match (card concentration)
- Stroop (color word inhibition)
- Quick Math (adaptive arithmetic)

**Step 3: Commit**

```bash
git add README.md .prettierignore
git commit -m "docs: update README for v2 games"
```

---

### Task 10: Lint, format, and final verification

**Step 1: Run full lint suite**

```bash
npm run lint
npm run lint:css
npm run format:check
```

Fix any issues.

**Step 2: Run all tests**

```bash
npm test
```

Expected: All pass

**Step 3: Build**

```bash
npx vite build
```

Expected: Build succeeds

**Step 4: Format**

```bash
npm run format
```

**Step 5: Commit if needed**

```bash
git add -A
git commit -m "chore: lint and format pass"
```

---

### Execution order

Tasks have these dependencies:

1. **Task 1** (progress module) — everything depends on new game IDs
2. **Task 2** (remove old games) — clears the slate
3. **Task 3** (Vite config + skeletons) — needed for pages
4. **Task 4** (hub page) — update labels/URLs
5. **Task 5** (skip button) — add to all pages
6. **Task 6** (Memory Match) — independent game, no engine deps
7. **Task 7** (Stockfish + engine) — needed before blitz
8. **Task 8** (Chess960 Blitz) — depends on Task 7
9. **Task 9** (README/cleanup)
10. **Task 10** (final verification)

Tasks 6 and 7 can run in parallel (independent).

Recommended linear order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10
