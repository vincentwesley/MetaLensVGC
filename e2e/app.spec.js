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
      await expect(page.locator('[data-section="usage"] thead')).toContainText('Raw uses');
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
  await waitForAllSections(page);

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
  await expect(page.locator('#header-controls .gear')).toBeVisible();
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

test('every type chart click is a plain type filter and the leaderboard then lists only that type', async ({ page }) => {
  await page.goto('/');
  await waitForAllSections(page);
  const charts = page.locator('main [data-section="types"] .types-panel__chart');
  for (const i of [0, 1]) {
    await charts.nth(i).scrollIntoViewIfNeeded();
    const type = await clickFirstBar(page, charts.nth(i));
    await expect(page.locator('#chips .chip__label')).toHaveText([`Type: ${type}`]);
    await waitForAllSections(page);
    const keys = await page.$$eval('[data-section="usage"] tbody tr', (trs) => trs.map((t) => t.dataset.key));
    expect(keys.length).toBeGreaterThan(0);
    const allOfType = await page.evaluate(async ({ keys, type }) => {
      const dex = await (await fetch('/data/dex.json')).json();
      return keys.every((k) => dex.species[k].types.includes(type));
    }, { keys, type });
    expect(allOfType).toBe(true);
    await page.locator('#chips .chips__clear').click();
    await waitForAllSections(page);
  }
});

test('chart tooltips never show NaN / undefined (hover sweep over the type charts)', async ({ page }) => {
  await page.goto('/');
  await waitForAllSections(page);
  const charts = page.locator('main [data-section="types"] .types-panel__chart');
  let seen = 0;
  for (const i of [0, 1]) {
    const c = charts.nth(i);
    await c.scrollIntoViewIfNeeded();
    const box = await c.boundingBox();
    for (let fy = 0.1; fy < 0.95; fy += 0.1) {
      await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * fy);
      await page.waitForTimeout(60);
      const t = await page.evaluate(() => [...document.querySelectorAll('[_echarts_instance_] > div:last-child')]
        .filter((d) => d.style.display !== 'none').map((d) => d.innerText).join(' '));
      if (t.trim()) seen++;
      expect(t).not.toMatch(/NaN|undefined|Infinity/);
    }
  }
  expect(seen).toBeGreaterThan(0);
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
          .map((d) => [d.getBoundingClientRect(), d.parentElement.getBoundingClientRect()])
          .filter(([r]) => r.width > 0)
          .map(([r, c]) => ({ l: r.left, r: r.right, t: r.top - c.top, b: c.bottom - r.bottom })));
        shown += out.length;
        for (const r of out) {
          expect(r.l).toBeGreaterThanOrEqual(-1);
          expect(r.r).toBeLessThanOrEqual(391);
          // confined: never spills out of the top or bottom of its chart either
          expect(r.t).toBeGreaterThanOrEqual(-1);
          expect(r.b).toBeGreaterThanOrEqual(-1);
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

test('a hovered [data-tip] tip survives the section nav scrolling sideways, hides when its anchor scrolls away', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await waitForAllSections(page);
  const tipped = page.locator('main [data-tip]').filter({ hasText: /lift/i }).first();
  await tipped.scrollIntoViewIfNeeded();
  await tipped.hover();
  const tip = page.locator('#tip');
  await expect(tip).toBeVisible();
  // The jump nav re-centres its active link (horizontal scroll) as the page scrolls: unrelated to the anchor.
  await page.evaluate(() => { const nav = document.getElementById('secnav'); nav.scrollLeft += 60; nav.dispatchEvent(new Event('scroll')); });
  await page.waitForTimeout(100);
  await expect(tip).toBeVisible();
  await page.mouse.move(5, 830);
  await page.evaluate(() => scrollBy(0, 3000));
  await expect(tip).toBeHidden();
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

test('Back closes the deep-dive drawer and stays on the page; closing with X leaves history as it was', async ({ page }) => {
  await page.goto('/#reg=M-B');
  await waitForUsageRendered(page);
  const len0 = await page.evaluate(() => history.length);
  const open = () => page.locator('[data-section="usage"] tbody tr .sprite-btn').first().click();
  await open();
  await expect(page.locator('#deepdive')).toHaveClass(/is-open/);
  await page.goBack();
  await expect(page.locator('#deepdive')).not.toHaveClass(/is-open/);
  expect(page.url()).toContain('#reg=M-B');
  await open();
  await page.locator('#deepdive [data-drawer-close]').click();
  await expect(page.locator('#deepdive')).not.toHaveClass(/is-open/);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => history.state)).toBeNull();
  expect(page.url()).toContain('#reg=M-B');
  expect(await page.evaluate(() => history.length)).toBeGreaterThanOrEqual(len0);
});

test('Scanner (M-C): speed position has data, evidence cards render, item clause is flagged', async ({ page }) => {
  await page.goto('/');
  await waitForAllSections(page);
  const sc = page.locator('main [data-section="scanner"]');
  await sc.scrollIntoViewIfNeeded();
  await sc.locator('textarea').fill(['Rillaboom @ Miracle Seed\n- Fake Out', 'Incineroar @ Sitrus Berry\n- Fake Out',
    'Sneasler @ Focus Sash\n- Fake Out', 'Salamence @ Salamencite\n- Tailwind', 'Kingambit @ Black Glasses\n- Sucker Punch',
    'Basculegion @ Focus Sash\n- Last Respects'].join('\n\n'));
  await sc.getByRole('button', { name: 'Scan', exact: true }).click();
  for (const t of ['Speed position', "Your team's archetype", 'Matchups: Pokémon', 'Matchups: archetypes', 'Item check', 'Common teammate picks', 'Weakest link']) {
    await expect(sc.getByText(t, { exact: true })).toBeVisible();
  }
  const text = await sc.innerText();
  expect(text).not.toContain('No speed data available');
  expect(text).toMatch(/Item clause: Focus Sash/);
  expect(text).not.toMatch(/\bNaN\b|\bundefined\b|Infinity/);
});

