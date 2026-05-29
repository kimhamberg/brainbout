/**
 * Deck content model — the (deckId, entryId) abstraction (design docs/design/04).
 *
 * A deck = manifest + entries. `label` is the surface form the player TYPES;
 * `entryId` is the immutable card identity (differs from label only for
 * homographs). `rank` is the baked seeding/promotion order (Q1): a deterministic
 * three-key sort [lengthBand, freqTier, originalIndex]. No third-party frequency
 * corpus is committed by default — `freqTier` is 0 unless an opt-in build
 * supplies one, so ranking is license-clean and length-graded.
 *
 * Pure: no DOM, no storage. `normalizeVocabDeck` is a pure fn of its input.
 */

export type ClusterBy = "gloss-keyword" | "entryId";

export interface DeckManifest {
  deckId: string;
  kind: "vocab" | "fact" | "custom";
  label: string;
  lang?: string;
  /** Gloss language; gloss-keyword clustering only applies when this is "en". */
  glossLang?: string;
  /** FLORA semantic-clustering strategy; defaults to "entryId" (universal). */
  clusterBy: ClusterBy;
  version: number;
  entryCount: number;
}

export interface DeckEntry {
  /** Immutable card identity: senseIdx===0 ? label : `${label}#${senseIdx}`. */
  entryId: string;
  /** Surface form the player types (NFC-normalized). */
  label: string;
  pos: string;
  /** = the source definition. */
  gloss: string;
  /** "" preserved, never synthesized. */
  example: string;
  senseIdx: number;
  /** Baked seeding/promotion order (lower = earlier). */
  rank: number;
}

export interface RawEntry {
  word: string;
  pos: string;
  definition: string;
  example: string;
}

export interface VocabDeck {
  manifest: DeckManifest;
  entries: DeckEntry[];
}

/** NFC code-point length of a string (so æ/ø/å count as one). */
function nfcLength(s: string): number {
  return [...s.normalize("NFC")].length;
}

/**
 * Difficulty band for seeding: 1-3 chars → band 0, 4-6 → 1, … capped at 6.
 * Multi-token labels (phrases/proverbs) are forced to a trailing band so they
 * never seed the greenhouse early — learn concrete words before phrases (Q9).
 */
export function lengthBand(label: string): number {
  if (label.includes(" ")) return 7;
  const n = nfcLength(label);
  const band = Math.floor((n - 1) / 3);
  return Math.max(0, Math.min(6, band));
}

/**
 * Adapt the raw {word,pos,definition,example}[] into a deck. Pure + deterministic.
 *  1. NFC-normalize each word (so hashing is code-point-stable across devices).
 *  2. Group by NFC label in original order → senseIdx; entryId per the homograph rule.
 *  3. gloss=definition, example preserved ("" kept).
 *  4. rank = position after sorting by [lengthBand, freqTier(=0), originalIndex].
 */
export function normalizeVocabDeck(
  raw: readonly RawEntry[],
  deckId: string,
  opts: { clusterBy?: ClusterBy; glossLang?: string } = {},
): VocabDeck {
  const seenByLabel = new Map<string, number>();
  interface Tmp {
    entry: DeckEntry;
    band: number;
    freqTier: number;
    originalIndex: number;
  }
  const tmp: Tmp[] = raw.map((r, i) => {
    const label = r.word.normalize("NFC");
    const senseIdx = seenByLabel.get(label) ?? 0;
    seenByLabel.set(label, senseIdx + 1);
    const entryId = senseIdx === 0 ? label : `${label}#${String(senseIdx)}`;
    const entry: DeckEntry = {
      entryId,
      label,
      pos: r.pos,
      gloss: r.definition,
      example: r.example,
      senseIdx,
      rank: 0, // filled below
    };
    return { entry, band: lengthBand(label), freqTier: 0, originalIndex: i };
  });

  // Stable three-key sort → assign rank by sorted position.
  const order = tmp
    .map((_t, i) => i)
    .sort((a, b) => {
      const ta = tmp[a] as Tmp;
      const tb = tmp[b] as Tmp;
      return (
        ta.band - tb.band ||
        ta.freqTier - tb.freqTier ||
        ta.originalIndex - tb.originalIndex
      );
    });
  order.forEach((origIdx, rank) => {
    (tmp[origIdx] as Tmp).entry.rank = rank;
  });

  const entries = tmp.map((t) => t.entry);
  return {
    manifest: {
      deckId,
      kind: "vocab",
      label: deckId,
      glossLang: opts.glossLang ?? "en",
      clusterBy: opts.clusterBy ?? "entryId",
      version: 1,
      entryCount: entries.length,
    },
    entries,
  };
}
