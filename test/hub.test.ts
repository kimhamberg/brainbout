import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { init } from "../src/hub";

function seedDom(): void {
  document.body.innerHTML = `
    <div id="app" class="app">
      <header class="hub-header">
        <button id="theme-btn" aria-label="Toggle theme"></button>
        <span class="hub-icon-slot"></span>
      </header>
      <main id="hub"></main>
    </div>
  `;
}

function resetEnv(): void {
  localStorage.clear();
  sessionStorage.clear();
  window.location.search = "";
  seedDom();
}

describe("hub: basic render", () => {
  beforeEach(() => {
    resetEnv();
    init();
  });

  test("renders 3 game cards", () => {
    expect(document.querySelectorAll("#hub a.game-card")).toHaveLength(3);
  });

  test("cards have correct relative hrefs (no BASE drift)", () => {
    const cards =
      document.querySelectorAll<HTMLAnchorElement>("#hub a.game-card");
    expect(cards[0]?.getAttribute("href")).toBe("games/crown.html");
    expect(cards[1]?.getAttribute("href")).toBe("games/flux.html");
    expect(cards[2]?.getAttribute("href")).toBe("games/lex.html");
  });

  test("renders game labels in fixed order", () => {
    const labels = Array.from(
      document.querySelectorAll<HTMLElement>(".game-name"),
    ).map((n) => n.textContent);
    expect(labels).toEqual(["Crown", "Flux", "Lex"]);
  });

  test("stage chip rendered per non-done game", () => {
    const chips = document.querySelectorAll<HTMLButtonElement>(".stage-chip");
    expect(chips).toHaveLength(3);
    expect(Array.from(chips).map((c) => c.dataset.game)).toEqual([
      "crown",
      "flux",
      "lex",
    ]);
  });

  test("hub brain icon is mounted", () => {
    expect(document.querySelector(".hub-icon-slot .hub-icon")).not.toBeNull();
  });

  test("theme toggle button has SVG injected", () => {
    expect(document.querySelector("#theme-btn svg")).not.toBeNull();
  });

  test("no streak/sessions/footer badges on a brand-new visit", () => {
    expect(document.querySelector(".streak-badge")).toBeNull();
    expect(document.querySelector(".sessions-badge")).toBeNull();
    expect(document.querySelector(".hub-footer")).toBeNull();
  });

  test("no per-game stat lines when no data exists", () => {
    expect(document.querySelectorAll(".game-stat")).toHaveLength(0);
  });
});

describe("hub: stage popover", () => {
  beforeEach(() => {
    resetEnv();
    init();
  });

  test("clicking a stage chip opens popover with stage rows", async () => {
    const chip = document.querySelector<HTMLButtonElement>(
      '.stage-chip[data-game="flux"]',
    );
    chip?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const popover = document.querySelector(".stage-popover");
    expect(popover).not.toBeNull();
    expect(popover?.querySelectorAll(".stage-row")).toHaveLength(3);
    expect(popover?.querySelector(".stage-row.current")).not.toBeNull();
  });

  test("clicking outside dismisses popover", async () => {
    const chip = document.querySelector<HTMLButtonElement>(
      '.stage-chip[data-game="flux"]',
    );
    chip?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.querySelector(".stage-popover")).not.toBeNull();
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.querySelector(".stage-popover")).toBeNull();
  });

  test("opening a second popover replaces the first", () => {
    document
      .querySelector<HTMLButtonElement>('.stage-chip[data-game="flux"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    document
      .querySelector<HTMLButtonElement>('.stage-chip[data-game="crown"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.querySelectorAll(".stage-popover")).toHaveLength(1);
  });
});

/**
 * `window.location.href` recording setter. happy-dom's real setter triggers
 * BrowserFrame.openPage which both no-ops navigation and trips on pending
 * fallback timers from previous tests. We install the override once for the
 * whole describe block and reset only the recorded calls between tests.
 */
