/**
 * Thin wrapper around `crossword-layout-generator`. Hides its CommonJS shape,
 * gives us typed placements, and offers helpers for cell ↔ word lookup so the
 * UI can paint filled letters and highlight intersections.
 */

import clg from "crossword-layout-generator";

export type Orientation = "across" | "down" | "none";

export interface RawClueInput {
  clue: string;
  answer: string;
}

export interface Placement {
  clue: string;
  answer: string;
  startx: number;
  starty: number;
  orientation: Orientation;
  position: number;
}

export interface CrosswordLayout {
  rows: number;
  cols: number;
  placements: Placement[];
  /** Words that the generator could not place — still reviewable, just not on the board. */
  unplaced: RawClueInput[];
}

interface RawLayoutEntry {
  clue: string;
  answer: string;
  startx?: number;
  starty?: number;
  orientation: string;
  position?: number;
}

interface RawLayout {
  rows: number;
  cols: number;
  result: RawLayoutEntry[];
}

interface CLGModule {
  generateLayout(words: RawClueInput[]): RawLayout;
}

/**
 * Run the upstream generator while muting its diagnostic console.log output.
 * The library logs internal score weights — useful for its author, noise for us.
 */
function generateSilently(words: RawClueInput[]): RawLayout {
  const original = console.log;
  console.log = (): void => {};
  try {
    return (clg as unknown as CLGModule).generateLayout(words);
  } finally {
    console.log = original;
  }
}

/** Build a layout from a queue of {clue, answer} pairs. Pure aside from RNG. */
export function buildLayout(words: readonly RawClueInput[]): CrosswordLayout {
  if (words.length === 0) {
    return { rows: 0, cols: 0, placements: [], unplaced: [] };
  }
  const raw = generateSilently([...words]);
  const placements: Placement[] = [];
  const unplaced: RawClueInput[] = [];
  for (const entry of raw.result) {
    if (entry.orientation === "across" || entry.orientation === "down") {
      placements.push({
        clue: entry.clue,
        answer: entry.answer,
        startx: entry.startx ?? 1,
        starty: entry.starty ?? 1,
        orientation: entry.orientation,
        position: entry.position ?? 0,
      });
    } else {
      unplaced.push({ clue: entry.clue, answer: entry.answer });
    }
  }
  // Re-number positions so they're stable + start at 1.
  placements.sort((a, b) =>
    a.starty === b.starty ? a.startx - b.startx : a.starty - b.starty,
  );
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i];
    if (p) p.position = i + 1;
  }
  return { rows: raw.rows, cols: raw.cols, placements, unplaced };
}

export interface Cell {
  x: number;
  y: number;
}

/** Cells occupied by a placement (1-indexed, matching the lib's coordinate system). */
export function cellsFor(p: Placement): Cell[] {
  const out: Cell[] = [];
  for (let i = 0; i < p.answer.length; i++) {
    if (p.orientation === "across") {
      out.push({ x: p.startx + i, y: p.starty });
    } else {
      out.push({ x: p.startx, y: p.starty + i });
    }
  }
  return out;
}

export type CellKey = `${number},${number}`;
export function cellKey(x: number, y: number): CellKey {
  return `${x},${y}`;
}

export interface CellInfo {
  /** Expected letter at this cell (from the layout). */
  letter: string;
  /** Word indices that pass through this cell. */
  wordIdxs: number[];
  /** True when ≥ 2 words cross here. */
  intersection: boolean;
}

/** Map every used cell → letter + the word(s) that cover it. */
export function cellMap(
  placements: readonly Placement[],
): Map<CellKey, CellInfo> {
  const map = new Map<CellKey, CellInfo>();
  for (let idx = 0; idx < placements.length; idx++) {
    const p = placements[idx];
    if (!p) continue;
    const cells = cellsFor(p);
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      const ch = p.answer[i];
      if (!c || ch === undefined) continue;
      const k = cellKey(c.x, c.y);
      const prev = map.get(k);
      if (prev) {
        prev.wordIdxs.push(idx);
        prev.intersection = true;
      } else {
        map.set(k, {
          letter: ch.toLowerCase(),
          wordIdxs: [idx],
          intersection: false,
        });
      }
    }
  }
  return map;
}
