import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { init } from "../src/hub";

// Replace setTimeout/clearTimeout with a deterministic virtual-time fake.
// hub.ts schedules a nested press(80ms)→fallback(600ms) pair; tests sleep
// 120/700/750ms to await those. Real timers + scaling were flaky under
// concurrent load (mutation runs) because the press-to-fallback gap and the
// test-wait gap were within scheduler jitter. The fake fires queued callbacks
// in virtual-time order on each microtask drain, so ordering is exact and
// total wall-clock cost is microtasks-only.
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
type FakeEntry = { at: number; id: number; fn: () => void };
let virtualNow = 0;
let nextTimerId = 1;
const timerQueue: FakeEntry[] = [];
let pumpScheduled = false;

function schedulePump(): void {
  if (pumpScheduled) return;
  pumpScheduled = true;
  queueMicrotask(() => {
    pumpScheduled = false;
    if (timerQueue.length === 0) return;
    timerQueue.sort((a, b) => a.at - b.at);
    const next = timerQueue.shift();
    if (next === undefined) return;
    virtualNow = next.at;
    try {
      next.fn();
    } finally {
      if (timerQueue.length > 0) schedulePump();
    }
  });
}

beforeAll(() => {
  globalThis.setTimeout = ((fn: () => void, ms?: number) => {
    const id = nextTimerId++;
    timerQueue.push({ at: virtualNow + Number(ms ?? 0), id, fn });
    schedulePump();
    return id as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((id: ReturnType<typeof setTimeout>) => {
    const idx = timerQueue.findIndex((e) => e.id === (id as unknown as number));
    if (idx >= 0) timerQueue.splice(idx, 1);
  }) as typeof clearTimeout;
});

afterAll(() => {
  globalThis.setTimeout = realSetTimeout;
  globalThis.clearTimeout = realClearTimeout;
});

beforeEach(() => {
  virtualNow = 0;
  timerQueue.length = 0;
});

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

  test("dismiss listener is removed with matching capture flag + event name", async () => {
    // Spy on document add/remove so we can confirm the (event, fn, capture)
    // tuple used on remove exactly matches the one used on add. A mutation
    // that flips the capture flag (true→false) or the event name ("click"→"")
    // would leak the listener — count remains > 0 after dismissal.
    const adds: Array<{
      ev: string;
      fn: EventListenerOrEventListenerObject;
      cap: unknown;
    }> = [];
    const removes: Array<{
      ev: string;
      fn: EventListenerOrEventListenerObject;
      cap: unknown;
    }> = [];
    const realAdd = document.addEventListener.bind(document);
    const realRemove = document.removeEventListener.bind(document);
    document.addEventListener = ((
      ev: string,
      fn: EventListenerOrEventListenerObject,
      opts?: unknown,
    ) => {
      adds.push({ ev, fn, cap: opts });
      return realAdd(ev, fn, opts as never);
    }) as typeof document.addEventListener;
    document.removeEventListener = ((
      ev: string,
      fn: EventListenerOrEventListenerObject,
      opts?: unknown,
    ) => {
      removes.push({ ev, fn, cap: opts });
      return realRemove(ev, fn, opts as never);
    }) as typeof document.removeEventListener;
    try {
      document
        .querySelector<HTMLButtonElement>('.stage-chip[data-game="flux"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      // Find the click-outside add/remove pair for the popover dismiss.
      const dismissAdd = adds.find((a) => a.ev === "click" && a.cap === true);
      expect(dismissAdd).toBeDefined();
      const matched = removes.find(
        (r) =>
          r.ev === dismissAdd!.ev &&
          r.fn === dismissAdd!.fn &&
          r.cap === dismissAdd!.cap,
      );
      expect(matched).toBeDefined();
    } finally {
      document.addEventListener = realAdd;
      document.removeEventListener = realRemove;
    }
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
  beforeEach(() => {
    resetEnv();
    init();
    navCalls.length = 0;
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

describe("hub: ?completed= bumps the session counter", () => {
  beforeEach(() => {
    resetEnv();
    window.location.search = "?completed=lex";
    init();
  });

  test("URL is cleaned after render", () => {
    expect(window.location.search).toBe("");
  });

  test("each game completion increments total-sessions", () => {
    expect(localStorage.getItem("brainbout:total-sessions")).toBe("1");
  });

  test("all 3 cards remain replayable anchors (no done state)", () => {
    expect(document.querySelectorAll("#hub a.game-card")).toHaveLength(3);
    expect(document.querySelectorAll("#hub .game-card.done")).toHaveLength(0);
    expect(document.querySelector(".done-badge")).toBeNull();
  });

  test("footer shows total sessions completed", () => {
    expect(document.querySelector(".hub-footer")?.textContent).toMatch(
      /1 session completed/u,
    );
  });

  test("no 'New Session' button is rendered", () => {
    expect(document.querySelector(".new-session-btn")).toBeNull();
  });
});

describe("hub: bogus ?completed= value is ignored", () => {
  beforeEach(() => {
    resetEnv();
    window.location.search = "?completed=notagame";
    init();
  });

  test("counter is not bumped", () => {
    expect(localStorage.getItem("brainbout:total-sessions")).toBeNull();
  });

  test("all 3 cards remain anchors", () => {
    expect(document.querySelectorAll("#hub a.game-card")).toHaveLength(3);
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
    localStorage.setItem("brainbout:best:crown", "120");
    localStorage.setItem("brainbout:best:flux", "42");
    // Mastered = stability ≥ 30 days in FSRS-lite.
    localStorage.setItem(
      "brainbout:lex:no:apple",
      JSON.stringify({
        s: 31,
        d: 5,
        lastReview: "",
        nextDue: "",
        lapses: 0,
        reps: 1,
      }),
    );
    localStorage.setItem(
      "brainbout:lex:no:banana",
      JSON.stringify({
        s: 45,
        d: 5,
        lastReview: "",
        nextDue: "",
        lapses: 0,
        reps: 1,
      }),
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

  test("crown stat: best score", () => {
    expect(
      document.querySelector('a.game-card[href$="crown.html"] .game-stat')
        ?.textContent,
    ).toMatch(/Best: 120 pts/u);
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

describe("hub: singular vs plural game-stat wording", () => {
  beforeEach(() => {
    resetEnv();
  });

  test("crown stat: best score 1 still says 'pts'", () => {
    localStorage.setItem("brainbout:best:crown", "1");
    init();
    const stat = document.querySelector(
      'a.game-card[href$="crown.html"] .game-stat',
    )?.textContent;
    expect(stat).toBe("Best: 1 pts");
  });

  test("lex: exactly 1 mastered uses 'word' (singular)", () => {
    localStorage.setItem(
      "brainbout:lex:no:apple",
      JSON.stringify({
        s: 31,
        d: 5,
        lastReview: "",
        nextDue: "",
        lapses: 0,
        reps: 1,
      }),
    );
    init();
    const stat = document.querySelector(
      'a.game-card[href$="lex.html"] .game-stat',
    )?.textContent;
    expect(stat).toBe("1 word mastered");
  });
});

describe("hub: stage popover positioning + accent", () => {
  beforeEach(() => {
    resetEnv();
    init();
  });

  test("popover style sets --accent to the game's accent", () => {
    document
      .querySelector<HTMLButtonElement>('.stage-chip[data-game="flux"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const popover = document.querySelector<HTMLElement>(".stage-popover");
    expect(popover).not.toBeNull();
    expect(popover?.style.getPropertyValue("--accent")).toBe("var(--ctp-red)");
  });

  test("popover has top + right inline styles (positioned, not unset)", () => {
    document
      .querySelector<HTMLButtonElement>('.stage-chip[data-game="crown"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const popover = document.querySelector<HTMLElement>(".stage-popover");
    expect(popover?.style.top.endsWith("px")).toBe(true);
    expect(popover?.style.right.endsWith("px")).toBe(true);
  });

  test("popover top arithmetic is `rect.bottom - hubRect.top + 4` (not `+`)", () => {
    const chip = document.querySelector<HTMLButtonElement>(
      '.stage-chip[data-game="crown"]',
    );
    const hub = document.querySelector<HTMLElement>("#hub");
    const stubChip = (): DOMRect =>
      ({
        bottom: 100,
        top: 80,
        left: 0,
        right: 0,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    const stubHub = (): DOMRect =>
      ({
        bottom: 200,
        top: 10,
        left: 0,
        right: 50,
        x: 0,
        y: 0,
        width: 50,
        height: 200,
        toJSON: () => ({}),
      }) as DOMRect;
    if (chip) chip.getBoundingClientRect = stubChip;
    if (hub) hub.getBoundingClientRect = stubHub;
    chip?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const popover = document.querySelector<HTMLElement>(".stage-popover");
    // 100 - 10 + 4 = 94. Mutation `bottom + top + 4` would give 114.
    expect(popover?.style.top).toBe("94px");
  });

  test("popover right arithmetic is `hubRect.right - rect.right` (not `+`)", () => {
    const chip = document.querySelector<HTMLButtonElement>(
      '.stage-chip[data-game="crown"]',
    );
    const hub = document.querySelector<HTMLElement>("#hub");
    if (chip)
      chip.getBoundingClientRect = (): DOMRect =>
        ({
          bottom: 0,
          top: 0,
          left: 0,
          right: 30,
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          toJSON: () => ({}),
        }) as DOMRect;
    if (hub)
      hub.getBoundingClientRect = (): DOMRect =>
        ({
          bottom: 0,
          top: 0,
          left: 0,
          right: 100,
          x: 0,
          y: 0,
          width: 100,
          height: 0,
          toJSON: () => ({}),
        }) as DOMRect;
    chip?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const popover = document.querySelector<HTMLElement>(".stage-popover");
    // 100 - 30 = 70. Mutation `+` would give 130.
    expect(popover?.style.right).toBe("70px");
  });
});

describe("hub: popover dismiss handler logic (direct invoke, no DOM leaks)", () => {
  test("the click-outside handler does NOT dismiss when target is inside the popover", async () => {
    resetEnv();
    // Capture the click-outside handler registered inside the rAF callback by
    // spying on document.addEventListener. Invoking it directly with target =
    // a child of the popover lets us verify the `!popover.contains(target)`
    // gate without any cross-test event propagation interference.
    const realAdd = document.addEventListener.bind(document);
    let captured: ((ev: MouseEvent) => void) | null = null;
    document.addEventListener = ((
      ev: string,
      fn: EventListenerOrEventListenerObject,
      opts?: unknown,
    ) => {
      if (ev === "click" && opts === true && typeof fn === "function") {
        captured = fn as (ev: MouseEvent) => void;
      }
      return realAdd(ev, fn, opts as never);
    }) as typeof document.addEventListener;
    try {
      init();
      document
        .querySelector<HTMLButtonElement>('.stage-chip[data-game="crown"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const popover = document.querySelector<HTMLElement>(".stage-popover");
      expect(popover).not.toBeNull();
      expect(captured).not.toBeNull();
      const innerChild =
        popover?.querySelector<HTMLElement>(".stage-row") ?? popover;
      // Invoke the captured handler directly with target = inner child.
      (captured as unknown as (ev: { target: Node }) => void)({
        target: innerChild as Node,
      });
      // The popover should NOT have been removed by this invocation.
      expect(popover?.isConnected).toBe(true);
    } finally {
      document.addEventListener = realAdd;
    }
  });
});

describe("hub: ?completed= history cleanup passes empty title", () => {
  test("history.replaceState is called with title === ''", () => {
    const spy: Array<[unknown, unknown, unknown]> = [];
    const orig = window.history.replaceState.bind(window.history);
    window.history.replaceState = ((
      state: unknown,
      title: unknown,
      url: unknown,
    ) => {
      spy.push([state, title, url]);
      return orig(
        state as Parameters<History["replaceState"]>[0],
        title as string,
        url as string,
      );
    }) as typeof window.history.replaceState;
    try {
      resetEnv();
      window.location.search = "?completed=lex";
      init();
      expect(spy.length).toBeGreaterThan(0);
      expect(spy[0]?.[1]).toBe("");
    } finally {
      window.history.replaceState = orig;
    }
  });
});

describe("hub: card click sets overlay accent + .app exiting", () => {
  beforeEach(() => {
    resetEnv();
    init();
    navCalls.length = 0;
  });

  test("after press delay, .app gains 'exiting' class", async () => {
    document
      .querySelector<HTMLAnchorElement>('a.game-card[href$="crown.html"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 120));
    expect(document.querySelector(".app")?.classList.contains("exiting")).toBe(
      true,
    );
  });

  test("overlay carries --transition-color from the card's --accent", async () => {
    document
      .querySelector<HTMLAnchorElement>('a.game-card[href$="flux.html"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 120));
    const overlay = document.querySelector<HTMLElement>(".page-transition");
    expect(overlay?.style.getPropertyValue("--transition-color")).toBe(
      "var(--ctp-red)",
    );
  });
});

describe("hub: advance/retreat with malformed data-game", () => {
  beforeEach(() => {
    resetEnv();
    init();
  });

  test("advance button with empty data-game is a no-op (no stage change)", () => {
    // Inject a counterfeit advance button with empty data-game and click it
    const hub = document.querySelector("#hub");
    const fake = document.createElement("button");
    fake.className = "advance-btn";
    fake.setAttribute("data-game", "");
    hub?.appendChild(fake);
    fake.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    // Nothing in localStorage carries a `brainbout:stage:` prefix — neither
    // a real game id nor the empty-string id that would slip through a `||`
    // mutation of the guard.
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) ?? "";
      expect(k.startsWith("brainbout:stage:")).toBe(false);
    }
  });

  test("retreat button with empty data-game is a no-op (no stage change)", () => {
    const hub = document.querySelector("#hub");
    const fake = document.createElement("button");
    fake.className = "retreat-btn";
    fake.setAttribute("data-game", "");
    hub?.appendChild(fake);
    fake.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) ?? "";
      expect(k.startsWith("brainbout:stage:")).toBe(false);
    }
  });

  test("stage chip with unknown game id is a no-op (no popover)", () => {
    const hub = document.querySelector("#hub");
    const fake = document.createElement("button");
    fake.className = "stage-chip";
    fake.setAttribute("data-game", "notagame");
    hub?.appendChild(fake);
    fake.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.querySelector(".stage-popover")).toBeNull();
  });

  test("stage chip with unknown game id does NOT trigger a JS error on the popover render path", () => {
    // Capture happy-dom's listener-error reporting via console.error. The
    // popover-creation path crashes with `Cannot read properties of undefined`
    // when the `isKnownGame` guard is mutated away, even though the popover
    // never makes it into the DOM (dispatchEvent swallows listener throws).
    const realErr = console.error;
    let errorMessages = "";
    console.error = (...args: unknown[]): void => {
      errorMessages += `${args.map(String).join(" ")}\n`;
    };
    try {
      const hub = document.querySelector("#hub");
      const fake = document.createElement("button");
      fake.className = "stage-chip";
      fake.setAttribute("data-game", "notagame");
      hub?.appendChild(fake);
      fake.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(errorMessages).not.toMatch(/Cannot read properties of undefined/u);
      expect(errorMessages).not.toMatch(/TypeError/u);
    } finally {
      console.error = realErr;
    }
  });

  test("advance button with empty data-game does NOT trigger a console.error", () => {
    // Mutation that removes the `game !== ""` guard makes advance("") run,
    // which calls localStorage with a malformed key — observable through
    // unexpected state changes already covered above, and additionally
    // verified here through the absence of TypeError reports.
    const realErr = console.error;
    let errorMessages = "";
    console.error = (...args: unknown[]): void => {
      errorMessages += `${args.map(String).join(" ")}\n`;
    };
    try {
      const hub = document.querySelector("#hub");
      const fake = document.createElement("button");
      fake.className = "advance-btn";
      fake.setAttribute("data-game", "");
      hub?.appendChild(fake);
      fake.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      // The guard prevents `advance("")` which would set `brainbout:stage:` key.
      // With the guard mutated, advance("") runs and the stage:1 default loads
      // for the empty key — but nothing throws, so this asserts the side-effect:
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k !== null) keys.push(k);
      }
      expect(keys.filter((k) => k.startsWith("brainbout:stage:"))).toEqual([]);
      expect(errorMessages).toBe("");
    } finally {
      console.error = realErr;
    }
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

  test("click on a card with no href attribute (getAttribute=null) bails out", async () => {
    const card = document.querySelector<HTMLAnchorElement>(
      'a.game-card[href$="flux.html"]',
    );
    card?.removeAttribute("href");
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
