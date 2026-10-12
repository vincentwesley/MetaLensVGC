import { test, expect } from '@playwright/test';

if (process.env.E2E_OFFLINE) {
  test.beforeEach(async ({ page }) => {
    await page.route(/play\.pokemonshowdown\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/, (r) => r.fulfill({ status: 204, body: '' }));
  });
}

async function open(page, hash) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/${hash}`);
  const sec = page.locator('[data-section="moves"]');
  await sec.scrollIntoViewIfNeeded();
  return { sec, errors };
}

test('M-C ladder: move rows, no Tera card, no NaN', async ({ page }) => {
  const { sec, errors } = await open(page, '#reg=M-C&source=ladder');
  await expect(sec.locator('.data-table tbody tr').first()).toBeVisible({ timeout: 30_000 });
  expect(await sec.locator('.data-table tbody tr').count()).toBeGreaterThan(0);
  await expect(sec.locator('.moves-tera')).toHaveCount(0);
  expect(await sec.innerText()).not.toMatch(/NaN|undefined/);
  expect(errors).toEqual([]);
});

test('NDD shows the Tera card with bars', async ({ page }) => {
  const { sec, errors } = await open(page, '#reg=NDD');
  await expect(sec.locator('.moves-tera .moves-bar').first()).toBeVisible({ timeout: 30_000 });
  expect(await sec.locator('.moves-tera .moves-bar').count()).toBeGreaterThan(0);
  expect(await sec.innerText()).not.toMatch(/NaN|undefined/);
  expect(errors).toEqual([]);
});

test('ND says Tera is banned', async ({ page }) => {
  const { sec, errors } = await open(page, '#reg=ND');
  await expect(sec).toContainText('Tera is banned in this format', { timeout: 30_000 });
  await expect(sec.locator('.data-table tbody tr').first()).toBeVisible();
  expect(errors).toEqual([]);
});
