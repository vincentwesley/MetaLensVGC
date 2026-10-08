// "What's new": a native <dialog> listing CHANGELOG. Opening it marks VERSION as seen.
import { CHANGELOG, VERSION } from '../lib/changelog.js';

const SEEN = 'metalens.seenVersion';

export function hasUnseen() {
  try { return localStorage.getItem(SEEN) !== VERSION; } catch { return false; }
}

function markSeen() {
  try { localStorage.setItem(SEEN, VERSION); } catch { /* storage off: dot returns next visit */ }
}

let dlg = null;

function build() {
  const d = document.createElement('dialog');
  d.className = 'changelog';
  d.setAttribute('aria-labelledby', 'changelog-title');
  const head = document.createElement('div');
  head.className = 'changelog__head';
  head.innerHTML = '<h2 id="changelog-title">What’s new</h2><button type="button" class="changelog__close" aria-label="Close">×</button>';
  head.querySelector('button').addEventListener('click', () => d.close());
  const body = document.createElement('div');
  body.className = 'changelog__body';
  for (const e of CHANGELOG) {
    const sec = document.createElement('section');
    const h = document.createElement('h3');
    h.textContent = `v${e.version} · ${e.title}`;
    const when = document.createElement('time');
    when.dateTime = e.date;
    when.textContent = e.date;
    const ul = document.createElement('ul');
    for (const n of e.notes) {
      const li = document.createElement('li');
      const tag = document.createElement('b');
      tag.className = `tag tag--${n.tag.toLowerCase()}`;
      tag.textContent = n.tag;
      li.append(tag, ` ${n.text}`);
      ul.appendChild(li);
    }
    sec.append(h, when, ul);
    body.appendChild(sec);
  }
  d.append(head, body);
  d.addEventListener('click', (ev) => { if (ev.target === d) d.close(); }); // backdrop click
  document.body.appendChild(d);
  return d;
}

/** Opens the dialog; `returnTo` gets focus when it closes. */
export function openChangelog(returnTo, onSeen) {
  dlg ||= build();
  dlg.addEventListener('close', () => returnTo?.focus(), { once: true });
  dlg.showModal();
  dlg.querySelector('.changelog__body').scrollTop = 0;
  markSeen();
  onSeen?.();
}
