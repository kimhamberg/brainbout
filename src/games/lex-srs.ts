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

function lexKey(lang: string, word: string): string {
  return `lex:${lang}:${word}`;
}

function lexPrefix(lang: string): string {
  return `lex:${lang}:`;
}

export function getCard(lang: string, word: string): CardState {
  return fsrsGetCard(lexKey(lang, word));
}

export function recordReview(
  lang: string,
  word: string,
  grade: Grade,
  today: string,
): CardState {
  return fsrsRecordReview(lexKey(lang, word), grade, today);
}

export function isDue(card: CardState, today: string): boolean {
  return fsrsIsDue(card, today);
}

export function getDueWords(
  lang: string,
  allWords: readonly string[],
  today: string,
): string[] {
  return allWords.filter((w) => isDue(getCard(lang, w), today));
}

/** Words that have ever been reviewed (used by the session-builder to mix new + due). */
export function getSeenWords(lang: string): Set<string> {
  return getSeenKeys(lexPrefix(lang));
}

export function getMasteredCount(lang: string): number {
  return getMasteredCountByPrefix(lexPrefix(lang));
}

/* ─── input grading helpers (lex-specific) ───────────────────────────── */

export function maxTypos(wordLength: number): number {
  if (wordLength <= 3) return 0;
  if (wordLength <= 7) return 1;
  return 2;
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
  const a = typed.trim().toLowerCase();
  const b = target.toLowerCase();
  if (a === b) return "good";
  const dist = levenshtein(a, b);
  return dist <= maxTypos(b.length) ? "hard" : "again";
}