test('Scanner never blanks a card after a scan: Weakest link shows flagged small samples, no "Insufficient data"', async ({ page }) => {
  const paste = ['Rillaboom @ Miracle Seed\n- Fake Out', 'Incineroar @ Sitrus Berry\n- Fake Out',
    'Sneasler @ Focus Sash\n- Fake Out', 'Salamence @ Salamencite\n- Tailwind', 'Kingambit @ Black Glasses\n- Sucker Punch',
    'Basculegion @ Focus Sash\n- Last Respects'].join('\n\n');
  // default view, then a narrow one: regional top cut is 36 teams, where "100+ games on both sides" used to blank the card
  for (const [hash, relaxed] of [['', false], ['#tiers=regional&place=topcut', true]]) {
    await page.goto(`/${hash}`);
    await waitForAllSections(page);
    const sc = page.locator('main [data-section="scanner"]');
    await sc.scrollIntoViewIfNeeded();
    await sc.locator('textarea').fill(paste);
    await sc.getByRole('button', { name: 'Scan', exact: true }).click();
    const card = sc.locator('.scn-block').filter({ has: page.getByText('Weakest link', { exact: true }) });
    await expect(card.locator('tbody tr').first()).toBeVisible();
    await expect(card.locator('.empty-state')).toHaveCount(0);
    expect(await card.innerText()).not.toContain('Insufficient data');
    if (relaxed) {
      await expect(card).toContainText('smaller samples shown');
      await expect(card.locator('.meta-line__relaxed')).toBeVisible();
      await expect(card.locator('tbody tr.scn-low').first()).toContainText('low sample');
    } else {
      await expect(card.locator('.meta-line__relaxed')).toHaveCount(0);
    }
    expect(await sc.locator('.scn-results').innerText()).not.toContain('Insufficient data');
  }
});

test('Teammate rate uses tournament sheets when there is no ladder data (M-C) and a row filters to the pair', async ({ page }) => {
  await page.route('**/data/manifest.json', async (route) => {
    const res = await route.fetch();
    const m = await res.json();
    m.regs = m.regs.map((r) => (r.id === m.current ? { ...r, ladderMonths: [] } : r)); // simulate "no ladder month" for the current reg
    await route.fulfill({ response: res, json: m });
  });
  await page.route(/data\/ladder-M-C\.json/, (route) => route.fulfill({ json: { reg: 'M-C', source: 'smogon', cutoff: 1760, months: [] } }));
  await page.goto('/#source=ladder');
  await waitForAllSections(page);
  const card = page.locator('main [data-section="teammates"] .card').filter({ hasText: 'Teammate rate' });
  await card.scrollIntoViewIfNeeded();
  await waitForAllSections(page);
  await expect(card.locator('.meta-line')).toContainText('Tournaments');
  const rows = card.locator('.sb-row');
  expect(await rows.count()).toBeGreaterThan(3);
  const picked = await card.locator('select').inputValue();
  const mate = (await rows.first().locator('.sb-names').innerText()).trim();
  await rows.first().click();
  await expect(page.locator('#chips .chip__label')).toHaveText([`Core: ${picked} + ${mate}`]);
});

test('stale-data notice: shown when the manifest is over 10 days old, absent when fresh, no overflow at 390px', async ({ page }) => {
  const withGenerated = (iso) => page.route('**/data/manifest.json', async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, json: { ...(await res.json()), generated: iso } });
  });
  await withGenerated(new Date().toISOString());
  await page.goto('/');
  await waitForUsageRendered(page);
  await expect(page.locator('#stale-notice')).toBeHidden();

  await page.unroute('**/data/manifest.json');
  await withGenerated(new Date(Date.now() - 30 * 864e5).toISOString());
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/');
  await waitForUsageRendered(page);
  await expect(page.locator('#stale-notice')).toBeVisible();
  await expect(page.locator('#stale-notice')).toContainText('may be out of date');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('snapshot cards show NEW (not a +pt jump) for a Pokémon absent from the previous regulation', async ({ page }) => {
  await page.goto('/'); // default reg M-C; the M-B file loads after first paint
  await waitForAllSections(page);
  const cards = page.locator('[data-section="snapshot"] .snapshot__mon');
  await expect(page.locator('[data-section="snapshot"] .snapshot__change')).toContainText('Change vs M-B', { timeout: 30_000 });
  // Rillaboom: 1 team in M-B (< min n 20), 1955 in M-C.
  const rilla = cards.filter({ hasText: 'Rillaboom' });
  await expect(rilla).toHaveCount(1);
  await expect(rilla.locator('.kpi__delta')).toContainText('NEW');
  await expect(rilla.locator('.kpi__delta')).not.toContainText(/NaN|undefined|pt/);
  await expect(rilla.locator('.kpi__delta')).toHaveAttribute('data-tip', /Not used \(or under min n\) in M-B/);
  for (const t of await cards.allTextContents()) {
    if (t.includes('Rillaboom')) expect(t).not.toMatch(/\+\d+(\.\d+)?pt/);
    expect(t).not.toMatch(/NaN|undefined/);
  }
});

test('click hints hide whenever their card shows an empty state (ranked, ladder without data)', async ({ page }) => {
  for (const hash of ['#source=ranked', '#reg=M-B&source=ladder', '#source=ladder']) {
    await page.goto(`/${hash}`);
    await waitForAllSections(page);
    const bad = await page.evaluate(() => [...document.querySelectorAll('main .click-hint')]
      .filter((h) => h.getClientRects().length && h.parentElement.querySelector('.empty-state'))
      .map((h) => h.textContent.slice(0, 40)));
    expect(bad, hash).toEqual([]);
  }
});

test('Scanner: click hint shows with results; gibberish paste is rejected, not scanned', async ({ page }) => {
  await page.goto('/');
  await waitForAllSections(page);
  const sc = page.locator('[data-section="scanner"]');
  await page.locator('#scn-textarea').fill('lorem ipsum dolor sit amet');
  await sc.getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(sc.locator('.empty-state')).toContainText('no recognised Pokémon');
  await expect(sc.locator('.scn-parsed')).toHaveCount(0);
  await expect(sc.locator('.click-hint')).toHaveCount(0);
  await sc.locator('.scn-results').waitFor({ state: 'attached' });
  await sc.getByRole('button', { name: /random/i }).click();
  await sc.getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(sc.locator('.scn-parsed .scn-mon').first()).toBeVisible();
  await expect(sc.locator('.click-hint')).toBeVisible();
});

