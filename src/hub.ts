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
  for (const game of GAMES) {
    const done = session.has(game);
    const cls = done ? "done" : "";

    if (done) {
      html += `<div class="game-card ${cls}">`;
      html += `<span class="game-name">${GAME_LABELS[game]}</span>`;
      html += `<span class="game-check">\u2713</span>`;
      html += `</div>`;
    } else {
      html += `<a href="${GAME_URLS[game]}" class="game-card ${cls}">`;
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
