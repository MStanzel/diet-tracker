import { useState, useEffect } from '../vendor/vendor.js';
import { html } from './ui.js';
import { todayISO, addDays, fmtDate, fmtNum, r1, movingAvg, weightOn, calorieGoal, proteinGoal, parseISO } from './calc.js';

const RANGES = [['14', '2 weeks'], ['30', 'Month'], ['90', '3 months'], ['365', 'Year'], ['all', 'All']];

export function ProgressScreen({ ctx }) {
  const { db, person, people, core } = ctx;
  const [totals, setTotals] = useState(null);
  const [range, setRange] = useState(ctx.prefs.range || '30');
  useEffect(() => { db.dailyTotals().then(setTotals); }, []);
  if (!totals) return html`<div class="spinner"></div>`;

  const today = todayISO();
  const weights = core.weights;
  const firstDate = totals.length ? totals[0].date : today;
  const start = range === 'all' ? firstDate : addDays(today, -(Number(range) - 1));
  const dates = [];
  for (let d = start; d <= today; d = addDays(d, 1)) dates.push(d);

  const byKey = new Map(totals.map((t) => [t.person_id + t.date, t]));
  const val = (pid, d, k) => { const t = byKey.get(pid + d); return t ? Number(t[k]) : null; };
  const series = (pid, k) => dates.map((d) => ({ date: d, value: d === today ? null : val(pid, d, k) })); // today isn't finished

  const cal = series(person.id, 'calories');
  const pro = series(person.id, 'protein');
  const calGoal = dates.map((d) => calorieGoal(person, weightOn(weights, person.id, d)?.weight, d));
  const proGoal = dates.map((d) => proteinGoal(person, weightOn(weights, person.id, d)?.weight));
  const wts = dates.map((d) => { const w = weights.find((x) => x.person_id === person.id && x.date === d); return w ? Number(w.weight) : null; });

  return html`
    <h3 style="margin:4px 0 8px">Last 7 days (average)</h3>
    <div class="statgrid" style="margin-bottom:14px">${people.map((p) => html`<${WeekCard} p=${p} val=${val} weights=${weights} today=${today} />`)}</div>

    <div class="chips">${RANGES.map(([id, l]) => html`<button class=${'chip' + (range === id ? ' on' : '')}
      onClick=${() => { setRange(id); ctx.prefs.range = id; ctx.savePrefs(); }}>${l}</button>`)}</div>

    <div class="card chart"><h2>${person.name}'s calories</h2>
      <${LineChart} dates=${dates} lines=${[
        { values: cal.map((x) => x.value), color: 'var(--accent)', dots: true, faint: true },
        { values: movingAvg(cal), color: 'var(--accent)', width: 2.5 },
        { values: calGoal, color: 'var(--good)', dash: true },
      ]} />
      <div class="legend"><span><i style="background:var(--accent)"></i>7-day average (dots = daily)</span><span><i style="background:var(--good)"></i>Goal</span></div>
    </div>
    <div class="card chart"><h2>${person.name}'s protein (g)</h2>
      <${LineChart} dates=${dates} lines=${[
        { values: pro.map((x) => x.value), color: 'var(--accent)', dots: true, faint: true },
        { values: movingAvg(pro), color: 'var(--accent)', width: 2.5 },
        { values: proGoal, color: 'var(--good)', dash: true },
      ]} />
      <div class="legend"><span><i style="background:var(--accent)"></i>7-day average</span><span><i style="background:var(--good)"></i>Target</span></div>
    </div>
    <div class="card chart"><h2>${person.name}'s weight (lb)</h2>
      ${wts.some((v) => v != null) ? html`<${LineChart} dates=${dates} connect lines=${[{ values: wts, color: 'var(--accent)', dots: true, width: 2 }]} />`
        : html`<p class="empty">No weigh-ins in this range.</p>`}
    </div>`;
}

function WeekCard({ p, val, weights, today }) {
  const days = []; for (let i = 1; i <= 7; i++) days.push(addDays(today, -i));
  const cals = days.map((d) => val(p.id, d, 'calories')).filter((v) => v != null);
  const pros = days.map((d) => val(p.id, d, 'protein')).filter((v) => v != null);
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const wNow = weightOn(weights, p.id, today), wThen = weightOn(weights, p.id, addDays(today, -30));
  const goal = calorieGoal(p, wNow?.weight, today);
  const c = avg(cals);
  return html`<div class="card" style=${`border-top:4px solid ${p.color}`}>
    <b>${p.name}</b>
    <div class="big">${c == null ? '—' : fmtNum(c)}<span class="small muted"> kcal</span></div>
    ${goal && c != null && html`<div class="small ${c > goal ? 'over' : 'muted'}">${c > goal ? `${fmtNum(c - goal)} over` : `${fmtNum(goal - c)} under`} goal</div>`}
    <div class="small" style="margin-top:6px">${avg(pros) == null ? '—' : fmtNum(avg(pros))} g protein</div>
    <div class="small muted">${cals.length} of 7 days logged</div>
    ${wNow && html`<div class="small" style="margin-top:6px">${r1(wNow.weight)} lb${wThen && wThen.date !== wNow.date ? html` <span class="muted">(${wNow.weight - wThen.weight >= 0 ? '+' : ''}${r1(wNow.weight - wThen.weight)} in 30d)</span>` : ''}</div>`}
  </div>`;
}

function LineChart({ dates, lines, connect = false, height = 190 }) {
  const W = 340, H = height, L = 38, R = 8, T = 8, B = 22;
  const all = lines.flatMap((l) => l.values).filter((v) => v != null);
  if (!all.length) return html`<p class="empty">No data in this range yet.</p>`;
  let lo = Math.min(...all), hi = Math.max(...all);
  const pad = (hi - lo) * 0.1 || Math.max(1, hi * 0.05);
  lo -= pad; hi += pad;
  const step = niceStep((hi - lo) / 4);
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  const n = dates.length;
  const x = (i) => L + (n <= 1 ? (W - L - R) / 2 : (i / (n - 1)) * (W - L - R));
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const ticks = []; for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(v);
  const xt = [0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1].filter((v, i, a) => a.indexOf(v) === i);
  const longRange = n > 120;
  const path = (vals) => {
    let d = '', pen = false;
    vals.forEach((v, i) => {
      if (v == null) { if (!connect) pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true;
    });
    return d;
  };
  return html`<svg viewBox=${`0 0 ${W} ${H}`} role="img">
    ${ticks.map((v) => html`<line x1=${L} x2=${W - R} y1=${y(v)} y2=${y(v)} stroke="var(--line)" stroke-width="1" />
      <text x=${L - 5} y=${y(v) + 4} text-anchor="end">${fmtNum(v, step < 1 ? 1 : 0)}</text>`)}
    ${xt.map((i) => html`<text x=${x(i)} y=${H - 5} text-anchor=${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
      ${fmtDate(dates[i], longRange ? { month: 'short', year: '2-digit' } : { month: 'short', day: 'numeric' })}</text>`)}
    ${lines.map((l) => html`
      <path d=${path(l.values)} fill="none" stroke=${l.color} stroke-width=${l.faint ? 0 : l.width || 1.5}
        stroke-dasharray=${l.dash ? '5 4' : ''} stroke-linejoin="round" stroke-linecap="round" />
      ${l.dots && l.values.map((v, i) => v != null && html`<circle cx=${x(i)} cy=${y(v)} r=${n > 120 ? 1.3 : 2.5} fill=${l.color} opacity=${l.faint ? 0.35 : 1} />`)}`)}
  </svg>`;
}
function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}