test('Items under Source=Ladder without data says "No ladder data"; teammate rate rows are buttons', async ({ page }) => {
  await page.route('**/data/manifest.json', async (route) => {
    const res = await route.fetch();
    const m = await res.json();
    m.regs = m.regs.map((r) => (r.id === m.current ? { ...r, ladderMonths: [] } : r)); // simulate "no ladder month" for the current reg
    await route.fulfill({ response: res, json: m });
  });
  await page.route(/data\/ladder-M-C\.json/, (route) => route.fulfill({ json: { reg: 'M-C', source: 'smogon', cutoff: 1760, months: [] } }));
  await page.goto('/#source=ladder');
  await waitForAllSections(page);
  await expect(page.locator('[data-section="items"] .empty-state__title')).toHaveText(['No ladder data for this regulation yet', 'No ladder data for this regulation yet']);
  const row = page.locator('main [data-section="teammates"] .card').filter({ hasText: 'Teammate rate' }).locator('.sb-row').first();
  await row.scrollIntoViewIfNeeded();
  await expect(row).toHaveAttribute('role', 'button');
  await expect(row).toHaveAttribute('data-tip', /Show only teams with/);
});

test('no chart aria-label contains NaN or undefined (default view and M-B)', async ({ page }) => {
  for (const hash of ['', '#reg=M-B']) {
    await page.goto(`/${hash}`);
    await waitForAllSections(page);
    const bad = await page.evaluate(() => [...document.querySelectorAll('[aria-label]')]
      .map((e) => e.getAttribute('aria-label')).filter((t) => /NaN|undefined/.test(t)));
    expect(bad, hash).toEqual([]);
  }
});

test('section nav: a link scrolls to its section and aria-current follows the scroll', async ({ page }) => {
  await page.goto('/');
  await waitForAllSections(page);
  const nav = page.locator('#secnav');
  await expect(nav.locator('a')).toHaveCount(13);
  await nav.locator('a[data-jump="speed"]').click();
  await expect(nav.locator('[aria-current="true"]')).toHaveText('Speed');
  const top = await page.locator('main [data-section="speed"]').evaluate((e) => e.getBoundingClientRect().top);
  const barBottom = await page.locator('#stickybar').evaluate((e) => e.getBoundingClientRect().bottom);
  expect(top).toBeGreaterThanOrEqual(barBottom - 2); // not hidden behind the sticky bar
  expect(await page.evaluate(() => location.hash)).toBe(''); // the hash holds dashboard state
  await page.mouse.wheel(0, -100000);
  await expect(nav.locator('[aria-current="true"]')).toHaveText('Snapshot');
  await expect(nav.locator('[aria-current="true"]')).toHaveCount(1);
});

test('phones start with the filter bar collapsed when nothing is stored; a stored choice wins', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await waitForUsageRendered(page);
  await expect(page.locator('html')).toHaveAttribute('data-filters-collapsed', '');
  await expect(page.locator('[aria-label="Regulation"]')).toBeHidden();
  await page.locator('#filterbar-toggle').click();
  await page.reload();
  await waitForUsageRendered(page);
  await expect(page.locator('html')).not.toHaveAttribute('data-filters-collapsed', '');
});

test('sticky bar (filters collapsed + section nav) stays under 15% of a phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await waitForUsageRendered(page);
  const h = await page.locator('#stickybar').evaluate((e) => e.offsetHeight);
  expect(h).toBeLessThanOrEqual(844 * 0.15);
  await expect(page.locator('#secnav')).toBeVisible();
  expect(await page.locator('#secnav').evaluate((e) => getComputedStyle(e).overflowX)).toBe('auto');
});

test('how-to strip shows on the first visit, dismiss persists across reload', async ({ page }) => {
  await page.goto('/');
  await waitForUsageRendered(page);
  const strip = page.locator('#howto');
  await expect(strip).toBeVisible();
  await expect(strip).toContainText('Click any bar, row or card');
  await expect(strip).toContainText('Shift-click to exclude');
  await strip.getByRole('link', { name: /Scanner/ }).click();
  await expect(page.locator('#secnav [aria-current="true"]')).toHaveText('Scanner');
  await page.getByRole('button', { name: 'Dismiss tips' }).click();
  await expect(strip).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('metalens.howtoDismissed'))).toBe('1');
  await page.reload();
  await waitForUsageRendered(page);
  await expect(strip).toBeHidden();
});

test('snapshot: one "Change vs" line under the cards, cards show only the change', async ({ page }) => {
  await page.goto('/');
  await waitForAllSections(page);
  const snap = page.locator('[data-section="snapshot"]');
  await expect(snap.locator('.snapshot__change')).toHaveCount(1, { timeout: 30_000 });
  await expect(snap.locator('.snapshot__change')).toContainText(/^Change vs M-B \(prev n=[\d,]+ teams\)/);
  for (const t of await snap.locator('.snapshot__mon .kpi__delta').allTextContents()) {
    expect(t).toMatch(/^(NEW|[▲▼—] [+-]?\d+\.\dpt)$/);
  }
});

test('snapshot: the Most-used Mega name only breaks after a hyphen at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await waitForAllSections(page);
  const v = page.locator('[data-section="snapshot"] .kpi').filter({ hasText: 'Most-used Mega' }).locator('.kpi__value > span');
  await expect(v.locator('wbr')).toHaveCount(await v.evaluate((s) => (s.textContent.match(/-/g) || []).length));
  expect(await v.evaluate((s) => getComputedStyle(s).overflowWrap)).toBe('normal');
  expect(await v.evaluate((s) => s.scrollWidth <= s.clientWidth + 1)).toBe(true);
});

test('off-screen sections carry aria-busy while they catch up, none once rendering is done', async ({ page }) => {
  await page.addInitScript(() => {
    window.__busySeen = false;
    new MutationObserver((ms) => { for (const m of ms) if (m.target.getAttribute?.('aria-busy') === 'true') window.__busySeen = true; })
      .observe(document, { subtree: true, attributes: true, attributeFilter: ['aria-busy'] });
  });
  await page.goto('/');
  await waitForAllSections(page);
  expect(await page.evaluate(() => window.__busySeen)).toBe(true);
  await expect(page.locator('main [data-section][aria-busy="true"]')).toHaveCount(0);
});

test('no horizontal overflow at 390px in both skins with the nav and how-to strip present', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const hash of ['/#skin=retro', '/#skin=pro&theme=light']) {
    await page.goto(hash);
    await waitForAllSections(page);
    await expect(page.locator('#howto')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth), hash).toBeLessThanOrEqual(390);
  }
});

// --- Spread explorer (deep dive) and the scanner's SP check ---
async function openDeepDive(page, hash, key) {
  await page.goto(hash);
  await waitForUsageRendered(page);
  await page.locator('[data-section="usage"] .sprite-btn').first().click();
  const input = page.locator('#ddv-picker-input');
  await input.fill(key);
  await input.press('Enter');
  await expect(page.locator('#deepdive-title')).toHaveText(key);
  const card = page.locator('#deepdive .ddv-block').filter({ has: page.locator('h3', { hasText: 'Spread explorer' }) });
  await expect(card).toBeVisible();
  return card;
}

