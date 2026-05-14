import { beforeEach, describe, expect, test } from "bun:test";
import {
  BRAIN_PATHS,
  GAME_ICONS,
  iconSvg,
  mountAppIcon,
  mountHubIcon,
  mountQuitButton,
} from "../src/shared/icons";
import { GAMES } from "../src/shared/progress";

describe("iconSvg", () => {
  test("defaults: size=24, stroke=currentColor, strokeWidth=2", () => {
    const out = iconSvg("<path/>");
    expect(out).toContain('width="24"');
    expect(out).toContain('height="24"');
    expect(out).toContain('viewBox="0 0 24 24"');
    expect(out).toContain('stroke="currentColor"');
    expect(out).toContain('stroke-width="2"');
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(out).toContain('fill="none"');
    expect(out).toContain('stroke-linecap="round"');
    expect(out).toContain('stroke-linejoin="round"');
    expect(out).toContain("<path/>");
  });

  test("overrides size / stroke / strokeWidth", () => {
    const out = iconSvg("<path/>", {
      size: 48,
      stroke: "red",
      strokeWidth: 3,
    });
    expect(out).toContain('width="48"');
    expect(out).toContain('height="48"');
    expect(out).toContain('stroke="red"');
    expect(out).toContain('stroke-width="3"');
  });

  test("paths are embedded verbatim", () => {
    const out = iconSvg('<rect x="1" y="2"/>');
    expect(out).toContain('<rect x="1" y="2"/>');
  });
});

describe("BRAIN_PATHS / GAME_ICONS", () => {
  test("BRAIN_PATHS contains 8 path elements (Lucide brain)", () => {
    expect(BRAIN_PATHS.match(/<path/gu)?.length).toBe(8);
  });

  for (const g of GAMES) {
    test(`GAME_ICONS.${g} is a valid SVG at size 18`, () => {
      const svg = GAME_ICONS[g];
      expect(svg).toContain("<svg ");
      expect(svg).toContain('width="18"');
      expect(svg).toContain('height="18"');
      expect(svg).toContain("</svg>");
      expect(svg).toContain("<path");
    });
  }
});

describe("mountAppIcon", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div class="app-title"></div>';
  });

  test("inserts SVG at start of .app-title slot", () => {
    mountAppIcon("flux", "red");
    const slot = document.querySelector(".app-title");
    const svg = slot?.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("width")).toBe("20");
    expect(svg?.getAttribute("stroke")).toBe("red");
  });

  test("no-op when slot missing", () => {
    document.body.innerHTML = "";
    expect(() => mountAppIcon("crown", "blue")).not.toThrow();
  });

  test("each game uses its own paths", () => {
    for (const g of GAMES) {
      document.body.innerHTML = '<div class="app-title"></div>';
      mountAppIcon(g, "currentColor");
      const svg = document.querySelector(".app-title svg");
      expect(svg).not.toBeNull();
    }
  });
});

describe("mountQuitButton", () => {
  beforeEach(() => {
    document.body.innerHTML = '<button id="quit-btn"></button>';
  });

  test("injects 16px SVG into the button", () => {
    mountQuitButton(() => {});
    const svg = document.querySelector("#quit-btn svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("width")).toBe("16");
  });

  test("attaches click handler to the button", () => {
    let clicks = 0;
    mountQuitButton(() => {
      clicks++;
    });
    document.getElementById("quit-btn")?.dispatchEvent(new MouseEvent("click"));
    expect(clicks).toBe(1);
  });

  test("no-op when #quit-btn is missing", () => {
    document.body.innerHTML = "";
    expect(() => mountQuitButton(() => {})).not.toThrow();
  });
});

describe("mountHubIcon", () => {
  beforeEach(() => {
    document.body.innerHTML = '<span class="hub-icon-slot"></span>';
  });

  test("inserts hub icon with gradient stops", () => {
    mountHubIcon();
    const slot = document.querySelector(".hub-icon-slot");
    expect(slot?.innerHTML).toContain("hub-icon");
    expect(slot?.innerHTML).toContain('id="hub-grad"');
    expect(slot?.innerHTML).toContain("var(--ctp-green)");
    expect(slot?.innerHTML).toContain("var(--ctp-blue)");
    expect(slot?.innerHTML).toContain("var(--ctp-red)");
    // happy-dom normalises self-closing paths to <path></path>;
    // assert via parsed DOM instead of raw HTML compare.
    expect(slot?.querySelectorAll("path")).toHaveLength(8);
  });

  test("no-op when slot missing", () => {
    document.body.innerHTML = "";
    expect(() => mountHubIcon()).not.toThrow();
  });
});
