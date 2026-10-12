import { test, expect } from '@playwright/test';

if (process.env.E2E_OFFLINE) {
  test.beforeEach(async ({ page }) => {
    await page.route(/play\.pokemonshowdown\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/, (r) => r.fulfill({ status: 204, body: '' }));
  });
}

for (const [reg, hash] of [['M-C', '#reg=M-C&source=ladder'], ['ND', '#reg=ND']]) {
  test(`threats renders rows and a click adds one species chip (${reg})`, async ({ page }) => {
    await page.goto(`/${hash}`);
    const rows = page.locator('[data-section="threats"] .threats__row');
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });
    expect(await rows.count()).toBeGreaterThan(0);
    expect(await page.locator('[data-section="threats"]').innerText()).not.toContain('NaN');
    await rows.first().click();
    await expect(page.locator('#chips .chip')).toHaveCount(1);
  });
}