test('Spread explorer (M-C, Rillaboom): rows with 6 numeric stats, archetype strip, regulation shift, Smogon option only with an M-C month', async ({ page }) => {
  const card = await openDeepDive(page, '/', 'Rillaboom');
  const rows = card.locator('.spx-row');
  expect(await rows.count()).toBeGreaterThanOrEqual(3);
  for (const stats of await rows.locator('.spx-row__stats').allInnerTexts()) {
    const nums = stats.replace('Lv50', '').split('/').map((x) => Number(x.trim()));
    expect(nums).toHaveLength(6);
    expect(nums.every((n) => Number.isInteger(n) && n > 0)).toBe(true);
  }
  await expect(card.locator('.spx-cover')).toContainText(/cover \d+%/);
  expect(await card.locator('.spx-bar__seg').count()).toBeGreaterThanOrEqual(2);
  await expect(card.locator('.spx-natures')).toContainText(/Natures: \w+ \d+%/);
  await expect(card.locator('.spx-shift')).toContainText(/NEW in M-C|Change from M-B to M-C/, { timeout: 15000 });
  await expect(card.locator('.spx-shift')).not.toContainText('loading');
  await expect(card).toContainText('sample size not published');
  await expect(card).toContainText('Battle data provided by Pokémon Champions Battle Data');
  // The Smogon toggle follows the data: none until Smogon publishes an M-C month, then it must appear.
  const mcMonths = await page.evaluate(async () => ((await (await fetch('data/ladder-M-C.json')).json()).months || []).length);
  await expect(card.locator('.spx-toggle')).toHaveCount(mcMonths ? 1 : 0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(await card.evaluate((c) => c.scrollWidth <= c.clientWidth + 1)).toBe(true);
  const text = await card.innerText();
  expect(text).not.toMatch(/\bNaN\b|\bundefined\b|Infinity/);
  // the old duplicate cards are gone
  await expect(page.locator('#deepdive').getByText('Top SP spreads & natures')).toHaveCount(0);
});

test('Spread explorer (M-B, Incineroar): Smogon option switches the meta line to battles', async ({ page }) => {
  const card = await openDeepDive(page, '/#reg=M-B', 'Incineroar');
  const ranked = card.locator('.spx-toggle__btn[data-source="ranked"]');
  const smogon = card.locator('.spx-toggle__btn[data-source="smogon"]');
  await expect(ranked).toHaveAttribute('aria-pressed', 'true');
  await expect(card.locator('.meta-line')).toContainText('sample size not published');
  await smogon.click();
  await expect(smogon).toHaveAttribute('aria-pressed', 'true');
  await expect(card.locator('.meta-line')).toContainText(/Smogon 1760 ladder · 2026-\d\d · [\d,]+ Incineroar entries · n=[\d,]+ battles/);
  await expect(card.locator('.spx-shift')).toHaveCount(0);
  expect(await card.locator('.spx-row').count()).toBeGreaterThanOrEqual(3);
  const text = await card.innerText();
  expect(text).toMatch(/Impish|Careful|Adamant/);
  expect(text).not.toMatch(/\bNaN\b|\bundefined\b|Infinity/);
});

test('Scanner SP check: exact / nearest spread from an EVs-style SP line, no NaN', async ({ page }) => {
  await page.goto('/');
  await waitForAllSections(page);
  const sc = page.locator('main [data-section="scanner"]');
  await sc.scrollIntoViewIfNeeded();
  await sc.locator('textarea').fill(['Rillaboom @ Miracle Seed\nAbility: Grassy Surge\nEVs: 32 HP / 32 Atk / 2 Spe\nAdamant Nature\n- Fake Out',
    'Incineroar @ Sitrus Berry\nEVs: 32 HP / 30 Atk / 4 Def\nImpish Nature\n- Fake Out', 'Sneasler @ Focus Sash\n- Fake Out', 'Garchomp\n- Earthquake'].join('\n\n'));
  await sc.getByRole('button', { name: 'Scan', exact: true }).click();
  const card = sc.locator('.scn-block').filter({ has: page.locator('h3', { hasText: 'SP check' }) });
  await expect(card).toBeVisible();
  const text = await card.innerText();
  expect(text).toMatch(/Common spread \(#\d+, \d+% of ranked spreads\)|Nearest common spread/);
  expect(text).toContain('no SP line — assumed most common spread');
  expect(text).not.toMatch(/\bNaN\b|\bundefined\b|Infinity/);
});

test('when Smogon publishes an M-C month (simulated with the M-B file), Ladder mode, Teammate rate and the Spread explorer use it', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/data\/ladder-M-C\.json/, async (route) => {
    const res = await route.fetch({ url: route.request().url().replace('ladder-M-C', 'ladder-M-B') });
    const json = await res.json();
    json.months = json.months.slice(-1).map((m) => ({ ...m, month: '2026-09' }));
    await route.fulfill({ json });
  });
  await page.goto('/#source=ladder');
  await waitForAllSections(page);
  const lead = page.locator('[data-section="usage"]');
  await expect(lead.locator('tbody tr').first()).toBeVisible();
  await expect(lead).toContainText(/battles/);
  const rate = page.locator('[data-section="teammates"] .card').filter({ hasText: 'Teammate rate' });
  await rate.scrollIntoViewIfNeeded();
  await waitForAllSections(page);
  await expect(rate).toContainText('Ladder (Smogon)');
  expect(await page.locator('body').innerText()).not.toMatch(/\bNaN\b|\bundefined\b/);
  const card = await openDeepDive(page, '/', 'Incineroar');
  await expect(card.locator('.spx-toggle')).toHaveCount(1);
  expect(errors).toEqual([]);
});

// Motion layer (ui/motion.js + the "motion" / "fireflies" blocks of app.css).
test('motion: bars grow after a filter click (and nothing else moves), the drawer slides out before it hides', async ({ page }) => {
  await page.goto('/');
  await waitForAllSections(page);
  await page.locator('[data-section="usage"] tbody tr').first().click();
  await waitForAllSections(page);
  // Motion budget (CLAUDE.md): after a click only the new chip, the bars and the ambient fireflies move.
  const moving = await page.evaluate(() => [...new Set(document.getAnimations()
    .filter((a) => a.playState === 'running')
    .filter((a) => { const r = a.effect?.target?.getBoundingClientRect?.(); return r && r.bottom > 0 && r.top < innerHeight; })
    .map((a) => a.animationName || a.transitionProperty || 'script'))]);
  const allowed = ['chip-pop', 'chip-glow', 'ff-lift', 'ff-drift', 'ff-blink', 'bar-grow', 'scroll-progress', 'busy-sweep'];
  expect(moving.filter((n) => !allowed.includes(n)), `unexpected animations: ${moving}`).toEqual([]);
  const anim = await page.locator('[data-section="usage"] .usage-bar__fill').first().evaluate((e) => getComputedStyle(e).animationName);
  expect(anim).toBe('bar-grow');

  await page.locator('[data-section="usage"] tbody tr img').first().click();
  const drawer = page.locator('#deepdive');
  await expect(drawer).toHaveClass(/is-open/);
  await page.keyboard.press('Escape');
  // Closed, it hides only after the slide-out (a delayed visibility transition; timing it races on slow runners).
  expect(await drawer.evaluate((e) => getComputedStyle(e).transitionDelay)).toBe('0.18s');
  await expect(drawer).toBeHidden();
});

// Owner's call (2026-09-30): cross-filters never blank a chart. A selected Pokémon is plotted on its own;
// a view where nothing reaches min n shows the real smaller samples, flagged "includes n < 20".
test('cross-filters: the quadrant plots a single selected Pokémon; a rare one fills every chart with an n flag', async ({ page }) => {
  await page.goto('/#chips=species:Rillaboom');
  await waitForAllSections(page);
  const quad = page.locator('main [data-section="quadrant"]');
  await expect(quad.locator('.empty-state')).toHaveCount(0);
  const pts = await quad.locator('[_echarts_instance_]').evaluate((e) => echarts.getInstanceByDom(e).getOption().series[0].data.map((d) => d.key));
  expect(pts).toEqual(['Rillaboom']);

  await page.goto('/#chips=species:Pikachu'); // 9 teams on M-C, under the default min n of 20
  await waitForAllSections(page);
  for (const id of ['snapshot', 'usage', 'quadrant', 'items']) {
    const sec = page.locator(`main [data-section="${id}"]`);
    await expect(sec.locator('.empty-state')).toHaveCount(0);
    await expect(sec.locator('.meta-line__relaxed').first()).toHaveText('includes n < 20');
  }
  await expect(page.locator('main [data-section="usage"] tbody tr')).toHaveCount(1);
});

test('fireflies: the meta leader glows while on screen; only a newly added chip lights up', async ({ page }) => {
  await page.goto('/');
  await waitForAllSections(page);
  const lead = page.locator('[data-section="snapshot"] .snapshot__mon--lead');
  await expect(lead).toHaveCount(1);
  await expect(lead.locator('.ff-layer i')).toHaveCount(4);
  await expect(page.locator('.snapshot-card')).toHaveClass(/is-live/);
  await page.locator('main [data-section="scanner"]').scrollIntoViewIfNeeded();
  await expect(page.locator('.snapshot-card')).not.toHaveClass(/is-live/); // paused off-screen

  await page.evaluate(() => scrollTo(0, 0));
  await page.locator('[data-section="usage"] tbody tr').nth(1).click();
  await expect(page.locator('#chips .chip--new')).toHaveCount(1);
  await waitForAllSections(page);
  await page.locator('[data-section="usage"] tbody tr .item-link').first().click(); // + an Item chip
  await waitForAllSections(page);
  // Two chips now: only the second is new; the first no longer re-pops.
  await expect(page.locator('#chips .chip')).toHaveCount(2);
  await expect(page.locator('#chips .chip').first()).not.toHaveClass(/chip--new/);
  await expect(page.locator('#chips .chip').nth(1)).toHaveClass(/chip--new/);
  await page.getByRole('button', { name: 'Top 8' }).click();
  await waitForAllSections(page);
  await expect(page.locator('#chips .chip--new')).toHaveCount(0); // a non-chip change animates nothing
});

test('one sprite scale (24/32/48/96) everywhere; item shares carry one decimal, so no real item reads 0%', async ({ page }) => {
  await page.goto('/');
  await waitForAllSections(page);
  const sizes = await page.evaluate(() => [...new Set([...document.querySelectorAll('main img.sprite, #chips img.sprite')].map((i) => i.getBoundingClientRect().width))]);
  expect(sizes.every((w) => [24, 32, 48, 96].includes(w)), `sprite widths: ${sizes}`).toBe(true);
  const shares = await page.locator('[data-section="items"] .item-link__pct').allTextContents();
  expect(shares.length).toBeGreaterThan(10);
  for (const s of shares) expect(s).toMatch(/^\d+\.\d%$/);
  expect(shares).not.toContain('0.0%');
});

test('archetype trend: weekly lines for the top archetypes; colours follow the archetype, not its rank; a line click adds that chip', async ({ page }) => {
  await page.goto('/#reg=M-B');
  await waitForAllSections(page);
  const trendEl = page.locator('main [data-section="archetypes"] .card').nth(1).locator('[_echarts_instance_]');
  await trendEl.scrollIntoViewIfNeeded();
  const opt = await trendEl.evaluate((e) => { const o = echarts.getInstanceByDom(e).getOption(); return { weeks: o.xAxis[0].data.length, series: o.series.map((s) => ({ name: s.name, color: s.itemStyle.color, n: s.data.length })) }; });
  expect(opt.weeks).toBeGreaterThan(4);
  expect(opt.series.length).toBe(6);
  for (const s of opt.series) expect(s.n).toBe(opt.weeks);
  const donutColor = (name) => page.locator('main [data-section="archetypes"] .card').first().locator('[_echarts_instance_]')
    .evaluate((e, name) => echarts.getInstanceByDom(e).getOption().series[0].data.find((d) => d.name === name)?.itemStyle.color, name);
  const tailwindBefore = await donutColor('Tailwind');
  expect(tailwindBefore).toBe(opt.series.find((s) => s.name === 'Tailwind').color); // same colour in donut and trend

  await page.goto('/#reg=M-B&chips=type:Electric'); // reorders the split
  await waitForAllSections(page);
  expect(await donutColor('Tailwind')).toBe(tailwindBefore);

  await page.goto('/#reg=M-B');
  await waitForAllSections(page);
  await trendEl.scrollIntoViewIfNeeded();
  const pt = await trendEl.evaluate((e) => { const i = echarts.getInstanceByDom(e); return i.convertToPixel({ seriesIndex: 0 }, [2, i.getOption().series[0].data[2]]); });
  const box = await trendEl.boundingBox();
  await page.mouse.click(box.x + pt[0], box.y + pt[1]);
  await expect(page.locator('#chips .chip')).toHaveCount(1);
  await expect(page.locator('#chips .chip__label')).toHaveText(/^Archetype: /);
});

test('meta by country: rows per country; a row click adds a Country chip that filters the dashboard and survives reload', async ({ page }) => {
  await page.goto('/');
  await waitForAllSections(page);
  const rows = page.locator('main [data-section="countries"] tbody tr');
  expect(await rows.count()).toBeGreaterThan(5);
  await expect(rows.first().locator('.cty-name')).toContainText('United States');
  const before = await teamsSampledValue(page).textContent();
  await rows.nth(1).scrollIntoViewIfNeeded();
  await rows.nth(1).click();
  await waitForAllSections(page);
  await expect(page.locator('#chips .chip__label')).toHaveText('Country: Brazil');
  expect(await teamsSampledValue(page).textContent()).not.toBe(before);
  expect(await page.evaluate(() => location.hash)).toContain('country:BR');
  await page.reload();
  await waitForAllSections(page);
  await expect(page.locator('#chips .chip__label')).toHaveText('Country: Brazil');
  await expect(page.locator('main [data-section="countries"] tbody tr')).toHaveCount(1);
});

test('library Filter also loads that team into the Scanner and scans it against the whole field; the team chip is named', async ({ page }) => {
  await page.goto('/');
  await waitForAllSections(page);
  const card = page.locator('[data-section="library"] .lib-card').first();
  await card.scrollIntoViewIfNeeded();
  await card.locator('.lib-btn', { hasText: 'Filter' }).click();
  await expect(page.locator('#chips .chip__label')).toHaveText(/^Team: .+ · .+/); // "Player · Event", not the raw id
  await expect(page.locator('.toast__action')).toHaveText('View scan');
  await page.locator('.toast__action').click();
  await waitForAllSections(page);
  await expect(page.locator('#scn-textarea')).toHaveValue(/@/);
  await expect(page.locator('[data-section="scanner"] .scn-parsed .scn-mon')).toHaveCount(6);
  // Reference field = everything but the team chip, not the one filtered team.
  const snapshotTeams = await teamsSampledValue(page).textContent();
  expect(snapshotTeams.trim()).toBe('1');
  const expectedTeams = (await (await page.request.get('/data/manifest.json')).json()).regs.find((r) => r.id === 'M-C').teams;
  await expect(page.locator('[data-section="scanner"]')).toContainText(`n=${expectedTeams.toLocaleString('en-US')} teams in view`);
});

test('leaderboard search: "/" focuses it, finds any Pokémon with its real rank, Escape clears; change column when a previous period exists', async ({ page }) => {
  await page.goto('/');
  await waitForAllSections(page);
  const lb = page.locator('main [data-section="usage"]');
  await expect(lb.locator('th.col-chg')).toHaveText('Change');
  await page.keyboard.press('/');
  await page.keyboard.type('raichu mega');
  await expect(lb.locator('tbody tr')).toHaveCount(2);
  const foundRank = (await lb.locator('tbody tr').first().locator('.col-rank').innerText()).trim();
  const foundName = (await lb.locator('tbody tr').first().locator('td').nth(1).innerText()).trim();
  await page.keyboard.press('Escape');
  await expect(lb.locator('tbody tr')).toHaveCount(30);
  // the searched row's rank is its real rank in the unfiltered list
  await expect(lb.locator('tbody tr').nth(Number(foundRank) - 1).locator('td').nth(1)).toHaveText(foundName);
  await lb.locator('input[type=search]').fill('zzzz');
  await expect(lb.locator('.empty-state__title')).toHaveText('No Pokémon matching “zzzz”');
  for (const t of await lb.locator('td.col-chg').allTextContents()) expect(t).not.toContain('-0.0');
});

test('leaderboard Change column is absent for M-A (no previous period), ladder and ranked; Copy link survives a missing Clipboard API', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }); });
  for (const hash of ['reg=M-A', 'source=ladder', 'reg=M-B&source=ranked']) {
    await page.goto(`/#${hash}`);
    await waitForAllSections(page);
    const lb = page.locator('main [data-section="usage"]');
    await expect(lb.locator('th.col-chg')).toHaveCount(0);
    expect(await lb.innerText()).not.toMatch(/NaN|undefined/);
  }
  await page.locator('#copy-link').click();
  await expect(page.locator('.toast')).toBeVisible(); // copied via the textarea fallback, or an error toast; never a crash
  expect(errors).toEqual([]);
});

