/**
 * Lex Scrabble-overlay scoring. Pure, no DOM or storage.
 *
 * Board sits *on top of* the SR recall loop: grading is unchanged, but a
 * correct recall lights up letter tiles on a deterministic per-word layout
 * and accumulates Scrabble-style points (letter values × cell multipliers).
 */

import { speedBonus, streakMultiplier } from "./lex-logic";

export type Multiplier = "DL" | "TL" | "DW" | "TW" | null;

/**
 * Norwegian Scrabble tile values. Q/X/Z are absent in the official set;
 * we map them to 10 in case they appear in source text (parity with C).
 * Source: en.wikipedia.org/wiki/Scrabble_letter_distributions (Norwegian).
 */
export const TILE_VALUES_NO: Readonly<Record<string, number>> = {
  a: 1,
  d: 1,
  e: 1,
  i: 1,
  l: 1,
  n: 1,
  r: 1,
  s: 1,
  t: 1,
  f: 2,
  g: 2,
  m: 2,
  o: 2,
  h: 3,
  b: 4,
  j: 4,
  k: 4,
  p: 4,
  u: 4,
  v: 4,
  å: 4,
  ø: 5,
  y: 6,
  æ: 6,
  w: 8,
  c: 10,
  q: 10,
  x: 10,
  z: 10,
};

export function letterValue(ch: string): number {
  return TILE_VALUES_NO[ch.toLowerCase()] ?? 0;
}

/** Cheap deterministic 32-bit string hash (FNV-1a). */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 PRNG seeded from a 32-bit int. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MULT_FACTORS: Record<Exclude<Multiplier, null>, number> = {
  DL: 2,
  TL: 3,
  DW: 1,
  TW: 1,
};

const WORD_MULT_FACTORS: Record<Exclude<Multiplier, null>, number> = {
  DL: 1,
  TL: 1,
  DW: 2,
  TW: 3,
};

/**
 * Build a per-letter multiplier layout for a word. Deterministic per word
 * (same word → same layout) so the player can re-encounter the same board.
 *
 * Distribution per cell, drawn independently:
 *   - 55 % no bonus
 *   - 20 % DL
 *   - 10 % TL
 *   - 10 % DW
 *   -  5 % TW
 */
export function boardLayout(word: string): Multiplier[] {
  const rand = mulberry32(hashString(word.toLowerCase()));
  const layout: Multiplier[] = [];
  for (let i = 0; i < word.length; i++) {
    const r = rand();
    if (r < 0.55) layout.push(null);
    else if (r < 0.75) layout.push("DL");
    else if (r < 0.85) layout.push("TL");
    else if (r < 0.95) layout.push("DW");
    else layout.push("TW");
  }
  return layout;
}

/** Score a fully-placed word against a layout. */
export function scoreWord(word: string, layout: readonly Multiplier[]): number {
  let letterTotal = 0;
  let wordMult = 1;
  for (let i = 0; i < word.length; i++) {
    const ch = word[i] ?? "";
    const m = layout[i] ?? null;
    const base = letterValue(ch);
    letterTotal += base * (m === null ? 1 : MULT_FACTORS[m]);
    if (m !== null) wordMult *= WORD_MULT_FACTORS[m];
  }
  return letterTotal * wordMult;
}

/**
 * Final per-turn score: word value × streak multiplier + speed bonus.
 *
 *   - Speed bonus is added flat (not scaled by streak) so the streak
 *     amplifies recall, while the speed bonus stays a tiny cherry.
 *   - Returns an integer.
 */
export function turnScore(
  word: string,
  layout: readonly Multiplier[],
  streak: number,
  elapsedMs: number,
): number {
  const base = scoreWord(word, layout);
  const scaled = base * streakMultiplier(streak);
  return Math.floor(scaled) + speedBonus(elapsedMs);
}
