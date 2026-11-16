/* The scrolling story: each <section class="step"> names a layout in data-step; as the
 * reader scrolls into a step, the chart redraws in that layout. Numbers in the prose are
 * not typed in: a <b data-fact="..."> is computed here from story.json, and
 * test/story.test.mjs checks each against the `check` block build_story.py computed in
 * python. Modelled on daily-ngrams/site/story. */
import { layout, stats, STEPS, dayOf } from './layout.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/* "2009-10-29" -> "October 29, 2009"; with year=false, "October 29" */
export const when = (iso, year = true) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}${year ? `, ${y}` : ''}`;
};
/* a day of the season (0 = Aug 1, in a non-leap year) -> "May 3" */
export const onDay = (k) => when(new Date(Date.UTC(2001, 7, 1) + Math.round(k) * 864e5).toISOString().slice(0, 10), false);
const r2 = (v) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(2);

/* Unknown names throw: a typo must not render as blank */
export function fact(D, f) {
  const S = stats(D), rb = D.robust, V = rb.variants;
  switch (f) {
    case 'n': return String(S.n);
    case 'first': case 'last': case 'len_min_season': case 'len_max_season': return S[f];
    case 'green_spread': case 'gold_spread': case 'len_min': case 'len_max': return `${S[f]} days`;
    case 'green_sd': case 'gold_sd': return `${Math.round(S[f])} days`;
    case 'green_first': case 'green_last': case 'gold_first': case 'gold_last': return when(S[f]);
    case 'r_go': case 'r_spring': case 'r_winter': return r2(S[f]);
    case 'sd_ratio': return `nearly ${Math.round(S.sd_ratio)} times`;
    case 'dry5_gold': case 'wet5_gold': return onDay(S[f]);
    case 'wet_later': return `${Math.round(S.wet5_gold - S.dry5_gold)} days`;
    case 'dry5_mm': case 'wet5_mm': return `${Math.round(S[f])} mm`;
    case 'n_variants': return String(V.length);
    case 'v_gold_lo': return `${Math.round(Math.min(...V.map((v) => v.gold_sd)))}`;
    case 'v_gold_hi': return `${Math.round(Math.max(...V.map((v) => v.gold_sd)))} days`;
    case 'v_green_lo': return `${Math.round(Math.min(...V.map((v) => v.green_sd)))}`;
    case 'v_green_hi': return `${Math.round(Math.max(...V.map((v) => v.green_sd)))} days`;
    case 'v_r_lo': return r2(Math.min(...V.map((v) => v.r)));
    case 'v_r_hi': return r2(Math.max(...V.map((v) => v.r)));
    case 'terra_spring_r': return r2(rb.terra_spring_r);
    case 'gauge_r': return r2(rb.gauge.r);
    case 'gauge_n': return String(rb.gauge.n);
    default: throw new Error(`unknown fact ${f}`);
  }
}

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

async function main() {
  const D = await (await fetch('story.json')).json();
  for (const e of document.querySelectorAll('[data-fact]')) e.textContent = fact(D, e.dataset.fact);
  const steps = [...document.querySelectorAll('.step')];
  for (const s of steps) if (!STEPS[s.dataset.step]) throw new Error(`unknown step ${s.dataset.step}`);
  const plot = document.getElementById('plot');
  const svg = el('svg', { id: 'chart' });
  const gAxis = el('g', { class: 'axis' }), gS = el('g'), gLab = el('g', { class: 'labels' });
  svg.append(gAxis, gS, gLab);
  plot.append(svg);
  const tick = (g, x, y, text, cls = 'tick') => { const t = el('text', { x, y, class: cls }); t.textContent = text; g.append(t); };
  const grid = (x1, y1, x2, y2, cls = 'grid') => gAxis.append(el('line', { x1, x2, y1, y2, class: cls }));

  let shown = -1;
  const draw = (i) => {
    const name = steps[i].dataset.step;
    const box = plot.getBoundingClientRect(), W = box.width, H = box.height;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const L = layout(name, D, W, H);
    const narrow = W < 420;
    gAxis.replaceChildren(); gLab.replaceChildren();
    for (const [v, label] of L.xt) { grid(L.X(v), L.T, L.X(v), L.B); tick(gAxis, L.X(v) + 2, L.B + 15, label, 'tick'); }
    for (const [y, label] of L.yt) tick(gAxis, L.L - 5, y, label, 'tick end');
    grid(L.L, L.B, L.R, L.B, 'grid axisline');
    const cap = {
      bars: narrow ? 'green, season by season' : 'each season, the days the hills were green',
      starts: narrow ? '● the day it turned green' : '● the day it turned green; shaded, the span of those days',
      ends: narrow ? '● the day it went gold' : '● the day it went gold again; shaded, the span of those days',
      sorted: narrow ? 'sorted by the green day' : 'the same seasons, sorted by the day they turned green',
      spring: narrow ? 'sorted by Mar–Apr rain, driest on top' : 'sorted by the rain in March and April, driest on top; ● gold again',
    }[name];
    tick(gAxis, 4, L.T - 9, cap, 'tick cat');
    gS.replaceChildren();
    for (const m of L.marks) {
      const e = m.kind === 'dot'
        ? el('circle', { cx: m.cx, cy: m.cy, r: m.r, class: m.cls })
        : el('rect', { x: m.x, y: m.y, width: Math.max(0, m.w), height: Math.max(0, m.h), class: m.cls });
      if (m.tip) { e.append(el('title')); e.firstChild.textContent = m.tip; }
      gS.append(e);
    }
    document.body.dataset.step = i;
    window.__story = { step: i, name, shown: L.marks.length };
  };

  const pick = () => {
    const line = innerHeight * 0.5;
    let i = 0;
    for (let k = 0; k < steps.length; k++) if (steps[k].getBoundingClientRect().top < line) i = k;
    if (i !== shown) { shown = i; draw(i); }
  };
  addEventListener('scroll', pick, { passive: true });
  addEventListener('resize', () => { shown = -1; pick(); });
  pick();
}

export { dayOf };
if (typeof document !== 'undefined') main().catch((e) => {
  document.body.classList.add('failed');
  document.getElementById('err').textContent = String(e.message || e);
  console.error(e);
});
