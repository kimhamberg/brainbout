import { describe, expect, it, test } from "bun:test";
import {
  GAME_META,
  type HubCardState,
  type HubState,
  isKnownGame,
  renderHubHtml,
  renderPopoverHtml,
} from "../src/hub-render";
import { GAMES, type GameId } from "../src/shared/progress";

function makeCard(over: Partial<HubCardState> = {}): HubCardState {
  return {
    game: "crown",
    stage: 1,
    ready: "grey",
    stat: null,
    ...over,
  };
}

function makeState(over: Partial<HubState> = {}): HubState {
  return {
    streak: 0,
    sessionsToday: 0,
    totalSessions: 0,
    cards: GAMES.map((g) => makeCard({ game: g })),
    ...over,
  };
}

describe("GAME_META: structural invariants", () => {
  for (const game of GAMES) {
    test(`${game} metadata has expected shape`, () => {
      const m = GAME_META[game];
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.url).toBe(`games/${game}.html`);
      expect(m.accent).toMatch(/^var\(--ctp-[a-z]+\)$/u);
      expect(m.tagline.length).toBeGreaterThan(0);
      expect(m.threshold).toBeGreaterThan(0);
      expect(m.threshold).toBeLessThanOrEqual(1);
      expect(m.stages).toHaveLength(3);
      for (const s of m.stages) {
        expect(s.length).toBeGreaterThan(0);
      }
    });
  }

  test("exact label values", () => {
    expect(GAME_META.crown.label).toBe("Crown");
    expect(GAME_META.flux.label).toBe("Flux");
    expect(GAME_META.lex.label).toBe("Lex");
  });

  test("exact accent values", () => {
    expect(GAME_META.crown.accent).toBe("var(--ctp-green)");
    expect(GAME_META.flux.accent).toBe("var(--ctp-red)");
    expect(GAME_META.lex.accent).toBe("var(--ctp-blue)");
  });

  test("exact tagline values", () => {
    expect(GAME_META.crown.tagline).toBe("Outsmart Stockfish");
    expect(GAME_META.flux.tagline).toBe("Think fast, switch faster");
    expect(GAME_META.lex.tagline).toBe("Build your vocabulary");
  });

  test("exact stage labels", () => {
    expect(GAME_META.crown.stages).toEqual(["600 Elo", "1200 Elo", "1600 Elo"]);
    expect(GAME_META.flux.stages).toEqual([
      "Relaxed · 2s",
      "Brisk · 1.5s",
      "Intense · 1.2s",
    ]);
    expect(GAME_META.lex.stages).toEqual([
      "Multiple choice",
      "Hinted cloze",
      "Free recall",
    ]);
  });

  test("exact thresholds", () => {
    expect(GAME_META.crown.threshold).toBe(0.6);
    expect(GAME_META.flux.threshold).toBe(0.8);
    expect(GAME_META.lex.threshold).toBe(0.8);
  });
});

describe("isKnownGame", () => {
  for (const g of GAMES) {
    test(`returns true for "${g}"`, () => {
      expect(isKnownGame(g)).toBe(true);
    });
  }
  for (const bad of ["", "Crown", "CROWN", "chess", "lex2", " lex", "lex "]) {
    test(`returns false for ${JSON.stringify(bad)}`, () => {
      expect(isKnownGame(bad)).toBe(false);
    });
  }
});

describe("renderHubHtml: stats bar", () => {
  test("no streak badge when streak=0", () => {
    expect(renderHubHtml(makeState({ streak: 0 }))).not.toContain(
      "streak-badge",
    );
  });
  test("streak badge with singular/plural correct (>=1 always uses 'streak')", () => {
    const out = renderHubHtml(makeState({ streak: 1 }));
    expect(out).toContain('<span class="streak-badge">1-day streak</span>');
  });
  test("streak badge value matches input exactly", () => {
    for (const s of [1, 2, 7, 100]) {
      const out = renderHubHtml(makeState({ streak: s }));
      expect(out).toContain(`>${String(s)}-day streak<`);
    }
  });
  test("no sessions-today badge when 0", () => {
    expect(renderHubHtml(makeState({ sessionsToday: 0 }))).not.toContain(
      "sessions-badge",
    );
  });
  test("sessions-today singular for 1", () => {
    expect(renderHubHtml(makeState({ sessionsToday: 1 }))).toContain(
      "1 session today",
    );
  });
  test("sessions-today plural for >=2", () => {
    expect(renderHubHtml(makeState({ sessionsToday: 2 }))).toContain(
      "2 sessions today",
    );
    expect(renderHubHtml(makeState({ sessionsToday: 5 }))).toContain(
      "5 sessions today",
    );
  });
  test("stats-bar wrapper always present", () => {
    expect(renderHubHtml(makeState())).toContain('<div class="hub-stats-bar">');
  });
});

