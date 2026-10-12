// Compare Periods: two Smogon ladder months side by side.
import { test, expect } from '@playwright/test';

if (process.env.E2E_OFFLINE) {
  test.beforeEach(async ({ page }) => {
    await page.route(/play\.pokemonshowdown\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/, (r) => r.fulfill({ status: 204, body: '' }));
  });
}

async function open(page, reg, errors) {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/#reg=${reg}`);
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-rendering') && document.querySelector('.filterbar__sample')?.textContent !== 'Loading…');
  const sec = page.locator('[data-section="compare"]');
  await sec.scrollIntoViewIfNeeded();
  return sec;
}

test('ND: two different months, changing a select updates the table', async ({ page }) => {
  const errors = [];
  const sec = await open(page, 'ND', errors);
  const a = sec.locator('select[data-cmp="a"]');
  const b = sec.locator('select[data-cmp="b"]');
  await expect(sec.locator('tbody tr')).toHaveCount(20);
  const [va, vb] = [await a.inputValue(), await b.inputValue()];
  expect(va).not.toBe(vb);
  const before = await sec.locator('thead').innerText();
  await a.selectOption(vb);
  await b.selectOption(va);
  await expect(sec.locator('thead')).not.toHaveText(before);
  await expect(sec.locator('thead')).toContainText(vb);
  expect(await sec.innerText()).not.toMatch(/NaN|undefined/);
  await sec.locator('tbody tr').first().click();
  await expect(page.locator('#chips .chip')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('M-C: a single ladder month shows the note and the table', async ({ page }) => {
  const errors = [];
  const sec = await open(page, 'M-C', errors);
  await expect(sec).toContainText('Only one Smogon month so far; the comparison appears when a second month is published');
  expect(await sec.locator('tbody tr').count()).toBeGreaterThan(5);
  expect(await sec.innerText()).not.toMatch(/NaN|undefined/);
  expect(errors).toEqual([]);
});
