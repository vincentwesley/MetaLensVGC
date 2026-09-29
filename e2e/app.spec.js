// End-to-end checks against the local static server (see playwright.config.js).
// Each bullet in GOAL_PROMPT.md's "Definition of done" #3 gets its own test.
import { test, expect } from '@playwright/test';

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
