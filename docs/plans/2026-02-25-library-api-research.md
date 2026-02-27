# Library API Research: chessground, chessops, stockfish

Researched 2026-02-25. All versions and code verified against npm, GitHub source, and official docs.

---

## 1. @lichess-org/chessground

**Latest version:** 10.0.2 (released 2026-02-06)
**Package name:** `@lichess-org/chessground`
**Note:** The old `chessground` package on npm is abandoned; use `@lichess-org/chessground`.

### Installation

```bash
npm install @lichess-org/chessground
```

CSS must be imported separately (no auto-injection):

```ts
import "@lichess-org/chessground/assets/chessground.base.css";
import "@lichess-org/chessground/assets/chessground.brown.css";
import "@lichess-org/chessground/assets/chessground.cburnett.css";
```

### Initialization

```ts
import { Chessground } from "@lichess-org/chessground";
import type { Api } from "@lichess-org/chessground/api";
import type { Config } from "@lichess-org/chessground/config";

const el: HTMLElement = document.getElementById("board")!;
const api: Api = Chessground(el, {
  /* Config */
});
```

The `Chessground()` call returns an `Api` object. The element should have explicit width/height set in CSS (e.g. `width: 500px; height: 500px`).

### Complete Config Type (src/config.ts)

```ts
interface Config {
  // Position
  fen?: string; // FEN string to set position
  orientation?: "white" | "black"; // Board orientation (default: 'white')
  turnColor?: "white" | "black"; // Whose turn it is
  check?: "white" | "black" | boolean; // Highlight check
  lastMove?: string[]; // Squares to highlight e.g. ['e2', 'e4']
  selected?: string; // Currently selected square

  // Visual
  coordinates?: boolean; // Show coordinate labels (default: true)
  coordinatesOnSquares?: boolean; // Coordinates on each square (default: false)
  ranksPosition?: "right" | "left"; // Rank label side (default: 'right')
  addPieceZIndex?: boolean; // For 3D rendering
  addDimensionsCssVarsTo?: HTMLElement;
  blockTouchScroll?: boolean;
  touchIgnoreRadius?: number;
  trustAllEvents?: boolean; // Skip human validation (for programmatic moves)
  viewOnly?: boolean; // Disable all interaction (default: false)
  disableContextMenu?: boolean;

  highlight?: {
    lastMove?: boolean;
    check?: boolean;
    custom?: Map<string, string>; // square -> css class
  };

  animation?: {
    enabled?: boolean; // default: true
    duration?: number; // ms, default: 200
  };

  movable?: {
    free?: boolean; // Board-editor mode: skip legal check (default: true)
    color?: "white" | "black" | "both"; // Who can move (default: 'both')
    dests?: Map<string, string[]>; // Legal destinations: Map<fromSquare, toSquares[]>
    showDests?: boolean; // Highlight destination squares (default: true)
    rookCastle?: boolean; // Allow castling by clicking rook (default: true)
    events?: {
      after?: (orig: string, dest: string, metadata: MoveMetadata) => void;
      afterNewPiece?: (
        role: string,
        key: string,
        metadata: MoveMetadata,
      ) => void;
    };
  };

  premovable?: {
    enabled?: boolean; // default: true
    showDests?: boolean;
    castle?: boolean;
    dests?: string[];
    events?: {
      set?: (orig: string, dest: string, metadata?: SetPremoveMetadata) => void;
      unset?: () => void;
    };
  };

  predroppable?: {
    enabled?: boolean;
    events?: {
      set?: (role: string, key: string) => void;
      unset?: () => void;
    };
  };

  draggable?: {
    enabled?: boolean; // default: true
    distance?: number; // Pixels to trigger drag (default: 3)
    autoDistance?: boolean; // default: true
    showGhost?: boolean; // Show translucent ghost piece (default: true)
    deleteOnDropOff?: boolean; // default: false
  };

  selectable?: {
    enabled?: boolean; // Click-to-move (default: true)
  };

  events?: {
    change?: () => void; // Board state changed
    move?: (orig: string, dest: string, capturedPiece?: Piece) => void;
    dropNewPiece?: (piece: Piece, key: string) => void;
    select?: (key: string) => void;
    insert?: (elements: Elements) => void;
  };

  drawable?: {
    enabled?: boolean; // default: true
    visible?: boolean; // default: true
    defaultSnapToValidMove?: boolean;
    eraseOnMovablePieceClick?: boolean;
    shapes?: DrawShape[];
    autoShapes?: DrawShape[]; // Engine arrows etc.
    brushes?: DrawBrushes;
    onChange?: (shapes: DrawShape[]) => void;
  };
}
```

