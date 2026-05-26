import type { BlockFactory, BlockHandle, BlockOutcome } from "../engine/block";
import {
  recordReview as fsrsRecordReview,
  getMasteredCountByPrefix,
} from "../shared/fsrs";
import { todayString } from "../shared/progress";
import * as sound from "../shared/sounds";
import { getStage } from "../shared/stages";
import {
  type ButtonSide,
  bpmToMs,
  createFluxState,
  deriveFluxGrade,
  evaluateResponse,
  type FluxState,
  fluxClassKey,
  generateTrial,
  getMultiplier,
  getRuleLabels,
  getStreakLabel,
  type Rule,
  type Trial,
  updateAdaptation,
} from "./flux-engine";
import {
  ringClass as computeRingClass,
  RING_CIRCUMFERENCE,
  RING_RADIUS,
  ringOffset,
  shapeHtml,
  streakBadgeHtml,
} from "./flux-render";

const FLUX_PREFIX = "flux:";

interface FluxBlockMeta extends Record<string, unknown> {
  peakStreak: number;
  peakStreakLabel: string;
  peakStreakMult: number;
  newlyMastered: number;
}

export const createFluxBlock: BlockFactory = (opts): BlockHandle => {
  const { container, onComplete } = opts;
  const stage = opts.stage ?? getStage("flux");
  const startedAt = Date.now();

  const state: FluxState = createFluxState(stage);
  let currentTrial: Trial | null = null;
  let trialRule: Rule = "color";
  let trialIsNot = false;
  let ruleJustSwitched = false;
  let trialTimeout: ReturnType<typeof setTimeout> | null = null;
  let advanceTimeout: ReturnType<typeof setTimeout> | null = null;
  let inputLocked = false;
  let ended = false;
  let totalTrials = 0;
  let correctTrials = 0;
  let responded = false;
  let trialStartMs = 0;
  const masteredAtStart = getMasteredCountByPrefix(FLUX_PREFIX);

  function streakHtml(): string {
    return streakBadgeHtml(
      state.streak,
      getMultiplier(state.streak),
      getStreakLabel(state.streak),
    );
  }

  function renderPlaying(): void {
    if (!currentTrial) return;

    const [leftLabel, rightLabel] = getRuleLabels(trialRule, trialIsNot);
    const ruleText = trialIsNot
      ? `NOT ${trialRule.toUpperCase()}`
      : trialRule.toUpperCase();
    const ruleCueClass = trialIsNot ? "rule-cue not-active" : "rule-cue";

    const offset = ringOffset(state.hp, state.maxHp);
    const ringCls = computeRingClass(
      state.hp,
      state.hp <= 1 ? "climax" : "flow",
    );

    const switchHtml = ruleJustSwitched
      ? `<div class="switch-ring"></div>`
      : "";

    container.innerHTML = `
      <div class="${ringCls}">
        <svg width="96" height="96" viewBox="0 0 96 96">
          <circle class="track" cx="48" cy="48" r="${String(RING_RADIUS)}" />
          <circle class="progress" cx="48" cy="48" r="${String(RING_RADIUS)}"
            stroke-dasharray="${String(RING_CIRCUMFERENCE)}"
            stroke-dashoffset="${String(offset)}" />
        </svg>
        <div class="timer-text">${String(state.hp)}♥</div>
      </div>
      <div class="${ruleCueClass}">${ruleText}</div>
      ${switchHtml}
      <div class="shape-stage">
        ${shapeHtml(currentTrial)}
      </div>
      ${streakHtml()}
      <div class="flux-buttons">
        <button class="flux-btn" data-side="left">
          <span class="btn-label">${leftLabel}</span>
        </button>
        <button class="flux-btn" data-side="right">
          <span class="btn-label">${rightLabel}</span>
        </button>
      </div>
      <div class="flux-feedback" id="feedback"></div>
      <div class="score-display">Score: ${String(state.score)}</div>
    `;
  }

  function spawnParticles(color: string): void {
    const particleContainer = document.createElement("div");
    particleContainer.className = "particles";
    for (let i = 0; i < 5; i++) {
      const p = document.createElement("div");
      p.className = "particle";
      p.style.background = color;
      p.style.left = "50%";
      p.style.top = "50%";
      particleContainer.appendChild(p);
    }
    const shape = container.querySelector(".shape");
    if (shape) {
      shape.parentElement?.insertBefore(particleContainer, shape.nextSibling);
      setTimeout(() => {
        particleContainer.remove();
      }, 500);
    }
  }

  function showFeedback(
    correct: boolean,
    message: string,
    golden = false,
  ): void {
    const feedback = container.querySelector("#feedback");
    if (feedback) {
      if (correct && golden) {
        feedback.classList.add("correct-golden");
      } else {
        feedback.classList.add(correct ? "correct" : "wrong");
      }
      feedback.textContent = message;
    }
  }

  function applyJuice(
    correct: boolean,
    side: ButtonSide | null,
    isNoGo: boolean,
  ): void {
    if (isNoGo) {
      if (correct) {
        container.classList.add("juice-nogo-correct");
      } else {
        container.classList.add("juice-nogo-fail");
      }
    } else if (correct && side) {
      container.classList.add(
        side === "left" ? "juice-correct-left" : "juice-correct-right",
      );
      spawnParticles("var(--ctp-green)");
    } else {
      container.classList.add("juice-wrong");
      container.classList.add("dim-flash");
    }

    setTimeout(() => {
      container.classList.remove(
        "juice-correct-left",
        "juice-correct-right",
        "juice-wrong",
        "juice-nogo-correct",
        "juice-nogo-fail",
        "dim-flash",
      );
    }, 500);
  }

  function updateHpRing(): void {
    const progress = container.querySelector<SVGCircleElement>(
      ".timer-ring .progress",
    );
    const text = container.querySelector(".timer-text");
    const ring = container.querySelector(".timer-ring");

    if (progress) {
      const fraction = state.hp / state.maxHp;
      const off = RING_CIRCUMFERENCE * (1 - fraction);
      progress.setAttribute("stroke-dashoffset", String(off));
    }

    if (text) {
      text.textContent = `${String(state.hp)}♥`;
    }

    if (ring) {
      ring.classList.toggle("low", state.hp <= 2);
      ring.classList.toggle("climax", state.hp <= 1);
    }
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

  function finish(reason: BlockOutcome["endReason"]): void {
    if (ended) return;
    ended = true;
    clearTimers();
    container.removeEventListener("click", onClick);
    document.removeEventListener("keydown", onKeydown);
    sound.stopBgm();
    const accuracy = totalTrials > 0 ? correctTrials / totalTrials : 0;
    const masteredNow = getMasteredCountByPrefix(FLUX_PREFIX);
    const meta: FluxBlockMeta = {
      peakStreak: state.peakStreak,
      peakStreakLabel: getStreakLabel(state.peakStreak),
      peakStreakMult: getMultiplier(state.peakStreak),
      newlyMastered: Math.max(0, masteredNow - masteredAtStart),
    };
    onComplete({
      kind: "flux",
      endReason: reason,
      trials: totalTrials,
      correct: correctTrials,
      points: state.score,
      accuracy,
      durationMs: Date.now() - startedAt,
      meta,
    });
  }

  function handleResponse(pressed: ButtonSide | null): void {
    if (ended || inputLocked || !currentTrial) {
      return;
    }
    inputLocked = true;
    responded = true;

    if (trialTimeout !== null) {
      clearTimeout(trialTimeout);
      trialTimeout = null;
    }

    const elapsed = Date.now() - trialStartMs;
    const result = evaluateResponse(
      currentTrial,
      trialRule,
      trialIsNot,
      state.streak,
      pressed,
    );
    state.score += result.totalPoints;
    totalTrials++;
    fsrsRecordReview(
      fluxClassKey(trialRule, trialIsNot),
      deriveFluxGrade(result.correct, elapsed, bpmToMs(state.bpm)),
      todayString(),
    );

    if (result.correct) {
      correctTrials++;
      if (result.isGolden) {
        sound.playGoldenChime();
      } else if (currentTrial.isNoGo) {
        sound.playNogoDissolve();
      } else {
        sound.playCorrectBurst();
      }
      showFeedback(
        true,
        result.feedback || `+${String(result.totalPoints)}`,
        result.isGolden === true,
      );
      updateAdaptation(state, true);
      if (state.streak >= 3) {
        sound.playStreakUp();
      }
    } else {
      if (result.noGoFail) {
        sound.playNogoFail();
      } else {
        sound.playWrongCrack();
      }
      showFeedback(false, result.feedback);
      updateAdaptation(state, false);
      state.hp = Math.max(0, state.hp - 1);
    }

    applyJuice(result.correct, pressed, currentTrial.isNoGo);

    const scoreEl = container.querySelector(".score-display");
    if (scoreEl) {
      scoreEl.textContent = `Score: ${String(state.score)}`;
    }
    updateHpRing();

    if (state.hp <= 0) {
      finish("failed");
      return;
    }

    if (opts.maxTrials !== undefined && totalTrials >= opts.maxTrials) {
      finish("completed");
      return;
    }

    const feedbackMs = result.correct ? 250 : 450;
    advanceTimeout = setTimeout(() => {
      if (!ended) {
        nextTrial();
      }
    }, feedbackMs);
  }

  function nextTrial(): void {
    if (ended) {
      return;
    }

    container.classList.remove(
      "juice-correct-left",
      "juice-correct-right",
      "juice-wrong",
      "juice-nogo-correct",
      "juice-nogo-fail",
      "dim-flash",
    );

    if (advanceTimeout !== null) {
      clearTimeout(advanceTimeout);
      advanceTimeout = null;
    }

    const prevRule = state.rule;
    currentTrial = generateTrial(state, todayString());
    trialRule = state.rule;
    trialIsNot = state.isNot;
    ruleJustSwitched = prevRule !== state.rule;
    inputLocked = false;
    responded = false;
    trialStartMs = Date.now();

    if (ruleJustSwitched) {
      sound.playSwitchWhoosh();
    }

    renderPlaying();

    if (trialTimeout !== null) {
      clearTimeout(trialTimeout);
    }
    trialTimeout = setTimeout(() => {
      if (!(responded || ended)) {
        handleResponse(null);
      }
    }, bpmToMs(state.bpm));
  }

  function onClick(e: Event): void {
    const target = (e.target as HTMLElement).closest<HTMLElement>(
      "button.flux-btn",
    );
    if (!target) return;
    const side = target.dataset.side as ButtonSide | undefined;
    if (side) {
      handleResponse(side);
    }
  }

  function onKeydown(e: KeyboardEvent): void {
    if (ended || inputLocked) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      handleResponse("left");
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      handleResponse("right");
    }
  }

  container.addEventListener("click", onClick);
  document.addEventListener("keydown", onKeydown);
  sound.startBgm();
  nextTrial();

  return {
    abort(): void {
      finish("aborted");
    },
  };
};
