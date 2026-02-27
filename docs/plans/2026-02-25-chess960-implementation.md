# Chess960 vs Stockfish — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Chess960 app where you play against Stockfish locally, with a polished board UI, adjustable difficulty, and deployable as a single Go binary (Linux/Windows) or Android APK.

**Architecture:** Shared web frontend (Chessground board + chessops logic + Stockfish WASM engine) served by a Go binary on desktop or bundled in an Android WebView APK.

**Tech Stack:** TypeScript, Vite, `@lichess-org/chessground`, `chessops`, `stockfish` (nmrugg), Vitest, Go 1.21+, Android SDK (Kotlin)

---

## Project Structure

```
chess960/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── public/
│   └── stockfish/
│       ├── stockfish-18-lite-single.js
│       └── stockfish-18-lite-single.wasm
├── src/
│   ├── main.ts
│   ├── chess960.ts
│   ├── engine.ts
│   ├── game.ts
│   ├── board.ts
│   ├── ui.ts
│   └── style.css
├── test/
│   ├── chess960.test.ts
│   ├── engine.test.ts
│   └── game.test.ts
├── server/
│   ├── go.mod
│   └── main.go
└── android/
    └── (Android project)
```

---

### Task 1: Project Scaffolding

**Files:**

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.ts`
- Create: `src/style.css`

**Step 1: Initialize npm project and install dependencies**

```bash
cd /home/kim/chess960
npm init -y
npm install @lichess-org/chessground chessops
npm install -D typescript vite vitest
```

**Step 2: Copy Stockfish WASM files**

```bash
npm install stockfish
mkdir -p public/stockfish
cp node_modules/stockfish/src/stockfish-18-lite-single.js public/stockfish/
cp node_modules/stockfish/src/stockfish-18-lite-single.wasm public/stockfish/
```

Note: if `stockfish-18-lite-single.*` files don't exist, check the `node_modules/stockfish/src/` directory for available filenames — the naming convention may differ. Use whatever single-threaded lite variant is available.

**Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "outDir": "dist",
    "sourceMap": true
  },
  "include": ["src"]
}
```

**Step 4: Create `vite.config.ts`**

```ts
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  build: {
    outDir: "dist",
  },
});
```

**Step 5: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Chess960</title>
    <link rel="stylesheet" href="/src/style.css" />
  </head>
  <body>
    <div id="app">
      <div id="board-container">
        <div id="board"></div>
      </div>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

**Step 6: Create `src/style.css`**

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  background: #1a1a2e;
  color: #e0e0e0;
  font-family:
    system-ui,
    -apple-system,
    sans-serif;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
}

#board-container {
  display: flex;
  justify-content: center;
  align-items: center;
}

#board {
  width: 480px;
  height: 480px;
}

@media (max-width: 520px) {
  #board {
    width: 95vw;
    height: 95vw;
  }
}
```

**Step 7: Create `src/main.ts`**

```ts
import "@lichess-org/chessground/assets/chessground.base.css";
import "@lichess-org/chessground/assets/chessground.brown.css";
import "@lichess-org/chessground/assets/chessground.cburnett.css";

console.log("Chess960 app loaded");
```

**Step 8: Verify dev server starts**

Run: `npx vite`
Expected: Dev server starts at `http://localhost:5173`, page shows dark background, console logs "Chess960 app loaded"

**Step 9: Commit**

```bash
git add package.json tsconfig.json vite.config.ts index.html src/ public/
git commit -m "feat: project scaffolding with Vite, chessground, chessops, stockfish"
```

---

### Task 2: Chess960 Position Generator (TDD)

**Files:**

- Create: `src/chess960.ts`
- Create: `test/chess960.test.ts`

**Step 1: Write failing tests**

```ts
// test/chess960.test.ts
import { describe, it, expect } from "vitest";
import { chess960Backrank, chess960Fen } from "../src/chess960";

describe("chess960Backrank", () => {
  it("returns standard chess position for id 518", () => {
    // Position 518 is the standard chess starting position
    expect(chess960Backrank(518)).toEqual([
      "R",
      "N",
      "B",
      "Q",
      "K",
      "B",
      "N",
      "R",
    ]);
  });

  it("returns position 0 correctly", () => {
    const rank = chess960Backrank(0);
    expect(rank).toHaveLength(8);
    // Position 0: B on b, B on a, Q first empty, NN first empties, RKR
    expect(rank).toEqual(["B", "B", "Q", "N", "N", "R", "K", "R"]);
  });

  it("returns position 959 correctly", () => {
    const rank = chess960Backrank(959);
    expect(rank).toHaveLength(8);
    expect(rank).toEqual(["R", "K", "R", "N", "N", "Q", "B", "B"]);
  });

  it("always has exactly one king between two rooks", () => {
    for (let id = 0; id < 960; id++) {
      const rank = chess960Backrank(id);
      const rookIndices = rank.reduce<number[]>(
        (acc, p, i) => (p === "R" ? [...acc, i] : acc),
        [],
      );
      const kingIndex = rank.indexOf("K");
      expect(rookIndices).toHaveLength(2);
      expect(kingIndex).toBeGreaterThan(rookIndices[0]);
      expect(kingIndex).toBeLessThan(rookIndices[1]);
    }
  });

  it("always has bishops on opposite-colored squares", () => {
    for (let id = 0; id < 960; id++) {
      const rank = chess960Backrank(id);
      const bishopIndices = rank.reduce<number[]>(
        (acc, p, i) => (p === "B" ? [...acc, i] : acc),
        [],
      );
      expect(bishopIndices).toHaveLength(2);
      expect(bishopIndices[0] % 2).not.toBe(bishopIndices[1] % 2);
    }
  });

  it("produces 960 unique positions", () => {
    const positions = new Set<string>();
    for (let id = 0; id < 960; id++) {
      positions.add(chess960Backrank(id).join(""));
    }
    expect(positions.size).toBe(960);
  });
});

describe("chess960Fen", () => {
  it("returns valid FEN for standard position", () => {
    const { fen } = chess960Fen(518);
    // Standard position FEN (with Shredder castling rights)
    expect(fen).toContain("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR");
    expect(fen).toContain(" w ");
    expect(fen).toEndWith(" 0 1");
  });

  it("includes Shredder-style castling rights", () => {
    const { fen } = chess960Fen(518);
    // Standard position rooks are on a and h files
    expect(fen).toContain("HAha");
  });

  it("returns correct id", () => {
    const { id } = chess960Fen(42);
    expect(id).toBe(42);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run test/chess960.test.ts`
