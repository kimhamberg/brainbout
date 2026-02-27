import {
  GAMES,
  todayString,
  getStreak,
  getDailyScore,
  nextGame,
} from "./shared/progress";

const GAME_LABELS: Record<string, string> = {
  puzzles: "Chess960 Puzzles",
  nback: "Dual N-back",
  stroop: "Stroop",
  math: "Quick Math",
};

const GAME_URLS: Record<string, string> = {
  puzzles: "games/puzzles.html",
  nback: "games/nback.html",
  stroop: "games/stroop.html",
  math: "games/math.html",
};

function render(): void {
  const hub = document.getElementById("hub");
  if (!hub) return;

  const today = todayString();
  const streak = getStreak(today);
  const next = nextGame(today);

  let html = "";

  html += `<div id="streak"><strong>${String(streak)}-day streak</strong></div>`;
  html += `<h2>Today's Workout</h2>`;
  html += `<div class="game-list">`;

  for (const game of GAMES) {
    const score = getDailyScore(game, today);
    const done = score !== null;
    const current = game === next;
    const cls = done ? "done" : current ? "current" : "";

    html += `<div class="game-card ${cls}">`;
    html += `<span class="game-name">${GAME_LABELS[game]}</span>`;
    if (done) {
      html += `<span class="game-score">Score: ${String(score)} <span class="game-check">✓</span></span>`;
    }
    html += `</div>`;
  }

  html += `</div>`;

  if (next !== null) {
    html += `<button id="start-btn">${streak === 0 && next === GAMES[0] ? "Start" : "Next"}</button>`;
  } else {
    html += `<div class="summary">All done for today!</div>`;
  }

  hub.innerHTML = html;

  const btn = document.getElementById("start-btn");
  if (btn && next !== null) {
    btn.addEventListener("click", () => {
      window.location.href = GAME_URLS[next];
    });
  }
}

render();
