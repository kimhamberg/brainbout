import {
  GAMES,
  todayString,
  getStreak,
  getDailyScore,
  nextGame,
  isSkipped,
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
  return `Score: ${String(score)}`;
}

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
    const skipped = isSkipped(game, today);
    const current = game === next;
    const cls = done ? "done" : current ? "current" : "";

    html += `<div class="game-card ${cls}">`;
    html += `<span class="game-name">${GAME_LABELS[game]}</span>`;
    if (skipped) {
      html += `<span class="game-score">Skipped</span>`;
    } else if (done) {
      html += `<span class="game-score">${formatScore(game, score)} <span class="game-check">✓</span></span>`;
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