test('punctuation-only search ("-") matches nothing in both the leaderboard and Items searches', async ({ page }) => {
  await page.goto('/');
  await waitForAllSections(page);
  for (const id of ['usage', 'items']) {
    const sec = page.locator(`main [data-section="${id}"]`);
    await sec.locator('input[type=search]').fill('-');
    await expect(sec.locator('.empty-state__title')).toHaveText('No Pokémon matching “-”');
  }
});

test('deep dive: Filter-dashboard adds one chip, Copy set pastes the species, new cards present', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__copied = t; } }, configurable: true }); });
  await openDeepDive(page, '/', 'Garchomp');
  const key = await page.locator('#deepdive-title').textContent();
  await expect(page.locator('#chips .chip')).toHaveCount(0); // opening never adds a chip
  for (const t of ['Stat range (Lv50)', 'Type matchups', 'Usage by week', 'Common move sets']) {
    await expect(page.locator('#deepdive .ddv-block').filter({ has: page.locator('h3', { hasText: t }) })).toHaveCount(1);
  }
  await expect(page.locator('#deepdive .ddv-matchrow')).toHaveCount(5);
  await expect(page.locator('#deepdive')).not.toContainText('NaN');
  await page.locator('#deepdive .ddv-btn', { hasText: 'Filter dashboard by' }).click();
  await expect(page.locator('#chips .chip')).toHaveCount(1);
  await expect(page.locator('#deepdive')).toHaveClass(/is-open/);
  const copy = page.locator('#deepdive .ddv-copyset');
  if (await copy.count()) {
    await copy.click();
    const base = key.split('-')[0];
    await expect.poll(() => page.evaluate(() => window.__copied || '')).toContain(base);
  }
});

