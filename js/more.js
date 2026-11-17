import { useState } from '../vendor/vendor.js';
import { html, Sheet, toast } from './ui.js';
import { todayISO, r1, recipeTotals, fmtFrac, portionFor } from './calc.js';

const XLSX_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';

export function SettingsSheet({ ctx, onClose, onSignOut }) {
  const [notes, setNotes] = useState(false);
  const [busy, setBusy] = useState(false);
  return html`<${Sheet} title="Settings" onClose=${onClose}>
    <div class="card" style="padding:4px 14px"><ul class="list">
      <li class="item" onClick=${() => setNotes(true)}><span>📝</span><div class="grow">Shared notes</div><span class="muted">›</span></li>
      <li class="item" onClick=${async () => { setBusy(true); try { await exportXlsx(ctx); } catch (e) { toast('Export failed: ' + e.message); } setBusy(false); }}>
        <span>⬇️</span><div class="grow">${busy ? 'Preparing…' : 'Download everything (Excel)'}<div class="small muted">Daily totals, full log, foods, recipes, weights</div></div></li>
      <li class="item" onClick=${() => location.reload()}><span>🔄</span><div class="grow">Refresh app</div></li>
      <li class="item" onClick=${() => confirm(ctx.db.mode === 'demo' ? 'Reset demo data on this device?' : 'Sign out on this phone?') && onSignOut()}>
        <span>🚪</span><div class="grow">${ctx.db.mode === 'demo' ? 'Reset demo data' : 'Sign out'}</div></li>
    </ul></div>
    <div class="card small muted">
      <b>Install on your phone:</b> open this page in Chrome, tap ⋮ (top right), then <i>Add to Home screen</i> → <i>Install</i>.
    </div>
    <p class="small muted" style="text-align:center">Diet Tracker v1.1 · ${ctx.db.mode === 'demo' ? 'demo mode' : 'synced'}</p>
    ${notes && html`<${NotesSheet} ctx=${ctx} onClose=${() => setNotes(false)} />`}
  <//>`;
}

function NotesSheet({ ctx, onClose }) {
  const [body, setBody] = useState(ctx.core.notes || '');
  const save = async () => { await ctx.db.saveNotes(body); ctx.patchCore((c) => { c.notes = body; }); toast('Notes saved'); onClose(); };
  return html`<${Sheet} full title="Shared notes" onClose=${onClose} footer=${html`<button class="btn block" onClick=${save}>Save</button>`}>
    <p class="small muted" style="margin-top:0">Recipe ideas, links, shopping notes. Both of you see the same notes.</p>
    <textarea style="min-height:60dvh" value=${body} onInput=${(e) => setBody(e.target.value)} />
  <//>`;
}

async function exportXlsx(ctx) {
  const XLSX = await import(XLSX_URL);
  const { core, people, foodsById, itemsByRecipe } = ctx;
  const pname = Object.fromEntries(people.map((p) => [p.id, p.name]));
  const [totals, entries] = await Promise.all([ctx.db.dailyTotals(), ctx.db.allEntries()]);
  const daily = totals.map((t) => ({
    Date: t.date, Person: pname[t.person_id], Calories: Math.round(t.calories), Protein: r1(t.protein),
    Carbs: r1(t.carbs), Fat: r1(t.fat), Weight: core.weights.find((w) => w.person_id === t.person_id && w.date === t.date)?.weight ?? '',
  }));
  const log = entries.map((e) => ({ Date: e.date, Person: pname[e.person_id], Meal: e.meal, Item: e.name, Servings: e.servings,
    'Calories each': e.calories, 'Protein each': e.protein, 'Carbs each': e.carbs ?? '', 'Fat each': e.fat ?? '',
    'Total calories': r1(e.calories * e.servings), 'Total protein': r1(e.protein * e.servings) }));
  const foods = core.foods.map((f) => ({ Name: f.name, Serving: f.serving, Calories: f.calories, Protein: f.protein, Carbs: f.carbs ?? '', Fat: f.fat ?? '',
    Type: f.kind, Favorite: f.favorite ? 'yes' : '', Barcode: f.barcode || '', Archived: f.archived ? 'yes' : '' }));
  const recipes = core.recipes.map((r) => {
    const t = recipeTotals(r, itemsByRecipe[r.id] || [], foodsById);
    const row = { Recipe: r.name, 'Total calories': Math.round(t.cal), 'Total protein': r1(t.pro) };
    for (const p of people) { const pp = portionFor(r, p.id); row[`${p.name} portion`] = fmtFrac(pp); row[`${p.name} kcal`] = Math.round(t.cal * pp); row[`${p.name} protein`] = r1(t.pro * pp); }
    row.Notes = r.notes || ''; return row;
  });
  const ingr = core.items.map((i) => ({ Recipe: core.recipes.find((r) => r.id === i.recipe_id)?.name, Ingredient: foodsById[i.food_id]?.name, Servings: i.qty }));
  const weights = core.weights.map((w) => ({ Date: w.date, Person: pname[w.person_id], Weight: w.weight }));
  const wb = XLSX.utils.book_new();
  const add = (rows, name) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{}]), name);
  add(daily, 'Daily totals'); add(log, 'Food log'); add(weights, 'Weights'); add(foods, 'Foods'); add(recipes, 'Recipes'); add(ingr, 'Recipe ingredients');
  XLSX.writeFile(wb, `diet-tracker-${todayISO()}.xlsx`);
}
