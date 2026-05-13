import { GAME_ICONS } from "./shared/icons";
import { GAMES, type GameId } from "./shared/progress";
import type { Readiness } from "./shared/stages";

export interface GameMeta {
  label: string;
  url: string;
  accent: string;
  tagline: string;
  threshold: number;
  stages: [string, string, string];
}

export const GAME_META: Record<GameId, GameMeta> = {
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
    stages: ["Relaxed · 2s", "Brisk · 1.5s", "Intense · 1.2s"],
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

export interface HubCardState {
  game: GameId;
  stage: number;
  ready: Readiness;
  stat: string | null;
}

export interface HubState {
  streak: number;
  sessionsToday: number;
  totalSessions: number;
  cards: HubCardState[];
}

function renderStatsBar(streak: number, sessionsToday: number): string {
  let html = `<div class="hub-stats-bar">`;
  if (streak > 0) {
    html += `<span class="streak-badge">${String(streak)}-day streak</span>`;
  }
  if (sessionsToday > 0) {
    html += `<span class="sessions-badge">${String(sessionsToday)} session${sessionsToday === 1 ? "" : "s"} today</span>`;
  }
  html += "</div>";
  return html;
}

function renderRight(card: HubCardState): string {
  let html = `<button class="stage-chip readiness-${card.ready}" data-game="${card.game}">Stage ${String(card.stage)}</button>`;
  if (card.ready === "green") {
    html += `<button class="advance-btn" data-game="${card.game}">Advance ▸</button>`;
  }
  if (card.stage > 1) {
    html += `<button class="retreat-btn" data-game="${card.game}">▾</button>`;
  }
  return html;
}

function renderCard(card: HubCardState, index: number): string {
  const meta = GAME_META[card.game];
  const style = `--i:${String(index)};--accent:${meta.accent}`;

  const line1 =
    `<span class="game-icon">${GAME_ICONS[card.game]}</span>` +
    `<span class="game-name">${meta.label}</span>` +
    `<div class="game-card-right">${renderRight(card)}</div>`;
  const line2 = `<span class="game-tagline">${meta.tagline}</span>`;
  const line3 =
    card.stat === null ? "" : `<span class="game-stat">${card.stat}</span>`;
  const inner = `<div class="game-card-top">${line1}</div>${line2}${line3}`;

  return `<a href="${meta.url}" class="game-card" style="${style}"><span class="game-play">Play</span>${inner}</a>`;
}

function renderFooter(totalSessions: number): string {
  if (totalSessions <= 0) {
    return "";
  }
  return `<div class="hub-footer">${String(totalSessions)} session${totalSessions === 1 ? "" : "s"} completed</div>`;
}

export function renderHubHtml(state: HubState): string {
  let html = renderStatsBar(state.streak, state.sessionsToday);
  html += `<div class="game-list">`;
  for (let i = 0; i < state.cards.length; i++) {
    const card = state.cards[i];
    if (card) {
      html += renderCard(card, i);
    }
  }
  html += "</div>";
  html += renderFooter(state.totalSessions);
  return html;
}

export function renderPopoverHtml(
  meta: GameMeta,
  currentStage: number,
): string {
  let html = "";
  for (let s = 1; s <= meta.stages.length; s++) {
    const current = s === currentStage ? " current" : "";
    html += `<div class="stage-row${current}"><span class="stage-row-num">${String(s)}</span><span>${meta.stages[s - 1]}</span></div>`;
  }
  return html;
}

export function isKnownGame(value: string): value is GameId {
  return (GAMES as readonly string[]).includes(value);
}
