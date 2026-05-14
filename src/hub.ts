import { getMasteredCount } from "./games/lex-srs";
import {
  GAME_META,
  type HubCardState,
  type HubState,
  isKnownGame,
  renderHubHtml,
  renderPopoverHtml,
} from "./hub-render";
import { mountHubIcon } from "./shared/icons";
import {
  completeSession,
  GAMES,
  type GameId,
  getBest,
  getSessionsToday,
  getStreak,
  getTotalSessions,
  todayString,
} from "./shared/progress";
import { advance, getStage, readiness, retreat } from "./shared/stages";
import { initTheme, wireToggle } from "./shared/theme";

function crownStat(): string | null {
  const best = getBest("crown");
  return best === null ? null : `Best: ${String(best)} pts`;
}

function fluxStat(): string | null {
  const best = getBest("flux");
  return best === null ? null : `Best: ${String(best)} pts`;
}

function lexStat(): string | null {
  const mastered = getMasteredCount("no");
  return mastered > 0
    ? `${String(mastered)} word${mastered === 1 ? "" : "s"} mastered`
    : null;
}

function getGameStat(game: GameId): string | null {
  if (game === "crown") return crownStat();
  if (game === "flux") return fluxStat();
  return lexStat();
}

function buildCards(): HubCardState[] {
  const cards: HubCardState[] = [];
  for (const game of GAMES) {
    cards.push({
      game,
      stage: getStage(game),
      ready: readiness(game, GAME_META[game].threshold),
      stat: getGameStat(game),
    });
  }
  return cards;
}

export function init(): void {
  const hubEl = document.querySelector<HTMLElement>("#hub");
  if (!hubEl) {
    initTheme();
    wireToggle();
    mountHubIcon();
    return;
  }
  const hub: HTMLElement = hubEl;

  // One session = one completed game. Bump counters when we land on the
  // hub via ?completed=<game>; URL is cleaned so refresh doesn't double-count.
  const params = new URLSearchParams(window.location.search);
  const completedParam = params.get("completed");
  if (completedParam !== null && isKnownGame(completedParam)) {
    completeSession();
    window.history.replaceState({}, "", window.location.pathname);
  }

  function buildState(): HubState {
    return {
      streak: getStreak(todayString()),
      sessionsToday: getSessionsToday(),
      totalSessions: getTotalSessions(),
      cards: buildCards(),
    };
  }

  function render(): void {
    hub.innerHTML = renderHubHtml(buildState());
  }

  function dismissPopover(): void {
    document.querySelector(".stage-popover")?.remove();
  }

  function showStagePopover(chip: HTMLElement, game: GameId): void {
    dismissPopover();
    const meta = GAME_META[game];
    const popover = document.createElement("div");
    popover.className = "stage-popover";
    popover.style.setProperty("--accent", meta.accent);
    popover.innerHTML = renderPopoverHtml(meta, getStage(game));

    const rect = chip.getBoundingClientRect();
    const hubRect = hub.getBoundingClientRect();
    popover.style.top = `${String(rect.bottom - hubRect.top + 4)}px`;
    popover.style.right = `${String(hubRect.right - rect.right)}px`;
    hub.appendChild(popover);

    requestAnimationFrame(() => {
      function onClickOutside(ev: MouseEvent): void {
        if (!popover.contains(ev.target as Node)) {
          dismissPopover();
          document.removeEventListener("click", onClickOutside, true);
        }
      }
      document.addEventListener("click", onClickOutside, true);
    });
  }

  render();

  hub.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;

    const stageChip = target.closest<HTMLButtonElement>(".stage-chip");
    if (stageChip !== null) {
      e.preventDefault();
      e.stopPropagation();
      const { game } = stageChip.dataset;
      if (game !== undefined && isKnownGame(game)) {
        showStagePopover(stageChip, game);
      }
      return;
    }

    const advBtn = target.closest<HTMLButtonElement>(".advance-btn");
    if (advBtn !== null) {
      e.preventDefault();
      e.stopPropagation();
      const { game } = advBtn.dataset;
      if (game !== undefined && game !== "") {
        advance(game);
        render();
      }
      return;
    }

    const retBtn = target.closest<HTMLButtonElement>(".retreat-btn");
    if (retBtn !== null) {
      e.preventDefault();
      e.stopPropagation();
      const { game } = retBtn.dataset;
      if (game !== undefined && game !== "") {
        retreat(game);
        render();
      }
      return;
    }

    const card = target.closest<HTMLAnchorElement>("a.game-card");
    if (!card) {
      return;
    }

    e.preventDefault();
    const href = card.getAttribute("href");
    if (href === null || href === "") {
      return;
    }

    card.classList.add("pressed");

    setTimeout(() => {
      document.querySelector(".app")?.classList.add("exiting");

      const overlay = document.createElement("div");
      overlay.className = "page-transition";
      const accent = card.style.getPropertyValue("--accent");
      overlay.style.setProperty("--transition-color", accent);
      document.body.appendChild(overlay);

      let navigated = false;
      const go = (): void => {
        if (navigated) return;
        navigated = true;
        window.location.href = href;
      };
      overlay.addEventListener("animationend", go);
      // Fallback: navigate even if animationend never fires (reduced motion, hidden tab)
      setTimeout(go, 600);
    }, 80);
  });

  initTheme();
  wireToggle();
  mountHubIcon();
}
