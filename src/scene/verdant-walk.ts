/**
 * Phase-5 entry: the Walk — Grove → Bench → Meadow stitched into one continuous
 * session by the scene-router, behind the BlockOutcome seam. Plays over the REAL
 * Norwegian deck (public/dict-no.json), falling back to a tiny built-in deck if
 * the fetch fails.
 */

import {
  normalizeVocabDeck,
  type RawEntry,
  type VocabDeck,
} from "../content/deck";
import { loadVocabDeck } from "../content/load-deck";
import { runWalk } from "./scene-router";

const FALLBACK: RawEntry[] = [
  { word: "fugl", pos: "noun", definition: "a bird", example: "" },
  { word: "skog", pos: "noun", definition: "a forest", example: "" },
  { word: "blomst", pos: "noun", definition: "a flower", example: "" },
];

const host = document.getElementById("walk");
if (!host) throw new Error("missing #walk");
const walkHost = host;

async function boot(): Promise<void> {
  let deck: VocabDeck;
  try {
    deck = await loadVocabDeck("no");
  } catch {
    deck = normalizeVocabDeck(FALLBACK, "no");
  }
  runWalk({
    host: walkHost,
    deck,
    today: "2026-05-29",
    groveTrials: 2,
    benchTrials: 2,
    meadowTrials: 6,
  });
}

void boot();