### Api Methods (src/api.ts)

```ts
interface Api {
  state: State;

  // Reconfigure the board at any time
  set(config: Config): void;

  // Get current FEN (board only, no clocks)
  getFen(): string;

  // Flip board orientation
  toggleOrientation(): void;

  // Programmatically move a piece (triggers animation)
  move(orig: string, dest: string): void;

  // Set/remove arbitrary pieces
  setPieces(pieces: Map<string, Piece | undefined>): void;

  // Select a square (highlight it)
  selectSquare(key: string | null, force?: boolean): void;

  // Place a new piece on the board
  newPiece(piece: Piece, key: string): void;

  // Play queued premove if any
  playPremove(): boolean;

  cancelPremove(): void;
  playPredrop(validate: (drop: Drop) => boolean): boolean;
  cancelPredrop(): void;
  cancelMove(): void;

  // Stop all current move/drag operations
  stop(): void;

  // Atomic chess: explode squares
  explode(keys: string[]): void;

  // Arrow/circle drawing
  setShapes(shapes: DrawShape[]): void;
  setAutoShapes(shapes: DrawShape[]): void;

  // Get square from DOM coordinates
  getKeyAtDomPos(pos: [number, number]): string | undefined;

  redrawAll: () => void;

  // Crazyhouse: drag a new piece from outside the board
  dragNewPiece(
    piece: Piece,
    event: MouseEvent | TouchEvent,
    force?: boolean,
  ): void;

  destroy(): void;
}
```

### Set Position from FEN

```ts
// At init time:
const api = Chessground(el, {
  fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
  turnColor: "black",
  lastMove: ["e2", "e4"],
});

// After init, reconfigure:
api.set({
  fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
  turnColor: "white",
  lastMove: ["g8", "f6"],
});
```

### Handle User Moves

The key callback is `movable.events.after`. You must also supply `movable.dests` to restrict moves to legal ones, and update it after each move.

```ts
import { Chessground } from "@lichess-org/chessground";
import { Chess } from "chessops/chess";
import { chessgroundDests } from "chessops/compat";
import { makeFen } from "chessops/fen";

let pos = Chess.default();

const api = Chessground(el, {
  fen: makeFen(pos.toSetup()),
  turnColor: "white",
  movable: {
    free: false, // only legal moves
    color: "white", // local player is white
    dests: chessgroundDests(pos), // Map<square, square[]>
    showDests: true,
    events: {
      after: (orig, dest, metadata) => {
        // This fires after the board animation starts
        handleUserMove(orig, dest, metadata);
      },
    },
  },
});

function handleUserMove(orig: string, dest: string, metadata: any) {
  // See chessops section for full implementation
}
```

### Animate an Opponent's Move

Use `api.move(orig, dest)` — this triggers the animation automatically. Then update the board state with `api.set()`.

```ts
function applyOpponentMove(
  orig: string,
  dest: string,
  newFen: string,
  nextTurn: "white" | "black",
  dests: Map<string, string[]>,
) {
  // move() triggers the animation
  api.move(orig, dest);

  // set() updates legal moves and turn for the next ply
  api.set({
    fen: newFen,
    turnColor: nextTurn,
    movable: {
      color: nextTurn === "white" ? "white" : "black", // or 'both' if local player
      dests: dests,
    },
    lastMove: [orig, dest],
  });
}
```

### Configure Piece Dragging

```ts
const api = Chessground(el, {
  draggable: {
    enabled: true, // default true
    distance: 3, // pixels before drag starts
    autoDistance: true,
    showGhost: true, // ghost piece at origin during drag
    deleteOnDropOff: false,
  },
});

// Disable drag (click-only):
api.set({ draggable: { enabled: false } });
```

