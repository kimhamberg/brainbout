/**
 * Scene router (design docs/design/03 §1, Phase 5). Stitches the zone blocks
 * into ONE continuous Walk — the cozy equivalent of cycle.ts/daily.ts, but the
 * zones read as one world: a single shared #stage, one control group shown at a
 * time, and a brief "walk" between zones that enforces ONE-CONSTRUCT-PER-MOMENT.
 * Each zone runs behind the BlockOutcome seam; its outcome is threaded into the
 * shared progress (best/score) + stages (curriculum) recorders, exactly as the
 * existing cycle/daily orchestrators do.
 */

import type { VocabDeck } from "../content/deck";
import type { BlockOutcome } from "../engine/block";
import { recordSessionScore, todayString } from "../shared/progress";
import { recordResult } from "../shared/stages";
import { createBenchBlock } from "./zones/bench-block";
import { createGroveBlock } from "./zones/grove-block";
import { createMeadowBlock } from "./zones/meadow-block";

type ZoneId = "grove" | "bench" | "meadow";

interface WalkStep {
  zone: ZoneId;
  // matches the cycle attentional design: recall while fresh, rotation, then
  // the rapid flux closer.
}

// Lex → Crown → Flux (Grove → Bench → Meadow), the same order as cycle.ts.
const WALK: readonly WalkStep[] = [
  { zone: "grove" },
  { zone: "bench" },
  { zone: "meadow" },
];

const NEXT_LABEL: Record<ZoneId, string> = {
  grove: "Wandering to the propagation bench…",
  bench: "Wandering to the meadow…",
  meadow: "",
};

const TRANSITION_MS = 800;

export interface WalkOptions {
  host: HTMLElement;
  deck: VocabDeck;
  today?: string;
  groveTrials?: number;
  benchTrials?: number;
  meadowTrials?: number;
  onDone?: (outcomes: BlockOutcome[]) => void;
}

interface WalkState {
  step: number;
  zone: ZoneId;
  done: boolean;
}

function pick(host: HTMLElement, id: string): HTMLElement {
  const e = host.querySelector<HTMLElement>(`#${id}`);
  if (!e) throw new Error(`Walk: missing #${id}`);
  return e;
}

export function runWalk(opts: WalkOptions): void {
  const { host, deck } = opts;
  const today = opts.today ?? todayString();
  const stageEl = pick(host, "stage");
  const transitionEl = pick(host, "walk-transition");
  const summaryEl = pick(host, "walk-summary");
  const groups: Record<ZoneId, HTMLElement> = {
    grove: pick(host, "grove-controls"),
    bench: pick(host, "bench-controls"),
    meadow: pick(host, "meadow-controls"),
  };

  const outcomes: BlockOutcome[] = [];
  const state: WalkState = { step: 0, zone: "grove", done: false };
  (window as unknown as { __walk?: WalkState }).__walk = state;
  let idx = 0;

  function showGroup(zone: ZoneId): void {
    for (const z of ["grove", "bench", "meadow"] as const) {
      groups[z].style.display = z === zone ? "" : "none";
    }
  }

  function finishWalk(): void {
    state.done = true;
    showGroup("meadow");
    for (const z of ["grove", "bench", "meadow"] as const) {
      groups[z].style.display = "none";
    }
    const totalPoints = outcomes.reduce((n, o) => n + o.points, 0);
    summaryEl.textContent = `The hollow's tended — ${String(totalPoints)} pts across ${String(outcomes.length)} groves`;
    (window as unknown as { __walkDone?: BlockOutcome[] }).__walkDone =
      outcomes;
    opts.onDone?.(outcomes);
  }

  function mount(): void {
    const step = WALK[idx];
    if (!step) {
      finishWalk();
      return;
    }
    state.step = idx;
    state.zone = step.zone;
    stageEl.replaceChildren(); // fresh stage per zone (prev ticker already stopped)
    showGroup(step.zone);

    const onComplete = (o: BlockOutcome): void => {
      outcomes.push(o);
      recordSessionScore(o.kind, o.points); // best / score
      recordResult(o.kind, o.accuracy); // stage curriculum history
      idx++;
      const label = NEXT_LABEL[step.zone];
      if (idx >= WALK.length || label === "") {
        finishWalk();
        return;
      }
      transitionEl.textContent = label; // the walk = one-construct-per-moment buffer
      transitionEl.style.display = "";
      setTimeout(() => {
        transitionEl.style.display = "none";
        mount();
      }, TRANSITION_MS);
    };

    if (step.zone === "grove") {
      createGroveBlock({
        container: host,
        deck,
        today,
        maxTrials: opts.groveTrials ?? 3,
        onComplete,
      });
    } else if (step.zone === "bench") {
      createBenchBlock({
        container: host,
        today,
        maxTrials: opts.benchTrials ?? 3,
        seed: "walk-bench",
        onComplete,
      });
    } else {
      createMeadowBlock({
        container: host,
        today,
        maxTrials: opts.meadowTrials ?? 8,
        onComplete,
      });
    }
  }

  transitionEl.style.display = "none";
  summaryEl.textContent = "";
  mount();
}
