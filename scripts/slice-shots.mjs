// Viewport-height screenshot slices of the running site (npm run serve first), for reviewing long pages.
// Usage: node scripts/slice-shots.mjs "<hash, e.g. skin=pro&theme=dark&source=ranked>" <prefix> [width=1440] -> screenshots/tmp/<prefix>-N.png
// Cloud sessions: PW_CHROMIUM=/opt/pw-browsers/chromium uses that browser; E2E_OFFLINE=1 aborts sprite / font requests.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const [,, hash, prefix, width = '1440'] = process.argv;
const b = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const p = await b.newPage({ viewport: { width: +width, height: 1000 } });
await p.emulateMedia({ reducedMotion: 'reduce' });
if (process.env.E2E_OFFLINE) await p.route(/pokemonshowdown|googleapis|gstatic/, (r) => r.abort());
await mkdir('screenshots/tmp', { recursive: true });
await p.goto('http://localhost:8080/#' + hash);
await p.waitForSelector('[data-section="usage"] tbody tr');
await p.waitForSelector('html:not([data-rendering])', { timeout: 60000 });
await p.waitForTimeout(800);
const h = await p.evaluate(() => document.documentElement.scrollHeight);
let i = 0;
for (let y = 0; y < h; y += 1000) await p.screenshot({ path: `screenshots/tmp/${prefix}-${i++}.png`, clip: { x: 0, y, width: +width, height: Math.min(1000, h - y) }, fullPage: true });
console.log(prefix, h, i);
await b.close();
