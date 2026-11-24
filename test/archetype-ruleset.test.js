import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ARCHETYPES, ARCHETYPE_RULESET } from '../public/js/lib/archetypes.js';

// The paper cites the rule set by version, so any change to the rules must bump it (Vin's Atelier).
const MARK = '// === rules (fingerprinted';
function rulesFingerprint(src) {
  const rules = src.slice(src.indexOf(MARK)).split('\n').filter((l) => !/^\s*source:/.test(l)).join('\n');
  return createHash('sha256').update(rules).digest('hex').slice(0, 16);
}

test('archetype rule set: fingerprint matches the rules (a rule change needs a new version + changes entry)', () => {
  const src = readFileSync(new URL('../public/js/lib/archetypes.js', import.meta.url), 'utf8');
  assert.ok(src.includes(MARK));
  assert.equal(ARCHETYPE_RULESET.fingerprint, rulesFingerprint(src),
    'archetypes.js rules changed: bump ARCHETYPE_RULESET.version, add a dated changes entry, and set fingerprint to the value above');
  const last = ARCHETYPE_RULESET.changes.at(-1);
  assert.equal(last.version, ARCHETYPE_RULESET.version);
  assert.match(last.date, /^\d{4}-\d{2}-\d{2}$/);
});

test('every archetype names its label source (a cited page with a quote, or our own definition)', () => {
  for (const a of ARCHETYPES) {
    if (typeof a.source === 'string') assert.match(a.source, /MetaLens definition/, a.id);
    else {
      assert.ok(Array.isArray(a.source) && a.source.length, a.id);
      for (const s of a.source) for (const k of ['title', 'url', 'date', 'accessed', 'quote']) assert.ok(s[k], `${a.id}.${k}`);
    }
  }
});
