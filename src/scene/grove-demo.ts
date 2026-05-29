/**
 * Phase-2 Grove demo (+ deferred polish): a playable typed-recall session over
 * the REAL Norwegian deck (public/dict-no.json, ~20k entries) — falling back to
 * a tiny built-in deck if the fetch fails — with a stage selector showing the
 * MCQ → cloze → typed recall ramp. Mounted via createGroveBlock behind the
 * BlockOutcome seam.
 */

import {
  normalizeVocabDeck,
  type RawEntry,
  type VocabDeck,
} from "../content/deck";
import { loadVocabDeck } from "../content/load-deck";
import type { BlockHandle } from "../engine/block";
import { createGroveBlock } from "./zones/grove-block";

// Offline fallback so the demo still plays if dict-no.json can't be fetched.
const FALLBACK: RawEntry[] = [
  { word: "fugl", pos: "noun", definition: "a bird", example: "" },
  { word: "skog", pos: "noun", definition: "a forest", example: "" },
  { word: "blomst", pos: "noun", definition: "a flower", example: "" },
  { word: "katt", pos: "verb", definition: "to prowl", example: "" },
  { word: "rød", pos: "adj", definition: "red", example: "" },
];

const DEMO_TRIALS = 5; // bounded showcase round

const root = document.getElementById("grove");
if (!root) throw new Error("missing #grove");
const host = root;

let handle: BlockHandle | null = null;

function start(deck: VocabDeck, stage: number): void {
  handle?.abort();
  host.querySelector("#stage")?.replaceChildren();
  const summary = document.getElementById("grove-summary");
  if (summary) summary.textContent = "";
  handle = createGroveBlock({
    container: host,
    deck,
    today: "2026-05-29",
    maxTrials: DEMO_TRIALS,
    stage,
    onComplete: (o) => {
      if (o.endReason !== "aborted" && summary) {
        const residents =
          (o.meta as { residents?: number }).residents ?? o.trials;
        summary.textContent = `Rest well — woke ${String(o.correct)}/${String(residents)} (${o.endReason}) · ${String(o.points)} pts`;
      }
      (window as unknown as { __groveDone?: unknown }).__groveDone = o;
    },
  });
}

async function boot(): Promise<void> {
  let deck: VocabDeck;
  try {
    deck = await loadVocabDeck("no");
  } catch {
    deck = normalizeVocabDeck(FALLBACK, "no");
  }
  for (const s of [1, 2, 3]) {
    document
      .getElementById(`grove-stage-${String(s)}`)
      ?.addEventListener("click", () => {
        start(deck, s);
      });
  }
  start(deck, 1); // default: recognise (MCQ)
}

void boot();
