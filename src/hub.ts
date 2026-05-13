import { getMasteredCount } from "./games/lex-srs";
import { defined } from "./shared/assert";
import { GAME_ICONS, mountHubIcon } from "./shared/icons";
import {
  completeSession,
  GAMES,
  type GameId,
  getBest,
  getCheckmates,
  getSessionsToday,
  getStreak,
  getTotalSessions,
  todayString,
} from "./shared/progress";
import { advance, getStage, readiness, retreat } from "./shared/stages";
import { initTheme, wireToggle } from "./shared/theme";

interface GameMeta {
  label: string;
  url: string;
  accent: string;
  tagline: string;
  threshold: number;
  stages: [string, string, string];
}

const GAME_META: Record<GameId, GameMeta> = {
  crown: {
    label: "Crown",
    url: "games/crown.html",
    accent: "var(--ctp-green)",
    tagline: "Outsmart Stockfish",
    threshold: 0.6,
    stages: ["600 Elo", "1200 Elo", "1600 Elo"],
  },
  flux: {
    label: "Flux",
    url: "games/flux.html",
    accent: "var(--ctp-red)",
    tagline: "Think fast, switch faster",
    threshold: 0.8,
    stages: ["Relaxed \u00b7 2s", "Brisk \u00b7 1.5s", "Intense \u00b7 1.2s"],
  },
  lex: {
    label: "Lex",
    url: "games/lex.html",
    accent: "var(--ctp-blue)",
    tagline: "Build your vocabulary",
    threshold: 0.8,
    stages: ["Multiple choice", "Hinted cloze", "Free recall"],
  },
};

function getGameStat(game: GameId): string | null {
  if (game === "crown") {
    const stage = getStage(game);
    const eloByStage = [0, 600, 1200, 1600];
    const elo = eloByStage[stage] ?? 1200;
    const mates = getCheckmates(elo);
    return mates > 0
      ? `${String(mates)} checkmate${mates === 1 ? "" : "s"} at ${String(elo)} Elo`
      : null;
  }
  if (game === "flux") {
    const best = getBest("flux");
    return best === null ? null : `Best: ${String(best)} pts`;
  }
  if (game === "lex") {
    const mastered = getMasteredCount("no");
    return mastered > 0
      ? `${String(mastered)} word${mastered === 1 ? "" : "s"} mastered`
      : null;
  }
  return null;
}

// --- Session state (in-memory, persisted via sessionStorage across page navigations) ---

const session = new Set<GameId>();

// Read completed game from URL params
const params = new URLSearchParams(window.location.search);
const completedParam = params.get("completed");

// Restore previously completed games from sessionStorage
const stored = sessionStorage.getItem("brainbout:current-session");
if (stored !== null) {
  for (const g of JSON.parse(stored) as string[]) {
    if ((GAMES as readonly string[]).includes(g)) {
      session.add(g as GameId);
    }
  }
}

// Add newly completed game
if (
  completedParam !== null &&
  (GAMES as readonly string[]).includes(completedParam)
) {
  session.add(completedParam as GameId);
  sessionStorage.setItem(
    "brainbout:current-session",
    JSON.stringify([...session]),
  );
  // Clean URL
  window.history.replaceState({}, "", window.location.pathname);
}

// Check if session just completed
let sessionJustCompleted = false;
if (session.size === GAMES.length) {
  completeSession();
  sessionJustCompleted = true;
  // Clear the session from sessionStorage so it doesn't re-trigger
  sessionStorage.removeItem("brainbout:current-session");
}

// --- Render ---

