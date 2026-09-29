import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Text tokens must stay readable (WCAG AA, 4.5:1) on every surface in every
// skin/theme. Reads the colour tokens straight from app.css.
const css = readFileSync(new URL('../public/css/app.css', import.meta.url), 'utf8');

function block(selector) {
  const i = css.indexOf(`${selector} {`);
  assert.ok(i >= 0, `missing ${selector}`);
  const body = css.slice(i, css.indexOf('}', i));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
}
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// The light palettes are the second [data-skin] block (the first holds fonts etc.).
function lightBlock(skin) {
  const sel = `[data-skin="${skin}"] {`;
  const first = css.indexOf(sel);
  const second = css.indexOf(sel, first + 1);
  const body = css.slice(second, css.indexOf('}', second));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
}

for (const skin of ['pro', 'retro']) {
  for (const theme of ['light', 'dark']) {
    test(`contrast: ${skin} ${theme} text tokens >= 4.5:1 on every surface`, () => {
      const t = theme === 'light' ? lightBlock(skin) : block(`[data-skin="${skin}"][data-theme="dark"]`);
      // Selected buttons / chips: --surface-1 text on --accent. Links and focus rings: --accent-2.
      const accent = t.accent || lightBlock(skin).accent || block(`[data-skin="${skin}"]`).accent;
      const accent2 = t['accent-2'] || block(`[data-skin="${skin}"]`)['accent-2'];
      assert.ok(ratio(t['surface-1'], accent) >= 4.5, `${skin} ${theme}: text on --accent ${accent} is ${ratio(t['surface-1'], accent).toFixed(2)}:1`);
      for (const bg of ['surface-0', 'surface-1', 'surface-2']) {
        assert.ok(ratio(accent2, t[bg]) >= 4.5, `${skin} ${theme}: --accent-2 ${accent2} on --${bg} is ${ratio(accent2, t[bg]).toFixed(2)}:1`);
      }
      for (const fg of ['ink', 'ink-2', 'muted']) {
        for (const bg of ['surface-0', 'surface-1', 'surface-2']) {
          assert.ok(t[fg] && t[bg], `${skin} ${theme}: missing --${fg} or --${bg}`);
          const r = ratio(t[fg], t[bg]);
          assert.ok(r >= 4.5, `${skin} ${theme}: --${fg} ${t[fg]} on --${bg} ${t[bg]} is ${r.toFixed(2)}:1`);
        }
      }
    });
  }
}