/**
 * Recording wrapper around `window.location.href`. happy-dom's default
 * implementation no-ops cross-origin nav but its internal URL parser still
 * reads href as a base, so the wrapper delegates get/set to the original.
 * The set call is captured first; the original is invoked best-effort so
 * happy-dom can keep its own internal state consistent.
 */
const navCalls: string[] = [];
{
  const proto = Object.getPrototypeOf(window.location);
  const orig = Object.getOwnPropertyDescriptor(proto, "href");
  if (!orig?.set || !orig.get) {
    throw new Error("happy-dom location.href descriptor missing accessors");
  }
  const origSet = orig.set;
  const origGet = orig.get;
  Object.defineProperty(window.location, "href", {
    configurable: true,
    set(v: string) {
      navCalls.push(String(v));
      try {
        origSet.call(window.location, v);
      } catch {
        // happy-dom's openPage throws for cross-origin / unparseable URLs.
        // We've already recorded the attempt; swallow.
      }
    },
    get() {
      return origGet.call(window.location);
    },
  });
}

describe("hub: card click triggers nav overlay + fallback", () => {
  // Track every setTimeout scheduled during a test so afterEach can cancel
  // any that haven't fired (press 80ms, fallback 600ms). Avoids per-test
  // 750ms drains that bloat mutation runtime.
  const tracked = new Set<ReturnType<typeof setTimeout>>();
  const realSetTimeout = globalThis.setTimeout;
  beforeEach(() => {
    globalThis.setTimeout = ((fn: () => void, ms?: number) => {
      const id = realSetTimeout(fn, ms);
      tracked.add(id);
      return id;
    }) as typeof setTimeout;
    resetEnv();
    init();
    navCalls.length = 0;
  });
  afterEach(() => {
    for (const id of tracked) clearTimeout(id);
    tracked.clear();
    globalThis.setTimeout = realSetTimeout;
  });

  test("anchor click is prevent-defaulted and marks card pressed", () => {
    const card = document.querySelector<HTMLAnchorElement>(
      'a.game-card[href$="crown.html"]',
    );
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    card?.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(card?.classList.contains("pressed")).toBe(true);
  });

  test("overlay element is added to body after press delay", async () => {
    const card = document.querySelector<HTMLAnchorElement>(
      'a.game-card[href$="flux.html"]',
    );
    card?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 120));
    expect(document.querySelector(".page-transition")).not.toBeNull();
    expect(document.querySelector(".app")?.classList.contains("exiting")).toBe(
      true,
    );
  });

  test("animationend → navigates to the card's exact href, once", async () => {
    const card = document.querySelector<HTMLAnchorElement>(
      'a.game-card[href$="lex.html"]',
    );
    card?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 120));
    const overlay = document.querySelector<HTMLElement>(".page-transition");
    overlay?.dispatchEvent(new Event("animationend", { bubbles: true }));
    expect(navCalls).toEqual(["games/lex.html"]);
  });

  test("fallback timer navigates when animationend never fires, once", async () => {
    const card = document.querySelector<HTMLAnchorElement>(
      'a.game-card[href$="crown.html"]',
    );
    card?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 750));
    expect(navCalls).toEqual(["games/crown.html"]);
  });

  test("nav fires only once even if animationend + fallback both arrive", async () => {
    const card = document.querySelector<HTMLAnchorElement>(
      'a.game-card[href$="flux.html"]',
    );
    card?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 120));
    const overlay = document.querySelector<HTMLElement>(".page-transition");
    overlay?.dispatchEvent(new Event("animationend", { bubbles: true }));
    // First nav already fired. Now let the fallback timer also fire.
    await new Promise((r) => setTimeout(r, 700));
    expect(navCalls).toEqual(["games/flux.html"]);
  });

  test("nav fires only once even if animationend dispatched multiple times", async () => {
    const card = document.querySelector<HTMLAnchorElement>(
      'a.game-card[href$="crown.html"]',
    );
    card?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 120));
    const overlay = document.querySelector<HTMLElement>(".page-transition");
    overlay?.dispatchEvent(new Event("animationend", { bubbles: true }));
    overlay?.dispatchEvent(new Event("animationend", { bubbles: true }));
    overlay?.dispatchEvent(new Event("animationend", { bubbles: true }));
    expect(navCalls).toHaveLength(1);
    expect(navCalls[0]).toBe("games/crown.html");
  });

  test("nav does NOT fire if a non-animationend event is dispatched on overlay", async () => {
    const card = document.querySelector<HTMLAnchorElement>(
      'a.game-card[href$="lex.html"]',
    );
    card?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 120));
    const overlay = document.querySelector<HTMLElement>(".page-transition");
    overlay?.dispatchEvent(new Event("transitionend", { bubbles: true }));
    overlay?.dispatchEvent(new Event("animationstart", { bubbles: true }));
    // Neither should have triggered nav — only animationend or the fallback timer should.
    expect(navCalls).toEqual([]);
  });
});

