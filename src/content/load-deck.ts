/**
 * Runtime deck loader: fetch the committed `dict-<id>.json` (a RawEntry[]) and
 * normalise it into a VocabDeck. Kept separate from deck.ts so the latter stays
 * a pure, IO-free module. `fetchImpl` is injectable for tests.
 */

import { BASE } from "../shared/base";
import { normalizeVocabDeck, type RawEntry, type VocabDeck } from "./deck";

export async function loadVocabDeck(
  deckId: string,
  opts: { base?: string; fetchImpl?: typeof fetch } = {},
): Promise<VocabDeck> {
  const base = opts.base ?? BASE;
  const doFetch = opts.fetchImpl ?? fetch;
  const resp = await doFetch(`${base}dict-${deckId}.json`);
  if (!resp.ok) {
    throw new Error(`deck "${deckId}" failed to load: ${String(resp.status)}`);
  }
  const raw = (await resp.json()) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error(`deck "${deckId}" is not a RawEntry[]`);
  }
  return normalizeVocabDeck(raw as RawEntry[], deckId);
}
