/**
 * Greenhouse-vs-wild active-set cap (design docs/design/04 "greenhouse-vs-wild").
 *
 * The "greenhouse" is a BOUNDED, ordered active learning set of entryIds — at
 * most ACTIVE_SET_CAP — the only Lex subset that admits NEW learning. It seeds
 * the lowest-`rank` unseen entries; when a card is mastered (s ≥ 30 days) it
 * MIGRATES to the "wild" (leaves the set) and the next lowest-rank unseen entry
 * is promoted in to refill. This bounds a session's due-load to a humane round
 * instead of letting a 20k-entry deck flood it: the queue draws from
 * `active ∪ sample(wildDue, WILD_DUE_PER_SESSION)`, never the whole deck.
 *
 * Stored as `brainbout:lex:<deck>:active` (a JSON entryId[]). Pure of DOM; reads
 * FSRS card state from storage (like the rest of the session layer).
 */

import type { DeckEntry, VocabDeck } from "../content/deck";
import { isMastered } from "../shared/fsrs";
import { ACTIVE_SET_CAP, WILD_DUE_PER_SESSION } from "../world/limits";
import { getCard, isDue } from "./lex-srs";

function activeKey(deckId: string): string {
  return `brainbout:lex:${deckId}:active`;
}

function load(deckId: string): string[] {
  const raw = localStorage.getItem(activeKey(deckId));
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

function save(deckId: string, list: readonly string[]): void {
  localStorage.setItem(activeKey(deckId), JSON.stringify(list));
}

/** Deck entries by ascending `rank` (the stable seeding/promotion order). */
function byRank(deck: VocabDeck): DeckEntry[] {
  return [...deck.entries].sort((a, b) => a.rank - b.rank);
}

/**
 * Reconcile + persist the greenhouse: drop mastered cards (they migrate to the
 * wild), then promote lowest-rank UNSEEN entries until the set is full (≤ cap)
 * or the deck is exhausted. Idempotent; safe to call at the start of every
 * session. Returns the ordered active entryId list.
 */
export function syncActiveSet(
  deck: VocabDeck,
  deckId: string,
  cap: number = ACTIVE_SET_CAP,
): string[] {
  const inDeck = new Set(deck.entries.map((e) => e.entryId));
  // keep current members that still exist and aren't mastered
  const active = load(deckId).filter(
    (id) => inDeck.has(id) && !isMastered(getCard(deckId, id)),
  );
  const seen = new Set(active);

  for (const e of byRank(deck)) {
    if (active.length >= cap) break;
    if (seen.has(e.entryId)) continue;
    if (getCard(deckId, e.entryId).reps > 0) continue; // only unseen are promotable as NEW
    active.push(e.entryId);
    seen.add(e.entryId);
  }
  save(deckId, active);
  return active;
}

/**
 * A small, capped slice of WILD residents that need attention now: entries
 * outside the greenhouse (migrated/mastered, or seen before they were
 * greenhoused) that are FSRS-due, most-overdue first. "The wild mostly tends
 * itself; occasionally a wild resident needs you."
 */
export function sampleWildDue(
  deck: VocabDeck,
  deckId: string,
  today: string,
  active: readonly string[],
  max: number = WILD_DUE_PER_SESSION,
): DeckEntry[] {
  const activeSet = new Set(active);
  return deck.entries
    .filter((e) => {
      if (activeSet.has(e.entryId)) return false;
      const card = getCard(deckId, e.entryId);
      return card.reps > 0 && isDue(card, today);
    })
    .sort((a, b) => {
      const na = getCard(deckId, a.entryId).nextDue;
      const nb = getCard(deckId, b.entryId).nextDue;
      return na < nb ? -1 : na > nb ? 1 : a.rank - b.rank; // most overdue first
    })
    .slice(0, max);
}