Expected: FAIL — module `../src/chess960` does not export `chess960Backrank` or `chess960Fen`

**Step 3: Implement the position generator**

```ts
// src/chess960.ts

/**
 * Generate the back rank piece arrangement for a Chess960 position ID (0-959).
 * Uses the Scharnagl numbering system.
 */
export function chess960Backrank(id: number): string[] {
  const pieces = new Array<string | null>(8).fill(null);

  // 1. Light-square bishop: files b(1), d(3), f(5), h(7)
  pieces[(id % 4) * 2 + 1] = "B";
  let n = Math.floor(id / 4);

  // 2. Dark-square bishop: files a(0), c(2), e(4), g(6)
  pieces[(n % 4) * 2] = "B";
  n = Math.floor(n / 4);

  // 3. Queen placed in nth empty square (0-5)
  const q = n % 6;
  let count = 0;
  for (let i = 0; i < 8; i++) {
    if (pieces[i] === null) {
      if (count === q) {
        pieces[i] = "Q";
        break;
      }
      count++;
    }
  }
  n = Math.floor(n / 6);

  // 4. Two knights — n encodes which 2 of 5 remaining squares
  const knightTable = [
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
    [1, 2],
    [1, 3],
    [1, 4],
    [2, 3],
    [2, 4],
    [3, 4],
  ];
  const [kn1, kn2] = knightTable[n];
  count = 0;
  for (let i = 0; i < 8; i++) {
    if (pieces[i] === null) {
      if (count === kn1 || count === kn2) {
        pieces[i] = "N";
      }
      count++;
    }
  }

  // 5. Remaining 3 squares: R, K, R (left to right)
  const rkr = ["R", "K", "R"];
  let ri = 0;
  for (let i = 0; i < 8; i++) {
    if (pieces[i] === null) {
      pieces[i] = rkr[ri++];
    }
  }

  return pieces as string[];
}

/**
 * Generate a full Chess960 FEN string for a given position ID.
 * Returns { fen, id }.
 */
export function chess960Fen(id: number): { fen: string; id: number } {
  const backrank = chess960Backrank(id);
  const blackRank = backrank.map((p) => p.toLowerCase()).join("");
  const whiteRank = backrank.join("");

  // Shredder castling rights: uppercase file letters for white rooks,
  // lowercase for black rooks
  const rookFiles: string[] = [];
  for (let i = 0; i < 8; i++) {
    if (backrank[i] === "R") {
      rookFiles.push(String.fromCharCode(65 + i)); // A-H
    }
  }
  // Rightmost rook file first (convention: kingside then queenside)
  const castling =
    rookFiles[1] +
    rookFiles[0] +
    rookFiles[1].toLowerCase() +
    rookFiles[0].toLowerCase();

  const fen = `${blackRank}/pppppppp/8/8/8/8/PPPPPPPP/${whiteRank} w ${castling} - 0 1`;
  return { fen, id };
}

/**
 * Generate a random Chess960 position.
 */
export function randomChess960(): { fen: string; id: number } {
  const id = Math.floor(Math.random() * 960);
  return chess960Fen(id);
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run test/chess960.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/chess960.ts test/chess960.test.ts
git commit -m "feat: chess960 position generator with tests"
```

---

### Task 3: Stockfish Engine Wrapper (TDD)

**Files:**

- Create: `src/engine.ts`
- Create: `test/engine.test.ts`

**Step 1: Write failing tests**

