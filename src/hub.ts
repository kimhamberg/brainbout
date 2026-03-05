import { initTheme, wireToggle } from "./shared/theme";
import {
  GAMES,
  type GameId,
  todayString,
  getStreak,
  getSessionsToday,
  getTotalSessions,
  getBest,
  getTodayBest,
  completeSession,
} from "./shared/progress";
import { getStage, readiness, advance, retreat } from "./shared/stages";

const GAME_LABELS: Record<string, string> = {
  crown: "Crown",
  flux: "Flux",
  cipher: "Cipher",
};

const GAME_URLS: Record<string, string> = {
  crown: "games/crown.html",
  flux: "games/flux.html",
  cipher: "games/cipher.html",
};

const GAME_ICONS: Record<string, string> = {
  crown: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/></svg>`,
  flux: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M3.7 7.8 12 12l8.3-4.2M3.7 16.2 12 12l8.3 4.2"/></svg>`,
  cipher: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/></svg>`,
};

const GAME_ACCENTS: Record<string, string> = {
  crown: "var(--ctp-blue)",
  flux: "var(--ctp-mauve)",
  cipher: "var(--ctp-green)",
};

const READINESS_THRESHOLDS: Record<string, number> = {
  crown: 0.6,
  flux: 0.8,
  cipher: 0.8,
};

function formatScore(game: string, score: number): string {
  if (game === "crown") {
    if (score === 1) return "Won";
    if (score === 0.5) return "Draw";
    return "Lost";
  }
  return String(score);
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

    if (done) {
      html += `<div class="game-card ${cls}" style="${style}">`;
      html += `<span class="game-icon">${GAME_ICONS[game]}</span>`;
      html += `<span class="game-name">${GAME_LABELS[game]}</span>`;
      html += `<span class="game-stage">\u00b7 Stage ${String(stage)}</span>`;
      html += `<span class="readiness-dot readiness-${ready}"></span>`;
      html += `<span class="game-check">\u2713</span>`;
      html += `</div>`;
    } else {
      html += `<a href="${GAME_URLS[game]}" class="game-card ${cls}" style="${style}">`;
      html += `<span class="game-play">Play</span>`;
      html += `<span class="game-icon">${GAME_ICONS[game]}</span>`;
      html += `<span class="game-name">${GAME_LABELS[game]}</span>`;
      html += `<span class="game-stage">\u00b7 Stage ${String(stage)}</span>`;
      html += `<span class="readiness-dot readiness-${ready}"></span>`;
      if (ready === "green")
        html += `<button class="advance-btn" data-game="${game}">Advance \u25b8</button>`;
      if (stage > 1)
        html += `<button class="retreat-btn" data-game="${game}">\u25be</button>`;
      html += `</a>`;
    }
  }
  html += `</div>`;

  // Session completion summary
  if (sessionJustCompleted) {
    html += `<div class="session-summary">`;
    html += `<h2>Session Complete!</h2>`;
    html += `<div class="session-scores">`;
    for (const game of GAMES) {
      const best = getTodayBest(game);
      html += `<div class="stat-row"><span>${GAME_LABELS[game]}</span><span class="stat-value">${best !== null ? formatScore(game, best) : "\u2014"}</span></div>`;
    }
    html += `</div></div>`;
  }

  // Action button
  if (sessionJustCompleted) {
    html += `<button class="new-session-btn">New Session</button>`;
  }

  // Collapsible stats
  html += `<details class="stats-panel">`;
  html += `<summary>Stats</summary>`;
  html += `<div class="stats-content">`;

  html += `<h3>All-time best</h3>`;
  html += `<div class="stats-grid">`;
  for (const game of GAMES) {
    const best = getBest(game);
    html += `<div class="stat-row"><span>${GAME_LABELS[game]}</span><span class="stat-value">${best !== null ? formatScore(game, best) : "\u2014"}</span></div>`;
  }
  html += `</div>`;

  const hasTodayBests = GAMES.some((g) => getTodayBest(g) !== null);
  if (hasTodayBests) {
    html += `<h3>Today's best</h3>`;
    html += `<div class="stats-grid">`;
    for (const game of GAMES) {
      const todayBest = getTodayBest(game);
      html += `<div class="stat-row"><span>${GAME_LABELS[game]}</span><span class="stat-value">${todayBest !== null ? formatScore(game, todayBest) : "\u2014"}</span></div>`;
    }
    html += `</div>`;
  }

  html += `<div class="stat-row stat-total"><span>Total sessions</span><span class="stat-value">${String(getTotalSessions())}</span></div>`;

  html += `</div></details>`;

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
