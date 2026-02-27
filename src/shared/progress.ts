export const GAMES = ["puzzles", "nback", "stroop", "math"] as const;
export type GameId = (typeof GAMES)[number];

const PREFIX = "brainbout";

function key(...parts: string[]): string {
  return `${PREFIX}:${parts.join(":")}`;
}

export function recordScore(game: GameId, score: number, date: string): void {
  localStorage.setItem(key("daily", date, game), String(score));

  const prev = getBest(game);
  if (prev === null || score > prev) {
    localStorage.setItem(key("best", game), String(score));
  }
}

export function getDailyScore(game: GameId, date: string): number | null {
  const val = localStorage.getItem(key("daily", date, game));
  return val === null ? null : Number(val);
}

export function getBest(game: GameId): number | null {
  const val = localStorage.getItem(key("best", game));
  return val === null ? null : Number(val);
}

export function isDayComplete(date: string): boolean {
  return GAMES.every((game) => getDailyScore(game, date) !== null);
}

export function getStreak(today: string): number {
  let streak = 0;
  const d = new Date(today + "T00:00:00");
  while (isDayComplete(formatDate(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export function todayString(): string {
  return formatDate(new Date());
}

function formatDate(d: Date): string {
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function nextGame(date: string): GameId | null {
  for (const game of GAMES) {
    if (getDailyScore(game, date) === null) {
      return game;
    }
  }
  return null;
}
