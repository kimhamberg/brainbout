export const BOX_INTERVALS = [0, 1, 3, 7, 14, 30];

const PREFIX = "brainbout:cipher";
const MAX_MASTERY = 2;
const MASTERY_THRESHOLD = 3;

interface WordState {
  box: number;
  nextDue: string;
  mastery: number;
  masteryStreak: number;
}

function stateKey(lang: string, word: string): string {
  return `${PREFIX}:${lang}:${word}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getWordState(lang: string, word: string): WordState {
  const raw = localStorage.getItem(stateKey(lang, word));
  if (raw === null)
    return { box: 0, nextDue: "", mastery: 0, masteryStreak: 0 };
  const parsed = JSON.parse(raw) as Partial<WordState>;
  return {
    box: parsed.box ?? 0,
    nextDue: parsed.nextDue ?? "",
    mastery: parsed.mastery ?? 0,
    masteryStreak: parsed.masteryStreak ?? 0,
  };
}

export function recordAnswer(
  lang: string,
  word: string,
  correct: boolean,
  today: string,
): void {
  const state = getWordState(lang, word);
  if (correct) {
    const newBox = Math.min(state.box + 1, BOX_INTERVALS.length - 1);
    const interval = BOX_INTERVALS[newBox];
    const nextDue = addDays(today, interval);
    let newStreak = state.masteryStreak + 1;
    let newMastery = state.mastery;
    if (newStreak >= MASTERY_THRESHOLD && newMastery < MAX_MASTERY) {
      newMastery++;
      newStreak = 0;
    }
    localStorage.setItem(
      stateKey(lang, word),
      JSON.stringify({
        box: newBox,
        nextDue,
        mastery: newMastery,
        masteryStreak: newStreak,
      }),
    );
  } else {
    localStorage.setItem(
      stateKey(lang, word),
      JSON.stringify({
        box: 0,
        nextDue: "",
        mastery: state.mastery,
        masteryStreak: 0,
      }),
    );
  }
}

export function getMastery(lang: string, word: string): number {
  return getWordState(lang, word).mastery;
}

export function getMasteryStreak(lang: string, word: string): number {
  return getWordState(lang, word).masteryStreak;
}

export function getDueWords(
  lang: string,
  allWords: string[],
  today: string,
): string[] {
  return allWords.filter((word) => {
    const state = getWordState(lang, word);
    return state.nextDue === "" || state.nextDue <= today;
  });
}

export function getMasteredCount(lang: string): number {
  const prefix = `${PREFIX}:${lang}:`;
  let count = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k !== null && k.startsWith(prefix)) {
      const raw = localStorage.getItem(k);
      if (raw !== null) {
        const parsed = JSON.parse(raw) as Partial<WordState>;
        if ((parsed.mastery ?? 0) >= MAX_MASTERY) count++;
      }
    }
  }
  return count;
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => 0),
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[m][n];
}