describe("hub: completed-game URL param + session restore + all-done", () => {
  beforeEach(() => {
    resetEnv();
    sessionStorage.setItem(
      "brainbout:current-session",
      JSON.stringify(["crown", "flux"]),
    );
    window.location.search = "?completed=lex";
    init();
  });

  test("URL is cleaned after render", () => {
    expect(window.location.search).toBe("");
  });

  test("completeSession() fires (sessions counter bumped)", () => {
    expect(localStorage.getItem("brainbout:total-sessions")).toBe("1");
  });

  test("sessionStorage is cleared", () => {
    expect(sessionStorage.getItem("brainbout:current-session")).toBeNull();
  });

  test("New Session button is rendered", () => {
    expect(document.querySelector(".new-session-btn")).not.toBeNull();
  });

  test("All 3 cards rendered in done state (no anchors)", () => {
    expect(document.querySelectorAll("#hub .game-card.done")).toHaveLength(3);
    expect(document.querySelectorAll("#hub a.game-card")).toHaveLength(0);
  });

  test("footer shows total sessions completed", () => {
    expect(document.querySelector(".hub-footer")?.textContent).toMatch(
      /1 session completed/u,
    );
  });

  test("clicking New Session resets to play state", () => {
    document
      .querySelector<HTMLButtonElement>(".new-session-btn")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.querySelector(".new-session-btn")).toBeNull();
    expect(document.querySelectorAll("#hub a.game-card")).toHaveLength(3);
  });
});

describe("hub: bogus ?completed= value is ignored", () => {
  beforeEach(() => {
    resetEnv();
    window.location.search = "?completed=notagame";
    init();
  });

  test("session is empty; all 3 cards remain as anchors", () => {
    expect(document.querySelectorAll("#hub a.game-card")).toHaveLength(3);
    expect(document.querySelector(".new-session-btn")).toBeNull();
  });
});

describe("hub: sessionStorage restore filters unknown game ids", () => {
  beforeEach(() => {
    resetEnv();
    sessionStorage.setItem(
      "brainbout:current-session",
      JSON.stringify(["crown", "garbage"]),
    );
    init();
  });

  test("only valid games are restored", () => {
    expect(document.querySelectorAll("#hub .game-card.done")).toHaveLength(1);
    expect(document.querySelectorAll("#hub a.game-card")).toHaveLength(2);
  });
});

