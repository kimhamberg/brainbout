import { initTheme, wireToggle } from "./shared/theme";
import {
  GAMES,
  type GameId,
  todayString,
  getStreak,
  getSessionsToday,
  getTotalSessions,
  getBest,
  getCheckmates,
  completeSession,
} from "./shared/progress";
import { getStage, readiness, advance, retreat } from "./shared/stages";
import { getMasteredCount } from "./games/lex-srs";

const GAME_LABELS: Record<string, string> = {
  crown: "Crown",
  flux: "Flux",
  lex: "Lex",
};

const GAME_URLS: Record<string, string> = {
  crown: "games/crown.html",
  flux: "games/flux.html",
  lex: "games/lex.html",
};

const GAME_ICONS: Record<string, string> = {
  crown: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/></svg>`,
  flux: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M3.7 7.8 12 12l8.3-4.2M3.7 16.2 12 12l8.3 4.2"/></svg>`,
  lex: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>`,
};

const GAME_ACCENTS: Record<string, string> = {
  crown: "var(--ctp-blue)",
  flux: "var(--ctp-mauve)",
  lex: "var(--ctp-green)",
};

const GAME_TAGLINES: Record<string, string> = {
  crown: "Outsmart Stockfish",
  flux: "Think fast, switch faster",
  lex: "Build your vocabulary",
};

const READINESS_THRESHOLDS: Record<string, number> = {
  crown: 0.6,
  flux: 0.8,
  lex: 0.8,
};

function getGameStat(game: string): string | null {
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
    return best !== null ? `Best: ${String(best)} pts` : null;
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
    if ((GAMES as readonly string[]).includes(g)) session.add(g as GameId);
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
  const hub = document.getElementById("hub");
  if (!hub) return;

  const today = todayString();
  const streak = getStreak(today);
  const sessionsToday = getSessionsToday();
  let html = "";

  // Header stats badges
  html += `<div class="hub-stats-bar">`;
  if (streak > 0)
    html += `<span class="streak-badge">${String(streak)}-day streak</span>`;
  if (sessionsToday > 0)
    html += `<span class="sessions-badge">${String(sessionsToday)} session${sessionsToday === 1 ? "" : "s"} today</span>`;
  html += `</div>`;

  // Game list
  html += `<div class="game-list">`;
  for (let i = 0; i < GAMES.length; i++) {
    const game = GAMES[i];
    const done = session.has(game);
    const cls = done ? "done" : "";
    const style = `--i:${String(i)};--accent:${GAME_ACCENTS[game]}`;

    const stage = getStage(game);
    const threshold = READINESS_THRESHOLDS[game] ?? 0.8;
    const ready = readiness(game, threshold);
    const tagline = GAME_TAGLINES[game];
    const stat = getGameStat(game);

    // Line 1: icon + name (left) + status area (right)
    let line1 = `<span class="game-icon">${GAME_ICONS[game]}</span>`;
    line1 += `<span class="game-name">${GAME_LABELS[game]}</span>`;
    let right = "";
    if (done) {
      right = `<span class="done-badge">\u2713</span>`;
    } else {
      right = `<span class="stage-chip readiness-${ready}">Stage ${String(stage)}</span>`;
      if (ready === "green")
        right += `<button class="advance-btn" data-game="${game}">Advance \u25b8</button>`;
      if (stage > 1)
        right += `<button class="retreat-btn" data-game="${game}">\u25be</button>`;
    }
    line1 += `<div class="game-card-right">${right}</div>`;

    // Line 2: tagline
    const line2 = `<span class="game-tagline">${tagline}</span>`;

    // Line 3: per-game stat (only if data exists)
    const line3 = stat !== null ? `<span class="game-stat">${stat}</span>` : "";

    const inner = `<div class="game-card-top">${line1}</div>${line2}${line3}`;

    if (done) {
      html += `<div class="game-card ${cls}" style="${style}">${inner}</div>`;
    } else {
      html += `<a href="${GAME_URLS[game]}" class="game-card ${cls}" style="${style}">${inner}</a>`;
    }
  }
  html += `</div>`;

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

function startNewSession(): void {
  session.clear();
  sessionStorage.removeItem("brainbout:current-session");
  sessionJustCompleted = false;
  render();
}

render();

// --- Page transition & event delegation ---
document.getElementById("hub")?.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;

  if (target.closest(".new-session-btn") !== null) {
    startNewSession();
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
  if (!card) return;

  e.preventDefault();
  const href = card.getAttribute("href");
  if (href === null || href === "") return;

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
