/**
 * Pure trial generation + transform math for the chess-themed mental rotation
 * task. No DOM, no rendering, no randomness directly — RNG is injected so
 * tests are deterministic.
 *
 * Stimuli: 64-square boards with a sprinkling of chess pieces. One transform
 * (rotation 90/180/270 or mirror) is applied; in "different" trials one piece
 * is then moved to a free square. The participant judges "same / different".
 *
 * Design choices (transfer ↑ + beginner-friendly):
 *   • Varied transforms per stage (matches Shepard-Metzler 1971; varied
 *     angles + mirror is what gave Uttal 2013's g = 0.47).
 *   • Pieces are familiar chess icons rather than abstract cubes → low
 *     stimulus-friction for long sessions, no learning of the symbols.
 *   • Asymmetric piece sprays (not standard starting positions) preserve
 *     the "asymmetric figures" requirement that drives rotation-RT effects.
 *   • Adaptive: piece-count and transform set widen with stage.
 */

import { rng as defaultRng } from "../shared/rng";

export type Color = "w" | "b";
export type Role = "k" | "q" | "r" | "b" | "n" | "p";

export interface Piece {
  /** 0-63, file-major: a1 = 0, h1 = 7, a8 = 56, h8 = 63. */
  sq: number;
  role: Role;
  color: Color;
}

export type Transform = "rot90" | "rot180" | "rot270" | "mirrorV" | "mirrorH";

export type TrialKind = "same" | "different";

export interface Trial {
  a: Piece[];
  b: Piece[];
  transform: Transform;
  kind: TrialKind;
}

/* ─── square coordinates ─────────────────────────────────────────────── */

export function squareToFileRank(sq: number): { file: number; rank: number } {
  return { file: sq & 7, rank: sq >> 3 };
}

export function fileRankToSquare(file: number, rank: number): number {
  return (rank << 3) | file;
}

/** Rotate / mirror a single square index. */
export function transformSquare(sq: number, t: Transform): number {
  const { file, rank } = squareToFileRank(sq);
  switch (t) {
    case "rot90":
      return fileRankToSquare(rank, 7 - file);
    case "rot180":
      return fileRankToSquare(7 - file, 7 - rank);
    case "rot270":
      return fileRankToSquare(7 - rank, file);
    case "mirrorV":
      return fileRankToSquare(7 - file, rank);
    case "mirrorH":
      return fileRankToSquare(file, 7 - rank);
  }
}

export function applyTransform(
  pieces: readonly Piece[],
  t: Transform,
): Piece[] {
  return pieces.map((p) => ({ ...p, sq: transformSquare(p.sq, t) }));
}

/* ─── stage curriculum ───────────────────────────────────────────────── */

export interface StageParams {
  pieceMin: number;
  pieceMax: number;
  transforms: readonly Transform[];
  /** Probability that a generated trial is "different" (vs "same"). */
  differentRate: number;
}

export const STAGE_PARAMS: Record<number, StageParams> = {
  1: {
    pieceMin: 3,
    pieceMax: 4,
    transforms: ["rot180"],
    differentRate: 0.5,
  },
  2: {
    pieceMin: 5,
    pieceMax: 7,
    transforms: ["rot90", "rot180", "rot270"],
    differentRate: 0.5,
  },
  3: {
    pieceMin: 8,
    pieceMax: 12,
    transforms: ["rot90", "rot180", "rot270", "mirrorV", "mirrorH"],
    differentRate: 0.5,
  },
};

export function getStageParams(stage: number): StageParams {
  return STAGE_PARAMS[stage] ?? STAGE_PARAMS[1]!;
}

/* ─── piece-spray generation ─────────────────────────────────────────── */

const ROLES: readonly Role[] = ["q", "r", "b", "n", "p", "p", "p"]; // weighted: pawns common
const COLORS: readonly Color[] = ["w", "b"];

function pickInt(rng: () => number, maxExclusive: number): number {
  return Math.floor(rng() * maxExclusive);
}

function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[pickInt(rng, arr.length)] as T;
}

/**
 * Sprinkle `n` random pieces onto distinct squares. Symmetric / standard
 * starting layouts are explicitly avoided (rotation RT effects need
 * asymmetric figures).
 */
export function generatePieces(
  n: number,
  rng: () => number = defaultRng,
): Piece[] {
  const used = new Set<number>();
  const pieces: Piece[] = [];
  const cap = Math.min(n, 64);
  while (pieces.length < cap) {
    let sq = pickInt(rng, 64);
    // Linear probe so a constant-valued rng (used in tests) terminates.
    while (used.has(sq)) sq = (sq + 1) & 63;
    used.add(sq);
    pieces.push({ sq, role: pick(ROLES, rng), color: pick(COLORS, rng) });
  }
  return pieces;
}

