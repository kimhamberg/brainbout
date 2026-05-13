import { beforeAll, describe, expect, test } from "bun:test";

describe("hub", () => {
  beforeAll(async () => {
    localStorage.clear();
    sessionStorage.clear();
    document.body.innerHTML = `
      <div id="app" class="app">
        <header class="hub-header">
          <button id="theme-btn" aria-label="Toggle theme"></button>
          <span class="hub-icon-slot"></span>
        </header>
        <main id="hub"></main>
      </div>
    `;
    await import("../src/hub");
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
    const games = Array.from(chips).map((c) => c.dataset.game);
    expect(games).toEqual(["crown", "flux", "lex"]);
  });

  test("hub brain icon is mounted", () => {
    expect(document.querySelector(".hub-icon-slot .hub-icon")).not.toBeNull();
  });

  test("theme toggle button has SVG injected", () => {
    expect(document.querySelector("#theme-btn svg")).not.toBeNull();
  });

  test("clicking a stage chip opens popover; outside click dismisses", async () => {
    const chip = document.querySelector<HTMLButtonElement>(
      '.stage-chip[data-game="flux"]',
    );
    expect(chip).not.toBeNull();
    chip?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.querySelector(".stage-popover")).not.toBeNull();

    // Wait one rAF tick — handler is attached on next frame
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.querySelector(".stage-popover")).toBeNull();
  });

  test("game-card anchor click sets pressed class and triggers nav overlay", () => {
    const card = document.querySelector<HTMLAnchorElement>(
      'a.game-card[href$="crown.html"]',
    );
    expect(card).not.toBeNull();
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    card?.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(card?.classList.contains("pressed")).toBe(true);
  });
});