describe("hub: stages — advance / retreat", () => {
  beforeEach(() => {
    resetEnv();
    localStorage.setItem(
      "brainbout:stage:crown",
      JSON.stringify({ stage: 2, history: [] }),
    );
    localStorage.setItem(
      "brainbout:stage:flux",
      JSON.stringify({ stage: 1, history: [0.9, 0.9, 0.9, 0.9, 0.9] }),
    );
    localStorage.setItem(
      "brainbout:stage:lex",
      JSON.stringify({ stage: 3, history: [1, 1, 1, 1, 1] }),
    );
    init();
  });

  test("flux has Advance button at green readiness", () => {
    expect(
      document.querySelector('.advance-btn[data-game="flux"]'),
    ).not.toBeNull();
  });

  test("crown has Retreat button (stage > 1)", () => {
    expect(
      document.querySelector('.retreat-btn[data-game="crown"]'),
    ).not.toBeNull();
  });

  test("lex at max stage has no Advance button", () => {
    expect(document.querySelector('.advance-btn[data-game="lex"]')).toBeNull();
  });

  test("clicking Advance bumps stored stage and re-renders chip", () => {
    document
      .querySelector<HTMLButtonElement>('.advance-btn[data-game="flux"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const stored = JSON.parse(
      localStorage.getItem("brainbout:stage:flux") ?? "{}",
    ) as { stage: number };
    expect(stored.stage).toBe(2);
    expect(
      document.querySelector<HTMLElement>('.stage-chip[data-game="flux"]')
        ?.textContent,
    ).toMatch(/Stage 2/u);
  });

  test("clicking Retreat decrements stored stage", () => {
    document
      .querySelector<HTMLButtonElement>('.retreat-btn[data-game="crown"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(
      (
        JSON.parse(localStorage.getItem("brainbout:stage:crown") ?? "{}") as {
          stage: number;
        }
      ).stage,
    ).toBe(1);
  });
});

function ymd(d: Date): string {
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

describe("hub: badges + per-game stats", () => {
  beforeEach(() => {
    resetEnv();
    const today = new Date();
    const yest = new Date(today);
    yest.setDate(yest.getDate() - 1);
    localStorage.setItem(`brainbout:sessions:${ymd(today)}`, "2");
    localStorage.setItem(`brainbout:sessions:${ymd(yest)}`, "1");
    localStorage.setItem("brainbout:total-sessions", "7");
    localStorage.setItem("brainbout:checkmates:600", "3");
    localStorage.setItem("brainbout:best:flux", "42");
    localStorage.setItem(
      "brainbout:lex:no:apple",
      JSON.stringify({ mastery: 2 }),
    );
    localStorage.setItem(
      "brainbout:lex:no:banana",
      JSON.stringify({ mastery: 2 }),
    );
    init();
  });

  test("streak badge renders", () => {
    expect(document.querySelector(".streak-badge")?.textContent).toMatch(
      /2-day streak/u,
    );
  });

  test("sessions-today badge renders", () => {
    expect(document.querySelector(".sessions-badge")?.textContent).toMatch(
      /2 sessions today/u,
    );
  });

  test("footer shows total sessions", () => {
    expect(document.querySelector(".hub-footer")?.textContent).toMatch(
      /7 sessions completed/u,
    );
  });

  test("crown stat: checkmates @ elo", () => {
    expect(
      document.querySelector('a.game-card[href$="crown.html"] .game-stat')
        ?.textContent,
    ).toMatch(/3 checkmates at 600 Elo/u);
  });

  test("flux stat: best score", () => {
    expect(
      document.querySelector('a.game-card[href$="flux.html"] .game-stat')
        ?.textContent,
    ).toMatch(/Best: 42 pts/u);
  });

  test("lex stat: mastered word count", () => {
    expect(
      document.querySelector('a.game-card[href$="lex.html"] .game-stat')
        ?.textContent,
    ).toMatch(/2 words mastered/u);
  });
});

describe("hub: defensive click paths", () => {
  beforeEach(() => {
    resetEnv();
    init();
  });

  test("click on #hub itself (not on any actionable child) is a no-op", () => {
    const hub = document.querySelector<HTMLElement>("#hub");
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    hub?.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  test("click on a card with empty href bails out (no overlay, no pressed)", async () => {
    const card = document.querySelector<HTMLAnchorElement>(
      'a.game-card[href$="flux.html"]',
    );
    card?.setAttribute("href", "");
    card?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 120));
    expect(document.querySelector(".page-transition")).toBeNull();
    expect(card?.classList.contains("pressed")).toBe(false);
  });
});

describe("hub: no #hub element — render is a no-op, no throw", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.body.innerHTML = `
      <button id="theme-btn"></button>
      <span class="hub-icon-slot"></span>
    `;
  });

  test("init does not throw without #hub", () => {
    expect(() => init()).not.toThrow();
  });
});