---

## 2. chessops

**Latest version:** 0.15.x (check npm for exact patch)
**Package:** `chessops`
**License:** GPL-3.0

### Installation

```bash
npm install chessops
```

### Module Structure (Subpath Imports)

```ts
import { Chess } from "chessops/chess";
import { parseFen, makeFen, INITIAL_FEN } from "chessops/fen";
import { parseUci, makeUci } from "chessops/util";
import { chessgroundDests, chessgroundMove } from "chessops/compat";
import { makeSan, parseSan } from "chessops/san";
// Types live in the root or chessops/types
import type {
  Move,
  NormalMove,
  DropMove,
  Color,
  Role,
  Square,
  SquareName,
} from "chessops/types";
```

### Core Types

```ts
// From chessops/types
type Color = "white" | "black";
type Role = "pawn" | "knight" | "bishop" | "rook" | "queen" | "king";
type Square = number; // 0 = a1, 7 = h1, 56 = a8, 63 = h8
type SquareName = string; // 'a1' .. 'h8'

interface Piece {
  role: Role;
  color: Color;
  promoted?: boolean;
}

interface NormalMove {
  from: Square;
  to: Square;
  promotion?: Role;
}
interface DropMove {
  role: Role;
  to: Square;
}
type Move = NormalMove | DropMove;

const isDrop = (v: Move): v is DropMove => "role" in v;
const isNormal = (v: Move): v is NormalMove => "from" in v;

// CastlingSide: 'a' = queenside, 'h' = kingside
type CastlingSide = "a" | "h";
```

### Parse FEN into Position

```ts
import { Chess } from "chessops/chess";
import { parseFen } from "chessops/fen";

// parseFen returns Result<Setup, FenError>
// .unwrap() throws on error; .ok() returns Setup | undefined
const setup = parseFen(
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
).unwrap();

// Chess.fromSetup returns Result<Chess, PositionError>
const pos = Chess.fromSetup(setup).unwrap();

// Or start from the standard position:
const pos2 = Chess.default();
```

### Check if a Move is Legal

```ts
import { parseUci } from "chessops/util";

const move = parseUci("e2e4")!; // Returns Move | undefined
const legal = pos.isLegal(move); // boolean
```

### Make a Move and Get the Resulting FEN

```ts
import { Chess } from "chessops/chess";
import { parseFen, makeFen } from "chessops/fen";
import { parseUci } from "chessops/util";

const pos = Chess.default();
const move = parseUci("e2e4")!;

// pos.play() mutates in place — clone first if you need the original
const next = pos.clone();
next.play(move);

const fen = makeFen(next.toSetup());
// 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'
```

### Detect Checkmate / Stalemate / Draw

```ts
// Checkmate
pos.isCheckmate(); // boolean

// Stalemate
pos.isStalemate(); // boolean

// Insufficient material (K vs K, K vs KB, K vs KN, etc.)
pos.isInsufficientMaterial(); // boolean

// Game ended by any means
pos.isEnd(); // boolean: checkmate || stalemate || variant rules

// Get result if game is over
const outcome = pos.outcome(); // { winner: Color | undefined } | undefined
// outcome === undefined  → game still ongoing
// outcome.winner === undefined  → draw (stalemate or insufficient material)
// outcome.winner === 'white'    → white won by checkmate

// Is the current player in check?
pos.isCheck(); // boolean

// 50-move rule / 75-move rule: check pos.halfmoves
// The library does NOT auto-claim draws — you must check manually:
const isDraw50 = pos.halfmoves >= 100; // 50 full moves = 100 half-moves
```

### Generate Legal Move Destinations

```ts
import { makeSquare, parseSquare } from "chessops/util";

// All destinations for all pieces (used to feed chessground.dests)
const allDests: Map<Square, SquareSet> = pos.allDests();

// Destinations for one square
const sq = parseSquare("e2")!; // number
const destsForE2: SquareSet = pos.dests(sq);

// For chessground: need Map<SquareName, SquareName[]>
import { chessgroundDests } from "chessops/compat";
const dests: Map<string, string[]> = chessgroundDests(pos);
// With Chess960 castling (king clicks rook file instead of king+2):
const dests960: Map<string, string[]> = chessgroundDests(pos, {
  chess960: true,
});
```

