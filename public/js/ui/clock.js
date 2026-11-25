// Meta clock: local time in the header; click for the next data refresh, regulation end and data date.
import { nextRefresh, daysLeft, fmtDuration } from '../lib/clock.js';
import { wirePopover } from './popover.js';

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

export function mountClock(host, fmt) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'clock';
  btn.setAttribute('aria-label', 'Local time and data schedule');
  const pop = document.createElement('div');
  pop.id = 'clock-panel';
  pop.className = 'settings clock-panel';
  pop.setAttribute('popover', 'auto');
  const l1 = document.createElement('p'), l2 = document.createElement('p'), l3 = document.createElement('p');
  pop.append(l1, l2, l3);
  let manifest = null;

  function fill() {
    const now = new Date();
    l1.textContent = `Next data refresh in ${fmtDuration(nextRefresh(now) - now)} (Mon 08:00 GMT+8)`;
    // The newest listed VGC regulation (it can be newer than `current` in its first days, before results come in).
    if (document.documentElement.dataset.family === 'showdown') {
      // Showdown formats: no regulations; Smogon publishes each month's stats early the next month.
      const last = manifest?.regs?.find((r) => r.family === 'showdown')?.ladderMonths?.at(-1);
      l2.hidden = !last;
      if (last) {
        const [y, m] = last.split('-').map(Number);
        const name = (yy, mm) => new Date(Date.UTC(yy, mm - 1, 1)).toLocaleString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
        const next = m === 12 ? [y + 1, 1] : [y, m + 1];
        const pub = next[1] === 12 ? [next[0] + 1, 1] : [next[0], next[1] + 1];
        l2.textContent = `Smogon ${name(...next)} stats expected early ${name(...pub)}`;
      }
    } else {
      const reg = manifest?.regs?.filter((r) => r.family === 'vgc').at(-1);
      const d = reg?.end ? daysLeft(reg.end, now) : 0;
      l2.hidden = !reg || (reg.end && d <= 0);
      if (reg && !reg.end) l2.textContent = `${reg.id} end date not announced yet`;
      else if (d > 0) l2.textContent = `${reg.id} ends in ${d} day${d === 1 ? '' : 's'}`;
    }
    l3.hidden = !manifest?.generated;
    l3.textContent = `Data updated ${fmt.date(manifest?.generated)}`;
  }

  let timer = 0;
  function tick() {
    clearTimeout(timer);
    if (document.hidden) return;
    const now = new Date();
    btn.textContent = timeFmt.format(now).toLowerCase();
    if (pop.matches(':popover-open')) fill();
    timer = setTimeout(tick, 60000 - (now.getTime() % 60000) + 50);
  }
  document.addEventListener('visibilitychange', tick);
  tick();

  wirePopover(pop, btn, fill);
  host.appendChild(btn);
  document.body.appendChild(pop);
  return { setManifest(m) { manifest = m; } };
}