describe("renderHubHtml: game cards", () => {
  test("emits anchor with correct href + accent + index for each non-done game", () => {
    const out = renderHubHtml(makeState());
    for (let i = 0; i < GAMES.length; i++) {
      const g = GAMES[i] as GameId;
      const meta = GAME_META[g];
      expect(out).toContain(`href="${meta.url}"`);
      expect(out).toContain(`--accent:${meta.accent}`);
      expect(out).toContain(`--i:${String(i)}`);
    }
  });

  test("each card contains its label, tagline, and Play CTA", () => {
    const out = renderHubHtml(makeState());
    for (const g of GAMES) {
      const meta = GAME_META[g];
      expect(out).toContain(`>${meta.label}<`);
      expect(out).toContain(`>${meta.tagline}<`);
    }
    const plays = out.match(/<span class="game-play">Play<\/span>/gu) ?? [];
    expect(plays).toHaveLength(3);
  });

  test("every card is always an anchor (no game is ever greyed out)", () => {
    const out = renderHubHtml(makeState());
    expect(out).not.toContain("done-badge");
    expect(out).not.toContain("game-card done");
    expect(out.match(/<a [^>]*class="game-card"/gu) ?? []).toHaveLength(3);
  });

  test("Advance button appears only when ready === green", () => {
    for (const ready of ["grey", "amber"] as const) {
      const out = renderHubHtml(
        makeState({ cards: [makeCard({ game: "crown", ready })] }),
      );
      expect(out).not.toContain("advance-btn");
    }
    const out = renderHubHtml(
      makeState({ cards: [makeCard({ game: "crown", ready: "green" })] }),
    );
    expect(out).toContain('data-game="crown"');
    expect(out).toMatch(
      /<button class="advance-btn"[^>]*>Advance ▸<\/button>/u,
    );
  });

  test("Retreat button appears only when stage > 1", () => {
    const out1 = renderHubHtml(
      makeState({ cards: [makeCard({ game: "crown", stage: 1 })] }),
    );
    expect(out1).not.toContain("retreat-btn");
    for (const stage of [2, 3]) {
      const out = renderHubHtml(
        makeState({ cards: [makeCard({ game: "crown", stage })] }),
      );
      expect(out).toMatch(/<button class="retreat-btn"[^>]*>▾<\/button>/u);
    }
  });

  test("stage chip shows stage number and readiness class", () => {
    for (const stage of [1, 2, 3]) {
      for (const ready of ["grey", "amber", "green"] as const) {
        const out = renderHubHtml(
          makeState({ cards: [makeCard({ game: "flux", stage, ready })] }),
        );
        expect(out).toContain(`readiness-${ready}`);
        expect(out).toContain(`>Stage ${String(stage)}<`);
      }
    }
  });

  test("stat line is omitted when null", () => {
    const out = renderHubHtml(
      makeState({ cards: [makeCard({ game: "crown", stat: null })] }),
    );
    expect(out).not.toContain("game-stat");
  });

  test("stat line is rendered with the exact provided text", () => {
    const out = renderHubHtml(
      makeState({
        cards: [makeCard({ game: "flux", stat: "Best: 42 pts" })],
      }),
    );
    expect(out).toContain('<span class="game-stat">Best: 42 pts</span>');
  });
});

describe("renderHubHtml: footer + new-session", () => {
  test("no footer when totalSessions === 0", () => {
    expect(renderHubHtml(makeState({ totalSessions: 0 }))).not.toContain(
      "hub-footer",
    );
  });
  test("footer singular for 1", () => {
    expect(renderHubHtml(makeState({ totalSessions: 1 }))).toContain(
      "1 session completed",
    );
  });
  test("footer plural for >=2", () => {
    expect(renderHubHtml(makeState({ totalSessions: 7 }))).toContain(
      "7 sessions completed",
    );
  });
  test("no 'New Session' button is ever rendered (cards always replayable)", () => {
    expect(renderHubHtml(makeState({ totalSessions: 0 }))).not.toContain(
      "new-session-btn",
    );
    expect(renderHubHtml(makeState({ totalSessions: 50 }))).not.toContain(
      "new-session-btn",
    );
  });
});

describe("renderPopoverHtml", () => {
  for (const game of GAMES) {
    test(`${game}: emits exactly 3 rows in fixed order`, () => {
      const out = renderPopoverHtml(GAME_META[game], 1);
      const rows = out.match(/<div class="stage-row(?: current)?"/gu) ?? [];
      expect(rows).toHaveLength(3);
      for (let i = 0; i < GAME_META[game].stages.length; i++) {
        expect(out).toContain(`>${GAME_META[game].stages[i]}<`);
        expect(out).toContain(
          `<span class="stage-row-num">${String(i + 1)}</span>`,
        );
      }
    });
  }
  test("only the current stage gets .current modifier", () => {
    for (const stage of [1, 2, 3]) {
      const out = renderPopoverHtml(GAME_META.flux, stage);
      const matches = out.match(/class="stage-row current"/gu) ?? [];
      expect(matches).toHaveLength(1);
      // The 'current' marker is on the right row index
      const idx = out.indexOf("stage-row current");
      const before = out.slice(0, idx);
      expect((before.match(/<div class="stage-row/gu) ?? []).length).toBe(
        stage - 1,
      );
    }
  });
  test("stage outside 1..3 yields no current row", () => {
    for (const s of [0, 4, 99, -1]) {
      const out = renderPopoverHtml(GAME_META.crown, s);
      expect(out).not.toContain("stage-row current");
    }
  });
});

describe("renderHubHtml: structural snapshot (3 fresh cards)", () => {
  it("matches expected HTML scaffold", () => {
    const html = renderHubHtml(makeState());
    // Stats bar, game list opens, three anchors, list closes, no footer/new-session
    expect(html.startsWith('<div class="hub-stats-bar">')).toBe(true);
    expect(html).toContain('<div class="game-list">');
    expect(html.match(/<a [^>]*class="game-card"/gu) ?? []).toHaveLength(3);
    expect(html.endsWith("</div>")).toBe(true);
  });
});