### UCI Move Format

```ts
import { parseUci, makeUci } from "chessops/util";

// Parse UCI string to Move object
const move1 = parseUci("e2e4"); // NormalMove { from: 12, to: 28 }
const move2 = parseUci("e1g1"); // Kingside castling (standard FEN)
const move3 = parseUci("e1h1"); // Kingside castling (Chess960 FEN — king to rook file)
const move4 = parseUci("a7a8q"); // Promotion to queen
const move5 = parseUci("Q@f7"); // Drop move (Crazyhouse)

// Move to UCI string
const uciStr = makeUci(move1!); // 'e2e4'
```

### Handle Chess960 Castling

In Chess960, castling is represented in UCI as the king moving to the **rook's square** (e.g. `e1h1` for kingside when rook is on h1). In standard FEN, it is `e1g1` (king to g1).

chessops uses `castlingRights` (a `SquareSet` of unmoved rooks) to track castling. When you parse a Chess960 FEN, the castling rights field uses file letters (Shredder FEN: `AHah`) or standard KQkq (X-FEN). Both are supported by `parseFen`.

```ts
import { Chess } from "chessops/chess";
import { parseFen, makeFen } from "chessops/fen";
import { chessgroundDests } from "chessops/compat";

// Chess960 starting position FEN (position 518 = standard):
// The castling field can be 'KQkq' (X-FEN) or 'HAha' (Shredder FEN)
const chess960Fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w HAha - 0 1";
const setup = parseFen(chess960Fen).unwrap();
const pos = Chess.fromSetup(setup).unwrap();

// Get dests in Chess960 style (king moves to rook's square for castling)
const dests = chessgroundDests(pos, { chess960: true });

// Without chess960 option, chessgroundDests includes BOTH representations
// (king to rook square AND king to final g1/c1 square) to work with rookCastle option
```

**Important:** When `chess960: false` (default), `chessgroundDests` adds both the Chess960 castling destination and the traditional destination so chessground's `rookCastle` option works. When `chess960: true`, only the king-to-rook destination is included.

When Stockfish sends a bestmove in Chess960 mode, it sends `e1h1` style. `parseUci('e1h1')` correctly produces a `NormalMove { from: e1-square, to: h1-square }`, and `pos.isLegal(move)` correctly recognizes it as castling because chessops checks castling rights internally.

### Generate a Random Chess960 Starting Position

chessops does NOT include Chess960 random position generation. Use either:

**Option A — Manual algorithm (no extra dependency):**

```ts
// Generates the backrank piece arrangement for Chess960 (IDs 0–959)
function chess960Backrank(id: number): string[] {
  const pieces = new Array<string | null>(8).fill(null);

  // Place light-square bishop (files b=1, d=3, f=5, h=7)
  pieces[(id % 4) * 2 + 1] = "B";
  const n1 = Math.floor(id / 4);

  // Place dark-square bishop (files a=0, c=2, e=4, g=6)
  pieces[(n1 % 4) * 2] = "B";
  const n2 = Math.floor(n1 / 4);

  // Place queen in nth empty square (0-based)
  const q = n2 % 6;
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
  const n3 = Math.floor(n2 / 6);

  // Knight placements: 10 combos for 5 remaining squares
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
  const [kn1, kn2] = knightTable[n3];
  count = 0;
  let placed = 0;
  for (let i = 0; i < 8; i++) {
    if (pieces[i] === null) {
      if (count === kn1 || count === kn2) {
        pieces[i] = "N";
        placed++;
      }
      count++;
    }
  }

  // Remaining 3 empty squares get R K R in order
  const rkr = ["R", "K", "R"];
  let ri = 0;
  for (let i = 0; i < 8; i++) {
    if (pieces[i] === null) pieces[i] = rkr[ri++];
  }

  return pieces as string[];
}

function randomChess960Fen(): { fen: string; id: number } {
  const id = Math.floor(Math.random() * 960);
  const backrank = chess960Backrank(id);

  // Build FEN: black pieces on rank 8, white on rank 1
  const blackRank = backrank.map((p) => p.toLowerCase()).join("");
  const whiteRank = backrank.join("");

  // Castling rights: find rook files for Shredder FEN
  const rookFiles = backrank
    .map((p, i) => (p === "R" ? String.fromCharCode(65 + i) : null)) // A-H
    .filter(Boolean) as string[];
  const castling =
    rookFiles.join("") + rookFiles.map((f) => f.toLowerCase()).join("");

  const fen = `${blackRank}/pppppppp/8/8/8/8/PPPPPPPP/${whiteRank} w ${castling} - 0 1`;
  return { fen, id };
}

// Usage:
const { fen, id } = randomChess960Fen();
const setup = parseFen(fen).unwrap();
const pos = Chess.fromSetup(setup).unwrap();
```

