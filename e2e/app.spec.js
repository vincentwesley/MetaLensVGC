// End-to-end checks against the local static server (see playwright.config.js).
// Each bullet in GOAL_PROMPT.md's "Definition of done" #3 gets its own test.
import { test, expect } from '@playwright/test';

// E2E_OFFLINE=1 (sandboxes without internet, e.g. cloud sessions): answer the only
// third-party hosts the page uses (Showdown sprites, Google Fonts) with an empty
// 204, so "no console errors" measures the app, not the network. Sprites then show
// their built-in placeholder, as they would if Showdown were down.
if (process.env.E2E_OFFLINE) {
  test.beforeEach(async ({ page }) => {
    await page.route(/play\.pokemonshowdown\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/, (r) => r.fulfill({ status: 204, body: '' }));
  });
}

/** Wait for a render pass to finish: the usage leaderboard always renders
 *  either a data table or an "Insufficient data" empty-state once `main.js`
 *  has computed a view, for every regulation/source/filter combination. */
async function waitForUsageRendered(page) {
  await page
    .locator('[data-section="usage"] .card__body .data-table, [data-section="usage"] .card__body .empty-state')
    .first()
    .waitFor({ state: 'visible' });
}

/** Wait until every section (including off-screen ones, which catch up in
 *  idle time) has rendered the current state. */
async function waitForAllSections(page) {
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-rendering') && document.querySelector('.filterbar__sample')?.textContent !== 'Loading…');
}

function teamsSampledValue(page) {
  return page.locator('[data-section="snapshot"] .kpi').filter({ hasText: 'Teams sampled' }).locator('.kpi__value');
}

test('no console errors while loading each regulation and cycling source through Ladder (where available) and Ranked', async ({ page }) => {
  test.setTimeout(90_000); // 3 regs x up to 3 sources, each a full re-render
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console error on ${page.url()}: ${msg.text()}`); });
  page.on('pageerror', (err) => errors.push(`uncaught exception on ${page.url()}: ${err.message}`));

  for (const reg of ['M-A', 'M-B', 'M-C']) {
    await page.goto(`/#reg=${reg}`);
    await waitForUsageRendered(page);

    const sourceGroup = page.locator('[aria-label="Source"]');
    const ladderBtn = sourceGroup.getByRole('button', { name: 'Ladder', exact: true });
    if (await ladderBtn.isEnabled()) {
      await ladderBtn.click();
      await expect(page.locator('[data-section="usage"] thead')).toContainText('battles');
      await sourceGroup.getByRole('button', { name: 'Tournaments', exact: true }).click();
      await expect(page.locator('[data-section="usage"] thead')).toContainText('Win %');
    }

    const rankedBtn = sourceGroup.getByRole('button', { name: 'Ranked (in-game)', exact: true });
    await expect(rankedBtn).toBeEnabled(); // every reg has at least one in-game season
    await rankedBtn.click();
    await expect(page.locator('[data-section="usage"] thead')).toContainText('Top item');
    await expect(page.locator('[data-section="usage"] .meta-line')).toContainText('In-game ranked');
    await expect(page.locator('[data-section="quadrant"]')).toContainText('Not available for the in-game ranked source');
    await expect(page.locator('.section-placeholder')).toHaveCount(0); // every section module loaded and mounted
    await expect(page.locator('[data-section="speed"] canvas').first()).toBeVisible();
    expect(await page.evaluate(() => location.hash)).toContain('source=ranked');
    await sourceGroup.getByRole('button', { name: 'Tournaments', exact: true }).click();
    await expect(page.locator('[data-section="usage"] thead')).toContainText('Win %');
  }

  expect(errors, errors.join('\n')).toEqual([]);
});

test('clicking a leaderboard Pokemon adds a chip and updates another section; shift-click negates', async ({ page }) => {
  await page.goto('/');
  await waitForUsageRendered(page);

  const rows = page.locator('[data-section="usage"] tbody tr');
  await expect(rows.first()).toBeVisible();
  const key = await rows.first().getAttribute('data-key');

  const teamsValue = teamsSampledValue(page);
  const before = await teamsValue.textContent();

  await rows.first().click();
  await waitForUsageRendered(page);

  const chip = page.locator('#chips .chip').filter({ hasText: key });
  await expect(chip).toHaveCount(1);
  await expect(chip).not.toHaveClass(/chip--neg/);

  const after = await teamsValue.textContent();
  expect(after, 'clicking a leaderboard row should change another section\'s numbers').not.toBe(before);

  await page.locator('#chips .chips__clear').click();
  await expect(page.locator('#chips .chip')).toHaveCount(0);

  // shift-click adds a NOT chip instead
  const rows2 = page.locator('[data-section="usage"] tbody tr');
  const key2 = await rows2.first().getAttribute('data-key');
  await rows2.first().click({ modifiers: ['Shift'] });
  await waitForUsageRendered(page);
  const negChip = page.locator('#chips .chip').filter({ hasText: key2 });
  await expect(negChip).toHaveCount(1);
  await expect(negChip).toHaveClass(/chip--neg/);
});

