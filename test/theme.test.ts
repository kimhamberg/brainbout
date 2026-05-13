import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { initTheme, toggleTheme, wireToggle } from "../src/shared/theme";

describe("theme", () => {
  let originalMatchMedia: typeof matchMedia;
  let mediaListeners: Array<(e: { matches: boolean }) => void> = [];

  beforeEach(() => {
    originalMatchMedia = globalThis.matchMedia;
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.body.innerHTML = "";
    mediaListeners = [];
  });

  afterEach(() => {
    globalThis.matchMedia = originalMatchMedia;
  });

  const noop = (): void => undefined;
  function stubMatchMedia(matches: boolean): void {
    globalThis.matchMedia = (() => ({
      matches,
      addEventListener: (
        _event: string,
        cb: (e: { matches: boolean }) => void,
      ) => {
        mediaListeners.push(cb);
      },
      removeEventListener: noop,
    })) as unknown as typeof matchMedia;
  }

  function emitMediaChange(matches: boolean): void {
    for (const cb of mediaListeners) cb({ matches });
  }

  it("defaults to frappe when OS prefers dark", () => {
    stubMatchMedia(false);
    initTheme();
    expect(document.documentElement.dataset.theme).toBe("frappe");
  });

  it("defaults to latte when OS prefers light", () => {
    stubMatchMedia(true);
    initTheme();
    expect(document.documentElement.dataset.theme).toBe("latte");
  });

  it("uses localStorage override when set", () => {
    localStorage.setItem("theme", "latte");
    stubMatchMedia(false);
    initTheme();
    expect(document.documentElement.dataset.theme).toBe("latte");
  });

  it("toggleTheme flips from frappe to latte", () => {
    stubMatchMedia(false);
    initTheme();
    toggleTheme();
    expect(document.documentElement.dataset.theme).toBe("latte");
    expect(localStorage.getItem("theme")).toBe("latte");
  });

  it("toggleTheme flips from latte to frappe", () => {
    localStorage.setItem("theme", "latte");
    stubMatchMedia(true);
    initTheme();
    toggleTheme();
    expect(document.documentElement.dataset.theme).toBe("frappe");
    expect(localStorage.getItem("theme")).toBe("frappe");
  });

  it("matchMedia 'change' switches theme when no user override is set", () => {
    stubMatchMedia(false);
    initTheme();
    expect(document.documentElement.dataset.theme).toBe("frappe");
    emitMediaChange(true);
    expect(document.documentElement.dataset.theme).toBe("latte");
    emitMediaChange(false);
    expect(document.documentElement.dataset.theme).toBe("frappe");
  });

  it("matchMedia 'change' is ignored when the user has saved a preference", () => {
    localStorage.setItem("theme", "frappe");
    stubMatchMedia(false);
    initTheme();
    expect(document.documentElement.dataset.theme).toBe("frappe");
    emitMediaChange(true);
    expect(document.documentElement.dataset.theme).toBe("frappe");
  });
});

describe("wireToggle", () => {
  let originalMatchMedia: typeof matchMedia;

  beforeEach(() => {
    originalMatchMedia = globalThis.matchMedia;
    localStorage.clear();
    document.documentElement.dataset.theme = "frappe";
  });

  afterEach(() => {
    globalThis.matchMedia = originalMatchMedia;
  });

  function stubMatchMedia(matches: boolean): void {
    globalThis.matchMedia = (() => ({
      matches,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof matchMedia;
  }

  it("no-ops when #theme-btn is missing", () => {
    document.body.innerHTML = "";
    expect(() => wireToggle()).not.toThrow();
  });

  it("injects icon SVG and clicking the button toggles the theme", () => {
    stubMatchMedia(false);
    document.body.innerHTML = `<button id="theme-btn"></button>`;
    wireToggle();
    const btn = document.querySelector<HTMLElement>("#theme-btn");
    expect(btn?.querySelector("svg")).not.toBeNull();
    btn?.click();
    expect(document.documentElement.dataset.theme).toBe("latte");
    expect(localStorage.getItem("theme")).toBe("latte");
    // Icon also updates
    btn?.click();
    expect(document.documentElement.dataset.theme).toBe("frappe");
  });

  it("clicking the toggle a second time flips back to the original theme + icon", () => {
    stubMatchMedia(false);
    document.body.innerHTML = `<button id="theme-btn"></button>`;
    wireToggle();
    const btn = document.querySelector<HTMLElement>("#theme-btn");
    btn?.click();
    expect(document.documentElement.dataset.theme).toBe("latte");
    btn?.click();
    expect(document.documentElement.dataset.theme).toBe("frappe");
    // Icon SVG re-rendered after each toggle (no exception, has a child <svg>)
    expect(btn?.querySelector("svg")).not.toBeNull();
  });
});
