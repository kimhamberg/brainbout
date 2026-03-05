# Brainbout v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Redesign Brainbout from 4 games to 3 (Crown, Flux, Cipher) with a per-game stage progression system.

**Architecture:** Incremental replacement — add Flux, upgrade Cipher, add stage system, wire stages into all 3 games, then remove Spark and Tally. Each task is independently testable and committable. The stage system is a shared module (`src/shared/stages.ts`) consumed by the hub and each game.

**Tech Stack:** TypeScript, Vite multi-page, Vitest + happy-dom, Catppuccin CSS variables, localStorage persistence.

---

### Task 0: Stage progression module

Build the shared stage system that all games will consume.

**Files:**

- Create: `src/shared/stages.ts`
- Create: `test/stages.test.ts`

**Step 1: Write the failing tests**

Create `test/stages.test.ts`:

```typescript
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import {
  getStage,
  getHistory,
  recordResult,
  advance,
  retreat,
  readiness,
  MAX_STAGE,
} from "../src/shared/stages";

beforeEach(() => {
  localStorage.clear();
});

describe("getStage", () => {
  it("returns 1 for unknown game", () => {
    expect(getStage("flux")).toBe(1);
  });
});

describe("recordResult", () => {
  it("appends to history", () => {
    recordResult("flux", 0.85);
    recordResult("flux", 0.72);
    expect(getHistory("flux")).toEqual([0.85, 0.72]);
  });

  it("keeps only last 5 results", () => {
    for (let i = 0; i < 7; i++) {
      recordResult("flux", i * 0.1);
    }
    expect(getHistory("flux")).toHaveLength(5);
  });
});

describe("advance", () => {
  it("increments stage up to MAX_STAGE", () => {
    advance("flux");
    expect(getStage("flux")).toBe(2);
    advance("flux");
    expect(getStage("flux")).toBe(3);
    advance("flux");
    expect(getStage("flux")).toBe(MAX_STAGE);
  });

  it("clears history on advance", () => {
    recordResult("flux", 0.9);
    advance("flux");
    expect(getHistory("flux")).toEqual([]);
  });
});

describe("retreat", () => {
  it("decrements stage down to 1", () => {
    advance("flux");
    advance("flux");
    expect(getStage("flux")).toBe(3);
    retreat("flux");
    expect(getStage("flux")).toBe(2);
    retreat("flux");
    expect(getStage("flux")).toBe(1);
    retreat("flux");
    expect(getStage("flux")).toBe(1);
  });
});

describe("readiness", () => {
  it("returns grey with no history", () => {
    expect(readiness("flux", 0.8)).toBe("grey");
  });

  it("returns grey with insufficient history", () => {
    recordResult("flux", 0.9);
    recordResult("flux", 0.9);
    expect(readiness("flux", 0.8)).toBe("grey");
  });

  it("returns green when threshold met over 5 sessions", () => {
    for (let i = 0; i < 5; i++) recordResult("flux", 0.85);
    expect(readiness("flux", 0.8)).toBe("green");
  });

  it("returns amber when close to threshold", () => {
    recordResult("flux", 0.85);
    recordResult("flux", 0.85);
    recordResult("flux", 0.85);
    recordResult("flux", 0.65);
    recordResult("flux", 0.65);
    // avg = 0.77, below 0.8 but above 0.7
    expect(readiness("flux", 0.8)).toBe("amber");
  });

  it("returns grey at max stage", () => {
    advance("flux");
    advance("flux");
    for (let i = 0; i < 5; i++) recordResult("flux", 0.95);
    expect(readiness("flux", 0.8)).toBe("grey");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run test/stages.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `src/shared/stages.ts`:

```typescript
export const MAX_STAGE = 3;
const HISTORY_SIZE = 5;
const PREFIX = "brainbout:stage";

interface StageData {
  stage: number;
  history: number[];
}

function key(gameId: string): string {
  return `${PREFIX}:${gameId}`;
}

function load(gameId: string): StageData {
  const raw = localStorage.getItem(key(gameId));
  if (raw === null) return { stage: 1, history: [] };
  return JSON.parse(raw) as StageData;
}

function save(gameId: string, data: StageData): void {
  localStorage.setItem(key(gameId), JSON.stringify(data));
}

export function getStage(gameId: string): number {
  return load(gameId).stage;
}

export function getHistory(gameId: string): number[] {
  return load(gameId).history;
}

export function recordResult(gameId: string, accuracy: number): void {
  const data = load(gameId);
  data.history.push(accuracy);
  if (data.history.length > HISTORY_SIZE) {
    data.history = data.history.slice(-HISTORY_SIZE);
  }
  save(gameId, data);
}

export function advance(gameId: string): void {
  const data = load(gameId);
  data.stage = Math.min(data.stage + 1, MAX_STAGE);
  data.history = [];
  save(gameId, data);
}

export function retreat(gameId: string): void {
  const data = load(gameId);
  data.stage = Math.max(data.stage - 1, 1);
  save(gameId, data);
}

export type Readiness = "grey" | "amber" | "green";

export function readiness(gameId: string, threshold: number): Readiness {
  const data = load(gameId);
  if (data.stage >= MAX_STAGE) return "grey";
  if (data.history.length < HISTORY_SIZE) return "grey";
  const avg = data.history.reduce((sum, v) => sum + v, 0) / data.history.length;
  if (avg >= threshold) return "green";
  if (avg >= threshold - 0.1) return "amber";
  return "grey";
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run test/stages.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/shared/stages.ts test/stages.test.ts
git commit -m "feat: add stage progression module with tests"
```

---

### Task 1: Flux game — core logic

Build the Flux game engine as a testable pure-logic module, separate from DOM rendering.

**Files:**

- Create: `src/games/flux-engine.ts`
- Create: `test/flux.test.ts`

**Step 1: Write the failing tests**

Create `test/flux.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  type FluxState,
  createFluxState,
  generateTrial,
  evaluateResponse,
  STAGE_PARAMS,
} from "../src/games/flux-engine";

