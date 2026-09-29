import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withChartDefaults } from '../public/js/ui/echarts-theme.js';
import { clampTip } from '../public/js/ui/tip.js';

test('withChartDefaults: every tooltip is confined and wraps, section options win', () => {
  const out = withChartDefaults({ tooltip: { trigger: 'item', extraCssText: 'color:red;' }, series: [] });
  assert.equal(out.tooltip.confine, true);
  assert.equal(out.tooltip.trigger, 'item');
  assert.match(out.tooltip.extraCssText, /white-space:normal/);
  assert.match(out.tooltip.extraCssText, /max-width/);
  assert.match(out.tooltip.extraCssText, /color:red;$/);
  assert.equal(out.aria.enabled, true);
  assert.match(out.aria.label.description, /0 data points/);
  const hm = withChartDefaults({ series: [{ type: 'heatmap', data: [[0, 0, 'x'], [0, 1, null]] }, { type: 'bar', name: 'Weak', data: [{ value: NaN }] }] });
  assert.match(hm.aria.label.description, /^heatmap \/ bar chart of Weak with 3 data points/);
  assert.doesNotMatch(hm.aria.label.description, /NaN|undefined/);
  const arr = withChartDefaults({ tooltip: [{ trigger: 'axis' }, { trigger: 'item' }] });
  assert.ok(arr.tooltip.every((t) => t.confine === true));
  assert.equal(withChartDefaults({ tooltip: { confine: false } }).tooltip.confine, false);
  assert.equal(withChartDefaults({ series: [], aria: { enabled: false } }).aria.enabled, false);
  assert.equal(withChartDefaults(null), null);
});

test('clampTip keeps the tip inside the viewport', () => {
  const vw = 390, vh = 844, tip = { width: 300, height: 60 };
  // Anchor at the right edge: the tip is pulled back inside.
  let p = clampTip({ left: 360, top: 400, width: 20, bottom: 420 }, tip, vw, vh);
  assert.ok(p.left >= 8 && p.left + tip.width <= vw - 8);
  assert.ok(p.top + tip.height <= 400);
  // Anchor at the left edge.
  p = clampTip({ left: 0, top: 400, width: 20, bottom: 420 }, tip, vw, vh);
  assert.equal(p.left, 8);
  // No room above: goes below the anchor.
  p = clampTip({ left: 100, top: 20, width: 40, bottom: 40 }, tip, vw, vh);
  assert.ok(p.top >= 40);
  // Anchor at the very bottom with no room below either: stays on screen.
  p = clampTip({ left: 100, top: 30, width: 40, bottom: 840 }, { width: 300, height: 800 }, vw, vh);
  assert.ok(p.top >= 8 && p.top + 800 <= vh);
});
