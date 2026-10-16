// threats.js — Threats: Pokémon that check the most of the top-12 field, from the
// Smogon ladder counters (lib/threats.js). Works for every reg with ladder data.
import { ladderMerge } from '../lib/aggregate.js';
import { threatScores } from '../lib/threats.js';
import { clickHint } from '../ui/meta.js';

const TOP = 12;

export default {
  id: 'threats',
  title: 'Threats',
  mount(el, ctx) {
    el.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'card threats';
    const head = document.createElement('div');
    head.className = 'card__head';
    const h = document.createElement('h3');
    h.textContent = `Top threats to the ${TOP} most-used Pokémon`;
    const meta = document.createElement('span');
    head.append(h, meta);
    const body = document.createElement('div');
    body.className = 'card__body';
    card.append(head, body);
    el.appendChild(card);

    function empty(title) {
      const box = document.createElement('div');
      box.className = 'empty-state';
      const t = document.createElement('div');
      t.className = 'empty-state__title';
      t.textContent = title;
      box.appendChild(t);
      body.replaceChildren(box);
    }

    function render(view) {
      const st = view.state;
      const merged = ladderMerge(view.ladder, st.from, st.to, view.dex);
      ctx.meta(meta, { source: 'Ladder (Smogon)', n: merged?.battles || 0, unit: 'battles' });
      const { total, rows } = merged ? threatScores(merged.mons, TOP) : { total: 0, rows: [] };
      if (!rows.length) return empty(`No Smogon ladder data for ${st.reg} yet`);
      const max = rows[0].score || 1;
      const list = document.createElement('ol');
      list.className = 'threats__list';
      for (const r of rows.slice(0, TOP)) {
        const li = document.createElement('li');
        li.className = 'threats__row';
        li.tabIndex = 0;
        li.dataset.key = r.name;
        li.setAttribute('aria-label', `Filter by ${r.name}`);
        const act = (e) => ctx.chip('species', r.name, e);
        li.addEventListener('click', act);
        li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(e); } });
        const name = document.createElement('span');
        name.className = 'threats__name';
        name.textContent = r.name;
        const checks = document.createElement('span');
        checks.className = 'threats__checks';
        checks.textContent = `checks ${r.checks} of ${total}`;
        const bar = document.createElement('span');
        bar.className = 'usage-bar';
        const track = document.createElement('span');
        track.className = 'usage-bar__track';
        const fill = document.createElement('span');
        fill.className = 'usage-bar__fill';
        fill.style.width = `${Math.max(2, (r.score / max) * 100)}%`;
        fill.style.background = 'var(--accent)';
        track.appendChild(fill);
        const lab = document.createElement('span');
        lab.className = 'usage-bar__label';
        lab.textContent = (r.score * 100).toFixed(1);
        bar.append(track, lab);
        li.append(ctx.sprite(r.name, { size: 'sm' }), name, checks, bar);
        list.appendChild(li);
      }
      body.replaceChildren(clickHint(`Pokémon that check the most of the top ${total}; score = sum of usage × check strength (Smogon). Click a row: show only that Pokémon. Shift-click to exclude.`), list);
    }

    return { update(view) { render(view); } };
  },
};
