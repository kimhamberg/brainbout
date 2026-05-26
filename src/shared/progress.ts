export const GAMES = ["crown", "flux", "lex"] as const;
export type GameId = (typeof GAMES)[number];

const PREFIX = "brainbout";

function key(...parts: string[]): string {
  return `${PREFIX}:${parts.join(":")}`;
}

function safeSet(k: string, v: string): void {
  try {
    localStorage.setItem(k, v);
  } catch {
    // QuotaExceededError / SecurityError (e.g., private mode): drop the
    // write so the session keeps running rather than crashing the page.
  }
}

function formatDate(d: Date): string {
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayString(): string {
  return formatDate(new Date());
}

export function getBest(game: GameId): number | null {
  const val = localStorage.getItem(key("best", game));
  return val === null ? null : Number(val);
}

export function getTodayBest(game: GameId): number | null {
  const today = todayString();
  const val = localStorage.getItem(key("today-best", today, game));
  return val === null ? null : Number(val);
}

export function recordSessionScore(game: GameId, score: number): void {
  const today = todayString();

  // Update today-best
  const prevToday = getTodayBest(game);
  if (prevToday === null || score > prevToday) {
    safeSet(key("today-best", today, game), String(score));
  }

  // Update all-time best
  const prevBest = getBest(game);
  if (prevBest === null || score > prevBest) {
    safeSet(key("best", game), String(score));
  }
}

export function getSessionsToday(): number {
  const today = todayString();
  const val = localStorage.getItem(key("sessions", today));
  return val === null ? 0 : Number(val);
}

export function getTotalSessions(): number {
  const val = localStorage.getItem(key("total-sessions"));
  return val === null ? 0 : Number(val);
}

export function completeSession(): void {
  const today = todayString();

  const todayCount = getSessionsToday();
  safeSet(key("sessions", today), String(todayCount + 1));

  const total = getTotalSessions();
  safeSet(key("total-sessions"), String(total + 1));
}

export function getCheckmates(elo: number): number {
  const val = localStorage.getItem(key("checkmates", String(elo)));
  return val === null ? 0 : Number(val);
}

export function recordCheckmate(elo: number): void {
  const count = getCheckmates(elo);
  safeSet(key("checkmates", String(elo)), String(count + 1));
}

/* ─── daily challenge ────────────────────────────────────────────────── */

/** Score recorded for a daily-challenge run on the given date, or null. */
export function getDaily(date: string): number | null {
  const val = localStorage.getItem(key("daily", date));
  return val === null ? null : Number(val);
}

/**
 * Record (and persist the best of) today's daily-challenge score. Replays
 * on the same date keep the best, never overwrite with a lower score.
 */
export function recordDaily(date: string, score: number): void {
  const prev = getDaily(date);
  if (prev === null || score > prev) {
    safeSet(key("daily", date), String(score));
  }
}

/**
 * Return the last `days` calendar days of daily-challenge scores (newest
 * first). Missing days appear as null so the caller can render a gap.
 */
export function getDailyHistory(
  today: string,
  days: number,
): Array<{ date: string; score: number | null }> {
  const out: Array<{ date: string; score: number | null }> = [];
  const d = new Date(`${today}T00:00:00`);
  for (let i = 0; i < days; i++) {
    const date = formatDate(d);
    out.push({ date, score: getDaily(date) });
    d.setDate(d.getDate() - 1);
  }
  return out;
}

export function getStreak(today: string): number {
  let streak = 0;
  const d = new Date(`${today}T00:00:00`);
  let val = localStorage.getItem(key("sessions", formatDate(d)));
  while (val !== null && Number(val) >= 1) {
    streak++;
    d.setDate(d.getDate() - 1);
    val = localStorage.getItem(key("sessions", formatDate(d)));
  }
  return streak;
}