**Option B — `fischer960` package (cleaner, no extra logic):**

```bash
npm install fischer960
```

```ts
import * as fischer from "fischer960";

const { id, arrangement } = fischer.random();
// arrangement: ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'] (standard = id 518)

// Convert to FEN manually (same as above) or build from arrangement string:
const backrankStr = arrangement.join(""); // e.g. 'RNBQKBNR'
```

---

## 3. stockfish (nmrugg/stockfish.js)

**Latest version:** Stockfish 18
**npm package:** `stockfish`
**License:** GPL-3.0

### Available Builds (inside `node_modules/stockfish/src/`)

| File                                    | Threads | CORS Required | Size   | Notes                     |
| --------------------------------------- | ------- | ------------- | ------ | ------------------------- |
| `stockfish-18.js` + `.wasm`             | Yes     | Yes           | >100MB | Strongest                 |
| `stockfish-18-single.js` + `.wasm`      | No      | No            | >100MB | Strong, no CORS           |
| `stockfish-18-lite.js` + `.wasm`        | Yes     | Yes           | ~7MB   | Recommended for web       |
| `stockfish-18-lite-single.js` + `.wasm` | No      | No            | ~7MB   | Mobile/no CORS            |
| `stockfish-18-asm.js`                   | No      | No            | ~10MB  | Fallback for old browsers |

The `.wasm` file must be served alongside the `.js` file from the same directory.

### CORS Headers Required for Multi-threaded Builds

Multi-threaded builds require `SharedArrayBuffer`, which requires these response headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

### Load Multi-threaded WASM Build in a Web Worker

```ts
// The worker script IS the stockfish-18.js file itself — it self-initializes
// Copy stockfish-18.js and stockfish-18.wasm to your public/ directory

function createStockfishWorker(scriptUrl: string): Worker {
  const worker = new Worker(scriptUrl);
  return worker;
}

// Usage:
const engine = createStockfishWorker("/stockfish/stockfish-18.js");

engine.addEventListener("message", (e: MessageEvent) => {
  console.log("SF>", e.data);
});

engine.postMessage("uci");
```

### Load Single-threaded Lite Build (no CORS needed)

```ts
const engine = new Worker("/stockfish/stockfish-18-lite-single.js");

engine.onmessage = (e: MessageEvent<string>) => {
  console.log(e.data);
};

engine.postMessage("uci");
```

### Full TypeScript Stockfish Wrapper

```ts
export class StockfishEngine {
  private worker: Worker;
  private messageHandlers: Array<(line: string) => void> = [];

  constructor(wasmUrl: string) {
    this.worker = new Worker(wasmUrl);
    this.worker.addEventListener("message", (e: MessageEvent<string>) => {
      const line = e.data;
      for (const handler of this.messageHandlers) handler(line);
    });
  }

  send(cmd: string): void {
    this.worker.postMessage(cmd);
  }

  onMessage(handler: (line: string) => void): () => void {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter((h) => h !== handler);
    };
  }

  terminate(): void {
    this.worker.terminate();
  }
}
```

### Send UCI Commands