test('settings panel: mode/style/palette change, persist on reload, never enter the hash; fits 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/');
  await waitForUsageRendered(page);
  const html = page.locator('html');
  await page.locator('.gear').click();
  const panel = page.locator('#settings-panel');
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Light' }).click();
  await panel.getByRole('button', { name: 'Retro' }).click();
  await panel.getByRole('button', { name: 'Ghost (Purple)' }).click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(html).toHaveAttribute('data-skin', 'retro');
  await expect(html).toHaveAttribute('data-palette', 'ghost');
  await expect(panel.getByRole('button', { name: 'Ghost (Purple)' })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => location.hash)).not.toMatch(/skin|theme|palette/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const box = await panel.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(page.locator('.gear')).toBeFocused();
  await page.reload();
  await expect(html).toHaveAttribute('data-palette', 'ghost');
  await expect(html).toHaveAttribute('data-skin', 'retro');
});

test("What's new lists the current version and clears the gear dot; clock popover shows the refresh line", async ({ page }) => {
  const { readFileSync } = await import('node:fs');
  const ver = JSON.parse(readFileSync('package.json', 'utf8')).version;
  await page.goto('/');
  await waitForUsageRendered(page);
  await expect(page.locator('.gear__dot')).toBeVisible();
  await page.locator('.gear').click();
  await expect(page.locator('#settings-panel .settings__foot')).toContainText('v' + ver);
  await page.getByRole('button', { name: 'What’s new' }).click();
  const dlg = page.locator('dialog.changelog');
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText('v' + ver);
  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
  await expect(page.locator('.gear')).toBeFocused();
  await expect(page.locator('.gear__dot')).toBeHidden();
  await page.locator('.clock').click();
  await expect(page.locator('#clock-panel')).toContainText('Next data refresh in');
  await expect(page.locator('#clock-panel')).toContainText('Mon 08:00 GMT+8');
  await expect(page.locator('#clock-panel')).toContainText('Data updated');
  await page.keyboard.press('Escape');
  await page.locator('.gear').click();
  await page.locator('#settings-panel').getByText('Show clock').click();
  await expect(page.locator('.clock')).toBeHidden();
});

