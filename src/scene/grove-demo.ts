/**
 * Phase-2 Grove demo entry: a playable typed-recall session over a small fixed
 * deck, mounted via createGroveBlock behind the BlockOutcome seam.
 */

import { normalizeVocabDeck, type RawEntry } from "../content/deck";
import { createGroveBlock } from "./zones/grove-block";

const RAW: RawEntry[] = [
  { word: "fugl", pos: "noun", definition: "a bird", example: "" },
  { word: "skog", pos: "noun", definition: "a forest", example: "" },
  { word: "blomst", pos: "noun", definition: "a flower", example: "" },
  { word: "katt", pos: "verb", definition: "to prowl", example: "" },
  { word: "rød", pos: "adj", definition: "red", example: "" },
];

const deck = normalizeVocabDeck(RAW, "no");
const root = document.getElementById("grove");
if (!root) throw new Error("missing #grove");

createGroveBlock({
  container: root,
  deck,
  today: "2026-05-29",
  maxTrials: RAW.length,
  onComplete: (o) => {
    const s = document.getElementById("grove-summary");
    if (s) {
      s.textContent = `Rest well — woke ${String(o.correct)}/${String(o.trials)} · ${String(o.points)} pts`;
    }
    (window as unknown as { __groveDone?: unknown }).__groveDone = o;
  },
});
