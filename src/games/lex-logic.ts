/** Pure, side-effect-free Lex helpers — testable without DOM or storage. */

export function maxMasteryForStage(stage: number): number {
  if (stage >= 3) return 2; // naked cloze
  if (stage >= 2) return 1; // hinted cloze
  return 0; // MCQ only
}

/** Score bonus for fast answers: <3s=5, <6s=3, <10s=1, else 0. */
export function speedBonus(elapsedMs: number): number {
  const sec = elapsedMs / 1000;
  if (sec < 3) return 5;
  if (sec < 6) return 3;
  if (sec < 10) return 1;
  return 0;
}

/** Streak multiplier: 1× under 3, 1.5× at 3+, 2× at 5+. */
export function streakMultiplier(streak: number): number {
  if (streak >= 5) return 2;
  if (streak >= 3) return 1.5;
  return 1;
}

/** Count shared letters between two words (multiset intersection, case-insensitive). */
export function commonLetters(a: string, b: string): number {
  const freq = new Map<string, number>();
  for (const ch of a.toLowerCase()) {
    freq.set(ch, (freq.get(ch) ?? 0) + 1);
  }
  let shared = 0;
  for (const ch of b.toLowerCase()) {
    const count = freq.get(ch) ?? 0;
    if (count > 0) {
      shared++;
      freq.set(ch, count - 1);
    }
  }
  return shared;
}

/**
 * Fisher–Yates shuffle in-place. RNG is injected so callers can seed it.
 * Returns the same array to allow chaining; the original is mutated.
 */
export function shuffleArray<T>(
  arr: T[],
  rng: () => number = Math.random,
): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const ai = arr[i] as T;
    const aj = arr[j] as T;
    arr[i] = aj;
    arr[j] = ai;
  }
  return arr;
}

export interface DistractorPick {
  word: string;
  length: number;
  pos: string;
}

/**
 * Pick up to `count` distractor words for a target. Prefers same POS + similar
 * length, ranks by most-shared letters (hardest first). Falls back to any word
 * with similar length when not enough same-POS candidates exist.
 */
export function pickDistractors<T extends DistractorPick>(
  target: T,
  posPool: readonly T[],
  allWords: readonly T[],
  count: number,
): string[] {
  const candidates = posPool.filter(
    (w) => w.word !== target.word && Math.abs(w.length - target.length) <= 3,
  );
  candidates.sort(
    (a, b) =>
      commonLetters(b.word, target.word) - commonLetters(a.word, target.word),
  );
  const picks = candidates.slice(0, count).map((c) => c.word);
  if (picks.length < count) {
    const used = new Set([target.word, ...picks]);
    for (const w of allWords) {
      if (picks.length >= count) break;
      if (!used.has(w.word) && Math.abs(w.length - target.length) <= 3) {
        picks.push(w.word);
        used.add(w.word);
      }
    }
  }
  return picks;
}

/**
 * Plan a session queue: blend recently-seen due cards with brand-new ones,
 * keeping the order shuffled and the total size capped.
 */
export interface Entry {
  word: string;
}

export function buildQueue<T extends Entry>(
  dict: readonly T[],
  seen: ReadonlySet<string>,
  due: ReadonlySet<string>,
  sessionSize: number,
  newRatio: number,
  shuffle: <U>(arr: U[]) => U[],
): T[] {
  const review = shuffle(
    dict.filter((d) => seen.has(d.word) && due.has(d.word)),
  );
  const fresh = shuffle(dict.filter((d) => !seen.has(d.word)));

  const reviewCount = Math.min(
    Math.round(sessionSize * (1 - newRatio)),
    review.length,
  );
  const newCount = Math.min(sessionSize - reviewCount, fresh.length);

  const queue: T[] = shuffle([
    ...review.slice(0, reviewCount),
    ...fresh.slice(0, newCount),
  ]);

  if (queue.length < sessionSize) {
    const used = new Set(queue.map((e) => e.word));
    const filler = shuffle(dict.filter((d) => !used.has(d.word)));
    queue.push(...filler.slice(0, sessionSize - queue.length));
  }
  return queue;
}
