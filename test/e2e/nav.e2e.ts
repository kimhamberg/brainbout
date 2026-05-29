import { expect, type Page, test } from "@playwright/test";

/**
 * Hook console + page errors and failing requests; flush via `expectClean`.
 */
function attachErrorTrap(page: Page): {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
} {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => {
    pageErrors.push(err.message);
  });
  page.on("requestfailed", (req) => {
    if (req.failure()?.errorText === "net::ERR_ABORTED") return;
    failedRequests.push(`${req.method()} ${req.url()}`);
  });
  return { consoleErrors, pageErrors, failedRequests };
}

function expectClean(t: {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
}): void {
  expect(t.pageErrors, "uncaught errors").toEqual([]);
  expect(t.consoleErrors, "console.error").toEqual([]);
  expect(t.failedRequests, "failed network requests").toEqual([]);
}

test.describe("hub (Verdant home)", () => {
  test("shows the Walk CTA + three read-only zone rows; no retired surfaces", async ({
    page,
  }) => {
    const trap = attachErrorTrap(page);
    await page.goto("/");

    const cta = page.locator("a.walk-cta");
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", /games\/verdant-walk\.html$/u);
    await expect(cta).toContainText(/Tend the Hollow/u);

    await expect(page.locator(".game-card.zone-row")).toHaveCount(3);
    await expect(page.locator("a.game-card")).toHaveCount(0); // rows are read-only
    await expect(page.locator("a.daily-cta, a.cycle-cta")).toHaveCount(0);
    expectClean(trap);
  });

  test("a stage chip opens its evidence popover", async ({ page }) => {
    const trap = attachErrorTrap(page);
    await page.goto("/");
    await page.locator('.stage-chip[data-game="lex"]').click();
    await expect(page.locator(".stage-popover")).toBeVisible();
    await expect(page.locator(".stage-popover .stage-row")).toHaveCount(3);
    expectClean(trap);
  });

  test("theme toggle persists across navigation to the Walk", async ({
    page,
  }) => {
    const trap = attachErrorTrap(page);
    await page.goto("/");
    const initial = await page.evaluate(
      () => document.documentElement.dataset.theme,
    );
    await page.locator("#theme-btn").click();
    const toggled = await page.evaluate(
      () => document.documentElement.dataset.theme,
    );
    expect(toggled).not.toBe(initial);
    await page.goto("/games/verdant-walk.html");
    const onWalk = await page.evaluate(
      () => document.documentElement.dataset.theme,
    );
    expect(onWalk).toBe(toggled);
    expectClean(trap);
  });
});

test("hub → Walk navigates, mounts the first zone, then returns home", async ({
  page,
}) => {
  const trap = attachErrorTrap(page);
  await page.goto("/");
  await page.locator("a.walk-cta").click();
  await page.waitForURL(/games\/verdant-walk\.html$/u, { timeout: 5000 });
  // the Grove leg mounts (its probe is published once the first resident shows)
  await page.waitForFunction(
    () =>
      !!(window as unknown as { __grove?: { answer?: string } }).__grove
        ?.answer,
    { timeout: 15_000 },
  );
  await page.goBack();
  await expect(page.locator("a.walk-cta")).toBeVisible();
  expectClean(trap);
});

test("the Walk deep-links and mounts directly", async ({ page }) => {
  const trap = attachErrorTrap(page);
  await page.goto("/games/verdant-walk.html");
  await expect(page.locator("#stage")).toBeVisible({ timeout: 15_000 });
  expectClean(trap);
});