test('switching regulation changes the data shown', async ({ page }) => {
  await page.goto('/'); // default reg is M-C
  await waitForUsageRendered(page);
  const teamsValue = teamsSampledValue(page);
  const before = await teamsValue.textContent();

  const regGroup = page.locator('[aria-label="Regulation"]');
  await regGroup.getByRole('button', { name: 'M-A', exact: true }).click();
  await waitForUsageRendered(page);
  await expect(regGroup.getByRole('button', { name: 'M-A', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await expect(teamsValue).not.toHaveText(before); // retries until the M-A render lands
});

test('URL hash round-trips filters and chips on reload', async ({ page }) => {
  await page.goto('/');
  await waitForUsageRendered(page);

  // Wait for the M-A render to land (the M-C table is still "rendered" until it does).
  const sample = page.locator('.filterbar__sample');
  const before = await sample.textContent();
  await page.locator('[aria-label="Regulation"]').getByRole('button', { name: 'M-A', exact: true }).click();
  await expect(sample).not.toHaveText(before);

  const rows = page.locator('[data-section="usage"] tbody tr');
  const key = await rows.first().getAttribute('data-key');
  await rows.first().click();
  await waitForUsageRendered(page);
  await expect(page.locator('#chips .chip')).toHaveCount(1);

  const hash = await page.evaluate(() => location.hash);
  expect(hash).toContain('reg=M-A');
  expect(hash).toContain('chips=');

  await page.goto(`/${hash}`);
  await waitForUsageRendered(page);

  await expect(page.locator('[aria-label="Regulation"]').getByRole('button', { name: 'M-A', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#chips .chip').filter({ hasText: key })).toHaveCount(1);
});

test('Team Sheet Library copy produces a valid Showdown paste', async ({ page }) => {
  await page.goto('/');
  await waitForUsageRendered(page);

  const firstCard = page.locator('[data-section="library"] .lib-card').first();
  await expect(firstCard).toBeVisible();
  await firstCard.locator('.lib-btn', { hasText: 'Copy' }).click();
  await expect(page.locator('.toast')).toContainText('Copied');

  const text = await page.evaluate(() => navigator.clipboard.readText());
  const blocks = text.trim().split(/\n\s*\n/).filter(Boolean);
  expect(blocks.length).toBe(6); // 6 Pokemon per team
  expect(text).toMatch(/Ability:/);
  for (const block of blocks) {
    const lines = block.split('\n');
    expect(lines[0].length).toBeGreaterThan(0); // species (optionally "Species @ Item") line
    expect(lines.some((l) => l.startsWith('- '))).toBe(true); // at least one move line
  }
});

test('deep-dive drawer opens from a Pokemon sprite and closes with Escape', async ({ page }) => {
  await page.goto('/');
  await waitForUsageRendered(page);

  const firstMon = page.locator('[data-section="library"] .lib-mon').first();
  await expect(firstMon).toBeVisible();
  await firstMon.click();

  const drawer = page.locator('#deepdive');
  await expect(drawer).toHaveClass(/is-open/);
  await expect(drawer).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#deepdive-title')).not.toHaveText('Deep Dive');

  await page.keyboard.press('Escape');
  await expect(drawer).not.toHaveClass(/is-open/);
  await expect(drawer).toHaveAttribute('aria-hidden', 'true');
});

test('My Team Scanner accepts a pasted Showdown team and renders results', async ({ page }) => {
  await page.goto('/');
  await waitForUsageRendered(page);

  // Build the paste from a real team sheet (never fabricated data) via the
  // library's own "Copy paste" button, then feed it into the scanner.
  const firstCard = page.locator('[data-section="library"] .lib-card').first();
  await firstCard.locator('.lib-btn', { hasText: 'Copy' }).click();
  const paste = await page.evaluate(() => navigator.clipboard.readText());
  expect(paste.trim().length).toBeGreaterThan(0);

  await page.locator('#scn-textarea').fill(paste);
  await page.locator('[data-section="scanner"]').getByRole('button', { name: 'Scan', exact: true }).click();

  await expect(page.locator('[data-section="scanner"] .scn-parsed .scn-mon')).toHaveCount(6);
  await expect(page.locator('[data-section="scanner"] .scn-mon--unknown')).toHaveCount(0);
});

test('no horizontal scroll at 390px width in both skins', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [skin, hash] of [['retro', '/#skin=retro'], ['pro', '/']]) {
    await page.goto(hash);
    await waitForUsageRendered(page);
    await waitForAllSections(page);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth, `${skin} skin overflows horizontally at 390px (scrollWidth=${scrollWidth})`).toBeLessThanOrEqual(390);
  }
});

test('leaderboard sprite opens the drawer without adding a chip', async ({ page }) => {
  await page.goto('/');
  await waitForUsageRendered(page);
  const btn = page.locator('[data-section="usage"] .sprite-btn').first();
  const key = await btn.evaluate((b) => b.closest('tr').dataset.key);
  await btn.click();
  await expect(page.locator('#deepdive')).toHaveClass(/is-open/);
  await expect(page.locator('#deepdive-title')).toContainText(key);
  await expect(page.locator('#chips .chip')).toHaveCount(0);
});

test('filter bar collapses to a summary line, remembers it, and F toggles it', async ({ page }) => {
  await page.goto('/');
  await waitForUsageRendered(page);
  const html = page.locator('html');
  const toggle = page.locator('#filterbar-toggle');
  await expect(html).toHaveAttribute('data-skin', 'pro');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('[aria-label="Regulation"]')).toBeVisible();
  await toggle.click();
  await expect(html).toHaveAttribute('data-filters-collapsed', '');
  await expect(page.locator('[aria-label="Regulation"]')).toBeHidden();
  await expect(page.locator('#header-controls')).toBeHidden();
  await expect(page.locator('#filterbar-summary')).toContainText('M-C');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await page.reload();
  await waitForUsageRendered(page);
  await expect(page.locator('[aria-label="Regulation"]')).toBeHidden();
  await page.locator('body').press('f');
  await expect(page.locator('[aria-label="Regulation"]')).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
});

test('Item Usage: per-Pokémon items render and clicking an item adds an item chip', async ({ page }) => {
  await page.goto('/');
  await waitForAllSections(page);
  const section = page.locator('main [data-section="items"]');
  const firstRow = section.locator('.items-table tbody tr').first();
  await expect(firstRow).toBeVisible();
  const item = firstRow.locator('.item-link').first();
  const itemName = (await item.locator('.item-link__name').textContent()).trim();
  expect(itemName.length).toBeGreaterThan(0);
  // leaderboard shows the same Pokémon's top item under its name
  const key = await firstRow.getAttribute('data-key');
  await expect(page.locator(`[data-section="usage"] tr[data-key="${key}"] .item-link__name`)).toHaveText(itemName);
  await item.click();
  await expect(page.locator('#chips .chip')).toHaveCount(1);
  await expect(page.locator('#chips .chip').first()).toContainText(itemName);
  // search narrows the per-Pokémon table
  await section.locator('.items-search').fill(key.slice(0, 5));
  await expect(section.locator('.items-table tbody tr').first()).toHaveAttribute('data-key', /.+/);
});

// Cross-filter contract: a chip from any chart narrows the Pokémon-level views to
// exactly the Pokémon it describes (see CLAUDE.md "Chip semantics").
async function clickFirstBar(page, chartLocator) {
  await chartLocator.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const pt = await chartLocator.evaluate((el) => {
    const inst = window.echarts.getInstanceByDom(el);
    const s = inst.getOption().series[0];
    const last = s.data.length - 1; // horizontal bars are listed bottom-up; last = top bar
    const d = s.data[last];
    const [x, y] = inst.convertToPixel({ seriesIndex: 0 }, [d.value / 2, last]);
    const r = el.getBoundingClientRect();
    return { x: r.left + x, y: r.top + y, type: d.type };
  });
  await page.mouse.click(pt.x, pt.y);
  return pt.type;
}

test('type charts add the matching chip kind and the leaderboard only lists matching Pokémon', async ({ page }) => {
  await page.goto('/');
  await waitForAllSections(page);
  const charts = page.locator('main [data-section="types"] .types-panel__chart');
  await charts.nth(2).scrollIntoViewIfNeeded();
  const weakType = await clickFirstBar(page, charts.nth(2));
  await expect(page.locator('#chips .chip__label')).toHaveText([`Weak to: ${weakType}`]);
  await waitForAllSections(page);
  const keys = await page.$$eval('[data-section="usage"] tbody tr', (trs) => trs.map((t) => t.dataset.key));
  expect(keys.length).toBeGreaterThan(0);
  const allWeak = await page.evaluate(async ({ keys, weakType }) => {
    const { effectiveness } = await import('/js/lib/types.js');
    const dex = await (await fetch('/data/dex.json')).json();
    return keys.every((k) => effectiveness(weakType, dex.species[k].types) > 1);
  }, { keys, weakType });
  expect(allWeak).toBe(true);
});

test('archetype chip from the donut leaves a single slice; species chip leaves only that Pokémon', async ({ page }) => {
  await page.goto('/');
  await waitForUsageRendered(page);
  const first = page.locator('[data-section="usage"] tbody tr').first();
  const key = await first.getAttribute('data-key');
  await first.click();
  await waitForAllSections(page);
  await expect(page.locator('[data-section="usage"] tbody tr')).toHaveCount(1);
  await expect(page.locator('[data-section="usage"] tbody tr').first()).toHaveAttribute('data-key', key);
  await page.locator('#chips .chips__clear').click();
  await waitForAllSections(page);
  const row = page.locator('main [data-section="archetypes"] tbody tr').first();
  await row.scrollIntoViewIfNeeded();
  await row.click();
  await waitForAllSections(page);
  await expect(page.locator('main [data-section="archetypes"] tbody tr')).toHaveCount(1);
});

test('active filters stay visible while scrolling and Clear all empties them', async ({ page }) => {
  await page.goto('/#chips=type:Electric,!species:Rillaboom');
  await waitForAllSections(page);
  const bar = page.locator('#chips');
  await expect(bar.locator('.chips__count')).toHaveText('2');
  await expect(bar.locator('.chip--neg')).toHaveCount(1);
  await page.locator('main [data-section="library"]').scrollIntoViewIfNeeded();
  const box = await bar.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeLessThan(200); // pinned under the header, not scrolled away
  await bar.locator('.chips__clear').click();
  await expect(bar).toBeEmpty();
  expect(await page.evaluate(() => location.hash)).not.toContain('chips=');
});

test('chart tooltips and [data-tip] tips stay inside the viewport on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await waitForAllSections(page);
  const charts = page.locator('main [_echarts_instance_]');
  const n = await charts.count();
  expect(n).toBeGreaterThan(3);
  let shown = 0;
  for (let i = 0; i < n; i++) {
    const c = charts.nth(i);
    await c.scrollIntoViewIfNeeded();
    const box = await c.boundingBox();
    if (!box || box.width < 20) continue;
    for (const fx of [0.05, 0.5, 0.95]) {
      for (const fy of [0.3, 0.7]) {
        await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
        await page.waitForTimeout(120);
        const out = await page.evaluate(() => [...document.querySelectorAll('[_echarts_instance_] > div:last-child')]
          .filter((d) => d.style.display !== 'none' && getComputedStyle(d).opacity !== '0' && d.textContent.trim())
          .map((d) => d.getBoundingClientRect())
          .filter((r) => r.width > 0)
          .map((r) => ({ l: r.left, r: r.right })));
        shown += out.length;
        for (const r of out) {
          expect(r.l).toBeGreaterThanOrEqual(-1);
          expect(r.r).toBeLessThanOrEqual(391);
        }
      }
    }
  }
  expect(shown).toBeGreaterThan(0);
  // A long help tip (co-usage "Lift" button) near the right edge.
  const tipped = page.locator('main [data-tip]').filter({ hasText: /lift/i }).first();
  await tipped.scrollIntoViewIfNeeded();
  await tipped.hover();
  const tip = page.locator('#tip');
  await expect(tip).toBeVisible();
  const tb = await tip.boundingBox();
  expect(tb.x).toBeGreaterThanOrEqual(0);
  expect(tb.x + tb.width).toBeLessThanOrEqual(390);
});

test('hand-edited hash is sanitized: bad values fall back, duplicates collapse, no errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/#reg=M-Z&source=nope&minN=-5&from=2026-13-45&chips=species:Garchomp,species:Garchomp,bogus:x');
  await waitForAllSections(page);
  await expect(page.locator('#chips .chips__count')).toHaveText('1');
  const hash = await page.evaluate(() => location.hash);
  expect(hash).toBe('#minN=0&chips=species:Garchomp');
  expect(await page.locator('body').innerText()).not.toMatch(/\bNaN\b|\bundefined\b/);
  expect(errors).toEqual([]);
});

test('keyboard: Enter on an archetype row adds a chip; Shift+Enter on a leaderboard row adds a NOT chip', async ({ page }) => {
  await page.goto('/');
  await waitForAllSections(page);
  const row = page.locator('main [data-section="archetypes"] tbody tr').first();
  await row.scrollIntoViewIfNeeded();
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#chips .chip')).toHaveCount(1);
  await page.locator('#chips .chips__clear').click();
  await waitForAllSections(page);
  const lead = page.locator('[data-section="usage"] tbody tr').first();
  await lead.focus();
  await page.keyboard.press('Shift+Enter');
  await expect(page.locator('#chips .chip--neg')).toHaveCount(1);
});

test('regulation shift table has no NaN at min-n 0', async ({ page }) => {
  await page.goto('/#minN=0');
  await waitForAllSections(page);
  const shift = page.locator('main [data-section="trends"]');
  await shift.scrollIntoViewIfNeeded();
  await waitForAllSections(page);
  expect(await shift.innerText()).not.toMatch(/NaN/);
});
