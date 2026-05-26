import "@lichess-org/chessground/assets/chessground.base.css";
import "@lichess-org/chessground/assets/chessground.brown.css";
import "@lichess-org/chessground/assets/chessground.cburnett.css";
import "../shared/board-theme.css";

import { Chessground } from "@lichess-org/chessground";
import type { Api } from "@lichess-org/chessground/api";
import type { BlockFactory, BlockHandle, BlockOutcome } from "../engine/block";
import {
  recordReview as fsrsRecordReview,
  getMasteredCountByPrefix,
} from "../shared/fsrs";
import { todayString } from "../shared/progress";
import * as sound from "../shared/sounds";
import { getStage } from "../shared/stages";
import {
  classifyResponse,
  crownClassKey,
  deriveCrownGrade,
  generateTrial,
  piecesToFen,
  type Trial,
  type TrialKind,
  transformLabel,
} from "./crown-rotation";

const CROWN_PREFIX = "crown:";

const DEFAULT_TRIALS = 20;
const TRIAL_BUDGET_MS = 8000;
const FEEDBACK_MS = 600;
const POINTS_BASE = 10;
const SPEED_THRESHOLD_MS = 2500;

interface CrownBlockMeta extends Record<string, unknown> {
  peakStreak: number;
  avgResponseMs: number;
  newlyMastered: number;
}

export const createCrownBlock: BlockFactory = (opts): BlockHandle => {
  const { container, onComplete } = opts;
  const maxTrials = opts.maxTrials ?? DEFAULT_TRIALS;
  const stage = opts.stage ?? getStage("crown");
  const startedAt = Date.now();

  let currentTrial: Trial | null = null;
  let trialStartMs = 0;
  let trialIndex = 0;
  let totalCorrect = 0;
  let totalResponseMs = 0;
  let streak = 0;
  let peakStreak = 0;
  let score = 0;
  let inputLocked = false;
  let ended = false;
  let boardA: Api | null = null;
  let boardB: Api | null = null;
  let trialTimeout: ReturnType<typeof setTimeout> | null = null;
  let advanceTimeout: ReturnType<typeof setTimeout> | null = null;
  const masteredAtStart = getMasteredCountByPrefix(CROWN_PREFIX);

  function getEl(id: string): HTMLElement {
    const el = container.querySelector<HTMLElement>(`#${id}`);
    if (el === null) {
      throw new Error(`Missing #${id} element`);
    }
    return el;
  }

  function clearTimers(): void {
    if (trialTimeout !== null) {
      clearTimeout(trialTimeout);
      trialTimeout = null;
    }
    if (advanceTimeout !== null) {
      clearTimeout(advanceTimeout);
      advanceTimeout = null;
    }
  }

  function renderPlaying(): void {
    if (!currentTrial) return;
    container.innerHTML = `
      <div class="trial-header">
        <div class="trial-count">Trial ${String(trialIndex + 1)} / ${String(maxTrials)}</div>
        <div class="transform-label">${transformLabel(currentTrial.transform)}</div>
      </div>
      <div class="rotate-boards">
        <div class="rotate-board" id="board-a"></div>
        <div class="rotate-divider">vs</div>
        <div class="rotate-board" id="board-b"></div>
      </div>
      <div class="rotate-buttons">
        <button class="rotate-btn" data-press="same">Same</button>
        <button class="rotate-btn" data-press="different">Different</button>
      </div>
      <div class="rotate-feedback" id="feedback"></div>
      <div class="score-display">Score: ${String(score)}</div>
    `;
    const elA = getEl("board-a");
    const elB = getEl("board-b");
    boardA = Chessground(elA, {
      fen: piecesToFen(currentTrial.a),
      viewOnly: true,
      coordinates: false,
      drawable: { enabled: false },
    });
    boardB = Chessground(elB, {
      fen: piecesToFen(currentTrial.b),
      viewOnly: true,
      coordinates: false,
      drawable: { enabled: false },
    });
  }

  function showFeedback(correct: boolean, message: string): void {
    const fb = container.querySelector("#feedback");
    if (!fb) return;
    fb.classList.add(correct ? "correct" : "wrong");
    fb.textContent = message;
  }

  function finish(reason: BlockOutcome["endReason"]): void {
    if (ended) return;
    ended = true;
    clearTimers();
    container.removeEventListener("click", onClick);
    const trials = trialIndex;
    const accuracy = trials === 0 ? 0 : totalCorrect / trials;
    const masteredNow = getMasteredCountByPrefix(CROWN_PREFIX);
    const meta: CrownBlockMeta = {
      peakStreak,
      avgResponseMs: trials === 0 ? 0 : totalResponseMs / trials,
      newlyMastered: Math.max(0, masteredNow - masteredAtStart),
    };
    onComplete({
      kind: "crown",
      endReason: reason,
      trials,
      correct: totalCorrect,
      points: score,
      accuracy,
      durationMs: Date.now() - startedAt,
      meta,
    });
  }

  function nextTrial(): void {
    if (ended) return;
    clearTimers();
    if (trialIndex >= maxTrials) {
      finish("completed");
      return;
    }
    currentTrial = generateTrial(stage, undefined, todayString());
    trialStartMs = Date.now();
    inputLocked = false;
    renderPlaying();
    trialTimeout = setTimeout(() => {
      if (!inputLocked && !ended) {
        handleResponse(currentTrial?.kind === "same" ? "different" : "same");
      }
    }, TRIAL_BUDGET_MS);
  }

  function handleResponse(pressed: TrialKind): void {
    if (inputLocked || ended || !currentTrial) return;
    inputLocked = true;
    if (trialTimeout !== null) {
      clearTimeout(trialTimeout);
      trialTimeout = null;
    }

    const elapsed = Date.now() - trialStartMs;
    const { correct } = classifyResponse(currentTrial, pressed);
    totalResponseMs += elapsed;
    fsrsRecordReview(
      crownClassKey(currentTrial),
      deriveCrownGrade(correct, elapsed),
      todayString(),
    );

    if (correct) {
      totalCorrect++;
      streak++;
      if (streak > peakStreak) peakStreak = streak;
      const fast = elapsed < SPEED_THRESHOLD_MS;
      const points = POINTS_BASE + (fast ? 5 : 0) + Math.min(streak, 10);
      score += points;
      sound.playCorrect();
      showFeedback(true, `+${String(points)}`);
    } else {
      streak = 0;
      sound.playWrong();
      showFeedback(false, `Was ${currentTrial.kind}`);
    }

    const scoreEl = container.querySelector(".score-display");
    if (scoreEl) {
      scoreEl.textContent = `Score: ${String(score)}`;
    }

    trialIndex++;
    advanceTimeout = setTimeout(() => {
      if (!ended) nextTrial();
    }, FEEDBACK_MS);
  }

  function onClick(e: Event): void {
    const target = (e.target as HTMLElement).closest<HTMLElement>(
      "button.rotate-btn",
    );
    if (!target) return;
    const pressed = target.dataset.press as TrialKind | undefined;
    if (pressed === "same" || pressed === "different") {
      handleResponse(pressed);
    }
  }

  container.addEventListener("click", onClick);
  nextTrial();

  // Suppress "unused" — we keep board refs alive to retain Chessground state.
  void boardA;
  void boardB;

  return {
    abort(): void {
      finish("aborted");
    },
  };
};
