import { defined } from "../shared/assert";
import {
  type CardState,
  getCard as fsrsGetCard,
  isDue as fsrsIsDue,
  recordReview as fsrsRecordReview,
  type Grade,
  getMasteredCountByPrefix,
  getSeenKeys,
} from "../shared/fsrs";

/**
 * Lex-specific wrapper around the generic FSRS scheduler.
 *
 * Keys are `brainbout:lex:<lang>:<word>`. The generic FSRS module owns the
 * algorithm + storage; this module only translates (lang, word) tuples into
 * keys and exposes typing-error grading helpers that are lex-specific.
 */

export type { CardState, Grade } from "../shared/fsrs";
export {
  GRADES,
  goodFactor,
  isMastered,
  jitterInterval,
  MASTERY_STABILITY_DAYS,
  updateDifficulty,
  updateStability,
} from "../shared/fsrs";

// Keyed by (deckId, entryId) (design docs/design/04). The default deck is "no";
// for sense-0 entries entryId === the bare label, so legacy `lex:no:<word>`
// cards are already valid under this scheme — NO migration is needed.
function lexKey(deckId: string, entryId: string): string {
  return `lex:${deckId}:${entryId}`;
}

function lexPrefix(deckId: string): string {
  return `lex:${deckId}:`;
}

export function getCard(deckId: string, entryId: string): CardState {
  return fsrsGetCard(lexKey(deckId, entryId));
}

export function recordReview(
  deckId: string,
  entryId: string,
  grade: Grade,
  today: string,
): CardState {
  return fsrsRecordReview(lexKey(deckId, entryId), grade, today);
}

export function isDue(card: CardState, today: string): boolean {
  return fsrsIsDue(card, today);
}

export function getDueWords(
  deckId: string,
  entryIds: readonly string[],
  today: string,
): string[] {
  return entryIds.filter((id) => isDue(getCard(deckId, id), today));
}

/** Entries ever reviewed (used by the session-builder to mix new + due). */
export function getSeenWords(deckId: string): Set<string> {
  return getSeenKeys(lexPrefix(deckId));
}

export function getMasteredCount(deckId: string): number {
  return getMasteredCountByPrefix(lexPrefix(deckId));
}

/* ─── input grading helpers (lex-specific) ───────────────────────────── */

/**
 * Typo budget by label length (Q10). Thresholds ≤13 are unchanged from the
 * original (single-word rigor intact); only labels longer than any single
 * Norwegian word — i.e. phrases/proverbs — get proportional slack.
 */
export function maxTypos(wordLength: number): number {
  if (wordLength <= 3) return 0;
  if (wordLength <= 7) return 1;
  if (wordLength <= 13) return 2;
  return 2 + Math.floor((wordLength - 13) / 8);
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const w = n + 1;
  const dp = new Uint32Array((m + 1) * w);

  for (let i = 0; i <= m; i++) dp[i * w] = i;
  for (let j = 0; j <= n; j++) dp[j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i * w + j] = Math.min(
        defined(dp[(i - 1) * w + j]) + 1,
        defined(dp[i * w + (j - 1)]) + 1,
        defined(dp[(i - 1) * w + (j - 1)]) + cost,
      );
    }
  }
  return defined(dp[m * w + n]);
}

/**
 * Map a typed answer to a suggested grade. The user can always override.
 *   - exact match → "good"
 *   - within typo budget → "hard"
 *   - otherwise         → "again"
 */
export function suggestGradeFromTyping(typed: string, target: string): Grade {
  // Collapse internal whitespace so a stray double-space in a phrase isn't a typo
  // (Q10); no effect on single-token words.
  const norm = (s: string): string =>
    s.trim().toLowerCase().replace(/\s+/g, " ");
  const a = norm(typed);
  const b = norm(target);
  if (a === b) return "good";
  const dist = levenshtein(a, b);
  return dist <= maxTypos(b.length) ? "hard" : "again";
}
