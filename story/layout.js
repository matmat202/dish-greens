/* Where every mark sits on each step of the story. Pure: no DOM, so test/story.test.mjs
 * runs every layout at several plot sizes. Modelled on daily-ngrams/site/story.
 *
 * One chart, x = day of the season (Aug 1 .. Jul 31), one row per season, a green bar from
 * the day the hills turned green to the day they went gold again:
 *   "bars":    the bars, in year order
 *   "starts":  the same, a dot on each green-up and the span of green-ups shaded
 *   "ends":    the same, a dot on each gold-down and the span of gold-downs shaded
 *   "sorted":  rows re-sorted by green-up, both dots: the right ends stay in their band
 *   "spring":  rows sorted by Mar-Apr rain, driest on top, gold-down dots only
 */
export const STEPS = { bars: 'bars', starts: 'starts', ends: 'ends', sorted: 'sorted', spring: 'spring' };
export const MON = ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
export const MDAY = [0, 31, 61, 92, 122, 153, 184, 212, 243, 273, 304, 334, 365];

const DAY = 864e5;
export const dayOf = (iso, y) => Math.round((Date.parse(iso) - Date.UTC(y, 7, 1)) / DAY);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };
export const corr = (a, b) => {
  const ma = mean(a), mb = mean(b);
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < a.length; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  return sab / Math.sqrt(saa * sbb);
};
const memo = new WeakMap();

/* -> the numbers the story quotes; build_story.py's `check` holds the same */
export function stats(D) {
  if (memo.has(D)) return memo.get(D);
  const R = D.seasons;
  const g = R.map((r) => dayOf(r.greenup, r.y)), o = R.map((r) => dayOf(r.golddown, r.y));
  const ln = o.map((v, i) => v - g[i]), sp = R.map((r) => r.spring_mm);
  const at = (xs, f) => R[xs.indexOf(f(...xs))];
  const bySp = R.map((_, i) => i).sort((a, b) => sp[a] - sp[b] || R[a].y - R[b].y);
  const S = {
    n: R.length, first: R[0].season, last: R.at(-1).season,
    green_spread: Math.max(...g) - Math.min(...g), gold_spread: Math.max(...o) - Math.min(...o),
    green_sd: sd(g), gold_sd: sd(o),
    green_first: at(g, Math.min).greenup, green_last: at(g, Math.max).greenup,
    gold_first: at(o, Math.min).golddown, gold_last: at(o, Math.max).golddown,
    r_go: corr(g, o),
    len_min: Math.min(...ln), len_min_season: at(ln, Math.min).season,
    len_max: Math.max(...ln), len_max_season: at(ln, Math.max).season,
    r_spring: corr(sp, o), r_winter: corr(R.map((r) => r.winter_mm), o),
    dry5_gold: mean(bySp.slice(0, 5).map((i) => o[i])), wet5_gold: mean(bySp.slice(-5).map((i) => o[i])),
    dry5_mm: Math.max(...bySp.slice(0, 5).map((i) => sp[i])), wet5_mm: Math.min(...bySp.slice(-5).map((i) => sp[i])),
    g, o, ln, sp, bySp,
  };
  S.sd_ratio = S.green_sd / S.gold_sd;
  memo.set(D, S);
  return S;
}

/* -> {X, L, R, T, B, xt: [[day, label]], yt: [[y, label]], marks}, in px of w x h.
 * marks: {kind: 'bar'|'band', cls, x, y, w, h, tip} | {kind: 'dot', cls, cx, cy, r, tip} */
export function layout(name, D, w, h) {
  if (!STEPS[name]) throw new Error(`unknown step ${name}`);
  const S = stats(D), R = D.seasons;
  const narrow = w < 420;
  const L = narrow ? 50 : 62, Rx = w - 8, T = 22, B = h - 22;
  const X = (d) => L + (d / 365) * (Rx - L);
  const order = name === 'sorted' ? R.map((_, i) => i).sort((a, b) => S.g[a] - S.g[b] || R[a].y - R[b].y)
    : name === 'spring' ? S.bySp : R.map((_, i) => i);
  const rowH = (B - T) / R.length, barH = Math.max(2, rowH * 0.62);
  const rowY = (k) => T + k * rowH + (rowH - barH) / 2;
  const marks = [];
  const band = (xs, cls, tip) => {
    const a = X(Math.min(...xs)), b = X(Math.max(...xs));
    marks.push({ kind: 'band', cls, x: a, y: T, w: b - a, h: B - T, tip });
  };
  if (name === 'starts') band(S.g, 'band', `green-up came anywhere in these ${S.green_spread} days`);
  if (name === 'ends' || name === 'sorted') band(S.o, 'band', `gold-down came inside these ${S.gold_spread} days`);
  order.forEach((i, k) => {
    const r = R[i], y = rowY(k);
    marks.push({ kind: 'bar', cls: name === 'spring' ? 'bar dim' : 'bar', x: X(S.g[i]), y, w: X(S.o[i]) - X(S.g[i]), h: barH,
      tip: `${r.season}: green ${r.greenup}, gold ${r.golddown}, ${S.ln[i]} days` });
    const dot = (d, cls, what) => marks.push({ kind: 'dot', cls, cx: X(d), cy: y + barH / 2, r: Math.max(2, Math.min(4, barH / 2 + 0.5)), tip: `${r.season}: ${what}` });
    if (name === 'starts' || name === 'sorted') dot(S.g[i], 'dot gu', `green ${r.greenup}`);
    if (name === 'ends' || name === 'sorted' || name === 'spring') dot(S.o[i], 'dot gd', `gold ${r.golddown}${name === 'spring' ? `, ${Math.round(r.spring_mm)} mm of rain in Mar-Apr` : ''}`);
  });
  const step = narrow ? 3 : 2;
  const xt = MON.map((m, i) => [MDAY[i], m]).filter((_, i) => i % step === 0);
  // a season name every few rows; when the rows are re-sorted, the top and bottom row say which
  const yt = [];
  const every = rowH >= 13 ? 1 : rowH >= 7 ? 5 : 25;
  order.forEach((i, k) => {
    const sorted = name === 'sorted' || name === 'spring';
    if (sorted ? k === 0 || k === R.length - 1 : k % every === 0 || k === R.length - 1)
      yt.push([rowY(k) + barH / 2 + 4, R[i].season]);
  });
  return { kind: name, X, L, R: Rx, T, B, xt, yt, marks };
}