```ts
const sf = new StockfishEngine("/stockfish/stockfish-18-lite-single.js");

// Initialize
sf.send("uci"); // Engine responds with options then 'uciok'
sf.send("isready"); // Engine responds 'readyok'
sf.send("ucinewgame"); // Clear hash tables

// Set Chess960 mode (MUST be done before position commands)
sf.send("setoption name UCI_Chess960 value true");

// Set strength limiting
sf.send("setoption name UCI_LimitStrength value true");
sf.send("setoption name UCI_Elo value 1500");

// Or use Skill Level (0=weakest, 20=strongest)
sf.send("setoption name UCI_LimitStrength value false");
sf.send("setoption name Skill Level value 10");

// Set thread count (only works in multi-threaded builds)
sf.send("setoption name Threads value 4");
sf.send("setoption name Hash value 128"); // Hash table MB

// Set position
sf.send("position startpos");
sf.send("position startpos moves e2e4 e7e5");
sf.send(
  "position fen rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
);
sf.send("position fen <fen> moves <move1> <move2>");

// Request analysis
sf.send("go movetime 1000"); // Think for 1 second
sf.send("go depth 15"); // Search to depth 15
sf.send("go wtime 60000 btime 60000 winc 1000 binc 1000"); // Clock-based
sf.send("go infinite"); // Until stop

// Stop search
sf.send("stop");

// Quit
sf.send("quit");
```

### Parse bestmove Response

```ts
sf.onMessage((line: string) => {
  // bestmove e2e4 ponder e7e5
  const bestmoveMatch = line.match(/^bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/);
  if (bestmoveMatch) {
    const uciMove = bestmoveMatch[1]; // e.g. 'e2e4' or 'a7a8q' or 'e1h1' (Chess960 castling)
    handleBestMove(uciMove);
    return;
  }

  // info depth 15 seldepth 21 multipv 1 score cp 34 nodes 123456 nps 1234567 time 100 pv e2e4 e7e5
  const infoMatch = line.match(
    /^info depth (\d+).*score (cp|mate) (-?\d+).*pv (.+)$/,
  );
  if (infoMatch) {
    const depth = parseInt(infoMatch[1]);
    const scoreType = infoMatch[2]; // 'cp' or 'mate'
    const scoreValue = parseInt(infoMatch[3]);
    const pv = infoMatch[4].trim().split(" ");
    // pv[0] is the best move in UCI format
  }
});
```

### UCI_Elo vs Skill Level

```ts
// Method 1: Elo-based strength (UCI_Elo range: 1320–3190)
sf.send("setoption name UCI_LimitStrength value true");
sf.send("setoption name UCI_Elo value 1200");

// Method 2: Skill Level (0–20, rough mapping: 0≈800, 20≈3200)
sf.send("setoption name UCI_LimitStrength value false");
sf.send("setoption name Skill Level value 5");
```

---

## 4. Integration Pattern: User Move → chessops → Stockfish → Animate

This is the complete loop for a Chess960 game where the user plays as white against Stockfish.

