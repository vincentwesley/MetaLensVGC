// Full-page screenshots for visual review (see CLAUDE.md "npm run shot").
// Not assertions: this file just captures artifacts into screenshots/.
import { test } from '@playwright/test';

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

async function waitForUsageRendered(page) {
  await page
    .locator('[data-section="usage"] .card__body .data-table, [data-section="usage"] .card__body .empty-state')
    .first()
    .waitFor({ state: 'visible' });
}

/** ECharts draws on the next frame after setOption(); give it a beat before capturing. */
async function waitForCharts(page) {
  await page.waitForFunction(() => document.querySelectorAll('canvas').length > 0, { timeout: 10_000 }).catch(() => {});
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(300);
}

async function setup(page, { skin, theme, viewport, extra = '' }) {
  await page.emulateMedia({ reducedMotion: 'reduce' }); // kills CSS animations app-wide (see app.css)
  await page.setViewportSize(viewport);
  await page.goto(`/#skin=${skin}&theme=${theme}${extra}`); // state.anim defaults to false: sprites are static too
  await waitForUsageRendered(page);
  await waitForCharts(page);
}

for (const skin of ['retro', 'pro']) {
  for (const theme of ['light', 'dark']) {
    for (const [device, viewport] of [['desktop', DESKTOP], ['mobile', MOBILE]]) {
      test(`${skin}-${theme}-${device}`, async ({ page }) => {
        await setup(page, { skin, theme, viewport });
        await page.screenshot({ path: `screenshots/${skin}-${theme}-${device}.png`, fullPage: true });
      });
    }
  }
}

// In-game ranked source (M-C: current season with a published ranking).
for (const [skin, theme] of [['retro', 'light'], ['pro', 'dark']]) {
  for (const [device, viewport] of [['desktop', DESKTOP], ['mobile', MOBILE]]) {
    test(`${skin}-${theme}-ranked-${device}`, async ({ page }) => {
      await setup(page, { skin, theme, viewport, extra: '&source=ranked' });
      await page.screenshot({ path: `screenshots/${skin}-${theme}-ranked-${device}.png`, fullPage: true });
    });
  }
}

test('retro-dark-drawer', async ({ page }) => {
  await setup(page, { skin: 'retro', theme: 'dark', viewport: DESKTOP });
  await page.locator('[data-section="library"] .lib-mon').first().click();
  await page.waitForFunction(() => document.getElementById('deepdive')?.classList.contains('is-open'));
  await waitForCharts(page);
  await page.screenshot({ path: 'screenshots/retro-dark-drawer.png', fullPage: true });
});

test('pro-light-drawer', async ({ page }) => {
  await setup(page, { skin: 'pro', theme: 'light', viewport: DESKTOP });
  await page.locator('[data-section="library"] .lib-mon').first().click();
  await page.waitForFunction(() => document.getElementById('deepdive')?.classList.contains('is-open'));
  await waitForCharts(page);
  await page.screenshot({ path: 'screenshots/pro-light-drawer.png', fullPage: true });
});
