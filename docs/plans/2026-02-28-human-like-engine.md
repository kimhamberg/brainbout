# Human-Like Engine Experience — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Make Chess960 rapid feel like playing a human — variable strength, natural think times, real opponent clock.

**Architecture:** Per-game random Elo (1200-1800) controls UCI_Elo and node cap. A think-time model simulates human time management. Both players have real 15+10 clocks; the engine's ticks during its synthetic delay and can flag.

**Tech Stack:** TypeScript, Stockfish WASM (UCI), Vitest, Chessground

---

### Task 0: Create think-time module with tests

**Files:**

- Create: `src/shared/think-time.ts`
- Create: `test/think-time.test.ts`

**Step 1: Write failing tests**

```typescript
// test/think-time.test.ts
import { describe, it, expect } from "vitest";
import { computeThinkTime, eloToNodes } from "../src/shared/think-time";

describe("eloToNodes", () => {
  it("returns ~1500 nodes at 1200 Elo", () => {
    const n = eloToNodes(1200);
    expect(n).toBeGreaterThan(1000);
    expect(n).toBeLessThan(3000);
  });

  it("returns ~25000 nodes at 1800 Elo", () => {
    const n = eloToNodes(1800);
    expect(n).toBeGreaterThan(15000);
    expect(n).toBeLessThan(40000);
  });

  it("scales logarithmically", () => {
    const low = eloToNodes(1200);
    const mid = eloToNodes(1500);
    const high = eloToNodes(1800);
    expect(mid / low).toBeLessThan(high / mid);
  });
});

describe("computeThinkTime", () => {
  it("returns time in ms between 1000 and 30000", () => {
    const t = computeThinkTime({
      remainingMs: 600_000,
      moveNumber: 15,
      evalSwing: 50,
      isRecapture: false,
    });
    expect(t).toBeGreaterThanOrEqual(1000);
    expect(t).toBeLessThanOrEqual(30000);
  });

  it("thinks faster on recaptures", () => {
    const base = { remainingMs: 600_000, moveNumber: 15, evalSwing: 50 };
    const normal = computeThinkTime({ ...base, isRecapture: false });
    const recap = computeThinkTime({ ...base, isRecapture: true });
    expect(recap).toBeLessThan(normal);
  });

  it("thinks faster in time trouble", () => {
    const base = { moveNumber: 20, evalSwing: 30, isRecapture: false };
    const relaxed = computeThinkTime({ ...base, remainingMs: 300_000 });
    const trouble = computeThinkTime({ ...base, remainingMs: 30_000 });
    expect(trouble).toBeLessThan(relaxed);
  });

  it("never exceeds remainingMs - 5000", () => {
    const t = computeThinkTime({
      remainingMs: 8000,
      moveNumber: 35,
      evalSwing: 200,
      isRecapture: false,
    });
    expect(t).toBeLessThanOrEqual(3000);
  });

  it("thinks longer in complex positions", () => {
    const base = { remainingMs: 600_000, moveNumber: 15, isRecapture: false };
    const simple = computeThinkTime({ ...base, evalSwing: 5 });
    const complex = computeThinkTime({ ...base, evalSwing: 200 });
    expect(complex).toBeGreaterThan(simple);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run test/think-time.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```typescript
// src/shared/think-time.ts

/** Duhamel formula: nodes = e^((elo + 839) / 243) */
export function eloToNodes(elo: number): number {
  return Math.round(Math.exp((elo + 839) / 243));
}

export interface ThinkTimeInput {
  remainingMs: number;
  moveNumber: number;
  /** Absolute centipawn eval swing between successive depths. */
  evalSwing: number;
  isRecapture: boolean;
}

/**
 * Compute synthetic think time in ms for the engine's current move.
 *
 * Chess960-aware: no opening discount (no theory to lean on).
 * Models: base budget, complexity scaling, recapture shortcut,
 * time-trouble panic, and jitter.
 */