```ts
// test/engine.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { StockfishEngine, parseInfoLine, parseBestMove } from "../src/engine";

describe("parseBestMove", () => {
  it("parses a simple bestmove", () => {
    expect(parseBestMove("bestmove e2e4 ponder e7e5")).toBe("e2e4");
  });

  it("parses bestmove with promotion", () => {
    expect(parseBestMove("bestmove a7a8q")).toBe("a7a8q");
  });

  it("parses chess960 castling move", () => {
    expect(parseBestMove("bestmove e1h1")).toBe("e1h1");
  });

  it("returns null for non-bestmove lines", () => {
    expect(parseBestMove("info depth 10 score cp 30")).toBeNull();
    expect(parseBestMove("readyok")).toBeNull();
  });
});

describe("parseInfoLine", () => {
  it("parses centipawn score", () => {
    const info = parseInfoLine(
      "info depth 15 seldepth 21 score cp 34 nodes 123456 nps 1234567 time 100 pv e2e4 e7e5",
    );
    expect(info).not.toBeNull();
    expect(info!.depth).toBe(15);
    expect(info!.score).toEqual({ type: "cp", value: 34 });
    expect(info!.pv[0]).toBe("e2e4");
  });

  it("parses mate score", () => {
    const info = parseInfoLine(
      "info depth 20 seldepth 20 score mate 3 nodes 500000 nps 5000000 time 100 pv d1h5 g6h5",
    );
    expect(info).not.toBeNull();
    expect(info!.score).toEqual({ type: "mate", value: 3 });
  });

  it("parses negative mate score", () => {
    const info = parseInfoLine("info depth 20 score mate -2 pv e1d1 d8d1");
    expect(info!.score).toEqual({ type: "mate", value: -2 });
  });

  it("returns null for non-info lines", () => {
    expect(parseInfoLine("bestmove e2e4")).toBeNull();
    expect(parseInfoLine("readyok")).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run test/engine.test.ts`
Expected: FAIL — cannot import from `../src/engine`

**Step 3: Implement the engine wrapper**

```ts
// src/engine.ts

export interface EngineInfo {
  depth: number;
  score: { type: "cp" | "mate"; value: number };
  pv: string[];
}

export interface EngineOptions {
  chess960: boolean;
  skillLevel: number; // 0-20
  elo: number; // 1320-3190, used when UCI_LimitStrength is true
  limitStrength: boolean;
  moveTime: number; // milliseconds
  contempt: number; // -100 to 100
}

export const DEFAULT_OPTIONS: EngineOptions = {
  chess960: true,
  skillLevel: 10,
  elo: 1500,
  limitStrength: true,
  moveTime: 1000,
  contempt: 0,
};

export function parseBestMove(line: string): string | null {
  const match = line.match(/^bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/);
  return match ? match[1] : null;
}

export function parseInfoLine(line: string): EngineInfo | null {
  const depthMatch = line.match(/^info\s.*depth\s+(\d+)/);
  if (!depthMatch) return null;

  const scoreMatch = line.match(/score\s+(cp|mate)\s+(-?\d+)/);
  if (!scoreMatch) return null;

  const pvMatch = line.match(/\bpv\s+(.+)$/);
  const pv = pvMatch ? pvMatch[1].trim().split(/\s+/) : [];

  return {
    depth: parseInt(depthMatch[1]),
    score: {
      type: scoreMatch[1] as "cp" | "mate",
      value: parseInt(scoreMatch[2]),
    },
    pv,
  };
}

type EngineCallback = (move: string) => void;
type InfoCallback = (info: EngineInfo) => void;

export class StockfishEngine {
  private worker: Worker | null = null;
  private onBestMove: EngineCallback | null = null;
  private onInfo: InfoCallback | null = null;
  private ready = false;

  constructor(private scriptUrl: string) {}

  async init(options: EngineOptions = DEFAULT_OPTIONS): Promise<void> {
    return new Promise((resolve) => {
      this.worker = new Worker(this.scriptUrl);
      this.worker.addEventListener("message", (e: MessageEvent<string>) => {
        this.handleLine(e.data);
      });

      // Wait for readyok before resolving
      const origHandler = this.handleLine.bind(this);
      const initHandler = (line: string) => {
        if (line === "readyok") {
          this.ready = true;
          this.handleLine = origHandler;
          resolve();
        }
      };
      this.handleLine = initHandler;

      this.send("uci");
      this.applyOptions(options);
      this.send("isready");
    });
  }

  private applyOptions(options: EngineOptions): void {
    this.send(`setoption name UCI_Chess960 value ${options.chess960}`);
    this.send(`setoption name Skill Level value ${options.skillLevel}`);
    this.send(
      `setoption name UCI_LimitStrength value ${options.limitStrength}`,
    );
    this.send(`setoption name UCI_Elo value ${options.elo}`);
    this.send(`setoption name Contempt value ${options.contempt}`);
  }

  private send(cmd: string): void {
    this.worker?.postMessage(cmd);
  }

  private handleLine(line: string): void {
    const bestMove = parseBestMove(line);
    if (bestMove) {
      this.onBestMove?.(bestMove);
      return;
    }

    const info = parseInfoLine(line);
    if (info) {
      this.onInfo?.(info);
    }
  }

  go(fen: string, callback: EngineCallback, infoCallback?: InfoCallback): void {
    this.onBestMove = callback;
    this.onInfo = infoCallback ?? null;
    this.send("ucinewgame");
    this.send(`position fen ${fen}`);
    this.send(`go movetime ${DEFAULT_OPTIONS.moveTime}`);
  }

  goWithMoves(
    startFen: string,
    moves: string[],
    moveTime: number,
    callback: EngineCallback,
    infoCallback?: InfoCallback,
  ): void {
    this.onBestMove = callback;
    this.onInfo = infoCallback ?? null;
    const movesStr = moves.length > 0 ? ` moves ${moves.join(" ")}` : "";
    this.send(`position fen ${startFen}${movesStr}`);
    this.send(`go movetime ${moveTime}`);
  }

  newGame(): void {
    this.send("ucinewgame");
    this.send("isready");
  }

  stop(): void {
    this.send("stop");
  }

  destroy(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run test/engine.test.ts`
Expected: All tests PASS (the parser functions are pure, no Worker needed)

**Step 5: Commit**