test('Pokédex: row opens details without a chip; search suggestions, filter tags and P focus work', async ({ page }) => {
  await page.goto('/');
  await waitForAllSections(page);
  const sec = page.locator('[data-section="pokedex"]');
  const rows = sec.locator('.dex-row');
  await expect(rows.first()).toBeVisible();
  const total = await rows.count();
  expect(total).toBeGreaterThan(10);
  await page.keyboard.press('p');
  await expect(sec.locator('.dex-search')).toBeFocused();
  await sec.locator('.dex-search').fill('fake');
  await expect(sec.locator('.dex-sug__head', { hasText: 'Moves' })).toBeVisible();
  await sec.locator('.dex-sug__opt', { hasText: 'Fake Out' }).first().click();
  const tag = sec.locator('.dex-tag[aria-label="Remove filter Fake Out"]');
  await expect(tag).toBeVisible();
  await expect.poll(() => rows.count()).toBeLessThan(total);
  await tag.click();
  await sec.locator('.dex-search').fill('drag');
  await sec.locator('.dex-sug__opt', { hasText: /^Dragon$/ }).first().click();
  await expect(sec.locator('.dex-tag[aria-label="Remove filter Dragon"]')).toBeVisible();
  expect(await page.locator('#chips .chip').count()).toBe(0);
  await sec.locator('.dex-tag').first().click();
  await expect(sec.locator('.dex-tag')).toHaveCount(0);
  await rows.first().click();
  await expect(page.locator('#deepdive[aria-hidden="false"]')).toBeVisible();
  expect(await page.locator('#chips .chip').count()).toBe(0);
});

test('Pokédex: tier bars, stat header sort, unused species opens the drawer cleanly', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await waitForAllSections(page);
  const sec = page.locator('[data-section="pokedex"]');
  await expect(sec.locator('.dex-seg__btn', { hasText: 'A–Z' })).toHaveAttribute('aria-pressed', 'true'); // A–Z is the default
  expect(await sec.locator('.dex-tierbar').count()).toBe(0);
  await sec.locator('.dex-seg__btn', { hasText: 'Tier' }).click();
  expect(await sec.locator('.dex-tierbar').count()).toBeGreaterThan(1);
  const spe = sec.locator('.dex-sort', { hasText: 'Spe' });
  await spe.click();
  await expect(spe).toHaveAttribute('aria-sort', 'descending');
  await expect(sec.locator('.dex-tierbar')).toHaveCount(0);
  const vals = await sec.locator('.dex-row').evaluateAll((els) => els.slice(0, 30).map((e) => +e.querySelectorAll('.dex-stat b')[5].textContent));
  expect(vals[0]).toBe(Math.max(...vals));
  expect(vals).toEqual([...vals].sort((a, b) => b - a));
  await spe.click();
  await expect(spe).toHaveAttribute('aria-sort', 'none'); // back to the default A–Z
  // an unused species (usage "—") still opens a sane drawer
  await sec.locator('.dex-seg__btn', { hasText: 'A–Z' }).click();
  await sec.locator('.dex-row', { has: page.locator('.dex-row__use', { hasText: '—' }) }).first().click();
  await expect(page.locator('#deepdive[aria-hidden="false"]')).toBeVisible();
  expect(await page.locator('#deepdive').innerText()).not.toMatch(/NaN|undefined/);
  expect(errors).toEqual([]);
});

