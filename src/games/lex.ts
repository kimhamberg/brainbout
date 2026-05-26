import type { BlockHandle } from "../engine/block";
import { BASE } from "../shared/base";
import { mountAppIcon, mountQuitButton } from "../shared/icons";
import { recordSessionScore } from "../shared/progress";
import * as sound from "../shared/sounds";
import { recordResult } from "../shared/stages";
import { initTheme, wireToggle } from "../shared/theme";
import { createLexBlock } from "./lex-block";

function getEl(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`Missing #${id} element`);
  return el;
}
const game = getEl("game");

let handle: BlockHandle | null = null;

function renderResult(outcome: {
  trials: number;
  accuracy: number;
  meta: {
    solved: number;
    totalPlacements: number;
    newlyMastered: number;
    totalScore: number;
  };
}): void {
  const { trials, accuracy, meta } = outcome;
  game.innerHTML = `
    <div class="result">
      <div class="final-score">${String(meta.totalScore)}</div>
      <div class="result-label">pts · ${String(meta.solved)}/${String(meta.totalPlacements)} crossword · ${String(Math.round(accuracy * 100))}% recalled · ${String(trials)} review${trials === 1 ? "" : "s"}</div>
      <div class="peak-streak">+${String(meta.newlyMastered)} new mastered word${meta.newlyMastered === 1 ? "" : "s"}</div>
      <div class="result-actions">
        <button id="again-btn">Play Again</button>
        <button id="back-btn" class="secondary">Back to Hub</button>
      </div>
    </div>
  `;
  sound.playVictory();
}

function startBlock(): void {
  handle = createLexBlock({
    container: game,
    onComplete: (outcome) => {
      handle = null;
      recordSessionScore("lex", outcome.trials);
      recordResult("lex", outcome.accuracy);
      const meta = outcome.meta as {
        solved: number;
        totalPlacements: number;
        newlyMastered: number;
        totalScore: number;
      };
      renderResult({
        trials: outcome.trials,
        accuracy: outcome.accuracy,
        meta,
      });
    },
  });
}

game.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const btn = target.closest<HTMLElement>("button");
  if (!btn) return;
  if (btn.id === "again-btn") {
    startBlock();
  } else if (btn.id === "back-btn") {
    window.location.href = `${BASE}?completed=lex`;
  }
});

mountQuitButton(() => {
  handle?.abort();
});

startBlock();

initTheme();
wireToggle();
mountAppIcon("lex", "var(--ctp-blue)");
