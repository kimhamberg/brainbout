# Daily Brain Workout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Brainbout from a Chess960-vs-Stockfish game into a daily brain workout app with four timed cognitive games and progress tracking.

**Architecture:** Multi-page Vite app. Hub page (`index.html`) manages daily workout flow. Each game is its own HTML page + TypeScript entry point. Shared utilities (progress, timer, sounds) imported per page. All progress stored in localStorage.

**Tech Stack:** TypeScript, Vite (multi-page), Chessground + chessops (puzzles only), vitest (tests), Catppuccin Frappé (theme)

**Design doc:** `docs/plans/2026-02-27-daily-workout-design.md`

---

### Task 1: Remove Stockfish and full Chess960 game

Remove the full Chess960 vs Stockfish game. Keep `chess960.ts` (position generator) and `sounds.ts` (shared sounds).

**Files:**

- Delete: `src/main.ts`
- Delete: `src/game.ts`
- Delete: `src/engine.ts`
- Delete: `test/engine.test.ts`
- Delete: `test/game.test.ts`
- Delete: `public/stockfish/stockfish-18-lite-single.js`
- Delete: `public/stockfish/stockfish-18-lite-single.wasm`
- Modify: `package.json` — remove `stockfish` from `dependencies`
- Modify: `index.html` — strip chess960 UI, replace with hub placeholder

**Step 1: Delete Stockfish files and engine/game modules**

```bash
rm -rf public/stockfish
rm src/main.ts src/game.ts src/engine.ts
rm test/engine.test.ts test/game.test.ts
```

**Step 2: Remove stockfish dependency**

```bash
npm uninstall stockfish
```

**Step 3: Replace `index.html` with hub skeleton**

Replace the full contents of `index.html` with:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0, viewport-fit=cover"
    />
    <title>Brainbout</title>
    <link
      rel="icon"
      href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🧠</text></svg>"
    />
    <link rel="stylesheet" href="/src/style.css" />
  </head>
  <body>
    <div id="app">
      <header>
        <h1>Brainbout</h1>
      </header>
      <main id="hub"></main>
    </div>
    <script type="module" src="/src/hub.ts"></script>
  </body>
</html>
```

**Step 4: Create empty `src/hub.ts` placeholder**

```typescript
// src/hub.ts — placeholder, implemented in Task 3
console.log("hub loaded");
```

**Step 5: Remove COOP/COEP headers from vite.config.ts**

These were only needed for Stockfish WASM SharedArrayBuffer. Replace `vite.config.ts` with:

```typescript
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
  },
});
```

**Step 6: Verify remaining tests pass**

Run: `npx vitest run`
Expected: 9 tests pass (chess960.test.ts only)

**Step 7: Commit**

```bash
git add -A
git commit -m "refactor: remove Stockfish engine and full Chess960 game"
```

---

### Task 2: Progress module with tests

Create the localStorage progress tracking module — streaks, daily scores, personal bests.

**Files:**

- Create: `src/shared/progress.ts`
- Create: `test/progress.test.ts`

**Step 1: Write failing tests**

Create `test/progress.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import {
  getStreak,
  recordScore,
  getDailyScore,
  getBest,
  isDayComplete,
  GAMES,
} from "../src/shared/progress";

beforeEach(() => {
  localStorage.clear();
});

describe("recordScore", () => {
  it("saves a score for a game on a date", () => {
    recordScore("puzzles", 8, "2026-02-27");
    expect(getDailyScore("puzzles", "2026-02-27")).toBe(8);
  });

  it("returns null for unrecorded scores", () => {
    expect(getDailyScore("puzzles", "2026-02-27")).toBeNull();
  });
});

describe("getBest", () => {
  it("returns null when no scores recorded", () => {
    expect(getBest("puzzles")).toBeNull();
  });

  it("tracks personal best across sessions", () => {
    recordScore("puzzles", 5, "2026-02-27");
    recordScore("puzzles", 8, "2026-02-28");
    recordScore("puzzles", 3, "2026-03-01");
    expect(getBest("puzzles")).toBe(8);
  });
});

