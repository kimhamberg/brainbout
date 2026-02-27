export const GAMES = ["rapid", "reaction", "vocab", "math"] as const;
export type GameId = (typeof GAMES)[number];

const PREFIX = "brainbout";

function key(...parts: string[]): string {
  return `${PREFIX}:${parts.join(":")}`;
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
    localStorage.setItem(key("today-best", today, game), String(score));
  }

  // Update all-time best
  const prevBest = getBest(game);
  if (prevBest === null || score > prevBest) {
    localStorage.setItem(key("best", game), String(score));
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
  localStorage.setItem(key("sessions", today), String(todayCount + 1));

  const total = getTotalSessions();
  localStorage.setItem(key("total-sessions"), String(total + 1));
}

export function getStreak(today: string): number {
  let streak = 0;
  const d = new Date(today + "T00:00:00");
  let val = localStorage.getItem(key("sessions", formatDate(d)));
  while (val !== null && Number(val) >= 1) {
    streak++;
    d.setDate(d.getDate() - 1);
    val = localStorage.getItem(key("sessions", formatDate(d)));
  }
  return streak;
}
