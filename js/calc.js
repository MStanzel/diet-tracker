// Pure helpers: dates, goals, totals. No UI here.

export const MEALS = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'snack', label: 'Snack' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'night', label: 'Night snack' },
  { id: 'misc', label: 'Other' },
];
export const mealLabel = (id) => (MEALS.find((m) => m.id === id) || { label: id }).label;

export function mealForNow(d = new Date()) {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h < 10.5) return 'breakfast';
  if (h < 14) return 'lunch';
  if (h < 17) return 'snack';
  if (h < 20.5) return 'dinner';
  return 'night';
}

export const ACTIVITY = [
  [1.2, 'Sedentary (no workouts)'],
  [1.375, 'Lightly active (1–3 workouts/wk)'],
  [1.55, 'Moderately active (4–5/wk)'],
  [1.725, 'Active (intense 2–3/wk)'],
  [1.9, 'Very active (intense 4–5/wk)'],
];

export const GOALS = [
  { id: 'maintain', label: 'Maintain weight', delta: 0 },
  { id: 'lose_05', label: 'Lose 0.5 lb / week', delta: -250 },
  { id: 'lose_1', label: 'Lose 1 lb / week', delta: -500 },
  { id: 'gain_05', label: 'Gain 0.5 lb / week', delta: 250 },
  { id: 'gain_1', label: 'Gain 1 lb / week', delta: 500 },
  { id: 'gain_pct', label: 'Gain: % above maintenance' },
  { id: 'custom', label: 'Custom calorie goal' },
];

// ---------- dates (local time, ISO yyyy-mm-dd) ----------
export function toISO(d) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
export const todayISO = () => toISO(new Date());
export function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}
export function fmtDate(iso, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
  return parseISO(iso).toLocaleDateString(undefined, opts);
}
export function friendlyDate(iso) {
  const t = todayISO();
  if (iso === t) return 'Today';
  if (iso === addDays(t, -1)) return 'Yesterday';
  if (iso === addDays(t, 1)) return 'Tomorrow';
  return fmtDate(iso);
}

// ---------- numbers ----------
export const r0 = (n) => Math.round(Number(n) || 0);
export const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
export function fmtNum(n, digits = 0) {
  const v = Number(n) || 0;
  return v.toLocaleString(undefined, { maximumFractionDigits: digits });
}
export function fmtFrac(x) {
  const v = Number(x) || 0;
  if (Math.abs(v - Math.round(v)) < 0.005) return String(Math.round(v));
  for (const den of [2, 3, 4, 5, 6, 8]) {
    const num = Math.round(v * den);
    if (Math.abs(num / den - v) < 0.006) {
      const whole = Math.floor(num / den);
      const rem = num % den;
      return whole ? `${whole} ${rem}/${den}` : `${rem}/${den}`;
    }
  }
  return String(r1(v * 100) / 100);
}
export function parseFrac(s) {
  s = String(s).trim();
  if (!s) return NaN;
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return +mixed[1] + +mixed[2] / +mixed[3];
  const fr = s.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (fr) return +fr[1] / +fr[2];
  return Number(s);
}

// ---------- goals (Mifflin-St Jeor, same as the spreadsheet) ----------
export function ageOn(birthISO, onISO = todayISO()) {
  if (!birthISO) return 30;
  const b = parseISO(birthISO), d = parseISO(onISO);
  let a = d.getFullYear() - b.getFullYear();
  if (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) a--;
  return a;
}
export function maintenance(person, weightLb, onISO) {
  if (!weightLb) return null;
  const kg = weightLb * 0.453592;
  const cm = (Number(person.height_in) || 0) * 2.54;
  const bmr = 10 * kg + 6.25 * cm - 5 * ageOn(person.birthdate, onISO) + (person.sex === 'female' ? -161 : 5);
  return Math.round(bmr * (Number(person.activity) || 1.2));
}
export function calorieGoal(person, weightLb, onISO) {
  if (person.goal === 'custom') return Number(person.goal_kcal) || null;
  const m = maintenance(person, weightLb, onISO);
  if (m == null) return Number(person.goal_kcal) || null;
  if (person.goal === 'gain_pct') return Math.round(m * (1 + (Number(person.goal_pct) || 0) / 100));
  const g = GOALS.find((x) => x.id === person.goal);
  return m + (g ? g.delta : 0);
}
export function proteinGoal(person, weightLb) {
  if (!weightLb) return null;
  return Math.round(weightLb * (Number(person.protein_per_lb) || 0.8));
}
export function weightOn(weights, personId, onISO) {
  // weights sorted ascending by date
  let w = null;
  for (const x of weights) {
    if (x.person_id !== personId) continue;
    if (x.date <= onISO) w = x;
    else break;
  }
  return w;
}

// ---------- totals ----------
export function entryTotals(e) {
  const s = Number(e.servings) || 0;
  return {
    cal: (Number(e.calories) || 0) * s,
    pro: (Number(e.protein) || 0) * s,
    carbs: e.carbs == null ? null : Number(e.carbs) * s,
    fat: e.fat == null ? null : Number(e.fat) * s,
  };
}
export function sumEntries(list) {
  const t = { cal: 0, pro: 0, carbs: 0, fat: 0, hasCarbs: false, hasFat: false };
  for (const e of list) {
    const x = entryTotals(e);
    t.cal += x.cal;
    t.pro += x.pro;
    if (x.carbs != null) { t.carbs += x.carbs; t.hasCarbs = true; }
    if (x.fat != null) { t.fat += x.fat; t.hasFat = true; }
  }
  return t;
}
export function recipeTotals(recipe, items, foodsById) {
  const t = { cal: 0, pro: 0, carbs: 0, fat: 0, hasCarbs: false, hasFat: false };
  for (const it of items) {
    const f = foodsById[it.food_id];
    if (!f) continue;
    const q = Number(it.qty) || 0;
    t.cal += q * (Number(f.calories) || 0);
    t.pro += q * (Number(f.protein) || 0);
    if (f.carbs != null) { t.carbs += q * f.carbs; t.hasCarbs = true; }
    if (f.fat != null) { t.fat += q * f.fat; t.hasFat = true; }
  }
  return t;
}
export function portionFor(recipe, personId) {
  const p = recipe.portions || {};
  const v = Number(p[personId]);
  return v > 0 ? v : 0.25;
}

// moving average over a dense daily series [{date, value|null}]
export function movingAvg(series, n = 7) {
  return series.map((_, i) => {
    const win = series.slice(Math.max(0, i - n + 1), i + 1).map((x) => x.value).filter((v) => v != null);
    return win.length ? win.reduce((a, b) => a + b, 0) / win.length : null;
  });
}
