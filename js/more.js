import { useState } from '../vendor/vendor.js';
import { html, Sheet, toast, NumInput } from './ui.js';
import { ACTIVITY, GOALS, todayISO, fmtNum, r1, weightOn, maintenance, calorieGoal, proteinGoal, ageOn, recipeTotals, fmtFrac, portionFor } from './calc.js';

const XLSX_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';

export function MoreScreen({ ctx, onSignOut }) {
  const [editP, setEditP] = useState(null);
  const [notes, setNotes] = useState(false);
  const [busy, setBusy] = useState(false);
  const today = todayISO();
  return html`
    <h3 style="margin:4px 0 8px">Goals</h3>
    ${ctx.people.map((p) => {
      const w = weightOn(ctx.core.weights, p.id, today)?.weight;
      return html`<div class="card row" style="cursor:pointer;border-left:5px solid ${p.color}" onClick=${() => setEditP(p)}>
        <div class="grow"><b>${p.name}</b>
          <div class="small muted">${GOALS.find((g) => g.id === p.goal)?.label || 'No goal'}${p.goal === 'gain_pct' ? ` (${p.goal_pct}%)` : ''}</div>
          <div class="small">${fmtNum(calorieGoal(p, w, today))} kcal · ${fmtNum(proteinGoal(p, w))} g protein / day</div></div>
        <span class="muted">›</span></div>`;
    })}

    <h3 style="margin:16px 0 8px">Other</h3>
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
      It will open like a normal app.
    </div>
    <p class="small muted" style="text-align:center">Diet Tracker v1.0 · ${ctx.db.mode === 'demo' ? 'demo mode' : 'synced'}</p>

    ${editP && html`<${PersonForm} ctx=${ctx} person=${editP} onClose=${() => setEditP(null)} />`}
    ${notes && html`<${NotesSheet} ctx=${ctx} onClose=${() => setNotes(false)} />`}`;
}

function PersonForm({ ctx, person, onClose }) {
  const [p, setP] = useState({ ...person });
  const set = (k) => (v) => setP((x) => ({ ...x, [k]: v }));
  const today = todayISO();
  const w = weightOn(ctx.core.weights, p.id, today)?.weight;
  const ft = Math.floor((p.height_in || 0) / 12), inch = r1((p.height_in || 0) % 12);
  const save = async () => { await ctx.db.savePerson(p); await ctx.reload(); toast('Saved'); onClose(); };
  return html`<${Sheet} full title=${`${person.name}'s profile & goals`} onClose=${onClose}
    footer=${html`<button class="btn block" onClick=${save}>Save</button>`}>
    <div class="card">
      <div class="small muted">Using latest weight: <b>${w ? r1(w) + ' lb' : 'none yet'}</b>, age ${ageOn(p.birthdate)}</div>
      <div class="grid2" style="margin-top:8px">
        <div><div class="small muted">Maintenance</div><div class="big">${w ? fmtNum(maintenance(p, w, today)) : '—'}</div></div>
        <div><div class="small muted">Daily goal</div><div class="big">${fmtNum(calorieGoal(p, w, today))}</div></div>
      </div>
      <div class="small" style="margin-top:6px">Protein target: <b>${fmtNum(proteinGoal(p, w))} g</b></div>
    </div>
    <div class="grid2">
      <label class="field"><span>Name</span><input value=${p.name} onInput=${(e) => set('name')(e.target.value)} /></label>
      <label class="field"><span>Color</span><input type="color" style="height:48px;padding:4px" value=${p.color} onInput=${(e) => set('color')(e.target.value)} /></label>
      <label class="field"><span>Sex (for the formula)</span><select value=${p.sex} onChange=${(e) => set('sex')(e.target.value)}>
        <option value="male">Male</option><option value="female">Female</option></select></label>
      <label class="field"><span>Birthday</span><input type="date" value=${p.birthdate || ''} onInput=${(e) => set('birthdate')(e.target.value)} /></label>
      <label class="field"><span>Height (feet)</span><${NumInput} value=${ft} onChange=${(v) => set('height_in')((v || 0) * 12 + inch)} /></label>
      <label class="field"><span>Height (inches)</span><${NumInput} value=${inch} onChange=${(v) => set('height_in')(ft * 12 + (v || 0))} /></label>
    </div>
    <label class="field"><span>Activity level</span><select value=${String(p.activity)} onChange=${(e) => set('activity')(Number(e.target.value))}>
      ${ACTIVITY.map(([v, l]) => html`<option value=${String(v)}>${l}</option>`)}</select></label>
    <label class="field"><span>Goal</span><select value=${p.goal} onChange=${(e) => set('goal')(e.target.value)}>
      ${GOALS.map((g) => html`<option value=${g.id}>${g.label}</option>`)}</select></label>
    ${p.goal === 'gain_pct' && html`<label class="field"><span>% above maintenance</span><${NumInput} value=${p.goal_pct} onChange=${set('goal_pct')} /></label>`}
    ${p.goal === 'custom' && html`<label class="field"><span>Daily calories</span><${NumInput} value=${p.goal_kcal} onChange=${set('goal_kcal')} /></label>`}
    <label class="field"><span>Protein target (grams per lb of body weight)</span><${NumInput} value=${p.protein_per_lb} onChange=${set('protein_per_lb')} /></label>
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