```bash
git add src/engine.ts test/engine.test.ts
git commit -m "feat: stockfish engine wrapper with UCI parsing"
```

---

### Task 4: Game State Manager (TDD)

**Files:**

- Create: `src/game.ts`
- Create: `test/game.test.ts`

**Step 1: Write failing tests**

```ts
// test/game.test.ts
import { describe, it, expect } from "vitest";
import { GameState, createGame, makeMove, getGameStatus } from "../src/game";

describe("createGame", () => {
  it("creates a game from a Chess960 FEN", () => {
    // Standard position FEN (position 518)
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w HAha - 0 1";
    const game = createGame(fen);
    expect(game.startFen).toBe(fen);
    expect(game.moves).toEqual([]);
    expect(game.turn).toBe("white");
    expect(game.isOver).toBe(false);
  });

  it("computes legal move destinations", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w HAha - 0 1";
    const game = createGame(fen);
    expect(game.dests.size).toBeGreaterThan(0);
    // Pawns and knights can move from the starting position
    expect(game.dests.has("e2")).toBe(true);
    expect(game.dests.get("e2")).toContain("e4");
  });
});

describe("makeMove", () => {
  it("applies a legal move and switches turn", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w HAha - 0 1";
    const game = createGame(fen);
    const result = makeMove(game, "e2", "e4");
    expect(result).not.toBeNull();
    expect(result!.turn).toBe("black");
    expect(result!.moves).toEqual(["e2e4"]);
    expect(result!.lastMove).toEqual(["e2", "e4"]);
  });

  it("returns null for illegal moves", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w HAha - 0 1";
    const game = createGame(fen);
    const result = makeMove(game, "e2", "e5"); // illegal pawn move
    expect(result).toBeNull();
  });

  it("tracks UCI moves for Stockfish", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w HAha - 0 1";
    let game = createGame(fen);
    game = makeMove(game, "e2", "e4")!;
    game = makeMove(game, "e7", "e5")!;
    game = makeMove(game, "g1", "f3")!;
    expect(game.moves).toEqual(["e2e4", "e7e5", "g1f3"]);
  });
});

describe("getGameStatus", () => {
  it("returns ongoing for a normal position", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w HAha - 0 1";
    const game = createGame(fen);
    expect(getGameStatus(game)).toEqual({ status: "playing" });
  });

  it("detects checkmate", () => {
    // Scholar's mate final position
    const fen = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 0 1";
    const game = createGame(fen);
    const status = getGameStatus(game);
    expect(status.status).toBe("checkmate");
    expect(status.winner).toBe("black");
  });

  it("detects stalemate", () => {
    // King in corner, no legal moves, not in check
    const fen = "k7/8/1K6/8/8/8/8/1Q6 b - - 0 1";
    const game = createGame(fen);
    // After Qb2 creating stalemate... actually let's use a direct stalemate position
    const stalemateFen = "8/8/8/8/8/5k2/5p2/5K2 w - - 0 1";
    const game2 = createGame(stalemateFen);
    const status = getGameStatus(game2);
    expect(status.status).toBe("stalemate");
  });

  it("detects check", () => {
    const fen = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1";
    const game = createGame(fen);
    expect(game.isCheck).toBe(false);

    // Position with white king in check
    const checkFen =
      "rnb1kbnr/pppp1ppp/8/4p3/7q/4PP2/PPPP2PP/RNBQKBNR w KQkq - 0 1";
    const game2 = createGame(checkFen);
    expect(game2.isCheck).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run test/game.test.ts`
Expected: FAIL — module `../src/game` does not exist

**Step 3: Implement the game state manager**

