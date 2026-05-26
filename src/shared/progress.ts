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
  if (todayCount === 0) {
    // First session of the day — bridge a 1-day gap with a freeze if
    // available, so a single missed day does not snap the streak.
    tryBridgeWithFreeze(today);
  }
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

/* ─── humane streaks ─────────────────────────────────────────────────── */

/**
 * Maximum freezes a user can spend in a single ISO week (Mon–Sun).
 * Duolingo data shows freeze affordances cut burnout without killing
 * streak motivation; we cap at 2 to keep the loyalty-loop honest.
 */
export const MAX_FREEZES_PER_WEEK = 2;

/** Hard cap on the visible streak — past this point the number stops mattering. */
export const STREAK_DISPLAY_CAP = 99;

function previousDay(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return formatDate(d);
}

/** Monday-of-week date string, used as the week-bucket key for freezes. */
export function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  const dow = d.getDay() === 0 ? 7 : d.getDay(); // ISO: Sunday = 7
  d.setDate(d.getDate() - (dow - 1));
  return formatDate(d);
}

function hasSession(date: string): boolean {
  const v = localStorage.getItem(key("sessions", date));
  return v !== null && Number(v) >= 1;
}

function hasFreeze(date: string): boolean {
  return localStorage.getItem(key("freeze", date)) !== null;
}

export function freezesUsedThisWeek(date: string): number {
  const v = localStorage.getItem(key("freezes-used", weekStart(date)));
  return v === null ? 0 : Number(v);
}

export function freezesRemainingThisWeek(date: string): number {
  return Math.max(0, MAX_FREEZES_PER_WEEK - freezesUsedThisWeek(date));
}

function tryBridgeWithFreeze(today: string): void {
  const yesterday = previousDay(today);
  if (hasSession(yesterday) || hasFreeze(yesterday)) return;
  const dayBefore = previousDay(yesterday);
  if (!(hasSession(dayBefore) || hasFreeze(dayBefore))) return;
  if (freezesUsedThisWeek(today) >= MAX_FREEZES_PER_WEEK) return;
  safeSet(key("freeze", yesterday), "1");
  const wk = weekStart(today);
  safeSet(key("freezes-used", wk), String(freezesUsedThisWeek(today) + 1));
}

export function getStreak(today: string): number {
  let streak = 0;
  const d = new Date(`${today}T00:00:00`);
  let date = formatDate(d);
  while (hasSession(date) || hasFreeze(date)) {
    streak++;
    d.setDate(d.getDate() - 1);
    date = formatDate(d);
  }
  return streak;
}
