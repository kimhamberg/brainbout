import { expect, type Page, test } from "@playwright/test";

/* Same console/network trap pattern as nav.e2e.ts */
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

/* ─── Flux ─────────────────────────────────────────────────────────────── */

test.describe("Flux gameplay", () => {
  test("renders timer + rule cue + two answer buttons + score 0", async ({
    page,
  }) => {
    const trap = attachErrorTrap(page);
    await page.goto("/games/flux.html");
    await expect(page.locator(".timer-text")).toBeVisible();
    await expect(page.locator(".rule-cue")).toBeVisible();
    await expect(page.locator(".flux-btn[data-side='left']")).toBeVisible();
    await expect(page.locator(".flux-btn[data-side='right']")).toBeVisible();
    await expect(page.locator(".score-display")).toContainText(/Score: 0/u);
    expectClean(trap);
  });

  test("clicking a button registers a response and triggers feedback class", async ({
    page,
  }) => {
    const trap = attachErrorTrap(page);
    await page.goto("/games/flux.html");
    await page.locator(".flux-btn[data-side='left']").click();
    // After click, .flux-feedback either shows text or the body briefly gains
    // a juice class. Either way, the page should not error out.
    await page.waitForTimeout(50);
    expectClean(trap);
  });

  test("timer counts down within the first 2 seconds", async ({ page }) => {
    const trap = attachErrorTrap(page);
    await page.goto("/games/flux.html");
    await expect(page.locator(".timer-text")).toBeVisible();
    const initial = Number(
      (await page.locator(".timer-text").textContent())?.replace(
        /[^\d]/gu,
        "",
      ) ?? "0",
    );
    expect(initial).toBeGreaterThan(0);
    await page.waitForTimeout(2200);
    const later = Number(
      (await page.locator(".timer-text").textContent())?.replace(
        /[^\d]/gu,
        "",
      ) ?? "0",
    );
    expect(later).toBeLessThan(initial);
    expectClean(trap);
  });
});

/* ─── Lex ──────────────────────────────────────────────────────────────── */

test.describe("Lex gameplay", () => {
  test("renders definition cue + 4 choice buttons after dict loads", async ({
    page,
  }) => {
    const trap = attachErrorTrap(page);
    await page.goto("/games/lex.html");
    await expect(page.locator(".cue-text")).toBeVisible({ timeout: 15_000 });
    const choices = page.locator(".choice-btn");
    await expect(choices).toHaveCount(4);
    await expect(page.locator(".score-display")).toContainText(/Score:/u);
    expectClean(trap);
  });

  test("clicking a choice button immediately marks the correct answer", async ({
    page,
  }) => {
    const trap = attachErrorTrap(page);
    await page.goto("/games/lex.html");
    await expect(page.locator(".choice-btn").first()).toBeVisible({
      timeout: 15_000,
    });
    await page.locator(".choice-btn").first().click();
    // handleChoice synchronously adds .correct to the right answer's button
    // (whether the user picked it or not), then schedules nextRound. Assert
    // before that re-render can fire (~600ms on success, 1500ms on wrong).
    await expect(page.locator(".choice-btn.correct").first()).toBeVisible({
      timeout: 400,
    });
    expectClean(trap);
  });
});

/* ─── Crown ────────────────────────────────────────────────────────────── */

test.describe("Crown gameplay", () => {
  test("renders chess board, two clocks, and action buttons", async ({
    page,
  }) => {
    const trap = attachErrorTrap(page);
    await page.goto("/games/crown.html");
    await expect(page.locator(".cg-wrap")).toBeVisible({ timeout: 15_000 });
    const pieceCount = await page.locator(".cg-wrap piece").count();
    expect(pieceCount).toBeGreaterThanOrEqual(16);
    await expect(page.locator("#player-clock")).toBeVisible();
    await expect(page.locator("#engine-clock")).toBeVisible();
    await expect(page.locator("#action-resign")).toBeVisible();
    expectClean(trap);
  });

  test("resigning ends the game and shows the result panel with 'Lost'", async ({
    page,
  }) => {
    const trap = attachErrorTrap(page);
    await page.goto("/games/crown.html");
    await expect(page.locator(".cg-wrap")).toBeVisible({ timeout: 15_000 });
    await page.locator("#action-resign").click();
    await expect(page.locator(".result")).toBeVisible({ timeout: 3000 });
    await expect(page.locator(".final-score")).toHaveText("Lost");
    await expect(page.locator(".result-label")).toContainText(/resigned/iu);
    await expect(page.locator("#again-btn")).toBeVisible();
    await expect(page.locator("#back-btn")).toBeVisible();
    expectClean(trap);
  });

  test("Stockfish worker boots without errors (engine init smoke)", async ({
    page,
  }) => {
    const trap = attachErrorTrap(page);
    await page.goto("/games/crown.html");
    // If the WASM/Worker boot fails it surfaces as a pageerror or console.error.
    await expect(page.locator(".cg-wrap")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1500);
    expectClean(trap);
  });
});