```ts
// src/game.ts
import { Chess } from "chessops/chess";
import { parseFen, makeFen } from "chessops/fen";
import { parseUci, makeUci } from "chessops/util";
import { chessgroundDests } from "chessops/compat";
import type { Color } from "chessops/types";

export interface GameState {
  startFen: string;
  currentFen: string;
  moves: string[]; // UCI strings: ['e2e4', 'e7e5', ...]
  turn: "white" | "black";
  isOver: boolean;
  isCheck: boolean;
  lastMove: [string, string] | null;
  dests: Map<string, string[]>; // legal move destinations for chessground
  position: Chess; // internal chessops position
}

export type GameStatus =
  | { status: "playing" }
  | { status: "checkmate"; winner: "white" | "black" }
  | { status: "stalemate" }
  | { status: "draw"; reason: string };

export function createGame(fen: string): GameState {
  const setup = parseFen(fen).unwrap();
  const pos = Chess.fromSetup(setup).unwrap();

  return {
    startFen: fen,
    currentFen: fen,
    moves: [],
    turn: pos.turn as "white" | "black",
    isOver: pos.isEnd(),
    isCheck: pos.isCheck(),
    lastMove: null,
    dests: chessgroundDests(pos, { chess960: true }),
    position: pos,
  };
}

export function makeMove(
  game: GameState,
  orig: string,
  dest: string,
  promotion?: "queen" | "rook" | "bishop" | "knight",
): GameState | null {
  const uciStr = orig + dest + (promotion ? promotion[0] : "");
  const move = parseUci(uciStr);
  if (!move) return null;

  const pos = game.position.clone();
  if (!pos.isLegal(move)) return null;

  pos.play(move);
  const newFen = makeFen(pos.toSetup());

  return {
    startFen: game.startFen,
    currentFen: newFen,
    moves: [...game.moves, uciStr],
    turn: pos.turn as "white" | "black",
    isOver: pos.isEnd(),
    isCheck: pos.isCheck(),
    lastMove: [orig, dest],
    dests: chessgroundDests(pos, { chess960: true }),
    position: pos,
  };
}

export function applyUciMove(
  game: GameState,
  uciStr: string,
): GameState | null {
  const move = parseUci(uciStr);
  if (!move) return null;

  const pos = game.position.clone();
  if (!pos.isLegal(move)) return null;

  // Extract orig/dest square names for chessground
  let orig: string, dest: string;
  if ("from" in move) {
    orig = squareName(move.from);
    dest = squareName(move.to);
  } else {
    // drop move — shouldn't happen in Chess960, but handle gracefully
    orig = dest = squareName(move.to);
  }

  pos.play(move);
  const newFen = makeFen(pos.toSetup());

  return {
    startFen: game.startFen,
    currentFen: newFen,
    moves: [...game.moves, uciStr],
    turn: pos.turn as "white" | "black",
    isOver: pos.isEnd(),
    isCheck: pos.isCheck(),
    lastMove: [orig, dest],
    dests: chessgroundDests(pos, { chess960: true }),
    position: pos,
  };
}

export function getGameStatus(game: GameState): GameStatus {
  const pos = game.position;
  if (pos.isCheckmate()) {
    // The player whose turn it is has been checkmated,
    // so the winner is the OTHER player
    const winner = pos.turn === "white" ? "black" : "white";
    return { status: "checkmate", winner };
  }
  if (pos.isStalemate()) {
    return { status: "stalemate" };
  }
  if (pos.isInsufficientMaterial()) {
    return { status: "draw", reason: "insufficient material" };
  }
  if (pos.halfmoves >= 100) {
    return { status: "draw", reason: "50-move rule" };
  }
  return { status: "playing" };
}

function squareName(sq: number): string {
  return "abcdefgh"[sq & 7] + ((sq >> 3) + 1);
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run test/game.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/game.ts test/game.test.ts
git commit -m "feat: game state manager with Chess960 support"
```

---

### Task 5: Board + Game Integration

**Files:**

- Modify: `src/main.ts`
- Modify: `src/style.css`
- Modify: `index.html`

This task wires everything together: chessground board renders, user moves are validated, Stockfish responds, and moves are animated. Manual testing only — this is UI integration code.

**Step 1: Implement the main app**

Replace `src/main.ts` with:

```ts
// src/main.ts
import "@lichess-org/chessground/assets/chessground.base.css";
import "@lichess-org/chessground/assets/chessground.brown.css";
import "@lichess-org/chessground/assets/chessground.cburnett.css";
import "./style.css";

import { Chessground } from "@lichess-org/chessground";
import type { Api } from "@lichess-org/chessground/api";
import type { Color as CgColor } from "@lichess-org/chessground/types";
import { randomChess960, chess960Fen } from "./chess960";
import { StockfishEngine, DEFAULT_OPTIONS } from "./engine";
import {
  createGame,
  makeMove,
  applyUciMove,
  getGameStatus,
  GameState,
} from "./game";
import type { EngineInfo } from "./engine";

let api: Api;
let game: GameState;
let engine: StockfishEngine;
let playerColor: "white" | "black" = "white";
let engineThinking = false;

// Detect the stockfish script path
const sfScript = "/stockfish/stockfish-18-lite-single.js";

async function startNewGame(positionId?: number): Promise<void> {
  const { fen, id } =
    positionId !== undefined ? chess960Fen(positionId) : randomChess960();

  game = createGame(fen);

  const boardEl = document.getElementById("board")!;
  if (api) api.destroy();

  api = Chessground(boardEl, {
    fen: game.currentFen,
    orientation: playerColor,
    turnColor: game.turn as CgColor,
    movable: {
      free: false,
      color: playerColor as CgColor,
      dests: game.dests as Map<string, string[]>,
      showDests: true,
      events: { after: onUserMove },
    },
    draggable: { enabled: true, showGhost: true },
    animation: { enabled: true, duration: 200 },
    premovable: { enabled: false },
  });

  updateStatus(`Chess960 #${id} — Your move`);

  // If player is black, engine moves first
  if (playerColor === "black") {
    engineMove();
  }
}

function onUserMove(orig: string, dest: string): void {
  if (engineThinking) return;

  // Check for promotion
  const piece = game.position.board.get(parseSquare(orig));
  const isPromotion =
    piece?.role === "pawn" &&
    ((game.turn === "white" && dest[1] === "8") ||
      (game.turn === "black" && dest[1] === "1"));

  const promotion = isPromotion ? "queen" : undefined; // auto-queen for now
  const newGame = makeMove(game, orig, dest, promotion);
  if (!newGame) {
    // Illegal move — reset board
    api.set({ fen: game.currentFen });
    return;
  }

  game = newGame;
  updateBoard();

  const status = getGameStatus(game);
  if (status.status !== "playing") {
    showResult(status);
    return;
  }

  engineMove();
}

