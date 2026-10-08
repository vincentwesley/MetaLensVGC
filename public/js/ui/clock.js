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
    const reg = manifest?.regs?.find((r) => r.id === manifest.current);
    const d = reg?.end ? daysLeft(reg.end, now) : 0;
    l2.hidden = d <= 0;
    l2.textContent = `${reg?.id} ends in ${d} day${d === 1 ? '' : 's'}`;
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
