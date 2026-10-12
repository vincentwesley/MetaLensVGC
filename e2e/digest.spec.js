// Weekly Digest: renders for tournaments (M-C) and ladder-only (ND); Copy as text puts the digest on the clipboard.
import { test, expect } from '@playwright/test';

if (process.env.E2E_OFFLINE) {
  test.beforeEach(async ({ page }) => {
    await page.route(/play\.pokemonshowdown\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/, (r) => r.fulfill({ status: 204, body: '' }));
  });
}

for (const [reg, label] of [['M-C', 'Reg M-C'], ['ND', 'National Dex']]) {
  test(`digest for ${reg}: >= 5 top rows, Copy as text, no NaN or console errors`, async ({ page }) => {
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      window.__copied = null;
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__copied = t; } }, configurable: true });
    });
    await page.goto(`/#reg=${reg}`);
    const sec = page.locator('[data-section="digest"]');
    await sec.scrollIntoViewIfNeeded();
    const rows = sec.locator('.digest__list').first().locator('li');
    await expect(rows.nth(4)).toBeVisible({ timeout: 60000 });
    expect(await rows.count()).toBeGreaterThanOrEqual(5);
    await sec.getByRole('button', { name: 'Copy as text' }).click();
    await expect.poll(() => page.evaluate(() => window.__copied)).toContain(label);
    expect(await sec.innerText()).not.toContain('NaN');
    expect(await page.evaluate(() => window.__copied)).not.toContain('NaN');
    expect(errors, errors.join('\n')).toEqual([]);
  });
}
