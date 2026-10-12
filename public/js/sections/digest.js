// digest.js: Weekly Digest. A shareable summary of the current view (lib/digest.js builds the data + plain text).
import { digestData, digestText } from '../lib/digest.js';
import { copyText } from '../ui/clipboard.js';
import { toast } from '../ui/toast.js';

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

export default {
  id: 'digest',
  title: 'Weekly Digest',
  mount(root, ctx) {
    root.innerHTML = '';
    const card = el('div', 'card digest-card');
    const head = el('div', 'card__head');
    const meta = el('span');
    head.append(el('h3', null, 'Weekly Digest'), meta);
    const body = el('div', 'card__body');
    const tools = el('div', 'digest__tools');
    const copyBtn = el('button', 'lib-btn', 'Copy as text');
    const printBtn = el('button', 'lib-btn', 'Print');
    copyBtn.type = printBtn.type = 'button';
    tools.append(copyBtn, printBtn);
    const out = el('div', 'digest__body');
    body.append(tools, out);
    card.append(head, body);
    root.appendChild(card);

    let text = '';
    copyBtn.addEventListener('click', async () => {
      const ok = text && await copyText(text);
      toast(ok ? 'Digest copied as text' : 'Could not copy the digest', { type: ok ? 'info' : 'error' });
    });
    printBtn.addEventListener('click', () => window.print());

    const list = (title, rows, cls) => {
      const wrap = el('div', 'digest__col');
      wrap.append(el('h4', 'digest__h', title));
      const ul = el('ul', 'digest__list');
      for (const r of rows) {
        const li = el('li');
        li.append(el('span', 'digest__key', r.key), el('span', `digest__val${cls ? ` ${cls}` : ''}`, r.text));
        ul.appendChild(li);
      }
      if (!rows.length) ul.appendChild(el('li', 'digest__none', 'none'));
      wrap.appendChild(ul);
      return wrap;
    };

    return {
      update(view) {
        const d = digestData(view);
        text = digestText(d);
        copyBtn.disabled = !!d.empty;
        ctx.meta(meta, { source: d.sourceLabel, n: d.n, unit: d.unit });
        out.innerHTML = '';
        out.appendChild(el('p', 'digest__head', `${d.regLabel} | ${d.sourceLabel}${d.range ? ` | ${d.range}` : ''}${d.updated ? ` | data updated ${d.updated}` : ''}`));
        if (d.empty) {
          const box = el('div', 'empty-state');
          box.appendChild(el('div', 'empty-state__title', d.empty));
          out.appendChild(box);
          return;
        }
        out.appendChild(list('Top 5 by usage', d.top.map((r, i) => ({ key: `${i + 1}. ${r.key}`, text: r.text }))));
        if (d.compare) {
          const g = el('div', 'digest__cols');
          g.append(list(`Biggest risers (${d.compare})`, d.risers, 'is-up'), list(`Biggest fallers (${d.compare})`, d.fallers, 'is-down'));
          out.appendChild(g);
        } else out.appendChild(el('p', 'digest__note', d.note || 'No previous period yet'));
        if (d.item) out.appendChild(el('p', 'digest__note', `Most common item on ${d.item.mon}: ${d.item.item} (${d.item.text})`));
        if (d.arch) out.appendChild(el('p', 'digest__note', `Top 8 archetype: ${d.arch.label}, ${d.arch.text}`));
      },
    };
  },
};