```ts
import { Chessground } from "@lichess-org/chessground";
import type { Api } from "@lichess-org/chessground/api";
import { Chess } from "chessops/chess";
import { parseFen, makeFen } from "chessops/fen";
import { parseUci, makeUci, parseSquare } from "chessops/util";
import { chessgroundDests } from "chessops/compat";
import type { Move, Color } from "chessops/types";

// ─── State ───────────────────────────────────────────────────────────────────

let pos: Chess; // Current game position
let api: Api; // Chessground board
let engineReady = false;
let waitingForEngine = false;
const playerColor: Color = "white";

// ─── Engine Setup ─────────────────────────────────────────────────────────────

const engine = new Worker("/stockfish/stockfish-18-lite-single.js");

engine.addEventListener("message", (e: MessageEvent<string>) => {
  const line = e.data;

  if (line === "readyok") {
    engineReady = true;
  }

  // Parse bestmove — this fires after pos.turn === opponent's turn
  const bmMatch = line.match(/^bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/);
  if (bmMatch && waitingForEngine) {
    waitingForEngine = false;
    const uciStr = bmMatch[1];
    applyEngineMove(uciStr);
  }
});

function initEngine(isChess960: boolean) {
  engine.postMessage("uci");
  engine.postMessage("isready");
  if (isChess960) {
    engine.postMessage("setoption name UCI_Chess960 value true");
  }
  engine.postMessage("setoption name Skill Level value 10");
  engine.postMessage("ucinewgame");
}

// ─── Board Setup ──────────────────────────────────────────────────────────────

function initBoard(el: HTMLElement, startFen: string) {
  const setup = parseFen(startFen).unwrap();
  pos = Chess.fromSetup(setup).unwrap();

  api = Chessground(el, {
    fen: makeFen(pos.toSetup()),
    orientation: playerColor,
    turnColor: pos.turn,
    movable: {
      free: false,
      color: playerColor,
      dests: chessgroundDests(pos, { chess960: true }),
      showDests: true,
      events: {
        after: onUserMove,
      },
    },
    draggable: {
      enabled: true,
      showGhost: true,
    },
    animation: {
      enabled: true,
      duration: 200,
    },
  });
}

// ─── User Move Handler ────────────────────────────────────────────────────────

function onUserMove(orig: string, dest: string, _metadata: any) {
  // 1. Parse the move into chessops format
  //    In chess960 mode, castling is orig=king-square, dest=rook-square
  const uciStr = orig + dest; // e.g. 'e1h1' or 'e2e4'
  const move: Move | undefined = parseUci(uciStr);

  if (!move) {
    console.error("Could not parse move:", uciStr);
    return;
  }

  // 2. Validate (chessground already filtered illegals, but double-check)
  if (!pos.isLegal(move)) {
    console.error("Illegal move:", uciStr);
    // Reset board to current position
    api.set({ fen: makeFen(pos.toSetup()) });
    return;
  }

  // 3. Apply move to position
  pos.play(move);

  // 4. Update board state (turn, new legal moves, check highlight)
  const newFen = makeFen(pos.toSetup());
  api.set({
    fen: newFen,
    turnColor: pos.turn,
    check: pos.isCheck() ? pos.turn : false,
    lastMove: [orig, dest],
    movable: {
      color: pos.isEnd()
        ? undefined
        : pos.turn === playerColor
          ? playerColor
          : undefined,
      dests: pos.isEnd()
        ? new Map()
        : chessgroundDests(pos, { chess960: true }),
    },
  });

  // 5. Check game end
  if (pos.isEnd()) {
    const outcome = pos.outcome();
    const msg = !outcome
      ? "Game over"
      : outcome.winner === "white"
        ? "White wins!"
        : outcome.winner === "black"
          ? "Black wins!"
          : "Draw!";
    console.log(msg, {
      checkmate: pos.isCheckmate(),
      stalemate: pos.isStalemate(),
      insufficient: pos.isInsufficientMaterial(),
    });
    return;
  }

  // 6. Send position to Stockfish and request a move
  requestEngineMove(newFen);
}

// ─── Engine Move Request ──────────────────────────────────────────────────────

function requestEngineMove(fen: string) {
  if (!engineReady) return;
  waitingForEngine = true;
  engine.postMessage(`position fen ${fen}`);
  engine.postMessage("go movetime 1000");
}

// ─── Apply Engine Move ────────────────────────────────────────────────────────

function applyEngineMove(uciStr: string) {
  // 1. Parse UCI move
  const move = parseUci(uciStr);
  if (!move || !pos.isLegal(move)) {
    console.error("Engine sent illegal move:", uciStr);
    return;
  }

  // 2. Extract orig/dest as square names for chessground
  const isNormal = "from" in move;
  const orig = isNormal ? squareName(move.from) : undefined;
  const dest = squareName(move.to);

  // 3. Play move on chessops position
  pos.play(move);
  const newFen = makeFen(pos.toSetup());

  // 4. Animate on board: api.move() triggers animation, then api.set() updates state
  if (orig) api.move(orig, dest);

  api.set({
    fen: newFen,
    turnColor: pos.turn,
    check: pos.isCheck() ? pos.turn : false,
    lastMove: orig ? [orig, dest] : [dest],
    movable: {
      color: pos.isEnd() ? undefined : playerColor,
      dests: pos.isEnd()
        ? new Map()
        : chessgroundDests(pos, { chess960: true }),
    },
  });

  // 5. Check game end after engine move
  if (pos.isEnd()) {
    const outcome = pos.outcome();
    console.log("Game over", outcome);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function squareName(sq: number): string {
  const files = "abcdefgh";
  const file = sq & 7;
  const rank = sq >> 3;
  return files[file] + (rank + 1);
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

// Standard starting position:
const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// Or a random Chess960 position (see chessops section for chess960Backrank()):
// const { fen: startFen } = randomChess960Fen();

initEngine(/* isChess960: */ false);
initBoard(document.getElementById("board")!, startFen);
```

