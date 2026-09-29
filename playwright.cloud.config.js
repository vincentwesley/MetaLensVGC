// Playwright config for sandboxes that can't download browsers or reach the
// internet (Claude Code cloud sessions): reuse the preinstalled Chromium and
// stub third-party hosts (see E2E_OFFLINE in e2e/app.spec.js).
//   npm run e2e:cloud     /     npx playwright test -c playwright.cloud.config.js
import base from './playwright.config.js';

process.env.E2E_OFFLINE = '1';
const executablePath = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';

export default {
  ...base,
  projects: base.projects.map((p) => ({ ...p, use: { ...p.use, launchOptions: { executablePath } } })),
};