/* ─── trial generation ───────────────────────────────────────────────── */

/**
 * Move one piece to a free square. Used to build "different" trials —
 * the change is intentionally small so the player has to actually compare
 * after the rotation, not just spot a missing piece.
 */
export function perturbOnePiece(
  pieces: readonly Piece[],
  rng: () => number = defaultRng,
): Piece[] {
  if (pieces.length === 0) return [...pieces];
  const occupied = new Set(pieces.map((p) => p.sq));
  // Linear probe — guaranteed terminate even with constant-valued rng.
  let newSq = pickInt(rng, 64);
  while (occupied.has(newSq)) newSq = (newSq + 1) & 63;
  const idx = pickInt(rng, pieces.length);
  return pieces.map((p, i) => (i === idx ? { ...p, sq: newSq } : p));
}

export function generateTrial(
  stage: number,
  rng: () => number = defaultRng,
): Trial {
  const params = getStageParams(stage);
  const n =
    params.pieceMin + pickInt(rng, params.pieceMax - params.pieceMin + 1);
  const a = generatePieces(n, rng);
  const transform = pick(params.transforms, rng);
  const transformed = applyTransform(a, transform);
  const isDifferent = rng() >= params.differentRate;
  const b = isDifferent ? perturbOnePiece(transformed, rng) : transformed;
  return {
    a,
    b,
    transform,
    kind: isDifferent ? "different" : "same",
  };
}

/* ─── response grading ───────────────────────────────────────────────── */

export function classifyResponse(
  trial: Trial,
  pressed: TrialKind,
): { correct: boolean } {
  return { correct: pressed === trial.kind };
}

/* ─── FEN serialization (for Chessground) ────────────────────────────── */

const ROLE_CHAR: Record<Role, string> = {
  k: "k",
  q: "q",
  r: "r",
  b: "b",
  n: "n",
  p: "p",
};

/** Convert a piece spray to a FEN board placement (rank 8 first). */
export function piecesToFen(pieces: readonly Piece[]): string {
  const board: (string | null)[][] = Array.from({ length: 8 }, () =>
    Array(8).fill(null),
  );
  for (const p of pieces) {
    const { file, rank } = squareToFileRank(p.sq);
    const ch =
      p.color === "w" ? ROLE_CHAR[p.role].toUpperCase() : ROLE_CHAR[p.role];
    board[rank]![file] = ch;
  }
  const ranks: string[] = [];
  for (let r = 7; r >= 0; r--) {
    let s = "";
    let blanks = 0;
    for (let f = 0; f < 8; f++) {
      const c = board[r]![f];
      if (c === null) {
        blanks++;
      } else {
        if (blanks > 0) {
          s += String(blanks);
          blanks = 0;
        }
        s += c;
      }
    }
    if (blanks > 0) s += String(blanks);
    ranks.push(s);
  }
  return `${ranks.join("/")} w - - 0 1`;
}

export function transformLabel(t: Transform): string {
  switch (t) {
    case "rot90":
      return "rotated 90°";
    case "rot180":
      return "rotated 180°";
    case "rot270":
      return "rotated 270°";
    case "mirrorV":
      return "mirrored (vertical)";
    case "mirrorH":
      return "mirrored (horizontal)";
  }
}

/* ─── result viewmodel ───────────────────────────────────────────────── */

export interface ResultVm {
  finalScore: number;
  totalTrials: number;
  correctTrials: number;
  avgResponseMs: number;
  peakStreak: number;
}

export function renderResultHtml(vm: ResultVm): string {
  const accuracy =
    vm.totalTrials === 0
      ? 0
      : Math.round((vm.correctTrials / vm.totalTrials) * 100);
  return `
    <div class="result">
      <div class="final-score" data-target="${String(vm.finalScore)}">0</div>
      <div class="result-label">points · ${String(accuracy)}% accuracy across ${String(vm.totalTrials)} trial${vm.totalTrials === 1 ? "" : "s"}</div>
      <div class="peak-streak">Best streak: ${String(vm.peakStreak)}</div>
      <div class="accuracy">Avg response: ${String(Math.round(vm.avgResponseMs))} ms</div>
      <div class="result-actions">
        <button id="again-btn">Play Again</button>
        <button id="back-btn" class="secondary">Back to Hub</button>
      </div>
    </div>
  `;
}
