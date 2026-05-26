import type { BlockHandle } from "../engine/block";
import { BASE } from "../shared/base";
import { mountAppIcon, mountQuitButton } from "../shared/icons";
import { getBest, recordSessionScore } from "../shared/progress";
import * as sound from "../shared/sounds";
import { recordResult } from "../shared/stages";
import { initTheme, wireToggle } from "../shared/theme";
import { createFluxBlock } from "./flux-block";
import { computeResultVm, renderResultHtml } from "./flux-render";

function getEl(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) {
    throw new Error(`Missing #${id} element`);
  }
  return el;
}
const game = getEl("game");

let handle: BlockHandle | null = null;

function animateCountUp(el: HTMLElement, target: number): void {
  const duration = 1500;
  const start = performance.now();
  function frame(now: number): void {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - (1 - progress) ** 3;
    el.textContent = String(Math.round(target * eased));
    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      const btn = game.querySelector("#again-btn");
      if (btn) {
        btn.classList.add("pulse");
      }
    }
  }
  requestAnimationFrame(frame);
}

function startBlock(): void {
  const previousBest = getBest("flux");
  handle = createFluxBlock({
    container: game,
    onComplete: (outcome) => {
      handle = null;
      recordSessionScore("flux", outcome.points);
      recordResult("flux", outcome.accuracy);

      const meta = outcome.meta as {
        peakStreak: number;
        peakStreakLabel: string;
        peakStreakMult: number;
      };
      const vm = computeResultVm({
        finalScore: outcome.points,
        previousBest,
        subtitle: `points · survived ${String(outcome.trials)} trial${outcome.trials === 1 ? "" : "s"}`,
        peakStreak: meta.peakStreak,
        peakStreakLabel: meta.peakStreakLabel,
        peakStreakMult: meta.peakStreakMult,
        correctTrials: outcome.correct,
        totalTrials: outcome.trials,
      });

      game.innerHTML = renderResultHtml(vm);

      const scoreEl = game.querySelector<HTMLElement>(".final-score");
      if (scoreEl) {
        animateCountUp(scoreEl, outcome.points);
      }
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
    window.location.href = `${BASE}?completed=flux`;
  }
});

mountQuitButton(() => {
  handle?.abort();
});

startBlock();

initTheme();
wireToggle();
mountAppIcon("flux", "var(--ctp-red)");