function render(): void {
  const hub = document.querySelector("#hub");
  if (!hub) {
    return;
  }

  const today = todayString();
  const streak = getStreak(today);
  const sessionsToday = getSessionsToday();
  let html = "";

  // Header stats badges
  html += `<div class="hub-stats-bar">`;
  if (streak > 0) {
    html += `<span class="streak-badge">${String(streak)}-day streak</span>`;
  }
  if (sessionsToday > 0) {
    html += `<span class="sessions-badge">${String(sessionsToday)} session${sessionsToday === 1 ? "" : "s"} today</span>`;
  }
  html += "</div>";

  // Game list
  html += `<div class="game-list">`;
  for (let i = 0; i < GAMES.length; i++) {
    const game = defined(GAMES[i]);
    const meta = GAME_META[game];
    const done = session.has(game);
    const cls = done ? "done" : "";
    const style = `--i:${String(i)};--accent:${meta.accent}`;

    const stage = getStage(game);
    const ready = readiness(game, meta.threshold);
    const stat = getGameStat(game);

    // Line 1: icon + name (left) + status area (right)
    let line1 = `<span class="game-icon">${GAME_ICONS[game]}</span>`;
    line1 += `<span class="game-name">${meta.label}</span>`;
    let right = "";
    if (done) {
      right = `<span class="done-badge">\u2713</span>`;
    } else {
      right = `<button class="stage-chip readiness-${ready}" data-game="${game}">Stage ${String(stage)}</button>`;
      if (ready === "green") {
        right += `<button class="advance-btn" data-game="${game}">Advance \u25b8</button>`;
      }
      if (stage > 1) {
        right += `<button class="retreat-btn" data-game="${game}">\u25be</button>`;
      }
    }
    line1 += `<div class="game-card-right">${right}</div>`;

    // Line 2: tagline
    const line2 = `<span class="game-tagline">${meta.tagline}</span>`;

    // Line 3: per-game stat (only if data exists)
    const line3 = stat === null ? "" : `<span class="game-stat">${stat}</span>`;

    const inner = `<div class="game-card-top">${line1}</div>${line2}${line3}`;

    if (done) {
      html += `<div class="game-card ${cls}" style="${style}">${inner}</div>`;
    } else {
      html += `<a href="${meta.url}" class="game-card ${cls}" style="${style}"><span class="game-play">Play</span>${inner}</a>`;
    }
  }
  html += "</div>";

  // Action button
  if (sessionJustCompleted) {
    html += `<button class="new-session-btn">New Session</button>`;
  }

  // Footer
  const totalSessions = getTotalSessions();
  if (totalSessions > 0) {
    html += `<div class="hub-footer">${String(totalSessions)} session${totalSessions === 1 ? "" : "s"} completed</div>`;
  }

  hub.innerHTML = html;
}

function dismissPopover(): void {
  document.querySelector(".stage-popover")?.remove();
}

function showStagePopover(chip: HTMLElement, game: GameId): void {
  dismissPopover();

  const stage = getStage(game);
  const meta = GAME_META[game];

  const popover = document.createElement("div");
  popover.className = "stage-popover";
  popover.style.setProperty("--accent", meta.accent);

  let rows = "";
  for (let s = 1; s <= meta.stages.length; s++) {
    const current = s === stage ? " current" : "";
    rows += `<div class="stage-row${current}"><span class="stage-row-num">${String(s)}</span><span>${meta.stages[s - 1]}</span></div>`;
  }
  popover.innerHTML = rows;

  // Position relative to the chip
  const rect = chip.getBoundingClientRect();
  const hub = document.querySelector("#hub");
  if (!hub) {
    return;
  }
  const hubRect = hub.getBoundingClientRect();

  popover.style.top = `${String(rect.bottom - hubRect.top + 4)}px`;
  popover.style.right = `${String(hubRect.right - rect.right)}px`;

  hub.appendChild(popover);

  // Dismiss on outside click (next tick to avoid immediate dismiss)
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

function startNewSession(): void {
  session.clear();
  sessionStorage.removeItem("brainbout:current-session");
  sessionJustCompleted = false;
  render();
}

render();

// --- Page transition & event delegation ---
document.querySelector("#hub")?.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;

  if (target.closest(".new-session-btn") !== null) {
    startNewSession();
    return;
  }

  const stageChip = target.closest<HTMLButtonElement>(".stage-chip");
  if (stageChip !== null) {
    e.preventDefault();
    e.stopPropagation();
    const { game } = stageChip.dataset;
    if (game !== undefined && (GAMES as readonly string[]).includes(game)) {
      showStagePopover(stageChip, game as GameId);
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

  // Tactile press feedback on the card
  card.classList.add("pressed");

  // Brief pause for the press to register, then sweep
  setTimeout(() => {
    document.querySelector(".app")?.classList.add("exiting");

    const overlay = document.createElement("div");
    overlay.className = "page-transition";
    const accent = card.style.getPropertyValue("--accent");
    overlay.style.setProperty("--transition-color", accent);
    document.body.appendChild(overlay);

    overlay.addEventListener("animationend", () => {
      window.location.href = href;
    });
  }, 80);
});

initTheme();
wireToggle();
mountHubIcon();
