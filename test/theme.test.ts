import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { initTheme, toggleTheme } from "../src/shared/theme";

describe("theme", () => {
  let originalMatchMedia: typeof matchMedia;

  beforeEach(() => {
    originalMatchMedia = globalThis.matchMedia;
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    globalThis.matchMedia = originalMatchMedia;
  });

  const noop = (): void => undefined;
  function stubMatchMedia(matches: boolean): void {
    globalThis.matchMedia = (() => ({
      matches,
      addEventListener: noop,
      removeEventListener: noop,
    })) as unknown as typeof matchMedia;
  }

  it("defaults to frappe when OS prefers dark", () => {
    stubMatchMedia(false);
    initTheme();
    expect(document.documentElement.dataset["theme"]).toBe("frappe");
  });

  it("defaults to latte when OS prefers light", () => {
    stubMatchMedia(true);
    initTheme();
    expect(document.documentElement.dataset["theme"]).toBe("latte");
  });

  it("uses localStorage override when set", () => {
    localStorage.setItem("theme", "latte");
    stubMatchMedia(false);
    initTheme();
    expect(document.documentElement.dataset["theme"]).toBe("latte");
  });

  it("toggleTheme flips from frappe to latte", () => {
    stubMatchMedia(false);
    initTheme();
    toggleTheme();
    expect(document.documentElement.dataset["theme"]).toBe("latte");
    expect(localStorage.getItem("theme")).toBe("latte");
  });

  it("toggleTheme flips from latte to frappe", () => {
    localStorage.setItem("theme", "latte");
    stubMatchMedia(true);
    initTheme();
    toggleTheme();
    expect(document.documentElement.dataset["theme"]).toBe("frappe");
    expect(localStorage.getItem("theme")).toBe("frappe");
  });
});
