/**
 * Grove session queue (design docs/design/03 Grove, 04). Pure-ish (reads FSRS
 * card state from storage) selector: due-first, then new, capped — the bounded
 * "Morning Round" the typed-recall block plays. No DOM, no rendering.
 */

import type { DeckEntry, VocabDeck } from "../content/deck";
import type { Rng } from "../shared/rng";
import { pickDistractors, shuffleArray } from "./lex-logic";
import { getCard, getDueWords } from "./lex-srs";

/**
 * The recall mode for the current curriculum stage (design docs/design/04): a
 * scaffold from recognition → cued → free recall as stage advances (stages.ts).
 *   stage 1 → MCQ (recognize the seedling)
 *   stage 2 → cloze (first-letter + length hint, then type)
 *   stage 3 → typed (free production — the testing-effect keystone)
 */
export type GroveMode = "mcq" | "cloze" | "typed";

export function groveMode(stage: number): GroveMode {
  if (stage <= 1) return "mcq";
  if (stage === 2) return "cloze";
  return "typed";
}

/**
 * How much a graded trial counts toward STAGE PROMOTION (readiness), 0–1.
 * Decouples curriculum advancement from raw correctness so the scaffold can't
 * masquerade as clean recall:
 *   - `good`/`easy` (exact answer) → full credit in any mode.
 *   - `hard` in MCQ → full credit (recognition has no "partial"; a correct
 *     pick IS the best the mode offers, and recognition mastery is exactly what
 *     gates the next rung).
 *   - `hard` in cloze/typed → HALF credit: a typo-within-budget answer is
 *     correct enough to wake the plant but shouldn't graduate you to free
 *     production on sloppy cued recall.
 *   - `again` → 0.
 */
export function promotionCredit(mode: GroveMode, grade: string): number {
  if (grade === "good" || grade === "easy") return 1;
  if (grade === "again") return 0;
  return mode === "mcq" ? 1 : 0.5; // "hard"
}

const normKey = (s: string): string => s.normalize("NFC").toLowerCase();

/**
 * Up to 4 shuffled MCQ options for a resident: the correct label + up to 3
 * distractors. Same-pos / similar-length / most-shared-letters first
 * (pickDistractors); pos-purity is best-effort — on a small or pos-skewed deck
 * we top up across part-of-speech (and across the length window) so the learner
 * still sees a full 4-way choice rather than a 1–2-button giveaway. Distractors
 * that are mere case/diacritic variants of the target are dropped (two
 * near-identical buttons aren't a real choice). Returns fewer than 4 only when
 * the deck genuinely lacks that many distinct words.
 */
export function groveOptions(
  entry: DeckEntry,
  deck: VocabDeck,
  rng: Rng,
): string[] {
  const picks = deck.entries.map((e) => ({
    word: e.label,
    length: [...e.label].length,
    pos: e.pos,
  }));
  const target = {
    word: entry.label,
    length: [...entry.label].length,
    pos: entry.pos,
  };
  const posPool = picks.filter((p) => p.pos === entry.pos);
  const want = 3;
  const used = new Set<string>([normKey(entry.label)]);
  const distractors: string[] = [];
  for (const w of pickDistractors(target, posPool, picks, want)) {
    const k = normKey(w);
    if (!used.has(k)) {
      distractors.push(w);
      used.add(k);
    }
  }
  // top up across pos / length when the same-pos window came up short.
  for (const p of picks) {
    if (distractors.length >= want) break;
    const k = normKey(p.word);
    if (!used.has(k)) {
      distractors.push(p.word);
      used.add(k);
    }
  }
  return shuffleArray([entry.label, ...distractors], rng);
}

/**
 * Ordered residents to tend this session: previously-seen DUE entries first
 * (most-overdue surface), then brand-new ones, capped at `cap`. Honest — "due"
 * is FSRS isDue, not a fake list.
 */
export function buildGroveQueue(
  deck: VocabDeck,
  deckId: string,
  today: string,
  cap: number,
): DeckEntry[] {
  const byId = new Map(deck.entries.map((e) => [e.entryId, e]));
  const dueIds = getDueWords(deckId, [...byId.keys()], today);

  const seenDue: DeckEntry[] = [];
  for (const id of dueIds) {
    if (getCard(deckId, id).reps > 0) {
      const e = byId.get(id);
      if (e) seenDue.push(e);
    }
  }
  const fresh = deck.entries.filter(
    (e) => getCard(deckId, e.entryId).reps === 0,
  );
  return [...seenDue, ...fresh].slice(0, cap);
}
