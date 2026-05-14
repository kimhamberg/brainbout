import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PAGES: Array<{ name: string; url: string; ready: string }> = [
  { name: "hub", url: "/", ready: "a.game-card" },
  { name: "crown", url: "/games/crown.html", ready: ".cg-wrap" },
  { name: "flux", url: "/games/flux.html", ready: ".flux-btn" },
  { name: "lex", url: "/games/lex.html", ready: ".cloze-input" },
];

for (const { name, url, ready } of PAGES) {
  test(`${name}: no critical / serious WCAG 2.1 a11y violations`, async ({
    page,
  }) => {
    await page.goto(url);
    await page.locator(ready).first().waitFor({ timeout: 15_000 });
    // Fast-forward any running animations so axe computes final-state
    // contrast, not a transient opacity < 1 mid-fade-in.
    await page.evaluate(() => {
      for (const a of document.getAnimations()) {
        try {
          a.finish();
        } catch {
          // Infinite animations cannot finish; pause them so contrast checks
          // see their final-keyframe paint.
          a.pause();
        }
      }
    });
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    if (blocking.length > 0) {
      // Surface details in the failure message.
      const summary = blocking
        .map((v) => {
          const nodeInfo = v.nodes
            .map(
              (n) =>
                `    target: ${n.target.join(" ")}\n    ${n.failureSummary ?? ""}`,
            )
            .join("\n");
          return `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node${v.nodes.length === 1 ? "" : "s"})\n${nodeInfo}`;
        })
        .join("\n");
      throw new Error(`a11y violations on ${name}:\n${summary}`);
    }
    expect(blocking).toEqual([]);
  });
}
