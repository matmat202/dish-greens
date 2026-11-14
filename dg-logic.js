/* dish-greens: everything the page computes, in one place the tests can reach.
 * data.json is built by build.py; this file only reads it. UMD: the browser gets window.DG.
 */
(function () {
  const DAY = 86400000;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const utc = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  const iso = (t) => new Date(t).toISOString().slice(0, 10);

  // A season runs Aug 1 of y to Jul 31 of y+1.
  const seasonY = (d) => (+d.slice(5, 7) >= 8 ? +d.slice(0, 4) : +d.slice(0, 4) - 1);
  const dayOfSeason = (d, y) => Math.round((utc(d) - Date.UTC(y, 7, 1)) / DAY);
  const addDays = (d, n) => iso(utc(d) + n * DAY);
  const fmt = (d) => `${MONTHS[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}`;
  const fmtY = (d) => `${fmt(d)}, ${d.slice(0, 4)}`;

  // Hill colour for an NDVI: summer gold to winter green, mixed in OKLab so the middle is an
  // olive rather than a muddy grey. lo/hi are the record's typical summer floor and winter peak.
  const GOLD = [196, 160, 82], GREEN = [62, 122, 58];
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const gam = (c) => { const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; return Math.round(Math.min(1, Math.max(0, v)) * 255); };
  function toLab([r, g, b]) {
    [r, g, b] = [lin(r), lin(g), lin(b)];
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  }
  function fromLab([L, a, b]) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [gam(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      gam(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      gam(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
  }
  const LGOLD = toLab(GOLD), LGREEN = toLab(GREEN);
  function colour(v, lo = 0.28, hi = 0.75) {
    const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
    const c = fromLab(LGOLD.map((x, i) => x + (LGREEN[i] - x) * t));
    return '#' + c.map((x) => x.toString(16).padStart(2, '0')).join('');
  }

  // One season's composites as [dayOfSeason, ndvi].
  const cells = (data, y) => data.series
    .filter(([d]) => seasonY(d) === y).map(([d, v]) => [dayOfSeason(d, y), v]);

  const complete = (data) => data.seasons.filter((s) => s.greenup && s.soak);

  // Where the green-up should land once the season's rain since Aug 1 reached the record's
  // threshold on `from`: the middle half and the median of the record's lags after that day.
  // Not a weather forecast; only the hills' delay, measured out of sample at about +-3 weeks.
  const predict = (total, from) => ({
    soonest: addDays(from, total.lag_q1), likely: addDays(from, total.lag_median), latest: addDays(from, total.lag_q3)
  });

  // The season in progress, as of `today`.
  function current(data, today) {
    const y = seasonY(today);
    const row = data.seasons.find((s) => s.y === y) || { y, season: `${y}-${String((y + 1) % 100).padStart(2, '0')}`, soak: null, rain_to_date: 0 };
    const pts = data.series.filter(([d]) => seasonY(d) === y);
    const last = pts.length ? pts[pts.length - 1] : null;
    const thr = data.seasons.filter((s) => s.threshold).map((s) => s.threshold);
    const medThr = thr.length ? thr.slice().sort((a, b) => a - b)[thr.length >> 1] : 0.5;
    const greened = row.greenup || (last && last[1] >= medThr ? last[0] : null);
    const reached = row.total_day && row.total_day <= today ? row.total_day : null;
    return { y, season: row.season, rain: row.rain_to_date || 0, reached, greened, last, threshold: medThr,
      prediction: reached && !greened ? predict(data.total, reached) : null };
  }

  // Rain the page fetched itself for the days after the build (Open-Meteo archive, the same
  // source build.py reads). `days` is [[iso, mm], ...]. Days on or before data.rain_last are
  // already counted; the first missing value ends the top-up, so "as of" never skips a gap.
  // Returns a copy of data with each touched season's rain_to_date, total_day and cum moved on.
  function topUp(data, days) {
    const out = { ...data, seasons: data.seasons.map((s) => ({ ...s, cum: (s.cum || []).slice() })) };
    for (const [d, mm] of days) {
      if (d <= out.rain_last) continue;
      if (typeof mm !== 'number' || !isFinite(mm) || mm < 0) break;
      const y = seasonY(d);
      let row = out.seasons.find((s) => s.y === y);
      if (!row) {
        row = { y, season: `${y}-${String((y + 1) % 100).padStart(2, '0')}`, soak: null, partial: true, rain_to_date: 0, total_day: null, cum: [] };
        out.seasons.push(row);
      }
      row.rain_to_date = Math.round(((row.rain_to_date || 0) + mm) * 10) / 10;
      if (!row.total_day && row.rain_to_date >= out.total.mm) row.total_day = d;
      if (row.cum.length === dayOfSeason(d, y)) row.cum.push(Math.round(row.rain_to_date));
      out.rain_last = d;
    }
    return out;
  }

  // How this season stands: of the past seasons, how many had passed the threshold by the same
  // day of their season. Counted by day of season so a leap February does not shift it.
  function pace(data, today) {
    const y = seasonY(today), day = dayOfSeason(today, y);
    const past = data.seasons.filter((s) => s.y < y);
    return { by: past.filter((s) => s.total_day && dayOfSeason(s.total_day, s.y) <= day).length, of: past.length };
  }

  // Rain since Aug 1 by day of season (build.py's cum, whole mm): this season's curve, every
  // earlier season's, and their median on each day all of them cover. `typical` is that median
  // on this season's last day, so "a typical season had N mm by now" compares like with like.
  function rainSoFar(data, y) {
    const row = data.seasons.find((s) => s.y === y);
    const now = (row && row.cum) || [];
    const past = data.seasons.filter((s) => s.y < y && s.cum && s.cum.length).map((s) => s.cum);
    const median = [];
    for (let k = 0; past.length && past.every((c) => c.length > k); k++) {
      const v = past.map((c) => c[k]).sort((a, b) => a - b), h = v.length >> 1;
      median.push(v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2);
    }
    const typical = now.length && median.length >= now.length ? median[now.length - 1] : null;
    return { now, past, median, typical };
  }

  function headline(stats) {
    return `In ${stats.n} seasons the Dish has turned green as early as ${fmt(stats.earliest.greenup)} and as late as ${fmt(stats.latest.greenup)} — ${stats.spread_days} days apart.`;
  }

  function nowLine(c, data) {
    const t = data.total;
    if (c.greened) return `The hills have greened this season (${fmt(c.greened)}).`;
    if (c.prediction) return `The rain since August passed ${t.mm} mm on ${fmt(c.reached)}. In past seasons the hills went green ${t.lag_q1}–${t.lag_q3} days after that: expect green between ${fmt(c.prediction.soonest)} and ${fmt(c.prediction.latest)}, most likely around ${fmt(c.prediction.likely)}.`;
    const p = pace(data, data.rain_last);
    const by = p.of ? ` By ${fmt(data.rain_last)}, ${p.by} of the last ${p.of} seasons had passed it.` : '';
    return `${Math.round(c.rain)} mm of rain since August 1, as of ${fmt(data.rain_last)}: ${Math.max(1, Math.round(t.mm - c.rain))} mm short of the ${t.mm} mm that comes before the green.${by} The hills have tended to go green ${t.lag_q1}–${t.lag_q3} days after the season's rain passes it.`;
  }

  const api = { seasonY, dayOfSeason, addDays, fmt, fmtY, colour, cells, complete, predict, current, topUp, pace, rainSoFar, headline, nowLine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.DG = api;
})();
