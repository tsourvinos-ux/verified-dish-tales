import { test, expect } from "@playwright/test";

const PATRON_EMAIL = process.env.E2E_PATRON_EMAIL;
const PATRON_PASSWORD = process.env.E2E_PATRON_PASSWORD;
const BUSINESS_SLUG = process.env.E2E_BUSINESS_SLUG;

test.describe("review flow", () => {
  test.skip(
    !PATRON_EMAIL || !PATRON_PASSWORD || !BUSINESS_SLUG,
    "E2E_PATRON_EMAIL / E2E_PATRON_PASSWORD / E2E_BUSINESS_SLUG not set",
  );

  test("patron signs in, posts a review, sees it in the ledger", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', PATRON_EMAIL!);
    await page.fill('input[type="password"]', PATRON_PASSWORD!);
    await page.click('button[type="submit"]:has-text("Sign in")');
    await expect(page).toHaveURL("/");

    await page.goto(`/restaurants/${BUSINESS_SLUG}`);
    const content = `e2e review ${Date.now()} — please ignore`;
    await page.fill('textarea', content);
    // Choose 4-star to avoid minting a reward in test env
    await page.click('[aria-label="4 stars"]').catch(() => {});
    await page.click('button:has-text("Post")');
    await expect(page.getByText(content)).toBeVisible({ timeout: 10_000 });
  });
});