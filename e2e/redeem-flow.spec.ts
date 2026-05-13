import { test, expect } from "@playwright/test";

const PATRON_EMAIL = process.env.E2E_PATRON_EMAIL;
const PATRON_PASSWORD = process.env.E2E_PATRON_PASSWORD;

test.describe("redeem flow", () => {
  test.skip(
    !PATRON_EMAIL || !PATRON_PASSWORD,
    "E2E_PATRON_* env vars not set",
  );

  test("patron can redeem an active reward exactly once", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', PATRON_EMAIL!);
    await page.fill('input[type="password"]', PATRON_PASSWORD!);
    await page.click('button[type="submit"]:has-text("Sign in")');
    await page.waitForURL("/");

    await page.goto("/account");
    const redeemBtn = page.getByRole("button", { name: /redeem/i }).first();
    if (await redeemBtn.count() === 0) {
      test.skip(true, "no active rewards in this test account; seed required");
    }
    await redeemBtn.click();
    await expect(page.getByText(/redeemed/i)).toBeVisible({ timeout: 10_000 });
    // The same button should no longer be present
    await expect(redeemBtn).toBeHidden();
  });
});