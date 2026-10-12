import { test, expect } from '@playwright/test';

if (process.env.E2E_OFFLINE) {
  test.beforeEach(async ({ page }) => {
    await page.route(/play\.pokemonshowdown\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/, (r) => r.fulfill({ status: 204, body: '' }));
  });
}

test('Event Results: rows with winner sprites, one click adds one team chip, no NaN/console errors', async ({ page }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/#reg=M-C');
  const sec = page.locator('main [data-section="events"]');
  await sec.scrollIntoViewIfNeeded();
  const rows = sec.locator('.ev-row');
  await expect(rows.first()).toBeVisible();
  await expect.poll(() => rows.count()).toBeLessThanOrEqual(12);
  const winner = sec.locator('.ev-winner').first();
  await expect(winner.locator('img')).toHaveCount(6);
  const text = await sec.innerText();
  expect(text).not.toMatch(/NaN|undefined/);
  const before = await page.locator('#chips .chip').count();
  await winner.click();
  await expect(page.locator('#chips .chip')).toHaveCount(before + 1);
  await expect(page.locator('#chips .chip__label').last()).toHaveText(/^Team: /);
  expect(errors).toEqual([]);
});

test('Event Results: hidden in Showdown mode', async ({ page }) => {
  await page.goto('/#reg=ND');
  await expect(page.locator('main [data-section="events"]')).toBeHidden();
});