function engineMove(): void {
  engineThinking = true;
  updateStatus("Engine thinking...");

  // Disable player moves while engine thinks
  api.set({
    movable: { color: undefined, dests: new Map() },
  });

  engine.goWithMoves(
    game.startFen,
    game.moves,
    DEFAULT_OPTIONS.moveTime,
    (bestMove: string) => {
      engineThinking = false;
      const newGame = applyUciMove(game, bestMove);
      if (!newGame) return;

      game = newGame;

      // Animate the engine's move
      if (game.lastMove) {
        api.move(game.lastMove[0], game.lastMove[1]);
      }
      updateBoard();

      const status = getGameStatus(game);
      if (status.status !== "playing") {
        showResult(status);
        return;
      }

      updateStatus("Your move");
    },
    (info: EngineInfo) => {
      // Optional: show eval
      const evalText =
        info.score.type === "cp"
          ? (info.score.value / 100).toFixed(1)
          : `M${info.score.value}`;
      updateEval(`Depth ${info.depth}: ${evalText}`);
    },
  );
}

function updateBoard(): void {
  api.set({
    fen: game.currentFen,
    turnColor: game.turn as CgColor,
    lastMove: game.lastMove ?? undefined,
    check: game.isCheck ? (game.turn as CgColor) : undefined,
    movable: {
      color: game.turn === playerColor ? (playerColor as CgColor) : undefined,
      dests:
        game.turn === playerColor
          ? (game.dests as Map<string, string[]>)
          : new Map(),
    },
  });
}

function showResult(status: ReturnType<typeof getGameStatus>): void {
  let msg: string;
  switch (status.status) {
    case "checkmate":
      msg = `Checkmate! ${status.winner === playerColor ? "You win!" : "Engine wins."}`;
      break;
    case "stalemate":
      msg = "Stalemate — Draw";
      break;
    case "draw":
      msg = `Draw — ${status.reason}`;
      break;
    default:
      msg = "Game over";
  }
  updateStatus(msg);
  api.set({ movable: { color: undefined, dests: new Map() } });
}

function updateStatus(text: string): void {
  const el = document.getElementById("status");
  if (el) el.textContent = text;
}

function updateEval(text: string): void {
  const el = document.getElementById("eval");
  if (el) el.textContent = text;
}

function parseSquare(name: string): number {
  return name.charCodeAt(0) - 97 + (parseInt(name[1]) - 1) * 8;
}

// Bootstrap
async function main(): Promise<void> {
  engine = new StockfishEngine(sfScript);
  await engine.init(DEFAULT_OPTIONS);

  // Wire up UI buttons
  document.getElementById("new-game")?.addEventListener("click", () => {
    engine.newGame();
    startNewGame();
  });

  document.getElementById("flip")?.addEventListener("click", () => {
    playerColor = playerColor === "white" ? "black" : "white";
    api.toggleOrientation();
  });

  await startNewGame();
}

main().catch(console.error);
```

**Step 2: Update `index.html` with UI elements**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Chess960</title>
  </head>
  <body>
    <div id="app">
      <header>
        <h1>Chess960</h1>
        <div id="controls">
          <button id="new-game">New Game</button>
          <button id="flip">Flip Board</button>
        </div>
      </header>
      <main>
        <div id="board-container">
          <div id="board"></div>
        </div>
        <aside id="sidebar">
          <div id="status">Loading engine...</div>
          <div id="eval"></div>
        </aside>
      </main>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

**Step 3: Update `src/style.css` with full layout**

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  background: #1a1a2e;
  color: #e0e0e0;
  font-family:
    system-ui,
    -apple-system,
    sans-serif;
  min-height: 100vh;
}

#app {
  max-width: 800px;
  margin: 0 auto;
  padding: 1rem;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

header h1 {
  font-size: 1.5rem;
  font-weight: 600;
}

#controls {
  display: flex;
  gap: 0.5rem;
}

#controls button {
  background: #16213e;
  color: #e0e0e0;
  border: 1px solid #0f3460;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
}

#controls button:hover {
  background: #0f3460;
}

main {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
}

#board-container {
  flex-shrink: 0;
}

#board {
  width: 480px;
  height: 480px;
}

#sidebar {
  flex: 1;
  min-width: 200px;
}

#status {
  font-size: 1.1rem;
  padding: 0.75rem;
  background: #16213e;
  border-radius: 4px;
  margin-bottom: 0.5rem;
}

#eval {
  font-size: 0.9rem;
  padding: 0.5rem 0.75rem;
  color: #888;
  font-family: monospace;
}

@media (max-width: 700px) {
  main {
    flex-direction: column;
    align-items: center;
  }

  #board {
    width: 95vw;
    height: 95vw;
    max-width: 480px;
    max-height: 480px;
  }

  #sidebar {
    width: 95vw;
    max-width: 480px;
  }
}
```

**Step 4: Test manually in browser**

Run: `npx vite`
Expected: Board renders with a random Chess960 position. Dragging pieces works. After your move, "Engine thinking..." appears, then the engine responds and its piece animates.

**Step 5: Commit**

```bash
git add src/main.ts src/style.css index.html
git commit -m "feat: wire up board, engine, and game UI"
```

---

### Task 6: Settings Panel (Difficulty)

**Files:**

- Modify: `index.html`
- Modify: `src/main.ts`
- Modify: `src/style.css`

**Step 1: Add settings HTML to `index.html`**

Add inside `#sidebar`, after the eval div:

