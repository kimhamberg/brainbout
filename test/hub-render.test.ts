import { describe, expect, it, test } from "bun:test";
import {
  GAME_META,
  type HubCardState,
  type HubState,
  isCompletableSession,
  isKnownGame,
  renderHubHtml,
  renderPopoverHtml,
  WALK_COMPLETED,
  ZONE_ORDER,
} from "../src/hub-render";
import { GAMES } from "../src/shared/progress";

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
    cards: ZONE_ORDER.map((g) => makeCard({ game: g })),
    pwa: { canInstall: false, notifications: "unsupported" },
    streakCap: 99,
    freezesRemaining: 2,
    ...over,
  };
}

describe("GAME_META: structural invariants", () => {
  for (const game of GAMES) {
    test(`${game} metadata has expected shape`, () => {
      const m = GAME_META[game];
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.accent).toMatch(/^var\(--ctp-[a-z]+\)$/u);
      expect(m.tagline.length).toBeGreaterThan(0);
      expect(m.threshold).toBeGreaterThan(0);
      expect(m.threshold).toBeLessThanOrEqual(1);
      expect(m.stages).toHaveLength(3);
      for (const s of m.stages) expect(s.length).toBeGreaterThan(0);
    });
  }

  test("zone labels map each cognitive track to its Verdant area", () => {
    expect(GAME_META.lex.label).toBe("Grove");
    expect(GAME_META.crown.label).toBe("Bench");
    expect(GAME_META.flux.label).toBe("Meadow");
  });

  test("exact accent values (unchanged from the cognitive tracks)", () => {
    expect(GAME_META.crown.accent).toBe("var(--ctp-green)");
    expect(GAME_META.flux.accent).toBe("var(--ctp-red)");
    expect(GAME_META.lex.accent).toBe("var(--ctp-blue)");
  });

  test("exact thresholds", () => {
    expect(GAME_META.crown.threshold).toBe(0.6);
    expect(GAME_META.flux.threshold).toBe(0.8);
    expect(GAME_META.lex.threshold).toBe(0.8);
  });

  test("ZONE_ORDER is the Walk's visiting order (Grove → Bench → Meadow)", () => {
    expect(ZONE_ORDER).toEqual(["lex", "crown", "flux"]);
  });
});

describe("isKnownGame / isCompletableSession", () => {
  for (const g of GAMES) {
    test(`isKnownGame true for "${g}"`, () => {
      expect(isKnownGame(g)).toBe(true);
    });
  }
  for (const bad of ["", "Crown", "chess", "lex2", " lex"]) {
    test(`isKnownGame false for ${JSON.stringify(bad)}`, () => {
      expect(isKnownGame(bad)).toBe(false);
    });
  }
  test("a completed Walk counts as a session", () => {
    expect(isCompletableSession(WALK_COMPLETED)).toBe(true);
    expect(isCompletableSession("walk")).toBe(true);
    expect(isCompletableSession("crown")).toBe(true); // single-track still valid
    expect(isCompletableSession("cycle")).toBe(false); // retired
    expect(isCompletableSession("nope")).toBe(false);
  });
});

describe("renderHubHtml: stats bar", () => {
  test("no streak badge when streak=0", () => {
    expect(renderHubHtml(makeState({ streak: 0 }))).not.toContain(
      "streak-badge",
    );
  });
  test("streak badge value matches input exactly (under the cap)", () => {
    for (const s of [1, 2, 7, 50, 99]) {
      expect(renderHubHtml(makeState({ streak: s }))).toContain(
        `>${String(s)}-day streak<`,
      );
    }
  });
  test("streak badge collapses to '99+' once the cap is crossed", () => {
    expect(renderHubHtml(makeState({ streak: 100 }))).toContain(
      ">99+-day streak<",
    );
  });
  test("freeze badge shown only when streak is alive AND freezes remain", () => {
    expect(
      renderHubHtml(makeState({ streak: 5, freezesRemaining: 2 })),
    ).toContain("freeze-badge");
    expect(
      renderHubHtml(makeState({ streak: 0, freezesRemaining: 2 })),
    ).not.toContain("freeze-badge");
    expect(
      renderHubHtml(makeState({ streak: 5, freezesRemaining: 0 })),
    ).not.toContain("freeze-badge");
  });
  test("sessions-today singular / plural", () => {
    expect(renderHubHtml(makeState({ sessionsToday: 1 }))).toContain(
      "1 session today",
    );
    expect(renderHubHtml(makeState({ sessionsToday: 2 }))).toContain(
      "2 sessions today",
    );
    expect(renderHubHtml(makeState({ sessionsToday: 0 }))).not.toContain(
      "sessions-badge",
    );
  });
  test("empty stats-bar is closed before the Walk CTA", () => {
    expect(renderHubHtml(makeState())).toContain(
      '<div class="hub-stats-bar"></div><a href="games/verdant-walk.html"',
    );
  });
  test("install + reminder chips gate on pwa state", () => {
    expect(
      renderHubHtml(
        makeState({ pwa: { canInstall: true, notifications: "unsupported" } }),
      ),
    ).toContain("data-pwa-install");
    expect(
      renderHubHtml(
        makeState({ pwa: { canInstall: false, notifications: "default" } }),
      ),
    ).toContain("data-pwa-notify");
    expect(renderHubHtml(makeState())).not.toContain("data-pwa-install");
    expect(
      renderHubHtml(
        makeState({ pwa: { canInstall: false, notifications: "granted" } }),
      ),
    ).not.toContain("data-pwa-notify");
  });
});