test('Pokédex: no horizontal overflow at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/');
  await waitForAllSections(page);
  await expect(page.locator('[data-section="pokedex"] .dex-row').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('Pokédex: no match shows an empty state and hides Show more', async ({ page }) => {
  await page.goto('/');
  await waitForAllSections(page);
  const sec = page.locator('[data-section="pokedex"]');
  await expect(sec.locator('.dex-more')).toBeVisible();
  await sec.locator('.dex-search').fill('fire');
  await sec.locator('.dex-sug__opt', { hasText: /^Fire$/ }).first().click();
  await sec.locator('.dex-search').fill('water');
  await sec.locator('.dex-sug__opt', { hasText: /^Water$/ }).first().click();
  await sec.locator('.dex-search').fill('ice');
  await sec.locator('.dex-sug__opt', { hasText: /^Ice$/ }).first().click();
  await expect(sec.locator('.empty-state')).toContainText('No Pokémon match');
  await expect(sec.locator('.dex-row')).toHaveCount(0);
  await expect(sec.locator('.dex-more')).toBeHidden();
});

test('extra styles: each is selectable in settings, persists on reload, no overflow at 390px, no console errors', async ({ page }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await waitForUsageRendered(page);
  const html = page.locator('html');
  for (const [skin, label] of [['glass', 'Glass'], ['paper', 'Paper'], ['terminal', 'Terminal'], ['soft', 'Soft']]) {
    await page.locator('.gear').click();
    const panel = page.locator('#settings-panel');
    await panel.getByRole('button', { name: label, exact: true }).click();
    await expect(html).toHaveAttribute('data-style', skin);
    await expect(html).toHaveAttribute('data-skin', 'pro');
    await expect(panel.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true');
    const box = await panel.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    await page.keyboard.press('Escape');
    await page.reload();
    await waitForUsageRendered(page);
    await expect(html).toHaveAttribute('data-style', skin);
    await expect(html).toHaveAttribute('data-skin', 'pro');
    await waitForAllSections(page);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(sw, `${skin} overflows at 390px (scrollWidth=${sw})`).toBeLessThanOrEqual(390);
  }
  expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
});

test('tips strip stays pinned while scrolling; Pokédex sits after the usage + quadrant pair', async ({ page }) => {
  await page.goto('/');
  await waitForUsageRendered(page);
  await expect(page.locator('#howto')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 2500));
  await page.waitForTimeout(300);
  const top = await page.locator('#howto').evaluate((e) => e.getBoundingClientRect().top);
  expect(top).toBeGreaterThanOrEqual(0);
  expect(top).toBeLessThan(200);
  const ids = await page.locator('main > section[data-section]').evaluateAll((els) => els.map((e) => e.dataset.section));
  expect(ids.indexOf('pokedex')).toBe(ids.indexOf('quadrant') + 1);
  const nav = await page.locator('#secnav a').evaluateAll((els) => els.map((e) => e.dataset.jump));
  expect(nav.indexOf('pokedex')).toBe(nav.indexOf('usage') + 1);
});

test('animated sprites keep their proportions (a tall 52x87 sprite is not stretched into a square)', async ({ page }) => {
  const { deflateSync, crc32 } = await import('node:zlib');
  const png = (w, h) => {
    const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4); d.copy(b, 8); b.writeUInt32BE(crc32(b.subarray(4, 8 + d.length)) >>> 0, 8 + d.length); return b; };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
    const raw = Buffer.alloc((w * 3 + 1) * h, 120);
    for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  };
  await page.route(/sprites\/ani\/.*\.gif$/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: png(52, 87) }));
  await page.addInitScript(() => localStorage.setItem('metalens.prefs', JSON.stringify({ skin: 'pro', theme: 'dark', anim: true, palette: 'grass' })));
  await page.goto('/');
  await waitForUsageRendered(page);
  const isAni = `(x) => x.src.includes('/ani/') && x.naturalWidth === 52 && x.style.height`;
  await page.waitForFunction(`[...document.querySelectorAll('img.sprite')].some(${isAni})`, null, { timeout: 30000 });
  const m = await page.evaluate(`(() => {
    const i = [...document.querySelectorAll('img.sprite')].find(${isAni});
    const bb = i.getBoundingClientRect(), cs = getComputedStyle(i);
    return { box: [Math.round(bb.width), Math.round(bb.height)], w: parseFloat(cs.width), h: parseFloat(cs.height) };
  })()`);
  expect(m, 'an animated sprite from /ani/ loaded').not.toBeNull();
  expect(m.box[0]).toBe(m.box[1]); // footprint stays square
  expect(Math.abs(m.h / m.w - 87 / 52)).toBeLessThan(0.1); // content keeps the sprite's aspect
});

test('Showdown mode: switch, sections hidden, EV rules, reload keeps reg, back to VGC', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await waitForAllSections(page);
  await page.locator('.modeswitch button[data-mode="showdown"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-family', 'showdown');
  await expect.poll(() => page.url()).toContain('reg=ND');
  for (const id of ['quadrant', 'archetypes', 'countries', 'library', 'scanner']) {
    await expect(page.locator(`main [data-section="${id}"]`)).toBeHidden();
    await expect(page.locator(`#secnav a[data-jump="${id}"]`)).toBeHidden();
  }
  await expect(page.locator('.filterbar [data-g="source"]')).toBeHidden();
  await expect(page.locator('.filterbar .segmented button', { hasText: 'Reg M-C' })).toBeHidden();
  await expect(page.locator('main [data-section="snapshot"] .snap__card, main [data-section="snapshot"] .card').first()).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-family', 'showdown');
  await page.locator('.filterbar .segmented button', { hasText: 'NatDex Doubles' }).click();
  await expect.poll(() => page.url()).toContain('reg=NDD');
  await waitForAllSections(page);
  for (const id of ['snapshot', 'usage', 'pokedex', 'types', 'items', 'teammates', 'speed', 'trends']) {
    const text = await page.locator(`main [data-section="${id}"]`).innerText();
    expect(text, id).not.toMatch(/NaN|undefined|Infinity|Insufficient/);
  }
  // deep dive: Tera card + Lv100 EV stat range
  await page.locator('[data-section="pokedex"] .dex-row').first().click();
  const dd = page.locator('#deepdive[aria-hidden="false"]');
  await expect(dd).toBeVisible();
  await expect(dd).toContainText('Stat range (Lv100)');
  await page.keyboard.press('Escape');
  await page.locator('.modeswitch button[data-mode="vgc"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-family', 'vgc');
  await expect.poll(() => page.url()).not.toContain('reg=ND');
  await expect(page.locator('main [data-section="scanner"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Pokédex follows the dashboard filters, but clicking it adds none', async ({ page }) => {
  await page.goto('/#chips=type:Dragon');
  await waitForAllSections(page);
  const rows = page.locator('[data-section="pokedex"] .dex-row');
  await expect(rows.first()).toBeVisible();
  const names = await rows.evaluateAll((els) => els.map((e) => e.textContent));
  expect(names.length).toBeGreaterThan(0);
  expect(await page.locator('[data-section="pokedex"] .dex-row .type-pill, [data-section="pokedex"] .dex-row [class*="pill"]').evaluateAll((els) => els.filter((e) => e.textContent.trim() === 'Dragon').length)).toBeGreaterThanOrEqual(names.length);
  await rows.first().click();
  await expect(page.locator('#chips .chip')).toHaveCount(1); // still just the Dragon chip
});
