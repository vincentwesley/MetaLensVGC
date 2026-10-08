import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHANGELOG, VERSION } from '../public/js/lib/changelog.js';

test('VERSION matches package.json', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.version, VERSION);
});

test('changelog entries are well formed and newest first', () => {
  for (const e of CHANGELOG) {
    assert.match(e.version, /^\d+\.\d+\.\d+$/);
    assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!Number.isNaN(Date.parse(e.date)) && e.title && e.notes.length);
    for (const n of e.notes) { assert.ok(['NEW', 'FIX', 'IMPROVED'].includes(n.tag)); assert.ok(n.text); }
  }
  for (let i = 1; i < CHANGELOG.length; i++) {
    assert.ok(CHANGELOG[i - 1].date >= CHANGELOG[i].date, 'dates descend');
    assert.notEqual(CHANGELOG[i - 1].version, CHANGELOG[i].version);
  }
});
