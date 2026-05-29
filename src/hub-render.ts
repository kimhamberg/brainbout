import { GAME_ICONS } from "./shared/icons";
import { GAMES, type GameId } from "./shared/progress";
import type { Readiness } from "./shared/stages";

/** Returning to the hub with ?completed=walk counts one tended session. */
export const WALK_COMPLETED = "walk";
const WALK_URL = "games/verdant-walk.html";

/** Display order = the order the Walk visits the zones (Grove → Bench → Meadow). */
export const ZONE_ORDER: readonly GameId[] = ["lex", "crown", "flux"];

export type EvidenceLevel = "strong" | "moderate" | "near-only";

export interface EvidenceBlurb {
  level: EvidenceLevel;
  /** Plain-English claim. Names the cognitive target + the transfer scope. */
  claim: string;
  /** Short citation pointer (meta-analysis or canonical paper). */
  citation: string;
}

export interface GameMeta {
  /** Zone name shown in the hub (the Verdant area for this cognitive track). */
  label: string;
  accent: string;
  tagline: string;
  threshold: number;
  stages: [string, string, string];
  evidence: EvidenceBlurb;
}

export const GAME_META: Record<GameId, GameMeta> = {
  crown: {
    label: "Bench",
    accent: "var(--ctp-green)",
    tagline: "Mental rotation — has a planting moved?",
    threshold: 0.6,
    stages: [
      "180° · 3-4 pieces",
      "90/180/270° · 5-7 pieces",
      "± mirror · 8-12 pieces",
    ],
    evidence: {
      level: "moderate",
      claim:
        "Mental rotation speed. Near transfer to related spatial tasks; far transfer to general intelligence not established.",
      citation:
        "Uttal 2013 meta g=0.47; npj Science of Learning 2025 (90-day retention).",
    },
  },
  flux: {
    label: "Meadow",
    accent: "var(--ctp-red)",
    tagline: "Sort the harvest, withhold for pollinators",
    threshold: 0.8,
    stages: ["Relaxed · 2s", "Brisk · 1.5s", "Intense · 1.2s"],
    evidence: {
      level: "near-only",
      claim:
        "Response inhibition + rule-switching. Improvements on similar tasks; no proven transfer to general cognition.",
      citation:
        "Gobet & Sala 2023 (cognitive training meta); response-inhibition reviews 2022.",
    },
  },
  lex: {
    label: "Grove",
    accent: "var(--ctp-blue)",
    tagline: "Wake dormant residents by recalling their names",
    threshold: 0.8,
    stages: ["Multiple choice", "Hinted cloze", "Free recall"],
    evidence: {
      level: "strong",
      claim:
        "Long-term vocabulary retention via spaced retrieval. Strong direct evidence; this is what the words actually do.",
      citation:
        "Cepeda 2006 meta g≈0.5; FSRS empirics 20–30% fewer reviews than SM-2.",
    },
  },
};

export const HONESTY_DISCLAIMER =
  "No app makes you generally smarter. Goal: durable near-transfer in three skills + replace passive scrolling.";

const EVIDENCE_LABEL: Record<EvidenceLevel, string> = {
  strong: "Strong evidence",
  moderate: "Moderate evidence · near transfer",
  "near-only": "Near transfer only",
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
  pwa: {
    canInstall: boolean;
    notifications: "unsupported" | "default" | "granted" | "denied";
  };
  /** Max display value for streak — past this point the number stops mattering. */
  streakCap: number;
  /** Freezes remaining this ISO week (Duolingo-style 2-per-week buffer). */
  freezesRemaining: number;
}