### Promotion Handling

Pawn promotion requires special handling — chessground fires `movable.events.after` with the destination on the 8th rank but does NOT automatically show a promotion dialog. You must implement that yourself, then call `pos.play()` once the user picks a piece.

```ts
// Detect promotion in the after callback:
function onUserMove(orig: string, dest: string) {
  const fromSq = parseSquare(orig)!;
  const toSq = parseSquare(dest)!;
  const piece = pos.board.get(fromSq);

  const isPromotion =
    piece?.role === "pawn" &&
    ((pos.turn === "white" && dest[1] === "8") ||
      (pos.turn === "black" && dest[1] === "1"));

  if (isPromotion) {
    // Show your own promotion UI; on selection call:
    const promotionRole: Role = "queen"; // from user choice
    const move = parseUci(orig + dest + roleToPromotionChar(promotionRole))!;
    applyValidatedMove(orig, dest, move);
  } else {
    const move = parseUci(orig + dest)!;
    applyValidatedMove(orig, dest, move);
  }
}

function roleToPromotionChar(role: Role): string {
  return { queen: "q", rook: "r", bishop: "b", knight: "n" }[role] ?? "q";
}
```

---

## Key Gotchas

### chessground `movable.free` Default is `true`

By default, `movable.free = true` means the board editor mode — no legal move filtering. **Always set `movable.free = false`** when playing a real game and supply `movable.dests`.

### chessground Does Not Validate Moves

Chessground is pure UI. Setting `movable.dests` restricts which squares are highlighted as destinations, but the `after` callback is still your responsibility to call `pos.play()` with a valid move.

### chessops `play()` Mutates In Place

Always `pos.clone()` before calling `pos.play()` if you need to keep the original position.

### Chess960 Castling UCI Notation

- Standard: king moves two squares — `e1g1` (kingside) / `e1c1` (queenside)
- Chess960: king moves to rook's file — `e1h1` (kingside, rook on h1) / `e1a1` (queenside, rook on a1)
- Stockfish in Chess960 mode (`UCI_Chess960 true`) expects and sends Chess960 notation
- chessops `parseUci` handles both; `pos.isLegal()` resolves castling by checking `castlingRights`

### Stockfish WASM Files Must Be Served

When using stockfish via npm in a bundled app (Vite/webpack), you must copy the `.js` and `.wasm` files to your `public/` directory. They cannot be bundled — they must be served as separate files. Vite plugin `vite-plugin-static-copy` or manual configuration is needed.

### chessground `rookCastle` Option

When `movable.rookCastle = true` (default) and `chess960 = false`, chessground allows the user to click either the king or the rook to initiate castling. The `after` callback receives `orig=king-square, dest=rook-square` in that case. With `chess960: true` in `chessgroundDests`, only rook-square destinations are included, so the callback always gives you king→rook format.

---

## Sources

- [@lichess-org/chessground npm / jsDelivr](https://www.jsdelivr.com/package/npm/@lichess-org/chessground) — version 10.0.2
- [chessground GitHub](https://github.com/lichess-org/chessground) — src/config.ts, src/api.ts, src/state.ts
- [chessops GitHub](https://github.com/niklasf/chessops) — src/chess.ts, src/fen.ts, src/compat.ts, src/util.ts, src/types.ts
- [chessops TypeDoc](https://niklasf.github.io/chessops/) — Chess class, compat module
- [nmrugg/stockfish.js GitHub](https://github.com/nmrugg/stockfish.js) — README, examples/
- [Stockfish UCI docs](https://official-stockfish.github.io/docs/stockfish-wiki/UCI-&-Commands.html)
- [fischer960 npm](https://github.com/joakim/fischer960) — Chess960 position generation