describe("createFluxState", () => {
  it("creates state with default values", () => {
    const state = createFluxState(1);
    expect(state.score).toBe(0);
    expect(state.streak).toBe(0);
    expect(state.trialCount).toBe(0);
    expect(state.intervalMs).toBe(STAGE_PARAMS[1].startInterval);
    expect(state.rule).toBe("color");
  });
});

describe("generateTrial", () => {
  it("returns a trial with number 1-9, color red or blue during warm-up", () => {
    const state = createFluxState(1);
    for (let i = 0; i < 20; i++) {
      const trial = generateTrial(state);
      expect(trial.number).toBeGreaterThanOrEqual(1);
      expect(trial.number).toBeLessThanOrEqual(9);
      expect(["red", "blue", "green"]).toContain(trial.color);
    }
  });

  it("never generates no-go during warm-up (first 5 trials)", () => {
    const state = createFluxState(1);
    for (let i = 0; i < 5; i++) {
      const trial = generateTrial(state);
      expect(trial.isNoGo).toBe(false);
      state.trialCount++;
    }
  });

  it("keeps rule as color during warm-up", () => {
    const state = createFluxState(1);
    for (let i = 0; i < 5; i++) {
      const trial = generateTrial(state);
      expect(state.rule).toBe("color");
      state.trialCount++;
    }
  });
});

describe("evaluateResponse", () => {
  it("scores +1 for correct color response", () => {
    const trial = { number: 3, color: "red" as const, isNoGo: false };
    const result = evaluateResponse(trial, "color", "left");
    expect(result.correct).toBe(true);
    expect(result.points).toBeGreaterThanOrEqual(1);
  });

  it("scores +1 for correct number response (odd = left)", () => {
    const trial = { number: 3, color: "blue" as const, isNoGo: false };
    const result = evaluateResponse(trial, "number", "left");
    expect(result.correct).toBe(true);
  });

  it("scores -1 for wrong response", () => {
    const trial = { number: 3, color: "red" as const, isNoGo: false };
    const result = evaluateResponse(trial, "color", "right");
    expect(result.correct).toBe(false);
    expect(result.points).toBe(-1);
  });

  it("scores -1 for pressing on no-go trial", () => {
    const trial = { number: 3, color: "green" as const, isNoGo: true };
    const result = evaluateResponse(trial, "color", "left");
    expect(result.correct).toBe(false);
    expect(result.points).toBe(-1);
    expect(result.noGoFail).toBe(true);
  });

  it("scores +1 for correctly withholding on no-go", () => {
    const trial = { number: 3, color: "green" as const, isNoGo: true };
    const result = evaluateResponse(trial, "color", null);
    expect(result.correct).toBe(true);
    expect(result.points).toBe(1);
  });
});