function renderStatsBar(
  streak: number,
  sessionsToday: number,
  pwa: HubState["pwa"],
  streakCap: number,
  freezesRemaining: number,
): string {
  let html = `<div class="hub-stats-bar">`;
  if (streak > 0) {
    const display =
      streak > streakCap ? `${String(streakCap)}+` : String(streak);
    html += `<span class="streak-badge">${display}-day streak</span>`;
  }
  if (streak > 0 && freezesRemaining > 0) {
    html += `<span class="freeze-badge" title="Free skip days remaining this week">🛡 ${String(freezesRemaining)}</span>`;
  }
  if (sessionsToday > 0) {
    html += `<span class="sessions-badge">${String(sessionsToday)} session${sessionsToday === 1 ? "" : "s"} today</span>`;
  }
  if (pwa.canInstall) {
    html += `<button class="install-chip" data-pwa-install>+ Install</button>`;
  }
  if (pwa.notifications === "default") {
    html += `<button class="reminder-chip" data-pwa-notify>🔔 Reminders</button>`;
  }
  html += "</div>";
  return html;
}

function renderWalkCta(): string {
  return `<a href="${WALK_URL}" class="walk-cta" data-walk-cta>
    <span class="cycle-cta-icon">🌿</span>
    <span class="cycle-cta-body">
      <span class="cycle-cta-title">Tend the Hollow</span>
      <span class="cycle-cta-sub">Grove · Bench · Meadow — one walk · ~3 min</span>
    </span>
    <span class="cycle-cta-play">Enter</span>
  </a>`;
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

/** A read-only progress row for one zone — no navigation; the Walk is the only entry. */
function renderZoneRow(card: HubCardState, index: number): string {
  const meta = GAME_META[card.game];
  const style = `--i:${String(index)};--accent:${meta.accent}`;
  const line1 =
    `<span class="game-icon">${GAME_ICONS[card.game]}</span>` +
    `<span class="game-name">${meta.label}</span>` +
    `<div class="game-card-right">${renderRight(card)}</div>`;
  const line2 = `<span class="game-tagline">${meta.tagline}</span>`;
  const line3 =
    card.stat === null ? "" : `<span class="game-stat">${card.stat}</span>`;
  return `<div class="game-card zone-row" data-game="${card.game}" style="${style}"><div class="game-card-top">${line1}</div>${line2}${line3}</div>`;
}

function renderFooter(totalSessions: number): string {
  if (totalSessions <= 0) {
    return "";
  }
  return `<div class="hub-footer">${String(totalSessions)} session${totalSessions === 1 ? "" : "s"} tended</div>`;
}

function renderZonesHeader(): string {
  return `<div class="hub-section-head">Your hollow</div>`;
}

export function renderHubHtml(state: HubState): string {
  let html = renderStatsBar(
    state.streak,
    state.sessionsToday,
    state.pwa,
    state.streakCap,
    state.freezesRemaining,
  );
  html += renderWalkCta();
  html += renderZonesHeader();
  html += `<div class="game-list">`;
  for (let i = 0; i < state.cards.length; i++) {
    const card = state.cards[i];
    if (card) {
      html += renderZoneRow(card, i);
    }
  }
  html += "</div>";
  html += renderFooter(state.totalSessions);
  return html;
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderPopoverHtml(
  meta: GameMeta,
  currentStage: number,
): string {
  let html = "";
  html += `<div class="evidence-row evidence-${meta.evidence.level}">
    <span class="evidence-tag">${escapeAttr(EVIDENCE_LABEL[meta.evidence.level])}</span>
    <span class="evidence-claim">${escapeAttr(meta.evidence.claim)}</span>
    <span class="evidence-cite">${escapeAttr(meta.evidence.citation)}</span>
  </div>`;
  for (let s = 1; s <= meta.stages.length; s++) {
    const current = s === currentStage ? " current" : "";
    html += `<div class="stage-row${current}"><span class="stage-row-num">${String(s)}</span><span>${meta.stages[s - 1]}</span></div>`;
  }
  html += `<div class="evidence-disclaimer">${escapeAttr(HONESTY_DISCLAIMER)}</div>`;
  return html;
}

export function isKnownGame(value: string): value is GameId {
  return (GAMES as readonly string[]).includes(value);
}

export function isCompletableSession(value: string): boolean {
  return value === WALK_COMPLETED || isKnownGame(value);
}
