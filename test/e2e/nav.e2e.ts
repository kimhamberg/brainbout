import { expect, type Page, test } from "@playwright/test";

/**
 * Hook console + page errors and failing requests; flush via `expectClean(page)`
 * inside each test. Anything goes wrong → the test fails with context.
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
    // Ignore well-known noisy aborts (e.g., font preconnect)
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

test.describe("hub", () => {
  test("renders three game cards with correct hrefs", async ({ page }) => {
    const trap = attachErrorTrap(page);
    await page.goto("/");
    const cards = page.locator("a.game-card");
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(0)).toHaveAttribute("href", /games\/crown\.html$/u);
    await expect(cards.nth(1)).toHaveAttribute("href", /games\/flux\.html$/u);
    await expect(cards.nth(2)).toHaveAttribute("href", /games\/lex\.html$/u);
    expectClean(trap);
  });

  test("theme toggle persists across navigation", async ({ page }) => {
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
    await page.goto("/games/crown.html");
    const onGame = await page.evaluate(
      () => document.documentElement.dataset.theme,
    );
    expect(onGame).toBe(toggled);
    expectClean(trap);
  });
});

for (const game of ["crown", "flux", "lex"] as const) {
  test(`hub → ${game} navigates and loads`, async ({ page }) => {
    const trap = attachErrorTrap(page);
    await page.goto("/");
    await page.locator(`a.game-card[href$="${game}.html"]`).click();
    await page.waitForURL(new RegExp(`games/${game}\\.html$`, "u"), {
      timeout: 5000,
    });
    await expect(page).toHaveTitle(new RegExp(game, "iu"));
    await expect(page.locator("#game")).toBeVisible();
    expectClean(trap);
  });
}

test("back navigation returns to hub", async ({ page }) => {
  const trap = attachErrorTrap(page);
  await page.goto("/");
  await page.locator('a.game-card[href$="flux.html"]').click();
  await page.waitForURL(/games\/flux\.html$/u, { timeout: 5000 });
  await page.goBack();
  await expect(page.locator("a.game-card")).toHaveCount(3);
  expectClean(trap);
});

test("game pages load directly (deep link)", async ({ page }) => {
  const trap = attachErrorTrap(page);
  for (const game of ["crown", "flux", "lex"] as const) {
    await page.goto(`/games/${game}.html`);
    await expect(page).toHaveTitle(new RegExp(game, "iu"));
    await expect(page.locator("#game")).toBeVisible();
  }
  expectClean(trap);
});
