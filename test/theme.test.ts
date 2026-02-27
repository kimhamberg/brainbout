// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("theme", () => {
  let matchMediaMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");

    matchMediaMock = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("matchMedia", matchMediaMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults to frappe when OS prefers dark", async () => {
    matchMediaMock.mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
    });
    const { initTheme } = await import("../src/shared/theme");
    initTheme();
    expect(document.documentElement.dataset.theme).toBe("frappe");
  });

  it("defaults to latte when OS prefers light", async () => {
    matchMediaMock.mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
    });

    vi.resetModules();
    const { initTheme } = await import("../src/shared/theme");
    initTheme();
    expect(document.documentElement.dataset.theme).toBe("latte");
  });

  it("uses localStorage override when set", async () => {
    localStorage.setItem("theme", "latte");
    matchMediaMock.mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
    });

    vi.resetModules();
    const { initTheme } = await import("../src/shared/theme");
    initTheme();
    expect(document.documentElement.dataset.theme).toBe("latte");
  });

  it("toggleTheme flips from frappe to latte", async () => {
    vi.resetModules();
    matchMediaMock.mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
    });
    const { initTheme, toggleTheme } = await import("../src/shared/theme");
    initTheme();
    toggleTheme();
    expect(document.documentElement.dataset.theme).toBe("latte");
    expect(localStorage.getItem("theme")).toBe("latte");
  });

  it("toggleTheme flips from latte to frappe", async () => {
    localStorage.setItem("theme", "latte");
    vi.resetModules();
    matchMediaMock.mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
    });
    const { initTheme, toggleTheme } = await import("../src/shared/theme");
    initTheme();
    toggleTheme();
    expect(document.documentElement.dataset.theme).toBe("frappe");
    expect(localStorage.getItem("theme")).toBe("frappe");
  });
});
