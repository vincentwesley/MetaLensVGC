import { test, expect } from '@playwright/test';

if (process.env.E2E_OFFLINE) {
  test.beforeEach(async ({ page }) => {
    await page.route(/play\.pokemonshowdown\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/, (r) => r.fulfill({ status: 204, body: '' }));
  });
}

async function ready(page) {
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-rendering') && document.querySelector('.filterbar__sample')?.textContent !== 'Loading…');
}

test('Showdown mode: quadrant is the ladder variant, markers plot, click adds one chip', async ({ page }) => {
  await page.goto('/#reg=ND');
  await ready(page);
  await page.locator('.modeswitch button[data-mode="showdown"]').click();
  await ready(page);
  const quad = page.locator('main [data-section="quadrant"]');
  await expect(quad).toBeVisible();
  await expect(quad.locator('h3')).toContainText('not win rate');
  await expect(quad.locator('.meta-line')).toContainText('no win rates');
  await expect(quad.locator('canvas').first()).toBeVisible();
  const keys = await quad.locator('[_echarts_instance_]').evaluate((e) => echarts.getInstanceByDom(e).getOption().series[0].data.map((d) => d.key));
  expect(keys.length).toBeGreaterThan(0);
  await quad.scrollIntoViewIfNeeded();
  const px = await quad.locator('[_echarts_instance_]').evaluate((e, k) => {
    const i = echarts.getInstanceByDom(e);
    const d = i.getOption().series[0].data[0];
    const r = e.getBoundingClientRect();
    const [x, y] = i.convertToPixel({ seriesIndex: 0 }, d.value);
    return [r.left + x, r.top + y];
  });
  await page.mouse.click(px[0], px[1]);
  await expect(page.locator('#chips .chip')).toHaveCount(1);
  expect(await page.evaluate(() => location.hash)).toContain('chips=species');
});

test('M-C tournaments keep the Win Rate quadrant', async ({ page }) => {
  await page.goto('/#reg=M-C');
  await ready(page);
  await page.locator('main [data-section="quadrant"]').scrollIntoViewIfNeeded();
  await expect(page.locator('main [data-section="quadrant"] h3')).toContainText('Win Rate');
});
