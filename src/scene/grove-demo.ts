/**
 * Phase-2 Grove demo (+ deferred polish): a playable typed-recall session over
 * a small fixed deck, with a stage selector showing the MCQ → cloze → typed
 * recall ramp. Mounted via createGroveBlock behind the BlockOutcome seam.
 */

import { normalizeVocabDeck, type RawEntry } from "../content/deck";
import type { BlockHandle } from "../engine/block";
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
const host = root;

let handle: BlockHandle | null = null;

function start(stage: number): void {
  handle?.abort();
  host.querySelector("#stage")?.replaceChildren();
  const summary = document.getElementById("grove-summary");
  if (summary) summary.textContent = "";
  handle = createGroveBlock({
    container: host,
    deck,
    today: "2026-05-29",
    maxTrials: RAW.length,
    stage,
    onComplete: (o) => {
      if (o.endReason !== "aborted" && summary) {
        summary.textContent = `Rest well — woke ${String(o.correct)}/${String(o.trials)} (${o.endReason}) · ${String(o.points)} pts`;
      }
      (window as unknown as { __groveDone?: unknown }).__groveDone = o;
    },
  });
}

for (const s of [1, 2, 3]) {
  document
    .getElementById(`grove-stage-${String(s)}`)
    ?.addEventListener("click", () => {
      start(s);
    });
}

start(1); // default: recognise (MCQ)
