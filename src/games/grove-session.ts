/**
 * Grove session queue (design docs/design/03 Grove, 04). Pure-ish (reads FSRS
 * card state from storage) selector: due-first, then new, capped — the bounded
 * "Morning Round" the typed-recall block plays. No DOM, no rendering.
 */

import type { DeckEntry, VocabDeck } from "../content/deck";
import { getCard, getDueWords } from "./lex-srs";

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