```html
<div id="settings">
  <h3>Settings</h3>
  <label>
    Difficulty (Elo)
    <input
      type="range"
      id="elo-slider"
      min="1320"
      max="3190"
      value="1500"
      step="10"
    />
    <span id="elo-value">1500</span>
  </label>
  <label>
    Skill Level
    <input type="range" id="skill-slider" min="0" max="20" value="10" />
    <span id="skill-value">10</span>
  </label>
  <label>
    Engine Think Time (ms)
    <input
      type="range"
      id="time-slider"
      min="200"
      max="5000"
      value="1000"
      step="100"
    />
    <span id="time-value">1000</span>
  </label>
  <label>
    Position ID (0-959, blank = random)
    <input
      type="number"
      id="position-id"
      min="0"
      max="959"
      placeholder="random"
    />
  </label>
  <label>
    Play as
    <select id="color-select">
      <option value="white">White</option>
      <option value="black">Black</option>
      <option value="random">Random</option>
    </select>
  </label>
</div>
```

**Step 2: Add settings CSS**

Append to `src/style.css`:

```css
#settings {
  margin-top: 1rem;
  padding: 0.75rem;
  background: #16213e;
  border-radius: 4px;
}

#settings h3 {
  font-size: 1rem;
  margin-bottom: 0.75rem;
}

#settings label {
  display: block;
  margin-bottom: 0.75rem;
  font-size: 0.85rem;
  color: #aaa;
}

#settings input[type="range"] {
  width: 100%;
  margin-top: 0.25rem;
}

#settings input[type="number"],
#settings select {
  width: 100%;
  margin-top: 0.25rem;
  padding: 0.3rem;
  background: #1a1a2e;
  color: #e0e0e0;
  border: 1px solid #0f3460;
  border-radius: 3px;
}
```

**Step 3: Wire settings into `src/main.ts`**

Add before the `main()` function:

```ts
function getSettings(): {
  elo: number;
  skillLevel: number;
  moveTime: number;
  positionId: number | undefined;
  playerColor: "white" | "black";
} {
  const elo = parseInt(
    (document.getElementById("elo-slider") as HTMLInputElement).value,
  );
  const skillLevel = parseInt(
    (document.getElementById("skill-slider") as HTMLInputElement).value,
  );
  const moveTime = parseInt(
    (document.getElementById("time-slider") as HTMLInputElement).value,
  );
  const posIdInput = (
    document.getElementById("position-id") as HTMLInputElement
  ).value;
  const positionId = posIdInput ? parseInt(posIdInput) : undefined;
  const colorSelect = (
    document.getElementById("color-select") as HTMLSelectElement
  ).value;
  const color =
    colorSelect === "random"
      ? Math.random() < 0.5
        ? "white"
        : "black"
      : (colorSelect as "white" | "black");

  return { elo, skillLevel, moveTime, positionId, playerColor: color };
}

function setupSliderLabels(): void {
  const pairs = [
    ["elo-slider", "elo-value"],
    ["skill-slider", "skill-value"],
    ["time-slider", "time-value"],
  ];
  for (const [sliderId, labelId] of pairs) {
    const slider = document.getElementById(sliderId) as HTMLInputElement;
    const label = document.getElementById(labelId)!;
    slider.addEventListener("input", () => {
      label.textContent = slider.value;
    });
  }
}
```

Then update the `new-game` click handler in `main()` to read settings:

```ts
document.getElementById("new-game")?.addEventListener("click", async () => {
  const settings = getSettings();
  playerColor = settings.playerColor;
  DEFAULT_OPTIONS.elo = settings.elo;
  DEFAULT_OPTIONS.skillLevel = settings.skillLevel;
  DEFAULT_OPTIONS.moveTime = settings.moveTime;
  DEFAULT_OPTIONS.limitStrength = true;
  engine.destroy();
  engine = new StockfishEngine(sfScript);
  await engine.init(DEFAULT_OPTIONS);
  startNewGame(settings.positionId);
});

setupSliderLabels();
```

**Step 4: Test manually**

Run: `npx vite`
Expected: Settings panel visible. Changing sliders updates labels. Starting new game with different settings changes engine strength and think time.

**Step 5: Commit**

```bash
git add index.html src/main.ts src/style.css
git commit -m "feat: settings panel for difficulty, skill, and think time"
```

---

### Task 7: Go Server (Desktop Binary)

**Files:**

- Create: `server/go.mod`
- Create: `server/main.go`
- Create: `Makefile`

**Step 1: Build the web app**

```bash
cd /home/kim/chess960
npx vite build
```

Expected: `dist/` directory created with production build.

**Step 2: Create Go module**

```bash
mkdir -p server
cd server
```

Create `server/go.mod`:

```
module chess960

go 1.21
```

**Step 3: Create `server/main.go`**

```go
package main

import (
	"context"
	"embed"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"syscall"
	"time"
)

//go:embed web
var webFiles embed.FS

func main() {
	sub, err := fs.Sub(webFiles, "web")
	if err != nil {
		log.Fatal(err)
	}

	mux := http.NewServeMux()
	mux.Handle("/", addHeaders(http.FileServer(http.FS(sub))))

	ln, err := net.Listen("tcp", "127.0.0.1:8960")
	if err != nil {
		log.Fatal(err)
	}
	addr := "http://" + ln.Addr().String()
	log.Printf("Chess960 serving on %s", addr)

	srv := &http.Server{Handler: mux}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	go openBrowser(addr)

	<-ctx.Done()
	log.Println("Shutting down…")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	srv.Shutdown(shutdownCtx)
}

func addHeaders(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")
		w.Header().Set("Cross-Origin-Embedder-Policy", "require-corp")
		h.ServeHTTP(w, r)
	})
}

func openBrowser(url string) {
	var cmd string
	var args []string
	switch runtime.GOOS {
	case "windows":
		cmd, args = "cmd", []string{"/c", "start", url}
	case "darwin":
		cmd, args = "open", []string{url}
	default:
		cmd, args = "xdg-open", []string{url}
	}
	if err := exec.Command(cmd, args...).Start(); err != nil {
		log.Printf("Could not open browser: %v", err)
	}
}
```

