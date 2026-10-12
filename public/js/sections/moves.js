// Moves & Tera: field-wide move usage (Smogon ladder, weighted by species usage) and, for NatDex Doubles, Tera types.
// Move chips are not supported on ladder rows (speciesChipFilter), so rows are not clickable: the hint says so.
import { ladderMerge } from '../lib/aggregate.js';
import { fieldMoves, fieldTera } from '../lib/moves-field.js';
import { TYPE_COLORS } from '../lib/types.js';
import { typePill, clickHint } from '../ui/meta.js';

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const pct = (v) => `${(v * 100).toFixed(1)}%`;

function card(title, hint) {
  const c = el('div', 'card');
  const head = el('div', 'card__head');
  const meta = el('span');
  head.append(el('h3', null, title), meta);
  const body = el('div', 'card__body');
  body.append(clickHint(hint));
  c.append(head, body);
  return { c, meta, body };
}
const empty = (body, title) => {
  const b = el('div', 'empty-state');
  b.append(el('div', 'empty-state__title', title));
  body.append(b);
};
const bar = (v, max, color) => {
  const w = el('div', 'moves-bar');
  const f = el('span', 'moves-bar__fill');
  f.style.width = `${max ? Math.max(2, (v / max) * 100) : 0}%`;
  if (color) f.style.background = color;
  w.append(f, el('span', 'moves-bar__val', pct(v)));
  return w;
};

export default {
  id: 'moves',
  title: 'Moves & Tera',
  mount(root, ctx) {
    root.innerHTML = '';
    root.className = 'sb-grid';
    const mv = card('Most used moves', 'Share of the field Pokémon (weighted by usage) that run each move. Not clickable: move filters do not apply to ladder rows.');
    const te = card('Tera types', 'Share of the field Pokémon (weighted by usage) that Terastallize to each type. Not clickable: there is no Tera filter.');
    root.append(mv.c, te.c);

    function render(view) {
      const s = view.state;
      const merged = s.source === 'ranked' ? null : ladderMerge(view.ladder, s.from, s.to, view.dex);
      for (const x of [mv, te]) {
        x.body.querySelectorAll('.empty-state, .data-table, .moves-tera').forEach((n) => n.remove());
        ctx.meta(x.meta, merged ? { source: 'Ladder (Smogon)', n: merged.battles, unit: 'battles' } : { source: 'Ladder (Smogon)' });
      }
      const mf = merged ? fieldMoves(merged.mons) : { rows: [] };
      if (!mf.rows.length) {
        empty(mv.body, merged ? 'No move data in the ladder for this view' : 'No ladder data for this view (Moves & Tera needs the Smogon ladder)');
      } else {
        const t = el('table', 'data-table');
        const hd = el('tr');
        for (const h of ['Move', 'Type', 'Share']) hd.append(el('th', null, h));
        const th = el('thead');
        th.append(hd);
        const tb = el('tbody');
        const max = mf.rows[0].pct;
        for (const r of mf.rows) {
          const tr = el('tr');
          const type = view.dex.moves?.[r.name]?.type;
          const tdT = el('td');
          if (type) tdT.append(typePill(type)); else tdT.textContent = '—';
          const tdB = el('td');
          tdB.append(bar(r.pct, max));
          tr.append(el('td', null, r.name), tdT, tdB);
          tb.append(tr);
        }
        t.append(th, tb);
        mv.body.append(t);
      }

      const isNDD = view.family === 'natdex'; // ND has only 'Nothing' -> banned note
      te.c.hidden = !isNDD;
      if (!isNDD) return;
      const tf = merged ? fieldTera(merged.mons) : { rows: [] };
      if (!tf.rows.length) { empty(te.body, 'Tera is banned in this format'); return; }
      const g = el('div', 'moves-tera');
      for (const r of tf.rows) g.append(el('span', null, r.name), bar(r.pct, tf.rows[0].pct, TYPE_COLORS[r.name]));
      te.body.append(g);
    }

    return { update(view) { render(view); }, highlight() {} };
  },
};
