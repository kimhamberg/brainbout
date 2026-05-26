import { rng } from "./rng";

/**
 * FSRS-lite spaced-repetition scheduler — generic over arbitrary card keys.
 *
 * Closer to Anki's FSRS than the original Leitner boxes:
 *   • per-card stability S (days) and difficulty D (1-10)
 *   • 4-button grading: again / hard / good / easy
 *   • next interval is a deterministic function of S, with ±15 % jitter
 *
 * Targets ~90 % retention at review time. Not a full FSRS-6 — that has 17
 * ML-trained parameters tuned on 700 M reviews. The rules below approximate
 * FSRS's qualitative behaviour while remaining auditable and testable.
 *
 * Storage layout: every card is keyed `brainbout:<kind>:<sub>...` where
 * `<kind>` is one of "lex", "crown", "flux". Crown/Flux schedule difficulty
 * *classes* rather than individual stimuli (a "card" = "5-piece rot180"
 * trial type, not a specific board); each due event spawns a fresh random
 * stimulus that matches the class. Lex keys the word itself.
 *
 * Evidence base
 *   - Cepeda et al. (2006) meta on distributed practice: g ≈ 0.5
 *   - Roediger / Karpicke testing effect: free-recall > recognition
 *   - FSRS empirics: ~15-20 % fewer reviews than SM-2 for equivalent retention
 */

export const PREFIX = "brainbout";

/** Grade buttons exposed to the user (or derived from RT in Crown/Flux). */
export type Grade = "again" | "hard" | "good" | "easy";

export const GRADES: readonly Grade[] = ["again", "hard", "good", "easy"];

export interface CardState {
  /** Stability in days. */
  s: number;
  /** Difficulty 1..10 (higher = harder). */
  d: number;
  /** YYYY-MM-DD, or "" for never reviewed. */
  lastReview: string;
  /** YYYY-MM-DD next due, or "" for never scheduled. */
  nextDue: string;
  /** Times the card lapsed (graded "again"). */
  lapses: number;
  /** Total reviews. */
  reps: number;
}

const NEW_CARD: CardState = {
  s: 0,
  d: 5,
  lastReview: "",
  nextDue: "",
  lapses: 0,
  reps: 0,
};

/** First-review stability seeds (in days), by grade. */
const INIT_STABILITY: Record<Grade, number> = {
  again: 0.5,
  hard: 1,
  good: 3,
  easy: 7,
};

function fullKey(key: string): string {
  return `${PREFIX}:${key}`;
}

function safeSet(k: string, v: string): void {
  try {
    localStorage.setItem(k, v);
  } catch {
    // Quota / private mode — drop the write rather than crash.
  }
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getCard(key: string): CardState {
  const raw = localStorage.getItem(fullKey(key));
  if (raw === null) return { ...NEW_CARD };
  try {
    const parsed = JSON.parse(raw) as Partial<CardState>;
    return {
      s: parsed.s ?? 0,
      d: parsed.d ?? 5,
      lastReview: parsed.lastReview ?? "",
      nextDue: parsed.nextDue ?? "",
      lapses: parsed.lapses ?? 0,
      reps: parsed.reps ?? 0,
    };
  } catch {
    return { ...NEW_CARD };
  }
}

/* ─── pure update rules (testable without storage) ───────────────────── */

const MIN_D = 1;
const MAX_D = 10;

/** Updated difficulty after a grade. */
export function updateDifficulty(d: number, grade: Grade): number {
  switch (grade) {
    case "again":
      return Math.min(MAX_D, d + 1);
    case "hard":
      return Math.min(MAX_D, d + 0.5);
    case "good":
      return d;
    case "easy":
      return Math.max(MIN_D, d - 0.5);
  }
}

/** Multiplier applied to stability after a "good" review of a card at difficulty d. */
export function goodFactor(d: number): number {
  // FSRS-inspired: easier cards (low D) grow stability faster.
  return Math.max(1.3, 2.6 - 0.15 * (d - 1));
}

/** Updated stability after a grade on a card with prior stability s and difficulty d. */
export function updateStability(s: number, d: number, grade: Grade): number {
  if (s <= 0) {
    return INIT_STABILITY[grade];
  }
  switch (grade) {
    case "again":
      // Don't reset all the way to 0; preserve some of the prior stability.
      return Math.max(0.5, s * 0.2);
    case "hard":
      return Math.max(s, s * 0.8);
    case "good":
      return s * goodFactor(d);
    case "easy":
      return s * goodFactor(d) * 1.5;
  }
}

/** ±15 % jitter applied to the scheduled interval (irregular spacing > uniform). */
export function jitterInterval(
  baseDays: number,
  random: () => number = rng,
): number {
  if (baseDays <= 0) return 0;
  const factor = 0.85 + random() * 0.3;
  return Math.max(1, Math.round(baseDays * factor));
}

/* ─── per-card review + scheduling ───────────────────────────────────── */

export function recordReview(
  key: string,
  grade: Grade,
  today: string,
): CardState {
  const prev = getCard(key);
  const d = updateDifficulty(prev.d, grade);
  const s = updateStability(prev.s, prev.d, grade);
  const interval = jitterInterval(s);
  const next: CardState = {
    s,
    d,
    lastReview: today,
    nextDue: addDays(today, interval),
    lapses: prev.lapses + (grade === "again" ? 1 : 0),
    reps: prev.reps + 1,
  };
  safeSet(fullKey(key), JSON.stringify(next));
  return next;
}

/** True if the card is due today or overdue. */
export function isDue(card: CardState, today: string): boolean {
  return card.nextDue === "" || card.nextDue <= today;
}

/* ─── prefix-scanning utilities ──────────────────────────────────────── */

/**
 * "Mastered" = stability ≥ 30 days. At 90 % retention that's roughly a month
 * of resilience without review — a reasonable proxy for "this card stuck".
 */
export const MASTERY_STABILITY_DAYS = 30;

export function isMastered(card: CardState): boolean {
  return card.s >= MASTERY_STABILITY_DAYS;
}

/** Returns the sub-keys (without the `brainbout:` prefix) that match `subPrefix`. */
export function getSeenKeys(subPrefix: string): Set<string> {
  const full = fullKey(subPrefix);
  const seen = new Set<string>();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(full) === true) {
      seen.add(key.slice(full.length));
    }
  }
  return seen;
}

/** Number of mastered cards whose key starts with `subPrefix` (e.g. "lex:no:"). */
export function getMasteredCountByPrefix(subPrefix: string): number {
  const full = fullKey(subPrefix);
  let count = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(full) === true) {
      const raw = localStorage.getItem(k);
      if (raw !== null) {
        try {
          const parsed = JSON.parse(raw) as Partial<CardState>;
          if ((parsed.s ?? 0) >= MASTERY_STABILITY_DAYS) count++;
        } catch {
          // ignore malformed entries
        }
      }
    }
  }
  return count;
}