**Step 4: Create `Makefile`**

```makefile
.PHONY: dev build build-server build-linux build-windows clean

dev:
	npx vite

build:
	npx vite build
	rm -rf server/web
	cp -r dist server/web

build-server: build
	cd server && go build -ldflags="-s -w" -o ../chess960 .

build-linux: build
	cd server && GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o ../chess960-linux-amd64 .

build-windows: build
	cd server && GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o ../chess960-windows-amd64.exe .

clean:
	rm -rf dist server/web chess960 chess960-linux-amd64 chess960-windows-amd64.exe
```

**Step 5: Build and test the Go binary**

```bash
cd /home/kim/chess960
make build-server
./chess960
```

Expected: Browser opens to `http://127.0.0.1:8960`, chess app loads, you can play. Ctrl+C shuts down cleanly.

**Step 6: Commit**

```bash
git add server/ Makefile
git commit -m "feat: Go server binary for desktop deployment"
```

---

### Task 8: Android APK (WebView Wrapper)

**Files:**

- Create: `android/` project structure

This task creates a minimal Android WebView app. Requires Android SDK installed.

**Step 1: Create the Android project structure**

```bash
cd /home/kim/chess960
mkdir -p android/app/src/main/kotlin/com/chess960/app
mkdir -p android/app/src/main/res/layout
mkdir -p android/app/src/main/assets
mkdir -p android/gradle/wrapper
```

**Step 2: Create `android/settings.gradle.kts`**

```kotlin
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "Chess960"
include(":app")
```

**Step 3: Create `android/build.gradle.kts`**

```kotlin
plugins {
    id("com.android.application") version "8.7.0" apply false
    id("org.jetbrains.kotlin.android") version "2.0.0" apply false
}
```

**Step 4: Create `android/app/build.gradle.kts`**

```kotlin
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.chess960.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.chess960.app"
        minSdk = 21
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
}
```

**Step 5: Create `android/app/src/main/AndroidManifest.xml`**

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application
        android:label="Chess960"
        android:theme="@style/Theme.AppCompat.NoActionBar"
        android:hardwareAccelerated="true">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:configChanges="orientation|screenSize|keyboardHidden">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

**Step 6: Create `android/app/src/main/kotlin/com/chess960/app/MainActivity.kt`**

```kotlin
package com.chess960.app

import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewAssetLoader.AssetsPathHandler

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this)
        setContentView(webView)

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", AssetsPathHandler(this))
            .build()

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                val response = assetLoader.shouldInterceptRequest(request.url)

                // Fix WASM MIME type — Android doesn't know application/wasm
                if (response != null &&
                    request.url.lastPathSegment?.endsWith(".wasm") == true) {
                    return WebResourceResponse(
                        "application/wasm",
                        response.encoding,
                        response.data
                    )
                }
                return response
            }
        }

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            cacheMode = WebSettings.LOAD_NO_CACHE
        }

        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html")
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack()
        else super.onBackPressed()
    }
}
```

**Step 7: Create `android/app/src/main/res/layout/activity_main.xml`**

```xml
<?xml version="1.0" encoding="utf-8"?>
<FrameLayout
    xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent">
    <WebView
        android:id="@+id/webview"
        android:layout_width="match_parent"
        android:layout_height="match_parent" />
</FrameLayout>
```

**Step 8: Add build targets to `Makefile`**

Append to `Makefile`:

```makefile
build-android: build
	rm -rf android/app/src/main/assets/*
	cp -r dist/* android/app/src/main/assets/
	cd android && ./gradlew assembleDebug
	@echo "APK: android/app/build/outputs/apk/debug/app-debug.apk"
```

**Step 9: Copy web assets and build**

```bash
cd /home/kim/chess960
npx vite build
cp -r dist/* android/app/src/main/assets/
cd android && ./gradlew assembleDebug
```

Expected: APK built at `android/app/build/outputs/apk/debug/app-debug.apk`

**Step 10: Commit**

```bash
git add android/ Makefile
git commit -m "feat: Android WebView wrapper for Chess960"
```

---

## Build & Run Summary

| Target         | Command              | Output                                              |
| -------------- | -------------------- | --------------------------------------------------- |
| Dev server     | `make dev`           | `http://localhost:5173`                             |
| Linux binary   | `make build-linux`   | `chess960-linux-amd64`                              |
| Windows binary | `make build-windows` | `chess960-windows-amd64.exe`                        |
| Android APK    | `make build-android` | `android/app/build/outputs/apk/debug/app-debug.apk` |

## Task Dependencies

```
Task 1 (scaffolding)
  └─► Task 2 (chess960 generator) ─┐
  └─► Task 3 (engine wrapper) ─────┤
  └─► Task 4 (game state) ─────────┤
                                    └─► Task 5 (board integration)
                                          └─► Task 6 (settings UI)
                                                └─► Task 7 (Go server)
                                                └─► Task 8 (Android APK)
```

Tasks 2, 3, and 4 can be worked on in parallel after Task 1.
Tasks 7 and 8 can be worked on in parallel after Task 6.