export function computeThinkTime(input: ThinkTimeInput): number {
  const { remainingMs, moveNumber, evalSwing, isRecapture } = input;

  // Budget: divide remaining time among expected remaining moves
  const movesLeft = Math.max(10, 40 - moveNumber);
  let base = remainingMs / movesLeft;

  // Complexity factor from eval swing (centipawns)
  // 0-20 cp = stable (0.5-0.8x), 20-100 cp = normal (1x), 100+ = complex (1.5-2x)
  let complexity: number;
  if (evalSwing < 20) {
    complexity = 0.5 + (evalSwing / 20) * 0.3; // 0.5 - 0.8
  } else if (evalSwing < 100) {
    complexity = 0.8 + ((evalSwing - 20) / 80) * 0.7; // 0.8 - 1.5
  } else {
    complexity = Math.min(2.0, 1.5 + ((evalSwing - 100) / 200) * 0.5);
  }

  // Recaptures are near-instant for humans
  if (isRecapture) {
    complexity *= 0.3;
  }

  base *= complexity;

  // Jitter: +/- 20%
  const jitter = 0.8 + Math.random() * 0.4;
  base *= jitter;

  // Clamp: [1s, min(30s, remaining - 5s)]
  const maxTime = Math.min(30_000, remainingMs - 5000);
  return Math.max(1000, Math.min(base, maxTime));
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run test/think-time.test.ts`
Expected: PASS (all 7 tests)

**Step 5: Commit**

```bash
git add src/shared/think-time.ts test/think-time.test.ts
git commit -m "feat: add think-time model for human-like engine delays"
```

---

### Task 1: Add info-line collection and Elo config to engine

**Files:**

- Modify: `src/shared/engine.ts`
- Modify: `test/engine.test.ts`

**Step 1: Write failing tests**

Append to `test/engine.test.ts`:

```typescript
describe("StockfishEngine info collection", () => {
  // These test the public parsing functions which are already tested,
  // but we add a test for the new getLastEvalSwing() concept.
  it("computes eval swing from successive info lines", () => {
    // Test the exported helper directly
    expect(
      computeEvalSwing(
        { depth: 4, score: { type: "cp", value: 30 }, pv: [] },
        { depth: 5, score: { type: "cp", value: 80 }, pv: [] },
      ),
    ).toBe(50);
  });

  it("returns 0 swing when scores are equal", () => {
    expect(
      computeEvalSwing(
        { depth: 4, score: { type: "cp", value: 30 }, pv: [] },
        { depth: 5, score: { type: "cp", value: 30 }, pv: [] },
      ),
    ).toBe(0);
  });

  it("returns large swing for mate vs cp", () => {
    const swing = computeEvalSwing(
      { depth: 4, score: { type: "cp", value: 30 }, pv: [] },
      { depth: 5, score: { type: "mate", value: 3 }, pv: [] },
    );
    expect(swing).toBeGreaterThan(500);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run test/engine.test.ts`
Expected: FAIL — `computeEvalSwing` not found

**Step 3: Implement changes in engine.ts**

Add `computeEvalSwing` export:

```typescript
/** Compute absolute eval swing between two info lines (centipawns). */
export function computeEvalSwing(prev: EngineInfo, curr: EngineInfo): number {
  const toCP = (s: EngineInfo["score"]): number =>
    s.type === "mate" ? (s.value > 0 ? 10000 : -10000) : s.value;
  return Math.abs(toCP(curr.score) - toCP(prev.score));
}
```

Modify `StockfishEngine`:

1. Add fields for info collection and Elo:

```typescript
private infoLines: EngineInfo[] = [];
private onInfo: ((info: EngineInfo) => void) | null = null;
```

2. Change `init()` — accept `elo` parameter, remove hardcoded 1500:

```typescript
public async init(elo: number = 1500): Promise<void> {
  // ... existing worker setup ...
  this.send("setoption name UCI_Chess960 value true");
  this.send("setoption name UCI_LimitStrength value true");
  this.send(`setoption name UCI_Elo value ${elo}`);
  this.send("isready");
}
```

3. Change `go()` — accept `nodes` instead of hardcoded depth 8, accept info callback:

```typescript
public go(
  startFen: string,
  moves: string[],
  callback: BestMoveCallback,
  options?: { nodes?: number; onInfo?: (info: EngineInfo) => void },
): void {
  this.onBestMove = callback;
  this.onInfo = options?.onInfo ?? null;
  this.infoLines = [];
  const movesStr = moves.length > 0 ? ` moves ${moves.join(" ")}` : "";
  this.send(`position fen ${startFen}${movesStr}`);
  const searchCmd = options?.nodes
    ? `go nodes ${options.nodes}`
    : "go depth 8";
  this.send(searchCmd);
}
```

4. Update `handleLine()` to collect info lines:

```typescript
private handleLine(line: string): void {
  const info = parseInfoLine(line);
  if (info) {
    this.infoLines.push(info);
    this.onInfo?.(info);
    return;
  }
  const bestMove = parseBestMove(line);
  if (bestMove !== null) {
    this.onBestMove?.(bestMove);
  }
}
```

5. Add getter for eval swing:

```typescript
public getEvalSwing(): number {
  if (this.infoLines.length < 2) return 0;
  const prev = this.infoLines[this.infoLines.length - 2];
  const curr = this.infoLines[this.infoLines.length - 1];
  return computeEvalSwing(prev, curr);
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run test/engine.test.ts`
Expected: PASS (all 6 tests — 3 old + 3 new)

**Step 5: Commit**

```bash
git add src/shared/engine.ts test/engine.test.ts
git commit -m "feat: engine accepts Elo and node count, collects info lines"
```

---

### Task 2: Add engine clock to rapid game

**Files:**

- Modify: `src/games/rapid.ts`
- Modify: `src/games/rapid.css`
- Modify: `test/rapid.test.ts`

**Step 1: Write failing test for engine clock**

Append to `test/rapid.test.ts`:

```typescript
describe("dual clocks", () => {
  it("engine clock ticks independently from player clock", () => {
    const playerTicks: number[] = [];
    const engineTicks: number[] = [];
    const playerClock = createClock({
      initialMs: 3000,
      incrementMs: 0,
      onTick: (ms) => playerTicks.push(ms),
      onFlag: () => {},
    });
    const engineClock = createClock({
      initialMs: 3000,
      incrementMs: 0,
      onTick: (ms) => engineTicks.push(ms),
      onFlag: () => {},
    });

    // Start only engine clock
    engineClock.start();
    vi.advanceTimersByTime(200);
    engineClock.stop();

    expect(engineTicks.length).toBeGreaterThanOrEqual(2);
    expect(playerTicks.length).toBe(0);
  });
});
```

**Step 2: Run tests to verify they pass (clock is already reusable)**

Run: `npx vitest run test/rapid.test.ts`
Expected: PASS — `createClock` already supports multiple instances

**Step 3: Add engine clock to rapid.ts game state**

Add new state variables near line 98:

```typescript
let engineClock: ChessClock;
let engineElo: number;
let baseNodes: number;
let lastMoveWasCapture = false;
```

**Step 4: Update `renderGame()` to show both clocks**

Change the HTML in `renderGame()` to add engine clock above the board:

```typescript
function renderGame(): void {
  game.innerHTML = `
    <div class="clock dimmed" id="engine-clock">${formatClock(INITIAL_MS)}</div>
    <div class="rapid-board"></div>
    <div class="game-status">Loading engine...</div>
    <div class="clock" id="player-clock">${formatClock(INITIAL_MS)}</div>
  `;
  // ... rest of Chessground init unchanged ...
}
```

**Step 5: Add engine clock CSS**

Append to `src/games/rapid.css`:

```css
.clock.dimmed {
  opacity: 0.5;
}
```

**Step 6: Update `main()` — create engine clock, pick random Elo**

Replace the main() function's clock + engine init section:

```typescript
async function main(): Promise<void> {
  const { fen } = randomChess960();
  startFen = fen;
  const setup = parseFen(fen).unwrap();
  pos = Chess.fromSetup(setup).unwrap();

  // Pick random Elo for this game
  engineElo = 1200 + Math.floor(Math.random() * 601); // [1200, 1800]
  baseNodes = eloToNodes(engineElo);

  clock = createClock({
    initialMs: INITIAL_MS,
    incrementMs: INCREMENT_MS,
    onTick: (ms) => {
      const el = document.getElementById("player-clock");
      if (el) {
        el.textContent = formatClock(ms);
        el.classList.toggle("low", ms < 60000);
      }
    },
    onFlag,
  });

  engineClock = createClock({
    initialMs: INITIAL_MS,
    incrementMs: INCREMENT_MS,
    onTick: (ms) => {
      const el = document.getElementById("engine-clock");
      if (el) {
        el.textContent = formatClock(ms);
        el.classList.toggle("low", ms < 60000);
      }
    },
    onFlag: onEngineFlag,
  });

  renderGame();

  engine = new StockfishEngine();
  await engine.init(engineElo);
  engine.newGame();

  updateStatus("Your move");
  clock.start();
  dimClock("engine-clock", true);
  dimClock("player-clock", false);
}
```

Add helper:

```typescript
function dimClock(id: string, dim: boolean): void {
  document.getElementById(id)?.classList.toggle("dimmed", dim);
}

function onEngineFlag(): void {
  gameOver = true;
  finishGame(1, "Opponent flagged — you win!");
}
```

**Step 7: Update `checkGameEnd()` to stop both clocks**

Replace every `clock.stop()` with:

```typescript
clock.stop();
engineClock.stop();
```

**Step 8: Commit**

```bash
git add src/games/rapid.ts src/games/rapid.css test/rapid.test.ts
git commit -m "feat: add engine clock with dual-clock UI"
```

---

### Task 3: Wire think-time delay into game flow

**Files:**

- Modify: `src/games/rapid.ts`

**Step 1: Add import**

```typescript
import { computeThinkTime, eloToNodes } from "../shared/think-time";
```

**Step 2: Update `onPlayerMove()` — compute think time, add delay**

Replace the engine call section (currently lines 222-225):

```typescript
if (checkGameEnd()) return;

updateStatus("Thinking...");

// Switch clocks: player stops, engine starts
dimClock("player-clock", true);
dimClock("engine-clock", false);
engineClock.start();

// Compute node count with per-move variance (0.7x-1.3x)
const timeTroubleMultiplier = engineClock.remaining() < 60_000 ? 0.5 : 1.0;
const variance = 0.7 + Math.random() * 0.6;
const nodes = Math.round(baseNodes * variance * timeTroubleMultiplier);

// Track last move for recapture detection
const wasCapture = isCapture;

// Start engine search (fast, <1s in WASM)
engine.go(
  startFen,
  moves,
  (bestMove: string) => {
    // Compute think time based on search results
    const thinkMs = computeThinkTime({
      remainingMs: engineClock.remaining(),
      moveNumber: moves.length,
      evalSwing: engine.getEvalSwing(),
      isRecapture: wasCapture,
    });

    // Engine already searched; delay the rest synthetically
    setTimeout(() => {
      engineClock.stop();
      engineClock.addIncrement();
      dimClock("engine-clock", true);
      dimClock("player-clock", false);
      onEngineMove(bestMove);
    }, thinkMs);
  },
  { nodes },
);
```

**Step 3: Update `onEngineMove()` — remove clock.start() (now handled in the setTimeout)**

The existing `onEngineMove()` at lines 197-200 currently does:

```typescript
if (checkGameEnd()) return;
clock.start();
updateStatus("Your move");
```

Keep this as-is. The player's clock starts after the engine move is played, which is correct.

**Step 4: Verify manually**

Run: `make dev`
Play a move. Engine should:

1. Show "Thinking..." status
2. Engine clock ticks for 1-25s
3. Engine plays its move
4. Player clock resumes

**Step 5: Commit**

```bash
git add src/games/rapid.ts
git commit -m "feat: wire think-time delay and node-limited search into game flow"
```

---

### Task 4: Run full test suite and fix any breakage

**Files:**

- Possibly modify: `test/rapid.test.ts` (if Worker stub needs updating for new init signature)

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: All 57+ tests pass (rapid tests may need Worker stub updated for `init(elo)`)

**Step 2: Fix any issues**

If `rapid.test.ts` fails because `init()` now takes an `elo` param, the Worker stub should still work since it's a no-op. But if there's an issue with the `eloToNodes` import path, fix the stub.

**Step 3: Commit fixes if needed**

```bash
git add -u
git commit -m "test: fix test compatibility with engine Elo parameter"
```

---

### Task 5: Manual playtest and polish

**Step 1: Run dev server**

Run: `make dev`

**Step 2: Verify the full experience**

Checklist:

- [ ] Engine clock appears above the board
- [ ] Player clock appears below the board
- [ ] Active clock is full opacity, inactive is dimmed
- [ ] Engine "thinks" for realistic variable durations (1-25s)
- [ ] Engine thinks faster on recaptures
- [ ] Engine thinks faster in time trouble
- [ ] Engine clock can flag (test by waiting)
- [ ] Low-time warning (red text) works on both clocks
- [ ] Sounds play correctly after engine delay
- [ ] Status shows "Thinking..." during engine turn
- [ ] Status shows "Your move" during player turn
- [ ] Game ends correctly for all conditions (checkmate, stalemate, flag)

**Step 3: Commit any polish**

```bash
git add -u
git commit -m "feat: polish human-like engine experience"
```
