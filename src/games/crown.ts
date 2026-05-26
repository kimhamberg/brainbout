import type { BlockHandle } from "../engine/block";
import { BASE } from "../shared/base";
import { mountAppIcon, mountQuitButton } from "../shared/icons";
import { recordSessionScore } from "../shared/progress";
import * as sound from "../shared/sounds";
import { recordResult } from "../shared/stages";
import { initTheme, wireToggle } from "../shared/theme";
import { createCrownBlock } from "./crown-block";
import { type ResultVm, renderResultHtml } from "./crown-rotation";

function getEl(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) {
    throw new Error(`Missing #${id} element`);
  }
  return el;
}
const game = getEl("game");

let handle: BlockHandle | null = null;

function startBlock(): void {
  handle = createCrownBlock({
    container: game,
    onComplete: (outcome) => {
      handle = null;
      recordSessionScore("crown", outcome.points);
      recordResult("crown", outcome.accuracy);
      const meta = outcome.meta as {
        peakStreak: number;
        avgResponseMs: number;
      };
      const vm: ResultVm = {
        finalScore: outcome.points,
        totalTrials: outcome.trials,
        correctTrials: outcome.correct,
        avgResponseMs: meta.avgResponseMs,
        peakStreak: meta.peakStreak,
      };
      game.innerHTML = renderResultHtml(vm);
      sound.playVictory();
    },
  });
}

game.addEventListener("click", (e) => {
  const target = (e.target as HTMLElement).closest<HTMLElement>("button");
  if (!target) return;
  if (target.id === "again-btn") {
    startBlock();
  } else if (target.id === "back-btn") {
    window.location.href = `${BASE}?completed=crown`;
  }
});

mountQuitButton(() => {
  handle?.abort();
});

startBlock();

initTheme();
wireToggle();
mountAppIcon("crown", "var(--ctp-green)");
