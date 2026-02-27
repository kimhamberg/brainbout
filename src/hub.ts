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

const GAME_LABELS: Record<string, string> = {
  rapid: "Chess960 Rapid",
  reaction: "Reaction Grid",
  vocab: "Word Recall",
  math: "Quick Math",
};

const GAME_URLS: Record<string, string> = {
  rapid: "games/rapid.html",
  reaction: "games/reaction.html",
  vocab: "games/vocab.html",
  math: "games/math.html",
};

const GAME_ICONS: Record<string, string> = {
  rapid: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/></svg>`,
  reaction: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>`,
  vocab: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>`,
  math: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/></svg>`,
};

const GAME_ACCENTS: Record<string, string> = {
  rapid: "var(--ctp-blue)",
  reaction: "var(--ctp-peach)",
  vocab: "var(--ctp-green)",
  math: "var(--ctp-yellow)",
};

function formatScore(game: string, score: number): string {
  if (game === "rapid") {
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

function startNewSession(): void {
  session.clear();
  sessionStorage.removeItem("brainbout:current-session");
  sessionJustCompleted = false;
  render(); // eslint-disable-line @typescript-eslint/no-use-before-define -- called from event handler
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

    if (done) {
      html += `<div class="game-card ${cls}" style="${style}">`;
      html += `<span class="game-icon">${GAME_ICONS[game]}</span>`;
      html += `<span class="game-name">${GAME_LABELS[game]}</span>`;
      html += `<span class="game-check">\u2713</span>`;
      html += `</div>`;
    } else {
      html += `<a href="${GAME_URLS[game]}" class="game-card ${cls}" style="${style}">`;
      html += `<span class="game-play">Play</span>`;
      html += `<span class="game-icon">${GAME_ICONS[game]}</span>`;
      html += `<span class="game-name">${GAME_LABELS[game]}</span>`;
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

  // Wire buttons
  const newBtn = hub.querySelector(".new-session-btn");
  if (newBtn) {
    newBtn.addEventListener("click", startNewSession);
  }
}

render();

initTheme();
wireToggle();