describe("renderHubHtml: Walk CTA (the single entry point)", () => {
  test("links to the Walk page with the data hook", () => {
    const out = renderHubHtml(makeState());
    expect(out).toContain('href="games/verdant-walk.html"');
    expect(out).toContain("data-walk-cta");
    expect(out).toContain("Tend the Hollow");
  });
  test("no retired Daily / Cycle / drill CTAs survive", () => {
    const out = renderHubHtml(makeState());
    expect(out).not.toContain("daily-cta");
    expect(out).not.toContain("Start Cycle");
    expect(out).not.toContain("games/daily.html");
    expect(out).not.toContain("games/cycle.html");
    expect(out).not.toContain("games/crown.html");
  });
});

describe("renderHubHtml: zone progress rows", () => {
  test("three read-only rows — never navigable anchors", () => {
    const out = renderHubHtml(makeState());
    const rows = out.match(/<div class="game-card zone-row"/gu) ?? [];
    expect(rows).toHaveLength(3);
    // the only anchor in the hub is the Walk CTA
    expect(out.match(/<a [^>]*class="walk-cta"/gu) ?? []).toHaveLength(1);
    expect(out).not.toContain('class="game-play"');
  });
  test("each row carries its zone label, tagline, accent + index", () => {
    const out = renderHubHtml(makeState());
    for (let i = 0; i < ZONE_ORDER.length; i++) {
      const meta = GAME_META[ZONE_ORDER[i] as (typeof ZONE_ORDER)[number]];
      expect(out).toContain(`>${meta.label}<`);
      expect(out).toContain(`>${meta.tagline}<`);
      expect(out).toContain(`--i:${String(i)}`);
      expect(out).toContain(`--accent:${meta.accent}`);
    }
  });
  test("icon slot wraps an svg per row", () => {
    const out = renderHubHtml(makeState());
    expect(out.match(/<span class="game-icon">/gu) ?? []).toHaveLength(3);
    expect(out).toMatch(/<span class="game-icon"><svg/u);
  });
  test("Advance button appears only when ready === green", () => {
    for (const ready of ["grey", "amber"] as const) {
      expect(
        renderHubHtml(makeState({ cards: [makeCard({ ready })] })),
      ).not.toContain("advance-btn");
    }
    expect(
      renderHubHtml(makeState({ cards: [makeCard({ ready: "green" })] })),
    ).toMatch(/<button class="advance-btn"[^>]*>Advance ▸<\/button>/u);
  });
  test("Retreat button appears only when stage > 1", () => {
    expect(
      renderHubHtml(makeState({ cards: [makeCard({ stage: 1 })] })),
    ).not.toContain("retreat-btn");
    for (const stage of [2, 3]) {
      expect(
        renderHubHtml(makeState({ cards: [makeCard({ stage })] })),
      ).toMatch(/<button class="retreat-btn"[^>]*>▾<\/button>/u);
    }
  });
  test("stage chip shows stage number and readiness class", () => {
    const out = renderHubHtml(
      makeState({
        cards: [makeCard({ game: "flux", stage: 2, ready: "amber" })],
      }),
    );
    expect(out).toContain("readiness-amber");
    expect(out).toContain(">Stage 2<");
  });
  test("stat line omitted when null, exact when present", () => {
    expect(
      renderHubHtml(makeState({ cards: [makeCard({ stat: null })] })),
    ).not.toContain("game-stat");
    expect(
      renderHubHtml(makeState({ cards: [makeCard({ stat: "Best: 42 pts" })] })),
    ).toContain('<span class="game-stat">Best: 42 pts</span>');
  });
});

describe("renderHubHtml: footer", () => {
  test("no footer when totalSessions === 0", () => {
    expect(renderHubHtml(makeState({ totalSessions: 0 }))).not.toContain(
      "hub-footer",
    );
  });
  test("footer singular/plural says 'tended'", () => {
    expect(renderHubHtml(makeState({ totalSessions: 1 }))).toContain(
      "1 session tended",
    );
    expect(renderHubHtml(makeState({ totalSessions: 7 }))).toContain(
      "7 sessions tended",
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
  test("output starts with a stage/evidence div", () => {
    expect(renderPopoverHtml(GAME_META.crown, 1).startsWith("<div")).toBe(true);
  });
  test("only the current stage gets .current modifier, in the right slot", () => {
    for (const stage of [1, 2, 3]) {
      const out = renderPopoverHtml(GAME_META.flux, stage);
      expect((out.match(/class="stage-row current"/gu) ?? []).length).toBe(1);
      const before = out.slice(0, out.indexOf("stage-row current"));
      expect((before.match(/<div class="stage-row/gu) ?? []).length).toBe(
        stage - 1,
      );
    }
  });
  test("stage outside 1..3 yields no current row", () => {
    for (const s of [0, 4, 99, -1]) {
      expect(renderPopoverHtml(GAME_META.crown, s)).not.toContain(
        "stage-row current",
      );
    }
  });
});

describe("renderHubHtml: structural snapshot", () => {
  it("stats bar → Walk CTA → zone list, no trailing footer when fresh", () => {
    const html = renderHubHtml(makeState());
    expect(html.startsWith('<div class="hub-stats-bar">')).toBe(true);
    expect(html).toContain('<div class="game-list">');
    expect(html.match(/<div class="game-card zone-row"/gu) ?? []).toHaveLength(
      3,
    );
    expect(html.endsWith("</div>")).toBe(true);
  });
});