describe("isDayComplete", () => {
  it("returns false when no games played", () => {
    expect(isDayComplete("2026-02-27")).toBe(false);
  });

  it("returns false when some games played", () => {
    recordScore("puzzles", 5, "2026-02-27");
    recordScore("nback", 3, "2026-02-27");
    expect(isDayComplete("2026-02-27")).toBe(false);
  });

  it("returns true when all four games played", () => {
    for (const game of GAMES) {
      recordScore(game, 5, "2026-02-27");
    }
    expect(isDayComplete("2026-02-27")).toBe(true);
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
    // Feb 26 missing — streak is only 1 (today)
    expect(getStreak("2026-02-27")).toBe(1);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run test/progress.test.ts`
Expected: FAIL — module not found

**Step 3: Implement progress module**

Create `src/shared/progress.ts`:

```typescript
export const GAMES = ["puzzles", "nback", "stroop", "math"] as const;
export type GameId = (typeof GAMES)[number];

const PREFIX = "brainbout";

function key(...parts: string[]): string {
  return `${PREFIX}:${parts.join(":")}`;
}

export function recordScore(game: GameId, score: number, date: string): void {
  localStorage.setItem(key("daily", date, game), String(score));

  const prev = getBest(game);
  if (prev === null || score > prev) {
    localStorage.setItem(key("best", game), String(score));
  }
}

export function getDailyScore(game: GameId, date: string): number | null {
  const val = localStorage.getItem(key("daily", date, game));
  return val === null ? null : Number(val);
}

export function getBest(game: GameId): number | null {
  const val = localStorage.getItem(key("best", game));
  return val === null ? null : Number(val);
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

function formatDate(d: Date): string {
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
git commit -m "feat: progress tracking module with localStorage"
```

---

### Task 3: Timer module with tests

Shared countdown timer used by all four games.

**Files:**

- Create: `src/shared/timer.ts`
- Create: `test/timer.test.ts`

**Step 1: Write failing tests**

Create `test/timer.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTimer } from "../src/shared/timer";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createTimer", () => {
  it("calls onTick every second with remaining time", () => {
    const ticks: number[] = [];
    const timer = createTimer({
      seconds: 3,
      onTick: (remaining) => {
        ticks.push(remaining);
      },
      onDone: () => {},
    });
    timer.start();

    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(1000);

    expect(ticks).toEqual([2, 1, 0]);
  });

  it("calls onDone when time runs out", () => {
    const done = vi.fn();
    const timer = createTimer({
      seconds: 2,
      onTick: () => {},
      onDone: done,
    });
    timer.start();

    vi.advanceTimersByTime(2000);

    expect(done).toHaveBeenCalledOnce();
  });

  it("stops when stop() is called", () => {
    const ticks: number[] = [];
    const timer = createTimer({
      seconds: 10,
      onTick: (remaining) => {
        ticks.push(remaining);
      },
      onDone: () => {},
    });
    timer.start();

    vi.advanceTimersByTime(2000);
    timer.stop();
    vi.advanceTimersByTime(5000);

    expect(ticks).toEqual([9, 8]);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run test/timer.test.ts`
Expected: FAIL — module not found

**Step 3: Implement timer module**

Create `src/shared/timer.ts`:

```typescript
export interface TimerOptions {
  seconds: number;
  onTick: (remaining: number) => void;
  onDone: () => void;
}

export interface Timer {
  start: () => void;
  stop: () => void;
}

export function createTimer(options: TimerOptions): Timer {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let remaining = options.seconds;

  function tick(): void {
    remaining--;
    options.onTick(remaining);
    if (remaining <= 0) {
      stop();
      options.onDone();
    }
  }

  function start(): void {
    remaining = options.seconds;
    intervalId = setInterval(tick, 1000);
  }

  function stop(): void {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  return { start, stop };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run test/timer.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/shared/timer.ts test/timer.test.ts
git commit -m "feat: shared countdown timer module"
```

---

### Task 4: Hub page

Build the hub that shows today's workout, progress, and navigates to games.

**Files:**

- Modify: `src/hub.ts` — full implementation
- Create: `src/hub.css` — hub-specific styles
- Modify: `index.html` — link hub.css
- Modify: `src/style.css` — remove chess960-specific styles, keep base theme

**Step 1: Clean up `src/style.css`**

Keep only the base theme and reset. Remove all chess960-specific styles (`#board`, `#sidebar`, `#settings`, `#controls`, `#board-container`, `#status`, and the media query). The file should contain only:

```css
/* Catppuccin Frappé — https://catppuccin.com/palette (MIT) */
:root {
  --ctp-base: #303446;
  --ctp-mantle: #292c3c;
  --ctp-surface0: #414559;
  --ctp-surface1: #51576d;
  --ctp-surface2: #626880;
  --ctp-text: #c6d0f5;
  --ctp-subtext0: #a5adce;
  --ctp-blue: #8caaee;
  --ctp-green: #a6d189;
  --ctp-red: #e78284;
  --ctp-yellow: #e5c890;
  --ctp-peach: #ef9f76;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  background: var(--ctp-base);
  color: var(--ctp-text);
  font-family:
    system-ui,
    -apple-system,
    sans-serif;
  min-height: 100vh;
}

#app {
  max-width: 480px;
  margin: 0 auto;
  padding: 1rem;
  padding-top: calc(1rem + env(safe-area-inset-top));
}

header {
  margin-bottom: 1rem;
}

header h1 {
  font-size: 1.5rem;
  font-weight: 600;
}
```

Note: added `--ctp-green`, `--ctp-red`, `--ctp-yellow`, `--ctp-peach` to the palette — these are needed for game UI (Stroop colors, correct/wrong feedback). Changed `max-width` from `800px` to `480px` since the app is now phone-first with no sidebar layout.

**Step 2: Create `src/hub.css`**

```css
#streak {
  font-size: 1.1rem;
  color: var(--ctp-subtext0);
  margin-bottom: 1rem;
}

#streak strong {
  color: var(--ctp-peach);
}

h2 {
  font-size: 1.1rem;
  margin-bottom: 0.75rem;
}

.game-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.game-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  background: var(--ctp-surface0);
  border-radius: 4px;
}

.game-card.done {
  opacity: 0.6;
}

.game-card.current {
  border-left: 3px solid var(--ctp-blue);
}

.game-name {
  font-size: 0.95rem;
}

.game-score {
  font-size: 0.85rem;
  color: var(--ctp-subtext0);
}

.game-check {
  color: var(--ctp-green);
}

#start-btn {
  width: 100%;
  padding: 0.75rem;
  background: var(--ctp-blue);
  color: var(--ctp-mantle);
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
}

#start-btn:hover {
  opacity: 0.9;
}

#start-btn:disabled {
  background: var(--ctp-surface1);
  color: var(--ctp-subtext0);
  cursor: default;
  opacity: 1;
}

.summary {
  text-align: center;
  padding: 1rem;
  color: var(--ctp-subtext0);
}
```

**Step 3: Add hub.css import to `index.html`**

Add after the style.css link:

```html
<link rel="stylesheet" href="/src/hub.css" />
```

**Step 4: Implement `src/hub.ts`**

```typescript
import {
  GAMES,
  todayString,
  getStreak,
  getDailyScore,
  nextGame,
} from "./shared/progress";

const GAME_LABELS: Record<string, string> = {
  puzzles: "Chess960 Puzzles",
  nback: "Dual N-back",
  stroop: "Stroop",
  math: "Quick Math",
};

const GAME_URLS: Record<string, string> = {
  puzzles: "games/puzzles.html",
  nback: "games/nback.html",
  stroop: "games/stroop.html",
  math: "games/math.html",
};

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
    const current = game === next;
    const cls = done ? "done" : current ? "current" : "";

    html += `<div class="game-card ${cls}">`;
    html += `<span class="game-name">${GAME_LABELS[game]}</span>`;
    if (done) {
      html += `<span class="game-score">Score: ${String(score)} <span class="game-check">✓</span></span>`;
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

**Step 5: Verify it builds and loads**

Run: `npx vite build`
Expected: Build succeeds

Run: `npx vitest run`
Expected: All existing tests pass

**Step 6: Commit**

```bash
git add src/hub.ts src/hub.css src/style.css index.html
git commit -m "feat: hub page with daily workout flow"
```

---

### Task 5: Vite multi-page config and game page template

Configure Vite for multi-page builds and create the HTML pages for all four games.

**Files:**

- Modify: `vite.config.ts` — add multi-page `build.rollupOptions.input`
- Create: `games/puzzles.html`
- Create: `games/nback.html`
- Create: `games/stroop.html`
- Create: `games/math.html`

**Step 1: Update `vite.config.ts`**

```typescript
import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        puzzles: resolve(__dirname, "games/puzzles.html"),
        nback: resolve(__dirname, "games/nback.html"),
        stroop: resolve(__dirname, "games/stroop.html"),
        math: resolve(__dirname, "games/math.html"),
      },
    },
  },
});
```

**Step 2: Create `games/puzzles.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0, viewport-fit=cover"
    />
    <title>Brainbout — Chess960 Puzzles</title>
    <link rel="stylesheet" href="/src/style.css" />
  </head>
  <body>
    <div id="app">
      <header>
        <h1>Chess960 Puzzles</h1>
      </header>
      <main id="game"></main>
    </div>
    <script type="module" src="/src/games/puzzles.ts"></script>
  </body>
</html>
```

**Step 3: Create `games/nback.html`**

Same structure, title "Brainbout — Dual N-back", `<h1>Dual N-back</h1>`, script `src="/src/games/nback.ts"`.

**Step 4: Create `games/stroop.html`**

Same structure, title "Brainbout — Stroop", `<h1>Stroop</h1>`, script `src="/src/games/stroop.ts"`.

**Step 5: Create `games/math.html`**

Same structure, title "Brainbout — Quick Math", `<h1>Quick Math</h1>`, script `src="/src/games/math.ts"`.

**Step 6: Create placeholder entry points**

Create these four files with placeholder content:

`src/games/puzzles.ts`:

```typescript
console.log("puzzles loaded");
```

`src/games/nback.ts`:

```typescript
console.log("nback loaded");
```

`src/games/stroop.ts`:

```typescript
console.log("stroop loaded");
```

`src/games/math.ts`:

```typescript
console.log("math loaded");
```

**Step 7: Verify build works**

Run: `npx vite build`
Expected: Build succeeds, `dist/` contains `index.html` plus `games/*.html`

**Step 8: Commit**

```bash
git add vite.config.ts games/ src/games/
git commit -m "feat: multi-page Vite config and game page skeletons"
```

---

### Task 6: Stroop game

The simplest game to implement — pure DOM, no external libraries. Good to build first to establish the game flow pattern.

**Files:**

- Modify: `src/games/stroop.ts` — full implementation
- Create: `src/games/stroop.css` — game styles
- Modify: `games/stroop.html` — link CSS
- Create: `test/stroop.test.ts` — logic tests

**Step 1: Write failing tests**

Create `test/stroop.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { generateRound, COLORS } from "../src/games/stroop";

describe("generateRound", () => {
  it("returns a word and ink color that differ", () => {
    for (let i = 0; i < 50; i++) {
      const round = generateRound();
      expect(COLORS).toContain(round.word);
      expect(COLORS).toContain(round.ink);
      expect(round.word).not.toBe(round.ink);
    }
  });

  it("returns an ink color property", () => {
    const round = generateRound();
    expect(round).toHaveProperty("ink");
    expect(round).toHaveProperty("word");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run test/stroop.test.ts`
Expected: FAIL

**Step 3: Implement Stroop game**

Create `src/games/stroop.css`:

```css
#game {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  padding-top: 1rem;
}

.timer {
  font-size: 1.5rem;
  color: var(--ctp-subtext0);
}

.stroop-word {
  font-size: 3rem;
  font-weight: 700;
  text-transform: uppercase;
  min-height: 4rem;
  display: flex;
  align-items: center;
}

.color-buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  width: 100%;
  max-width: 320px;
}

.color-btn {
  padding: 1rem;
  border: 2px solid var(--ctp-surface1);
  border-radius: 4px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  text-transform: uppercase;
  background: var(--ctp-surface0);
}

.color-btn:hover {
  border-color: var(--ctp-blue);
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

Add to `games/stroop.html` `<head>`:

```html
<link rel="stylesheet" href="/src/games/stroop.css" />
```

Implement `src/games/stroop.ts`:

```typescript
import "../shared/sounds";
import { createTimer } from "../shared/timer";
import { recordScore, todayString } from "../shared/progress";
import * as sound from "../shared/sounds";

export const COLORS = ["red", "blue", "green", "yellow"] as const;
type Color = (typeof COLORS)[number];

const COLOR_HEX: Record<Color, string> = {
  red: "var(--ctp-red)",
  blue: "var(--ctp-blue)",
  green: "var(--ctp-green)",
  yellow: "var(--ctp-yellow)",
};

export interface StroopRound {
  word: Color;
  ink: Color;
}

export function generateRound(): StroopRound {
  const word = COLORS[Math.floor(Math.random() * COLORS.length)];
  let ink: Color;
  do {
    ink = COLORS[Math.floor(Math.random() * COLORS.length)];
  } while (ink === word);
  return { word, ink };
}

const DURATION = 60;
const game = document.getElementById("game");
if (!game) throw new Error("missing #game");

let score = 0;
let round: StroopRound;

function renderPlaying(remaining: number): void {
  game.innerHTML = `
    <div class="timer">${String(remaining)}s</div>
    <div class="stroop-word" style="color: ${COLOR_HEX[round.ink]}">${round.word}</div>
    <div class="score-display">Score: ${String(score)}</div>
    <div class="color-buttons">
      ${COLORS.map(
        (c) =>
          `<button class="color-btn" data-color="${c}" style="color: ${COLOR_HEX[c]}">${c}</button>`,
      ).join("")}
    </div>
  `;

  for (const btn of game.querySelectorAll<HTMLButtonElement>(".color-btn")) {
    btn.addEventListener("click", () => {
      handleAnswer(btn.dataset.color as Color);
    });
  }
}

function handleAnswer(chosen: Color): void {
  if (chosen === round.ink) {
    score++;
    sound.playMove();
  } else {
    sound.playCheck();
  }
  round = generateRound();
  // re-render is handled by the next tick or immediately
  const timerEl = game.querySelector(".timer");
  if (timerEl) {
    renderPlaying(Number(timerEl.textContent?.replace("s", "")));
  }
}

function showResult(): void {
  recordScore("stroop", score, todayString());

  game.innerHTML = `
    <div class="result">
      <div class="final-score">${String(score)}</div>
      <div>correct in ${String(DURATION)} seconds</div>
      <button id="back-btn">Back to Hub</button>
    </div>
  `;

  sound.playVictory();

  document.getElementById("back-btn")?.addEventListener("click", () => {
    window.location.href = "/";
  });
}

round = generateRound();

const timer = createTimer({
  seconds: DURATION,
  onTick: (remaining) => {
    renderPlaying(remaining);
  },
  onDone: () => {
    showResult();
  },
});

renderPlaying(DURATION);
timer.start();
```

**Step 4: Run tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 5: Verify manually**

Run: `npx vite` and open `http://localhost:5173/games/stroop.html`
Expected: 60-second Stroop test works, score saves, back button returns to hub

**Step 6: Commit**

```bash
git add src/games/stroop.ts src/games/stroop.css games/stroop.html test/stroop.test.ts
git commit -m "feat: Stroop game with 60-second timed rounds"
```

---

### Task 7: Quick Math game

**Files:**

- Modify: `src/games/math.ts` — full implementation
- Create: `src/games/math.css` — game styles
- Modify: `games/math.html` — link CSS
- Create: `test/math.test.ts` — logic tests

**Step 1: Write failing tests**

Create `test/math.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { generateProblem } from "../src/games/math";

describe("generateProblem", () => {
  it("returns a question with correct answer and 3 wrong choices", () => {
    for (let i = 0; i < 50; i++) {
      const p = generateProblem(1);
      expect(p.choices).toHaveLength(4);
      expect(p.choices).toContain(p.answer);
      // All choices are unique
      expect(new Set(p.choices).size).toBe(4);
    }
  });

  it("scales difficulty with level", () => {
    const easy = generateProblem(1);
    const hard = generateProblem(3);
    // Level 1 uses single digits, level 3 uses triple digits
    expect(easy.a).toBeLessThan(10);
    expect(hard.a).toBeGreaterThanOrEqual(10);
  });

  it("never divides by zero", () => {
    for (let i = 0; i < 100; i++) {
      const p = generateProblem(1);
      if (p.op === "÷") {
        expect(p.b).not.toBe(0);
      }
    }
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run test/math.test.ts`
Expected: FAIL

**Step 3: Implement Quick Math game**

Create `src/games/math.css`:

```css
#game {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  padding-top: 1rem;
}

.timer {
  font-size: 1.5rem;
  color: var(--ctp-subtext0);
}

.problem {
  font-size: 2.5rem;
  font-weight: 700;
  min-height: 3.5rem;
}

.choices {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  width: 100%;
  max-width: 320px;
}

.choice-btn {
  padding: 1rem;
  background: var(--ctp-surface0);
  color: var(--ctp-text);
  border: 2px solid var(--ctp-surface1);
  border-radius: 4px;
  font-size: 1.2rem;
  font-weight: 600;
  cursor: pointer;
}

.choice-btn:hover {
  border-color: var(--ctp-blue);
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

Add to `games/math.html` `<head>`:

```html
<link rel="stylesheet" href="/src/games/math.css" />
```

Implement `src/games/math.ts`:

```typescript
import { createTimer } from "../shared/timer";
import { recordScore, todayString } from "../shared/progress";
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

export function generateProblem(level: number): MathProblem {
  const ops = OPS_BY_LEVEL[Math.min(level - 1, OPS_BY_LEVEL.length - 1)];
  const op = ops[Math.floor(Math.random() * ops.length)];

  const maxVal = level === 1 ? 9 : level === 2 ? 50 : 100;
  let a: number;
  let b: number;
  let answer: number;

  if (op === "÷") {
    // Generate clean division: pick answer and divisor, compute dividend
    b = rand(2, Math.min(maxVal, 12));
    answer = rand(1, maxVal);
    a = answer * b;
  } else {
    a = rand(1, maxVal);
    b = rand(1, maxVal);
    if (op === "+") answer = a + b;
    else if (op === "−") {
      // Ensure non-negative result
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

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const DURATION = 60;
const game = document.getElementById("game");
if (!game) throw new Error("missing #game");

let score = 0;
let streak = 0;
let level = 1;
let problem: MathProblem;

function renderPlaying(remaining: number): void {
  game.innerHTML = `
    <div class="timer">${String(remaining)}s</div>
    <div class="problem">${String(problem.a)} ${problem.op} ${String(problem.b)}</div>
    <div class="score-display">Score: ${String(score)}</div>
    <div class="choices">
      ${problem.choices.map((c) => `<button class="choice-btn" data-val="${String(c)}">${String(c)}</button>`).join("")}
    </div>
  `;

  for (const btn of game.querySelectorAll<HTMLButtonElement>(".choice-btn")) {
    btn.addEventListener("click", () => {
      handleAnswer(Number(btn.dataset.val));
    });
  }
}

function handleAnswer(chosen: number): void {
  if (chosen === problem.answer) {
    score++;
    streak++;
    if (streak >= 5 && level < 3) {
      level++;
      streak = 0;
    }
    sound.playMove();
  } else {
    streak = 0;
    if (level > 1) level--;
    sound.playCheck();
  }
  problem = generateProblem(level);
  const timerEl = game.querySelector(".timer");
  if (timerEl) {
    renderPlaying(Number(timerEl.textContent?.replace("s", "")));
  }
}

function showResult(): void {
  recordScore("math", score, todayString());

  game.innerHTML = `
    <div class="result">
      <div class="final-score">${String(score)}</div>
      <div>correct in ${String(DURATION)} seconds</div>
      <button id="back-btn">Back to Hub</button>
    </div>
  `;

  sound.playVictory();

  document.getElementById("back-btn")?.addEventListener("click", () => {
    window.location.href = "/";
  });
}

problem = generateProblem(level);

const timer = createTimer({
  seconds: DURATION,
  onTick: (remaining) => {
    renderPlaying(remaining);
  },
  onDone: () => {
    showResult();
  },
});

renderPlaying(DURATION);
timer.start();
```

**Step 4: Run tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src/games/math.ts src/games/math.css games/math.html test/math.test.ts
git commit -m "feat: Quick Math game with adaptive difficulty"
```

---

### Task 8: Dual N-back game

Most complex game. 3x3 grid with position + letter matching against N steps back.

**Files:**

- Modify: `src/games/nback.ts` — full implementation
- Create: `src/games/nback.css` — game styles
- Modify: `games/nback.html` — link CSS
- Create: `test/nback.test.ts` — logic tests

**Step 1: Write failing tests**

Create `test/nback.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  generateStimulus,
  checkMatch,
  LETTERS,
  GRID_SIZE,
} from "../src/games/nback";

describe("generateStimulus", () => {
  it("returns a position (0-8) and a letter", () => {
    const s = generateStimulus();
    expect(s.position).toBeGreaterThanOrEqual(0);
    expect(s.position).toBeLessThan(GRID_SIZE * GRID_SIZE);
    expect(LETTERS).toContain(s.letter);
  });
});

describe("checkMatch", () => {
  it("detects position match", () => {
    const history = [
      { position: 4, letter: "A" },
      { position: 2, letter: "B" },
      { position: 4, letter: "C" },
    ];
    const result = checkMatch(history, 2);
    expect(result.positionMatch).toBe(true);
    expect(result.letterMatch).toBe(false);
  });

  it("detects letter match", () => {
    const history = [
      { position: 0, letter: "A" },
      { position: 3, letter: "B" },
      { position: 7, letter: "A" },
    ];
    const result = checkMatch(history, 2);
    expect(result.positionMatch).toBe(false);
    expect(result.letterMatch).toBe(true);
  });

  it("detects dual match", () => {
    const history = [
      { position: 4, letter: "A" },
      { position: 2, letter: "B" },
      { position: 4, letter: "A" },
    ];
    const result = checkMatch(history, 2);
    expect(result.positionMatch).toBe(true);
    expect(result.letterMatch).toBe(true);
  });

  it("returns no match when history too short", () => {
    const history = [{ position: 4, letter: "A" }];
    const result = checkMatch(history, 2);
    expect(result.positionMatch).toBe(false);
    expect(result.letterMatch).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run test/nback.test.ts`
Expected: FAIL

**Step 3: Implement Dual N-back game**

Create `src/games/nback.css`:

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

.n-level {
  font-size: 1rem;
  color: var(--ctp-subtext0);
}

.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  width: 240px;
  height: 240px;
}

.grid-cell {
  background: var(--ctp-surface0);
  border-radius: 4px;
}

.grid-cell.active {
  background: var(--ctp-blue);
}

.letter-display {
  font-size: 2.5rem;
  font-weight: 700;
  min-height: 3.5rem;
  display: flex;
  align-items: center;
}

.match-buttons {
  display: flex;
  gap: 0.75rem;
}

.match-btn {
  padding: 0.75rem 1.5rem;
  background: var(--ctp-surface0);
  color: var(--ctp-text);
  border: 2px solid var(--ctp-surface1);
  border-radius: 4px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
}

.match-btn:hover {
  border-color: var(--ctp-blue);
}

.match-btn.pressed {
  background: var(--ctp-blue);
  color: var(--ctp-mantle);
  border-color: var(--ctp-blue);
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

Add to `games/nback.html` `<head>`:

```html
<link rel="stylesheet" href="/src/games/nback.css" />
```

Implement `src/games/nback.ts`:

```typescript
import { createTimer } from "../shared/timer";
import { recordScore, todayString } from "../shared/progress";
import * as sound from "../shared/sounds";

export const GRID_SIZE = 3;
export const LETTERS = ["C", "H", "K", "L", "Q", "R", "S", "T"] as const;

export interface Stimulus {
  position: number;
  letter: string;
}

export function generateStimulus(): Stimulus {
  return {
    position: Math.floor(Math.random() * GRID_SIZE * GRID_SIZE),
    letter: LETTERS[Math.floor(Math.random() * LETTERS.length)],
  };
}

export function checkMatch(
  history: Stimulus[],
  n: number,
): { positionMatch: boolean; letterMatch: boolean } {
  if (history.length < n + 1) {
    return { positionMatch: false, letterMatch: false };
  }
  const current = history[history.length - 1];
  const prev = history[history.length - 1 - n];
  return {
    positionMatch: current.position === prev.position,
    letterMatch: current.letter === prev.letter,
  };
}

const DURATION = 120;
const ROUND_MS = 2500; // time per stimulus
const game = document.getElementById("game");
if (!game) throw new Error("missing #game");

let nLevel = 2;
let history: Stimulus[] = [];
let current: Stimulus | null = null;
let correct = 0;
let total = 0;
let roundCorrect = 0;
let roundTotal = 0;
let posPressed = false;
let letterPressed = false;
let roundInterval: ReturnType<typeof setInterval> | null = null;
let maxN = 2;
let remaining = DURATION;

function renderGrid(): string {
  let html = `<div class="grid">`;
  for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
    const active = current !== null && current.position === i ? " active" : "";
    html += `<div class="grid-cell${active}"></div>`;
  }
  html += `</div>`;
  return html;
}

function renderPlaying(): void {
  game.innerHTML = `
    <div class="timer">${String(remaining)}s</div>
    <div class="n-level">${String(nLevel)}-back</div>
    ${renderGrid()}
    <div class="letter-display">${current?.letter ?? ""}</div>
    <div class="match-buttons">
      <button class="match-btn${posPressed ? " pressed" : ""}" id="pos-btn">Position</button>
      <button class="match-btn${letterPressed ? " pressed" : ""}" id="letter-btn">Letter</button>
    </div>
    <div class="score-display">Score: ${String(correct)}/${String(total)}</div>
  `;

  document.getElementById("pos-btn")?.addEventListener("click", () => {
    posPressed = true;
    renderPlaying();
  });

  document.getElementById("letter-btn")?.addEventListener("click", () => {
    letterPressed = true;
    renderPlaying();
  });
}

function evaluateRound(): void {
  if (history.length < nLevel + 1) return;

  const match = checkMatch(history, nLevel);

  // Score position response
  if (match.positionMatch === posPressed) correct++;
  total++;

  // Score letter response
  if (match.letterMatch === letterPressed) correct++;
  total++;

  // Track for adaptive difficulty
  let roundHits = 0;
  let roundChecks = 0;
  if (match.positionMatch === posPressed) roundHits++;
  roundChecks++;
  if (match.letterMatch === letterPressed) roundHits++;
  roundChecks++;
  roundCorrect += roundHits;
  roundTotal += roundChecks;
}

function nextRound(): void {
  evaluateRound();

  // Adaptive difficulty every 10 rounds
  if (roundTotal >= 20) {
    const accuracy = roundCorrect / roundTotal;
    if (accuracy > 0.8 && nLevel < 9) {
      nLevel++;
      if (nLevel > maxN) maxN = nLevel;
    } else if (accuracy < 0.5 && nLevel > 1) {
      nLevel--;
    }
    roundCorrect = 0;
    roundTotal = 0;
  }

  posPressed = false;
  letterPressed = false;
  current = generateStimulus();
  history.push(current);

  if (posPressed || letterPressed) sound.playMove();

  renderPlaying();
}

function showResult(): void {
  if (roundInterval !== null) clearInterval(roundInterval);

  recordScore("nback", maxN, todayString());

  game.innerHTML = `
    <div class="result">
      <div class="final-score">${String(maxN)}-back</div>
      <div>highest level reached</div>
      <div class="score-display" style="margin-top: 0.5rem">${String(correct)}/${String(total)} correct</div>
      <button id="back-btn">Back to Hub</button>
    </div>
  `;

  sound.playVictory();

  document.getElementById("back-btn")?.addEventListener("click", () => {
    window.location.href = "/";
  });
}

// Start game
current = generateStimulus();
history.push(current);

const timer = createTimer({
  seconds: DURATION,
  onTick: (r) => {
    remaining = r;
    renderPlaying();
  },
  onDone: () => {
    showResult();
  },
});

renderPlaying();
timer.start();
roundInterval = setInterval(nextRound, ROUND_MS);
```

**Step 4: Run tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src/games/nback.ts src/games/nback.css games/nback.html test/nback.test.ts
git commit -m "feat: Dual N-back game with adaptive difficulty"
```

---

### Task 9: Chess960 Puzzles — puzzle data and game

**Files:**

- Create: `scripts/extract-puzzles.ts` — script to extract puzzles from Lichess CSV
- Create: `public/puzzles.json` — static puzzle data
- Modify: `src/games/puzzles.ts` — full implementation
- Create: `src/games/puzzles.css` — game styles
- Modify: `games/puzzles.html` — link Chessground CSS + game CSS
- Create: `test/puzzles.test.ts` — logic tests

**Step 1: Create puzzle extraction script**

The Lichess puzzle DB is a CSV file: `PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags`

Download it from https://database.lichess.org/#puzzles (file: `lichess_db_puzzle.csv.zst`). Decompress with `zstd -d`. Then run the extraction script.

Create `scripts/extract-puzzles.ts`:

```typescript
import { readFileSync, writeFileSync } from "fs";

interface Puzzle {
  fen: string;
  moves: string[];
  rating: number;
}

const TIERS = [
  { min: 800, max: 1200, count: 200 },
  { min: 1200, max: 1600, count: 200 },
  { min: 1600, max: 2000, count: 200 },
  { min: 2000, max: 2400, count: 200 },
  { min: 2400, max: 3000, count: 200 },
];

const csv = readFileSync(process.argv[2] ?? "lichess_db_puzzle.csv", "utf-8");
const lines = csv.split("\n").slice(1); // skip header

const byTier: Puzzle[][] = TIERS.map(() => []);

for (const line of lines) {
  if (!line.trim()) continue;
  const cols = line.split(",");
  const fen = cols[1];
  const moves = cols[2].split(" ");
  const rating = parseInt(cols[3], 10);
  const popularity = parseInt(cols[5], 10);

  // Only include popular, clean puzzles with 2-6 moves
  if (popularity < 80 || moves.length < 2 || moves.length > 6) continue;

  for (let i = 0; i < TIERS.length; i++) {
    if (
      rating >= TIERS[i].min &&
      rating < TIERS[i].max &&
      byTier[i].length < TIERS[i].count
    ) {
      byTier[i].push({ fen, moves, rating });
      break;
    }
  }

  // Stop early if all tiers are full
  if (byTier.every((t, i) => t.length >= TIERS[i].count)) break;
}

const puzzles = byTier.flat();
writeFileSync("public/puzzles.json", JSON.stringify(puzzles));
console.log(`Extracted ${String(puzzles.length)} puzzles`);
for (let i = 0; i < TIERS.length; i++) {
  console.log(
    `  ${String(TIERS[i].min)}-${String(TIERS[i].max)}: ${String(byTier[i].length)}`,
  );
}
```

Run: `tsx scripts/extract-puzzles.ts path/to/lichess_db_puzzle.csv`

Note: The developer must download and decompress the Lichess puzzle CSV manually before running this script. The output `public/puzzles.json` is committed to the repo.

**Step 2: Write failing tests**

Create `test/puzzles.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { pickPuzzle, validateMove } from "../src/games/puzzles";

// Minimal test puzzle set
const TEST_PUZZLES = [
  {
    fen: "r1bqkbnr/pppppppp/2n5/4N3/4P3/8/PPPP1PPP/RNBQKB1R b KQkq - 0 1",
    moves: ["d7d5", "e5c6", "b7c6"],
    rating: 1200,
  },
  {
    fen: "rnbqkb1r/pppppppp/5n2/4N3/4P3/8/PPPP1PPP/RNBQKB1R b KQkq - 0 1",
    moves: ["d7d5", "e5f7"],
    rating: 1800,
  },
];

describe("pickPuzzle", () => {
  it("returns a puzzle from the set", () => {
    const puzzle = pickPuzzle(TEST_PUZZLES);
    expect(TEST_PUZZLES).toContain(puzzle);
  });
});

describe("validateMove", () => {
  it("returns true for the correct next move", () => {
    // After opponent plays d7d5, correct response is e5c6
    expect(validateMove("e5c6", ["d7d5", "e5c6", "b7c6"], 1)).toBe(true);
  });

  it("returns false for an incorrect move", () => {
    expect(validateMove("a2a3", ["d7d5", "e5c6", "b7c6"], 1)).toBe(false);
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `npx vitest run test/puzzles.test.ts`
Expected: FAIL

**Step 4: Implement Chess960 Puzzles game**

Create `src/games/puzzles.css`:

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

.puzzle-board {
  width: 320px;
  height: 320px;
}

@media (width >= 480px) {
  .puzzle-board {
    width: 400px;
    height: 400px;
  }
}

.puzzle-status {
  font-size: 1rem;
  color: var(--ctp-subtext0);
  min-height: 1.5rem;
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

Update `games/puzzles.html` — add Chessground CSS and game CSS in `<head>`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0, viewport-fit=cover"
    />
    <title>Brainbout — Chess960 Puzzles</title>
    <link rel="stylesheet" href="/src/style.css" />
    <link rel="stylesheet" href="/src/games/puzzles.css" />
  </head>
  <body>
    <div id="app">
      <header>
        <h1>Chess960 Puzzles</h1>
      </header>
      <main id="game"></main>
    </div>
    <script type="module" src="/src/games/puzzles.ts"></script>
  </body>
</html>
```

Implement `src/games/puzzles.ts`:

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
import { createTimer } from "../shared/timer";
import { recordScore, todayString } from "../shared/progress";
import * as sound from "../shared/sounds";

export interface Puzzle {
  fen: string;
  moves: string[];
  rating: number;
}

export function pickPuzzle(puzzles: Puzzle[]): Puzzle {
  return puzzles[Math.floor(Math.random() * puzzles.length)];
}

export function validateMove(
  uci: string,
  moves: string[],
  moveIndex: number,
): boolean {
  return uci === moves[moveIndex];
}

const DURATION = 120;
const game = document.getElementById("game");
if (!game) throw new Error("missing #game");

let api: Api | undefined;
let score = 0;
let remaining = DURATION;
let puzzles: Puzzle[] = [];
let currentPuzzle: Puzzle;
let moveIndex: number;
let pos: Chess;

async function loadPuzzles(): Promise<Puzzle[]> {
  const base = import.meta.env.BASE_URL as string;
  const resp = await fetch(`${base}puzzles.json`);
  return (await resp.json()) as Puzzle[];
}

function setupPuzzle(): void {
  currentPuzzle = pickPuzzle(puzzles);
  const setup = parseFen(currentPuzzle.fen).unwrap();
  pos = Chess.fromSetup(setup).unwrap();

  // Opponent plays the first move
  const firstMove = parseUci(currentPuzzle.moves[0]);
  if (firstMove) pos.play(firstMove);
  moveIndex = 1;

  const boardEl = game.querySelector<HTMLElement>(".puzzle-board");
  if (!boardEl) return;

  if (api) api.destroy();

  const playerColor = pos.turn === "white" ? "white" : "black";
  const dests = chessgroundDests(pos);

  api = Chessground(boardEl, {
    fen: makeFen(pos.toSetup()),
    orientation: playerColor,
    turnColor: pos.turn,
    movable: {
      free: false,
      color: playerColor,
      dests: dests as Dests,
      showDests: true,
      events: { after: onUserMove },
    },
    draggable: { enabled: true, showGhost: true },
    animation: { enabled: true, duration: 200 },
    premovable: { enabled: false },
  });
}

function onUserMove(orig: string, dest: string): void {
  const uci = orig + dest;

  if (!validateMove(uci, currentPuzzle.moves, moveIndex)) {
    // Wrong — shake and move to next puzzle
    sound.playCheck();
    const statusEl = game.querySelector(".puzzle-status");
    if (statusEl) statusEl.textContent = "Wrong! Next puzzle...";
    setTimeout(() => {
      setupPuzzle();
      updateStatus("");
    }, 800);
    return;
  }

  // Correct move
  const move = parseUci(uci);
  if (move) pos.play(move);
  moveIndex++;
  sound.playMove();

  // Check if puzzle is complete
  if (moveIndex >= currentPuzzle.moves.length) {
    score++;
    const statusEl = game.querySelector(".puzzle-status");
    if (statusEl) statusEl.textContent = "Correct!";
    updateScoreDisplay();
    setTimeout(() => {
      setupPuzzle();
      updateStatus("");
    }, 600);
    return;
  }

  // Opponent responds
  const opponentMove = parseUci(currentPuzzle.moves[moveIndex]);
  if (opponentMove) {
    const from = "from" in opponentMove ? makeSquare(opponentMove.from) : "";
    const to = makeSquare(opponentMove.to);
    pos.play(opponentMove);
    moveIndex++;

    setTimeout(() => {
      if (api) {
        api.move(from as Key, to as Key);
        api.set({
          fen: makeFen(pos.toSetup()),
          turnColor: pos.turn,
          movable: {
            dests: chessgroundDests(pos) as Dests,
          },
        });
      }
    }, 300);
  }
}

function updateStatus(text: string): void {
  const el = game.querySelector(".puzzle-status");
  if (el) el.textContent = text;
}

function updateScoreDisplay(): void {
  const el = game.querySelector(".score-display");
  if (el) el.textContent = `Solved: ${String(score)}`;
}

function renderPlaying(): void {
  game.innerHTML = `
    <div class="timer">${String(remaining)}s</div>
    <div class="puzzle-board"></div>
    <div class="puzzle-status"></div>
    <div class="score-display">Solved: ${String(score)}</div>
  `;
  setupPuzzle();
}

function showResult(): void {
  if (api) api.destroy();
  recordScore("puzzles", score, todayString());

  game.innerHTML = `
    <div class="result">
      <div class="final-score">${String(score)}</div>
      <div>puzzles solved in ${String(DURATION)} seconds</div>
      <button id="back-btn">Back to Hub</button>
    </div>
  `;

  sound.playVictory();

  document.getElementById("back-btn")?.addEventListener("click", () => {
    window.location.href = "/";
  });
}

async function main(): Promise<void> {
  game.innerHTML = `<div class="puzzle-status">Loading puzzles...</div>`;
  puzzles = await loadPuzzles();

  const timer = createTimer({
    seconds: DURATION,
    onTick: (r) => {
      remaining = r;
      const el = game.querySelector(".timer");
      if (el) el.textContent = `${String(r)}s`;
    },
    onDone: () => {
      showResult();
    },
  });

  renderPlaying();
  timer.start();
}

void main();
```

**Step 5: Create a small placeholder `public/puzzles.json`**

For development and CI, ship a small placeholder file with ~10 puzzles. The full extraction is done manually by the developer when they have the Lichess CSV.

```json
[
  {
    "fen": "r2q1rk1/pp2ppbp/2p2np1/6B1/3PP1b1/2N2N2/PPQ2PPP/3RK2R b K - 0 1",
    "moves": ["g4f3", "g2f3", "d8b6"],
    "rating": 1100
  },
  {
    "fen": "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 1",
    "moves": ["h5f7"],
    "rating": 800
  },
  {
    "fen": "rnbqkb1r/pppp1ppp/5n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 0 1",
    "moves": ["f6e4", "d2d3", "e4f2"],
    "rating": 1400
  },
  {
    "fen": "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 0 1",
    "moves": ["f6e4", "d2d4", "e4d6"],
    "rating": 1600
  },
  {
    "fen": "r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 b - - 0 1",
    "moves": ["c5f2", "f1f2", "f6g4"],
    "rating": 1800
  },
  {
    "fen": "r2qr1k1/pppb1ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPPBQPPP/R4RK1 b - - 0 1",
    "moves": ["c5f2", "f1f2", "f6g4"],
    "rating": 2000
  },
  {
    "fen": "r4rk1/pp1qppbp/2np1np1/2p5/4PP2/2NP2P1/PPP1N1BP/R1BQ1RK1 b - - 0 1",
    "moves": ["d6e4", "d3e4", "d7d1"],
    "rating": 2200
  },
  {
    "fen": "r1b2rk1/pp3ppp/2n1pn2/q1pp4/2PP4/P1PBPN2/5PPP/R1BQK2R b KQ - 0 1",
    "moves": ["c5d4", "e3d4", "f6g4"],
    "rating": 2400
  },
  {
    "fen": "r1bq1rk1/1pp2pbp/p1np1np1/4p3/2PPP3/2N1BP2/PP2N1PP/R2QKB1R b KQ - 0 1",
    "moves": ["d6c4", "b2b3", "c4e3"],
    "rating": 2600
  },
  {
    "fen": "rnb1kb1r/pp1p1ppp/1q2pn2/2p5/2PP4/5NP1/PP2PP1P/RNBQKB1R w KQkq - 0 1",
    "moves": ["d4d5", "e6d5", "c4d5"],
    "rating": 2800
  }
]
```

**Step 6: Run tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 7: Commit**

```bash
git add src/games/puzzles.ts src/games/puzzles.css games/puzzles.html test/puzzles.test.ts public/puzzles.json scripts/extract-puzzles.ts
git commit -m "feat: Chess960 puzzle game with timed solving"
```

---

### Task 10: Update sounds module path

The sounds module moves from `src/sounds.ts` to `src/shared/sounds.ts` so all shared modules are in one directory.

**Files:**

- Move: `src/sounds.ts` → `src/shared/sounds.ts`

**Step 1: Move the file**

```bash
mkdir -p src/shared
mv src/sounds.ts src/shared/sounds.ts
```

**Step 2: Run tests to verify nothing broke**

Run: `npx vitest run`
Expected: All tests pass (no tests import sounds directly)

**Step 3: Commit**

```bash
git add src/sounds.ts src/shared/sounds.ts
git commit -m "refactor: move sounds module to src/shared/"
```

Note: This task should be done **before** Task 6 since the game modules import from `../shared/sounds`. If executing linearly, do this task between Task 5 and Task 6.

---

### Task 11: Update Makefile, CI, and README

Remove Stockfish-related build steps. Update docs.

**Files:**

- Modify: `Makefile` — remove COOP/COEP references if any, update clean target
- Modify: `.github/workflows/release.yml` — no changes needed (builds from Vite output)
- Modify: `README.md` — update description, remove Stockfish references, update test count
- Modify: `scripts/screenshot.ts` — update if hub page changed the initial view
- Modify: `.prettierignore` — remove `public/stockfish` line

**Step 1: Update `.prettierignore`**

Remove the `public/stockfish` line since that directory no longer exists.

**Step 2: Update `README.md`**

Update the description, stack section, and test count to reflect the new app. Remove Go requirement (if dropping desktop build) or keep it. Update screenshot after manual testing.

**Step 3: Run all lints and tests**

```bash
make lint
npm test
```

Expected: All pass

**Step 4: Commit**

```bash
git add .prettierignore README.md Makefile
git commit -m "docs: update README and build config for daily workout app"
```

---

### Task 12: Lint, format, and final verification

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

Expected: Build succeeds, `dist/` contains hub + 4 game pages

**Step 4: Manual smoke test**

```bash
npx vite
```

Open `http://localhost:5173`:

- Hub loads, shows 4 games, streak at 0
- Click "Start" → navigates to puzzles
- Complete a puzzle round → returns to hub with score
- "Next" → navigates to N-back
- Complete all 4 → hub shows "All done for today!" and streak = 1

**Step 5: Format any remaining files**

```bash
npm run format
```

**Step 6: Final commit**

```bash
git add -A
git commit -m "chore: lint and format pass"
```

---

### Execution order

Tasks have these dependencies:

1. **Task 10** (move sounds) — do first, before any game imports `shared/sounds`
2. **Task 1** (remove Stockfish) — clears the slate
3. **Task 2** (progress module) — needed by hub and all games
4. **Task 3** (timer module) — needed by all games
5. **Task 4** (hub page) — needed for navigation
6. **Task 5** (Vite multi-page + skeletons) — needed before any game page works
7. **Tasks 6-9** (games) — can be done in any order, but Stroop first is simplest
8. **Task 11** (docs/CI cleanup)
9. **Task 12** (final verification)

Recommended linear order: 10 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 11 → 12
