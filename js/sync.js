// Keeps logged meals in step with your foods and recipes.
// Like the spreadsheet: today (and any future days) follow your latest food/recipe
// numbers; earlier days keep what they were, so your history doesn't change.
import { recipeTotals, portionFor, r1, todayISO } from './calc.js';

export async function syncLoggedEntries(db, fromDate = todayISO()) {
  const [core, entries] = await Promise.all([db.loadCore(), db.getEntriesFrom(fromDate)]);
  const foods = Object.fromEntries(core.foods.map((f) => [f.id, f]));
  const items = {};
  for (const it of core.items) (items[it.recipe_id] ||= []).push(it);
  const recipes = Object.fromEntries(core.recipes.map((r) => [r.id, r]));
  const opt = (v) => (v == null ? null : r1(v));
  let changed = 0;
  for (const e of entries) {
    let want = null;
    if (e.food_id && foods[e.food_id]) {
      const f = foods[e.food_id];
      want = { name: f.name, calories: r1(f.calories), protein: r1(f.protein), carbs: opt(f.carbs), fat: opt(f.fat) };
    } else if (e.recipe_id && recipes[e.recipe_id]) {
      const r = recipes[e.recipe_id];
      const t = recipeTotals(r, items[r.id] || [], foods);
      const p = portionFor(r, e.person_id);
      want = { name: r.name, calories: r1(t.cal * p), protein: r1(t.pro * p), carbs: t.hasCarbs ? r1(t.carbs * p) : null, fat: t.hasFat ? r1(t.fat * p) : null };
    }
    if (!want) continue;
    const same = Object.keys(want).every((k) => (want[k] == null && e[k] == null) || (k === 'name' ? want[k] === e[k] : Number(want[k]) === Number(e[k])));
    if (!same) { await db.updateEntry(e.id, want); changed++; }
  }
  return changed;
}
