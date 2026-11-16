// axe (wcag2a + wcag2aa): the Credits card (incl. the sign-off) must be violation-free in dark and light.
// The full page is scanned once and its violations outside Credits are only logged (known, tracked in docs/).
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const TAGS = ['wcag2a', 'wcag2aa'];
const CREDITS = 'section.creator';

test.beforeEach(async ({ page }) => {
  await page.route(/play\.pokemonshowdown\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/, (r) => r.fulfill({ status: 204, body: '' }));
});

for (const theme of ['dark', 'light']) {
  test(`credits card and sign-off have no axe violations (${theme})`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('metalens.prefs', JSON.stringify({ skin: 'pro', theme: t, anim: false, palette: 'grass' })), theme);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.locator('.studio-signoff').scrollIntoViewIfNeeded();
    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).include(CREDITS).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  });
}

test('full page: report violations outside credits (informational)', async ({ page }) => {
  test.setTimeout(90_000); // the page renders ~9 MB of data first
  await page.goto('/');
  await page.locator('.studio-signoff').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-rendering'));
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).exclude(CREDITS).analyze();
  console.log('FULL-PAGE (excl. credits):', violations.map((v) => `${v.id} x${v.nodes.length}`).join(', ') || 'none');
});