describe("STAGE_PARAMS", () => {
  it("has params for stages 1-3", () => {
    expect(STAGE_PARAMS[1].startInterval).toBe(2000);
    expect(STAGE_PARAMS[2].startInterval).toBe(1500);
    expect(STAGE_PARAMS[3].startInterval).toBe(1200);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run test/flux.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `src/games/flux-engine.ts`:

```typescript
export type Rule = "color" | "number";
export type ButtonSide = "left" | "right";
export type TrialColor = "red" | "blue" | "green";

export interface Trial {
  number: number;
  color: TrialColor;
  isNoGo: boolean;
}

export interface FluxState {
  score: number;
  streak: number;
  trialCount: number;
  intervalMs: number;
  rule: Rule;
  trialsUntilSwitch: number;
  noGoUnlocked: boolean;
  stage: number;
}

export interface StageParams {
  startInterval: number;
  switchMin: number;
  switchMax: number;
  noGoRate: number;
  floorMs: number;
}

export const STAGE_PARAMS: Record<number, StageParams> = {
  1: {
    startInterval: 2000,
    switchMin: 6,
    switchMax: 6,
    noGoRate: 0.2,
    floorMs: 800,
  },
  2: {
    startInterval: 1500,
    switchMin: 4,
    switchMax: 6,
    noGoRate: 0.2,
    floorMs: 800,
  },
  3: {
    startInterval: 1200,
    switchMin: 3,
    switchMax: 5,
    noGoRate: 0.25,
    floorMs: 800,
  },
};

const WARM_UP_TRIALS = 5;
const SPEED_UP = 75;
const SLOW_DOWN = 150;
const STREAK_TO_SPEED = 5;

function randRange(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function createFluxState(stage: number): FluxState {
  const params = STAGE_PARAMS[stage] ?? STAGE_PARAMS[1];
  return {
    score: 0,
    streak: 0,
    trialCount: 0,
    intervalMs: params.startInterval,
    rule: "color",
    trialsUntilSwitch: params.switchMax,
    noGoUnlocked: false,
    stage,
  };
}

export function generateTrial(state: FluxState): Trial {
  const params = STAGE_PARAMS[state.stage] ?? STAGE_PARAMS[1];
  const inWarmUp = state.trialCount < WARM_UP_TRIALS;

  // Check rule switching
  if (!inWarmUp && state.trialsUntilSwitch <= 0) {
    state.rule = state.rule === "color" ? "number" : "color";
    state.trialsUntilSwitch = randRange(params.switchMin, params.switchMax);
    if (!state.noGoUnlocked) state.noGoUnlocked = true;
  }

  state.trialsUntilSwitch--;

  const number = randRange(1, 9);

  // No-go check
  const canNoGo = !inWarmUp && state.noGoUnlocked;
  const isNoGo = canNoGo && Math.random() < params.noGoRate;

  let color: TrialColor;
  if (isNoGo) {
    color = "green";
  } else {
    color = Math.random() < 0.5 ? "red" : "blue";
  }

  return { number, color, isNoGo };
}

export interface ResponseResult {
  correct: boolean;
  points: number;
  noGoFail?: boolean;
  feedback: string;
}

/** Left button = Red / Odd. Right button = Blue / Even. */
export function evaluateResponse(
  trial: Trial,
  rule: Rule,
  pressed: ButtonSide | null,
): ResponseResult {
  // No-go trial
  if (trial.isNoGo) {
    if (pressed === null) {
      return { correct: true, points: 1, feedback: "" };
    }
    return {
      correct: false,
      points: -1,
      noGoFail: true,
      feedback: "Don't press on green!",
    };
  }

  // Player didn't press on a go trial (timeout)
  if (pressed === null) {
    return { correct: false, points: -1, feedback: "Too slow!" };
  }

  // Determine correct side
  let correctSide: ButtonSide;
  if (rule === "color") {
    correctSide = trial.color === "red" ? "left" : "right";
  } else {
    correctSide = trial.number % 2 === 1 ? "left" : "right";
  }

  if (pressed === correctSide) {
    return { correct: true, points: 1, feedback: "" };
  }

  const expected =
    rule === "color"
      ? trial.color === "red"
        ? "Red"
        : "Blue"
      : trial.number % 2 === 1
        ? "Odd"
        : "Even";
  return { correct: false, points: -1, feedback: `It was ${expected}` };
}

/** Update interval after a response. Mutates state. */
export function updateAdaptation(state: FluxState, correct: boolean): void {
  const params = STAGE_PARAMS[state.stage] ?? STAGE_PARAMS[1];
  if (correct) {
    state.streak++;
    if (state.streak >= STREAK_TO_SPEED) {
      state.intervalMs = Math.max(params.floorMs, state.intervalMs - SPEED_UP);
      state.streak = 0;
    }
  } else {
    state.streak = 0;
    state.intervalMs = Math.min(
      params.startInterval,
      state.intervalMs + SLOW_DOWN,
    );
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run test/flux.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/games/flux-engine.ts test/flux.test.ts
git commit -m "feat: add Flux game engine with tests"
```

---

### Task 2: Flux game — UI, HTML, CSS, and Vite entry

Wire the Flux engine into a playable game page.

**Files:**

- Create: `games/flux.html`
- Create: `src/games/flux.ts`
- Create: `src/games/flux.css`
- Modify: `vite.config.ts:8-14` — add flux entry

**Step 1: Create the HTML page**

Create `games/flux.html` following the pattern from `games/reaction.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0, viewport-fit=cover"
    />
    <script>
      (function () {
        var t = localStorage.getItem("theme");
        if (!t)
          t = matchMedia("(prefers-color-scheme:light)").matches
            ? "latte"
            : "frappe";
        document.documentElement.dataset.theme = t;
      })();
    </script>
    <title>Brainbout — Flux</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <style>
      :root {
        --game-accent: var(--ctp-mauve);
      }
    </style>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="/src/style.css" />
    <link rel="stylesheet" href="/src/games/flux.css" />
  </head>
  <body>
    <div class="page-enter-overlay" aria-hidden="true"></div>
    <div id="app" class="app">
      <header>
        <h1>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--ctp-mauve)"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M12 3v18M3.7 7.8 12 12l8.3-4.2M3.7 16.2 12 12l8.3 4.2" />
          </svg>
          Flux
        </h1>
        <button
          class="theme-toggle"
          id="theme-btn"
          aria-label="Toggle theme"
        ></button>
      </header>
      <main id="game" class="game"></main>
    </div>
    <script type="module" src="/src/games/flux.ts"></script>
  </body>
</html>
```

**Step 2: Create the CSS**

Create `src/games/flux.css`:

```css
@keyframes fade-in-up {
  from {
    transform: translateY(8px);
    opacity: 0;
  }
}

@keyframes flash-correct {
  50% {
    background: color-mix(in srgb, var(--ctp-green) 20%, transparent);
  }
}

@keyframes flash-wrong {
  50% {
    background: color-mix(in srgb, var(--ctp-red) 20%, transparent);
  }
}

@keyframes switch-flash {
  0% {
    opacity: 1;
    transform: scale(1.1);
  }

  100% {
    opacity: 0;
    transform: scale(1);
  }
}

@media (--motion-reduce) {
  @keyframes fade-in-up {
    from {
      opacity: 0;
    }
  }

  @keyframes flash-correct {
    50% {
      opacity: 0.8;
    }
  }

  @keyframes flash-wrong {
    50% {
      opacity: 0.8;
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
    color var(--dur-250) ease,
    background-color var(--dur-250) ease;
}

.rule-cue {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--ctp-subtext0);
  text-transform: uppercase;
  letter-spacing: 0.1em;

  transition: color var(--dur-150) ease;
}

.switch-label {
  position: absolute;

  font-size: 1.5rem;
  font-weight: 700;
  color: var(--ctp-mauve);

  animation: switch-flash var(--dur-350) ease forwards;
}

.stimulus {
  display: flex;
  align-items: center;
  justify-content: center;

  width: 120px;
  height: 120px;
  border-radius: 12px;

  font-size: 3rem;
  font-weight: 700;

  background: var(--ctp-surface0);
  box-shadow: var(--ctp-shadow);

  transition: background-color var(--dur-150) ease;
}

.stimulus.color-red {
  color: var(--ctp-red);
}

.stimulus.color-blue {
  color: var(--ctp-blue);
}

.stimulus.color-green {
  color: var(--ctp-green);
}

.stimulus.flash-correct {
  animation: flash-correct var(--dur-250) ease;
}

.stimulus.flash-wrong {
  animation: flash-wrong var(--dur-250) ease;
}

.flux-buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;

  width: 100%;
  max-width: 320px;
}

.flux-btn {
  cursor: pointer;

  padding: 0.75rem;
  border: 2px solid var(--ctp-surface1);
  border-radius: 6px;

  font-size: 1rem;
  font-weight: 600;
  color: var(--ctp-text);
  text-align: center;

  background: var(--ctp-surface0);
  box-shadow: var(--ctp-shadow);

  transition:
    border-color var(--dur-150) ease,
    background-color var(--dur-150) ease,
    transform var(--dur-100) ease;

  &:hover {
    transform: translateY(-1px);
    border-color: var(--game-accent, var(--ctp-mauve));
  }

  &:active {
    transform: translateY(0);
  }

  &:focus-visible {
    outline: none;
    box-shadow: var(--ctp-focus-ring);
  }
}

.flux-btn .btn-label-active {
  font-weight: 700;
  color: var(--game-accent, var(--ctp-mauve));
}

.flux-btn .btn-label-inactive {
  font-size: 0.75rem;
  color: var(--ctp-overlay0);
}

.flux-feedback {
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
  transition: color var(--dur-250) ease;
}

.result {
  padding: 2rem 0;
  text-align: center;

  & .final-score {
    margin-bottom: 0.5rem;

    font-size: 2rem;
    font-weight: 700;
    color: var(--ctp-green);

    animation: fade-in-up var(--dur-350) ease both;
  }

  & .result-label {
    color: var(--ctp-subtext0);
    animation: fade-in-up var(--dur-350) ease var(--dur-100) both;
  }

  & .result-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
    animation: fade-in-up var(--dur-350) ease var(--dur-200) both;
  }

  & button {
    cursor: pointer;

    display: inline-flex;
    gap: 0.5rem;
    align-items: center;

    margin-top: 1rem;
    padding: 0.75rem 2rem;
    border: 2px solid transparent;
    border-radius: 6px;

    font-size: 1rem;
    font-weight: 600;
    color: var(--ctp-mantle);

    background: var(--game-accent, var(--ctp-mauve));
    box-shadow: var(--ctp-shadow);

    transition:
      box-shadow var(--dur-150) ease,
      transform var(--dur-100) ease;
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

  & .secondary {
    border-color: var(--ctp-surface1);
    color: var(--ctp-subtext0);
    background: none;
    box-shadow: none;
  }

  & .secondary:hover {
    border-color: var(--ctp-surface2);
    color: var(--ctp-text);
    box-shadow: none;
  }
}
```

**Step 3: Create the game script**

Create `src/games/flux.ts`:

```typescript
import { initTheme, wireToggle } from "../shared/theme";
import { createTimer } from "../shared/timer";
import { recordSessionScore } from "../shared/progress";
import { getStage, recordResult } from "../shared/stages";
import * as sound from "../shared/sounds";
import {
  type FluxState,
  type Trial,
  type Rule,
  type ButtonSide,
  createFluxState,
  generateTrial,
  evaluateResponse,
  updateAdaptation,
} from "./flux-engine";

const DURATION = 60;

function getEl(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`Missing #${id} element`);
  return el;
}
const game = getEl("game");

let state: FluxState;
let currentTrial: Trial | null = null;
let trialTimeout: ReturnType<typeof setTimeout> | null = null;
let currentRemaining = DURATION;
let timerRef: ReturnType<typeof createTimer> | null = null;
let gameOver = false;
let totalTrials = 0;
let correctTrials = 0;
let previousRule: Rule = "color";

function renderPlaying(): void {
  if (!currentTrial) return;

  const ruleName = state.rule === "color" ? "COLOR" : "NUMBER";
  const showSwitch = state.rule !== previousRule && state.trialCount > 0;
  previousRule = state.rule;

  const leftActive = state.rule === "color" ? "Red" : "Odd";
  const leftInactive = state.rule === "color" ? "Odd" : "Red";
  const rightActive = state.rule === "color" ? "Blue" : "Even";
  const rightInactive = state.rule === "color" ? "Even" : "Blue";

  game.innerHTML = `
    <div class="timer">${String(currentRemaining)}s</div>
    <div class="rule-cue">${ruleName}</div>
    ${showSwitch ? '<div class="switch-label">SWITCH</div>' : ""}
    <div class="stimulus color-${currentTrial.color}">${String(currentTrial.number)}</div>
    <div class="flux-buttons">
      <button class="flux-btn" data-side="left">
        <span class="btn-label-active">${leftActive}</span>
        <span class="btn-label-inactive">${leftInactive}</span>
      </button>
      <button class="flux-btn" data-side="right">
        <span class="btn-label-active">${rightActive}</span>
        <span class="btn-label-inactive">${rightInactive}</span>
      </button>
    </div>
    <div class="flux-feedback" id="feedback"></div>
    <div class="score-display">Score: ${String(Math.max(0, state.score))}</div>
  `;
}

function handleResponse(pressed: ButtonSide | null): void {
  if (gameOver || !currentTrial) return;

  if (trialTimeout !== null) {
    clearTimeout(trialTimeout);
    trialTimeout = null;
  }

  const result = evaluateResponse(currentTrial, state.rule, pressed);
  state.score += result.points;
  totalTrials++;
  if (result.correct) correctTrials++;

  updateAdaptation(state, result.correct);

  // Visual feedback
  const stimulus = game.querySelector(".stimulus");
  if (stimulus) {
    stimulus.classList.add(result.correct ? "flash-correct" : "flash-wrong");
  }
  const feedback = document.getElementById("feedback");
  if (feedback && result.feedback) {
    feedback.classList.add(result.correct ? "correct" : "wrong");
    feedback.textContent = result.feedback;
  }

  if (result.correct) {
    sound.playCorrect();
  } else {
    sound.playWrong();
  }

  // Update score display
  const scoreEl = game.querySelector(".score-display");
  if (scoreEl)
    scoreEl.textContent = `Score: ${String(Math.max(0, state.score))}`;

  setTimeout(nextTrial, result.correct ? 400 : 800);
}

function nextTrial(): void {
  if (gameOver) return;

  state.trialCount++;
  currentTrial = generateTrial(state);
  renderPlaying();

  // Auto-advance after interval (if player doesn't respond)
  trialTimeout = setTimeout(() => {
    handleResponse(null);
  }, state.intervalMs);
}

function showResult(): void {
  gameOver = true;
  const finalScore = Math.max(0, state.score);
  recordSessionScore("flux", finalScore);

  const accuracy = totalTrials > 0 ? correctTrials / totalTrials : 0;
  recordResult("flux", accuracy);

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

function startGame(): void {
  const stage = getStage("flux");
  state = createFluxState(stage);
  currentTrial = null;
  currentRemaining = DURATION;
  gameOver = false;
  totalTrials = 0;
  correctTrials = 0;
  previousRule = "color";

  if (timerRef) timerRef.stop();
  if (trialTimeout !== null) clearTimeout(trialTimeout);

  timerRef = createTimer({
    seconds: DURATION,
    onTick: (remaining) => {
      currentRemaining = remaining;
      const el = game.querySelector(".timer");
      if (el) el.textContent = `${String(remaining)}s`;
    },
    onDone: () => {
      if (trialTimeout !== null) clearTimeout(trialTimeout);
      showResult();
    },
  });

  timerRef.start();
  nextTrial();
}

game.addEventListener("click", (e) => {
  const target = (e.target as HTMLElement).closest<HTMLElement>("button");
  if (!target) return;

  if (target.classList.contains("flux-btn")) {
    const side = target.dataset.side as ButtonSide;
    handleResponse(side);
  } else if (target.id === "again-btn") {
    startGame();
  } else if (target.id === "back-btn") {
    window.location.href = "../?completed=flux";
  }
});

startGame();

initTheme();
wireToggle();
```

**Step 4: Add Vite entry**

In `vite.config.ts`, add the flux entry to `rollupOptions.input`:

```typescript
input: {
  main: resolve(__dirname, "index.html"),
  rapid: resolve(__dirname, "games/rapid.html"),
  reaction: resolve(__dirname, "games/reaction.html"),
  vocab: resolve(__dirname, "games/vocab.html"),
  math: resolve(__dirname, "games/math.html"),
  flux: resolve(__dirname, "games/flux.html"),
},
```

**Step 5: Verify build works**

Run: `npx vite build`
Expected: Build succeeds with 6 HTML entries

**Step 6: Commit**

```bash
git add games/flux.html src/games/flux.ts src/games/flux.css vite.config.ts
git commit -m "feat: add Flux game UI with timer, feedback, and stage integration"
```

---

### Task 3: Cipher upgrade — per-word mastery in SRS

Extend the existing `vocab-srs.ts` to track per-word mastery levels for the MCQ → hinted cloze → naked cloze progression.

**Files:**

- Modify: `src/games/vocab-srs.ts:1-85`
- Modify: `test/vocab-srs.test.ts`

**Step 1: Write the failing tests**

Add to `test/vocab-srs.test.ts`:

```typescript
describe("mastery tracking", () => {
  it("returns mastery 0 for unknown words", () => {
    expect(getMastery("no", "tapper")).toBe(0);
  });

  it("increments mastery streak on correct answer", () => {
    recordAnswer("no", "tapper", true, "2026-02-27");
    expect(getMasteryStreak("no", "tapper")).toBe(1);
  });

  it("promotes mastery after 3 consecutive correct", () => {
    for (let i = 0; i < 3; i++) {
      recordAnswer("no", "tapper", true, `2026-03-0${String(i + 1)}`);
    }
    expect(getMastery("no", "tapper")).toBe(1);
  });

  it("resets streak on wrong answer without demoting", () => {
    for (let i = 0; i < 3; i++) {
      recordAnswer("no", "tapper", true, `2026-03-0${String(i + 1)}`);
    }
    expect(getMastery("no", "tapper")).toBe(1);
    recordAnswer("no", "tapper", false, "2026-03-04");
    expect(getMastery("no", "tapper")).toBe(1); // no demotion
    expect(getMasteryStreak("no", "tapper")).toBe(0);
  });

  it("caps mastery at 2", () => {
    for (let i = 0; i < 9; i++) {
      recordAnswer(
        "no",
        "tapper",
        true,
        `2026-03-${String(i + 1).padStart(2, "0")}`,
      );
    }
    expect(getMastery("no", "tapper")).toBe(2);
  });
});
```

Add imports at the top of the test file: `getMastery, getMasteryStreak`

**Step 2: Run tests to verify they fail**

Run: `npx vitest run test/vocab-srs.test.ts`
Expected: FAIL — getMastery is not exported

**Step 3: Extend the SRS module**

In `src/games/vocab-srs.ts`, expand the `WordState` interface and update `recordAnswer`:

Change the `WordState` interface to:

```typescript
interface WordState {
  box: number;
  nextDue: string;
  mastery: number;
  masteryStreak: number;
}
```

Add after `getWordState`:

```typescript
export function getMastery(lang: string, word: string): number {
  return getWordState(lang, word).mastery;
}

export function getMasteryStreak(lang: string, word: string): number {
  return getWordState(lang, word).masteryStreak;
}
```

Update `getWordState` to default mastery fields:

```typescript
export function getWordState(lang: string, word: string): WordState {
  const raw = localStorage.getItem(stateKey(lang, word));
  if (raw === null)
    return { box: 0, nextDue: "", mastery: 0, masteryStreak: 0 };
  const parsed = JSON.parse(raw) as WordState;
  return {
    box: parsed.box ?? 0,
    nextDue: parsed.nextDue ?? "",
    mastery: parsed.mastery ?? 0,
    masteryStreak: parsed.masteryStreak ?? 0,
  };
}
```

Update `recordAnswer` to handle mastery:

```typescript
const MAX_MASTERY = 2;
const MASTERY_THRESHOLD = 3;

export function recordAnswer(
  lang: string,
  word: string,
  correct: boolean,
  today: string,
): void {
  const state = getWordState(lang, word);

  if (correct) {
    const newBox = Math.min(state.box + 1, BOX_INTERVALS.length - 1);
    const interval = BOX_INTERVALS[newBox];
    const nextDue = addDays(today, interval);
    const newStreak = state.masteryStreak + 1;
    let newMastery = state.mastery;
    let resetStreak = newStreak;
    if (newStreak >= MASTERY_THRESHOLD && newMastery < MAX_MASTERY) {
      newMastery++;
      resetStreak = 0;
    }
    localStorage.setItem(
      stateKey(lang, word),
      JSON.stringify({
        box: newBox,
        nextDue,
        mastery: newMastery,
        masteryStreak: resetStreak,
      }),
    );
  } else {
    localStorage.setItem(
      stateKey(lang, word),
      JSON.stringify({
        box: 0,
        nextDue: "",
        mastery: state.mastery,
        masteryStreak: 0,
      }),
    );
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run test/vocab-srs.test.ts`
Expected: All PASS (both old and new tests)

**Step 5: Commit**

```bash
git add src/games/vocab-srs.ts test/vocab-srs.test.ts
git commit -m "feat: add per-word mastery tracking to SRS"
```

---

### Task 4: Cipher upgrade — autocomplete input and cloze modes

Add typed input with fuzzy autocomplete for cloze modes in the Cipher game.

**Files:**

- Modify: `src/games/vocab.ts:1-324`
- Modify: `src/games/vocab.css`

**Step 1: Add autocomplete CSS**

Append to `src/games/vocab.css`:

```css
.cloze-input-wrap {
  position: relative;

  width: 100%;
  max-width: 320px;
}

.cloze-input {
  width: 100%;
  padding: 0.5rem 0;
  border: none;
  border-bottom: 2px solid var(--ctp-surface1);

  font-family: inherit;
  font-size: 1.25rem;
  color: var(--ctp-text);

  background: transparent;

  transition: border-color var(--dur-150) ease;

  &:focus {
    border-color: var(--game-accent, var(--ctp-green));
    outline: none;
  }
}

.cloze-hint {
  font-size: 0.875rem;
  color: var(--ctp-subtext0);
}

.autocomplete-dropdown {
  position: absolute;
  z-index: 10;
  right: 0;
  left: 0;

  overflow: hidden;

  margin-top: 0.25rem;
  border-radius: 6px;

  background: var(--ctp-surface1);
  box-shadow: var(--ctp-shadow-lg);
}

.autocomplete-item {
  cursor: pointer;

  padding: 0.5rem 0.75rem;

  font-size: 1rem;
  color: var(--ctp-text);

  transition: background-color var(--dur-100) ease;

  &:hover,
  &.active {
    background: var(--ctp-surface2);
  }
}

.autocomplete-item .match-prefix {
  color: var(--ctp-blue);
  font-weight: 600;
}
```

**Step 2: Update the game script**

In `src/games/vocab.ts`, add the following changes:

1. Import `getMastery` from `vocab-srs` and `getStage` from `../shared/stages`:

```typescript
import {
  getDueWords,
  recordAnswer,
  getMastery,
  levenshtein,
} from "./vocab-srs";
import { getStage, recordResult } from "../shared/stages";
```

2. Add a `maxMasteryForStage` helper:

```typescript
function maxMasteryForStage(stage: number): number {
  if (stage >= 3) return 2; // naked cloze
  if (stage >= 2) return 1; // hinted cloze
  return 0; // MCQ only
}
```

3. Modify `renderRound()` to branch on mastery level:

- If mastery 0 (or stage gates it): render MCQ choices (existing behavior)
- If mastery 1: render hinted cloze (first 2 letters pre-filled, text input)
- If mastery 2: render naked cloze (empty text input)

4. Add autocomplete logic:

```typescript
let activeDropdownIndex = -1;
let dropdownItems: string[] = [];

function fuzzyMatch(input: string, words: string[]): string[] {
  const lower = input.toLowerCase();
  const prefixMatches = words.filter((w) => w.toLowerCase().startsWith(lower));
  const fuzzyMatches = words.filter(
    (w) =>
      !w.toLowerCase().startsWith(lower) &&
      levenshtein(lower, w.toLowerCase().slice(0, lower.length)) <= 2,
  );
  return [...prefixMatches, ...fuzzyMatches].slice(0, 5);
}

function renderDropdown(matches: string[], inputVal: string): string {
  if (matches.length === 0) return "";
  return `<div class="autocomplete-dropdown">${matches
    .map((word, i) => {
      const lower = word.toLowerCase();
      const inputLower = inputVal.toLowerCase();
      let html: string;
      if (lower.startsWith(inputLower)) {
        html = `<span class="match-prefix">${word.slice(0, inputVal.length)}</span>${word.slice(inputVal.length)}`;
      } else {
        html = word;
      }
      return `<div class="autocomplete-item${i === activeDropdownIndex ? " active" : ""}" data-word="${word}">${html}</div>`;
    })
    .join("")}</div>`;
}
```

5. In `renderRound()`, for cloze modes:

```typescript
const stage = getStage("vocab");
const wordMastery = getMastery(lang, currentEntry.word);
const effectiveMastery = Math.min(wordMastery, maxMasteryForStage(stage));

if (effectiveMastery === 0) {
  // Existing MCQ rendering
} else {
  const hint = effectiveMastery === 1 ? currentEntry.word.slice(0, 2) : "";
  const hintText = hint
    ? `<div class="cloze-hint">Starts with: ${hint}...</div>`
    : "";

  game.innerHTML = `
    <div class="timer">${String(currentRemaining)}s</div>
    <div class="cue-type">Definition</div>
    <div class="cue-text">${currentEntry.definition}</div>
    ${exHtml}
    ${hintText}
    <div class="cloze-input-wrap">
      <input class="cloze-input" type="text" autocomplete="off"
        value="${hint}" placeholder="Type the word..."
        id="cloze-input" />
    </div>
    <div class="feedback" id="feedback"></div>
    <div class="score-display">Score: ${String(Math.floor(score))}</div>
  `;

  const input = document.getElementById("cloze-input") as HTMLInputElement;
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}
```

6. Wire autocomplete events (input, keydown for arrows/Enter, click on dropdown items).

7. For answer submission: use `levenshtein(input, answer) <= 1` for acceptance.

**Full implementation details**: The existing `handleChoice` function stays for MCQ mode. Add a new `handleClozeSubmit(input: string)` function that follows the same pattern (checks answer, updates score/streak, records SRS, plays sound, shows feedback, calls `setTimeout(nextRound, ...)`).

**Step 3: Verify manually**

Run: `npx vite` (dev server) and test:

1. MCQ mode works as before
2. For words at mastery 1 (if stage >= 2): hinted cloze shows
3. Autocomplete dropdown appears after typing 2+ chars
4. Arrow keys navigate, Enter selects
5. Fuzzy acceptance works

**Step 4: Commit**

```bash
git add src/games/vocab.ts src/games/vocab.css
git commit -m "feat: add cloze modes and autocomplete to Cipher"
```

---

### Task 5: Hub — wire stages and update game list

Update the hub to show 3 games (Crown, Flux, Cipher), display stage info inline, and add advance/retreat buttons.

**Files:**

- Modify: `src/shared/progress.ts:1-2` — update GAMES array
- Modify: `src/hub.ts` — add Flux, remove Spark/Tally, render stages
- Modify: `src/hub.css` — add stage/readiness styles
- Modify: `test/progress.test.ts:87-91` — update GAMES assertion

**Step 1: Update the GAMES array**

In `src/shared/progress.ts` line 1:

```typescript
export const GAMES = ["rapid", "flux", "vocab"] as const;
```

**Step 2: Update the progress test**

In `test/progress.test.ts`, update the GAMES test:

```typescript
describe("GAMES", () => {
  it("has three games", () => {
    expect(GAMES).toEqual(["rapid", "flux", "vocab"]);
  });
});
```

**Step 3: Run tests to verify**

Run: `npx vitest run test/progress.test.ts`
Expected: PASS

**Step 4: Update hub.ts**

Key changes to `src/hub.ts`:

1. Import stages module:

```typescript
import {
  getStage,
  readiness,
  advance,
  retreat,
  type Readiness,
} from "./shared/stages";
```

2. Update `GAME_LABELS`, `GAME_URLS`, `GAME_ICONS`, `GAME_ACCENTS` — remove `reaction` and `math`, add `flux`:

```typescript
const GAME_LABELS: Record<string, string> = {
  rapid: "Crown",
  flux: "Flux",
  vocab: "Cipher",
};

const GAME_URLS: Record<string, string> = {
  rapid: "games/rapid.html",
  flux: "games/flux.html",
  vocab: "games/vocab.html",
};

const GAME_ICONS: Record<string, string> = {
  rapid: `<svg ...crown icon...>`,
  flux: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M3.7 7.8 12 12l8.3-4.2M3.7 16.2 12 12l8.3 4.2"/></svg>`,
  vocab: `<svg ...key icon...>`,
};

const GAME_ACCENTS: Record<string, string> = {
  rapid: "var(--ctp-blue)",
  flux: "var(--ctp-mauve)",
  vocab: "var(--ctp-green)",
};
```

3. Define readiness thresholds per game:

```typescript
const READINESS_THRESHOLDS: Record<string, number> = {
  rapid: 0.6, // 3/5 wins
  flux: 0.8, // 80% accuracy
  vocab: 0.8, // 80% accuracy
};
```

4. In the `render()` function, for each game card, add stage info:

```typescript
const stage = getStage(game);
const threshold = READINESS_THRESHOLDS[game] ?? 0.8;
const ready = readiness(game, threshold);
const stageSuffix = ` · Stage ${String(stage)}`;
const dotClass = `readiness-dot readiness-${ready}`;
```

Render the card name as `${GAME_LABELS[game]}${stageSuffix}` with a readiness dot span and, when `ready === "green"`, an advance button.

5. Add event handlers for advance/retreat buttons.

**Step 5: Add hub CSS for stages**

Append to `src/hub.css`:

```css
.readiness-dot {
  display: inline-block;

  width: 8px;
  height: 8px;
  margin-left: 0.5rem;
  border-radius: 50%;

  vertical-align: middle;

  background: var(--ctp-overlay0);

  transition: background-color var(--dur-250) ease;
}

.readiness-grey {
  background: var(--ctp-overlay0);
}

@keyframes readiness-pulse {
  0%,
  100% {
    opacity: 0.6;
  }

  50% {
    opacity: 1;
  }
}

.readiness-amber {
  background: var(--ctp-peach);
  animation: readiness-pulse 2s ease-in-out infinite;
}

@keyframes readiness-glow {
  0%,
  100% {
    box-shadow: 0 0 4px var(--ctp-green);
  }

  50% {
    box-shadow: 0 0 8px var(--ctp-green);
  }
}

.readiness-green {
  background: var(--ctp-green);
  animation: readiness-glow 2s ease-in-out infinite;
}

@media (--motion-reduce) {
  @keyframes readiness-pulse {
    0%,
    50%,
    100% {
      opacity: 1;
    }
  }

  @keyframes readiness-glow {
    0%,
    50%,
    100% {
      box-shadow: 0 0 4px var(--ctp-green);
    }
  }
}

.advance-btn {
  cursor: pointer;

  margin-left: auto;
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--ctp-green);
  border-radius: 4px;

  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ctp-green);

  background: transparent;

  transition:
    background-color var(--dur-150) ease,
    color var(--dur-150) ease;

  &:hover {
    color: var(--ctp-mantle);
    background: var(--ctp-green);
  }
}

.retreat-btn {
  cursor: pointer;

  padding: 0.25rem 0.5rem;
  border: none;

  font-size: 0.75rem;
  color: var(--ctp-subtext0);

  background: transparent;

  transition: color var(--dur-150) ease;

  &:hover {
    color: var(--ctp-text);
  }
}

.game-stage {
  font-size: 0.75rem;
  color: var(--ctp-subtext0);
}
```

**Step 6: Verify manually**

Run: `npx vite` and check:

1. Hub shows 3 games: Crown, Flux, Cipher
2. Each card shows "· Stage 1" and a grey dot
3. After playing Flux, readiness data is recorded
4. Advance button appears when readiness is green

**Step 7: Run all tests**

Run: `npx vitest run`
Expected: All PASS

**Step 8: Commit**

```bash
git add src/shared/progress.ts src/hub.ts src/hub.css test/progress.test.ts
git commit -m "feat: hub shows 3 games with stage progression and readiness indicators"
```

---

### Task 5b: Create Flux docs icon

Create the Lucide-style icon for Flux in the docs folder (for README).

**Files:**

- Create: `docs/icons/flux.svg`

**Step 1: Create icon**

Create `docs/icons/flux.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ca9ee6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M3.7 7.8 12 12l8.3-4.2M3.7 16.2 12 12l8.3 4.2"/></svg>
```

(Uses `#ca9ee6` = Catppuccin Frappe mauve, matching Flux's accent.)

**Step 2: Commit**

```bash
git add docs/icons/flux.svg
git commit -m "docs: add Flux icon"
```

---

### Task 6: Wire stages into Crown

Make Crown read its stage to set engine Elo.

**Files:**

- Modify: `src/games/rapid.ts:325-326` — use stage to determine Elo
- Modify: `src/games/rapid.ts` — record result after game ends

**Step 1: Import stages**

Add to `src/games/rapid.ts` imports:

```typescript
import { getStage, recordResult } from "../shared/stages";
```

**Step 2: Replace random Elo with stage-based Elo**

Replace lines 325-326 (`engineElo = 1200 + ...`, `baseNodes = eloToNodes(engineElo)`) with:

```typescript
const stage = getStage("rapid");
const eloByStage: Record<number, number> = { 1: 600, 2: 1200, 3: 1600 };
engineElo = eloByStage[stage] ?? 1200;
baseNodes = eloToNodes(engineElo);
```

**Step 3: Record result after game ends**

In `finishGame`, add after `recordSessionScore`:

```typescript
recordResult("rapid", result); // 1 = win, 0.5 = draw, 0 = loss
```

**Step 4: Verify manually**

Run dev server, play a Crown game, verify it uses the correct Elo for stage 1 (~600). Check localStorage for `brainbout:stage:rapid` data.

**Step 5: Commit**

```bash
git add src/games/rapid.ts
git commit -m "feat: Crown uses stage-based Elo tiers"
```

---

### Task 7: Wire stages into Cipher

Make Cipher gate mastery levels based on its stage.

**Files:**

- Modify: `src/games/vocab.ts` — record accuracy result after game

**Step 1: Record result**

In `showResult()` in `src/games/vocab.ts`, before the existing `recordSessionScore` call, calculate and record accuracy:

```typescript
// Calculate session accuracy for stage progression
const sessionAccuracy = totalCorrect / totalAttempts; // add these counters
recordResult("vocab", sessionAccuracy);
```

Add `let totalCorrect = 0; let totalAttempts = 0;` to the game state variables. Increment `totalAttempts` in `handleChoice`/`handleClozeSubmit`, and `totalCorrect` when correct.

**Step 2: The `maxMasteryForStage` gating** was already added in Task 4. Verify the logic works by checking that at stage 1 all words render as MCQ regardless of mastery.

**Step 3: Commit**

```bash
git add src/games/vocab.ts
git commit -m "feat: Cipher records accuracy for stage progression"
```

---

### Task 8: Remove Spark and Tally

Delete the old games and clean up references.

**Files:**

- Delete: `src/games/reaction.ts`
- Delete: `src/games/reaction.css`
- Delete: `games/reaction.html`
- Delete: `src/games/math.ts`
- Delete: `src/games/math.css`
- Delete: `games/math.html`
- Delete: `test/reaction.test.ts`
- Delete: `test/math.test.ts`
- Delete: `docs/icons/zap.svg` (Spark icon)
- Delete: `docs/icons/hash.svg` (Tally icon)
- Modify: `vite.config.ts` — remove reaction and math entries
- Modify: `README.md` and `README.md.tpl` — update game list, descriptions, and counts

**Step 1: Delete files**

```bash
rm src/games/reaction.ts src/games/reaction.css games/reaction.html
rm src/games/math.ts src/games/math.css games/math.html
rm test/reaction.test.ts test/math.test.ts
rm docs/icons/zap.svg docs/icons/hash.svg
```

**Step 2: Update vite.config.ts**

Remove `reaction` and `math` from `rollupOptions.input`:

```typescript
input: {
  main: resolve(__dirname, "index.html"),
  rapid: resolve(__dirname, "games/rapid.html"),
  vocab: resolve(__dirname, "games/vocab.html"),
  flux: resolve(__dirname, "games/flux.html"),
},
```

**Step 3: Update README.md and README.md.tpl**

Update game list to 3 games:

```markdown
3 timed cognitive games in ~18 minutes. No accounts, no ads, no internet required. Progress tracked locally.

- <img src="docs/icons/crown.svg" width="16" /> **Crown** — Chess960 rapid, 15+10 vs Stockfish
- <img src="docs/icons/flux.svg" width="16" /> **Flux** — adaptive rule-switching with inhibition (60s)
- <img src="docs/icons/key.svg" width="16" /> **Cipher** — Norwegian vocabulary with per-word mastery (120s)
```

Update the Roadmap section to remove Spark/Tally references.

**Step 4: Run all tests**

Run: `npx vitest run`
Expected: All PASS (reaction and math tests deleted, remaining tests pass)

**Step 5: Verify build**

Run: `npx vite build`
Expected: Build succeeds with 4 HTML entries

**Step 6: Run lint**

Run: `npm run lint && npm run lint:css && npm run lint:tokens && npm run format:check`
Expected: All pass

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: remove Spark and Tally, finalize 3-game layout"
```

---

## Summary

| Task | Description                              | Dependencies |
| :--- | :--------------------------------------- | :----------- |
| 0    | Stage progression module                 | none         |
| 1    | Flux game — core logic                   | none         |
| 2    | Flux game — UI, HTML, CSS, Vite entry    | 0, 1         |
| 3    | Cipher upgrade — per-word mastery in SRS | none         |
| 4    | Cipher upgrade — autocomplete + cloze UI | 3            |
| 5    | Hub — wire stages and update game list   | 0            |
| 5b   | Create Flux docs icon                    | none         |
| 6    | Wire stages into Crown                   | 0            |
| 7    | Wire stages into Cipher                  | 0, 4         |
| 8    | Remove Spark and Tally                   | 2, 5, 6, 7   |
