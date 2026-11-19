// Recipes tab: list + recipe builder (the spreadsheet's Ingredient Calories / Meal.Builder).
import { useState } from '../vendor/vendor.js';
import { html, Sheet, toast, NumInput } from './ui.js';
import { uuid } from './db.js';
import { fmtNum, fmtFrac, recipeTotals, portionFor, todayISO, mealLabel } from './calc.js';
import { FoodForm } from './library.js';
import { ConfirmAdd, recipeItem, toEntry } from './add.js';
import { syncLoggedEntries } from './sync.js';

const FRACTIONS = [1 / 6, 1 / 4, 1 / 3, 1 / 2, 1];

export function RecipesScreen({ ctx }) {
  const [edit, setEdit] = useState(null);
  const [q, setQ] = useState('');
  const [showArch, setShowArch] = useState(false);
  const ws = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = ctx.core.recipes.filter((r) => !!r.archived === showArch && ws.every((w) => r.name.toLowerCase().includes(w)));
  return html`
    <div class="row" style="margin-bottom:8px">
      <div class="search grow"><input type="search" placeholder="Search recipes" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
      <button class="btn" onClick=${() => setEdit({})}>+ New</button>
    </div>
    ${list.length === 0 && html`<div class="card empty">${showArch ? 'No archived recipes.' : 'No recipes found.'}</div>`}
    ${list.map((r) => {
      const items = ctx.itemsByRecipe[r.id] || [];
      const t = recipeTotals(r, items, ctx.foodsById);
      return html`<div class="card" onClick=${() => setEdit(r)} style="cursor:pointer">
        <div class="row between"><h2 class="ellipsis">${r.name}</h2><span class="muted">›</span></div>
        <div class="small muted" style="margin:2px 0 8px">${items.length} ingredient${items.length === 1 ? '' : 's'} · whole recipe ${fmtNum(t.cal)} kcal · ${fmtNum(t.pro)} g protein</div>
        <div class="grid2">${ctx.people.map((p) => {
          const pp = portionFor(r, p.id);
          return html`<div class="small" style=${`border-left:3px solid ${p.color};padding-left:8px`}>
            <b>${p.name}</b> <span class="muted">(${fmtFrac(pp)})</span><br />${fmtNum(t.cal * pp)} kcal · ${fmtNum(t.pro * pp)} g</div>`;
        })}</div></div>`;
    })}
    <button class=${'chip' + (showArch ? ' on' : '')} onClick=${() => setShowArch(!showArch)}>${showArch ? '← Back to recipes' : 'Show archived recipes'}</button>
    ${edit && html`<${RecipeEditor} ctx=${ctx} recipe=${edit} onClose=${() => setEdit(null)} />`}`;
}

function RecipeEditor({ ctx, recipe, onClose }) {
  const isNew = !recipe.id;
  const [r, setR] = useState(() => ({ id: recipe.id || uuid(), name: '', notes: '', archived: false, ...recipe }));
  const [items, setItems] = useState(() => (ctx.itemsByRecipe[recipe.id] || []).map((i) => ({ ...i })));
  const [portions, setPortions] = useState(() => Object.fromEntries(ctx.people.map((p) => [p.id, portionFor(recipe, p.id)])));
  const [picking, setPicking] = useState(false);
  const [editFood, setEditFood] = useState(null);
  const [dirty, setDirty] = useState(isNew);
  const [logging, setLogging] = useState(false);
  const [meal, setMeal] = useState(new Date().getHours() < 15 ? 'lunch' : 'dinner');
  const t = recipeTotals(r, items, ctx.foodsById);
  const touch = (fn) => (...a) => { setDirty(true); fn(...a); };

  const save = async ({ asCopy = false, archived, quiet = false } = {}) => {
    const out = {
      id: asCopy ? uuid() : r.id, name: (asCopy ? `${r.name} (copy)` : r.name).trim(), notes: r.notes || '',
      portions, archived: archived ?? !!r.archived,
    };
    await ctx.db.saveRecipe(out, items.filter((i) => i.qty > 0).map((i) => ({ id: uuid(), food_id: i.food_id, qty: i.qty })));
    const n = asCopy ? 0 : await syncLoggedEntries(ctx.db);
    await ctx.reload();
    setDirty(false);
    if (!quiet) toast((asCopy ? 'Copy created' : archived != null ? (archived ? 'Recipe archived' : 'Recipe restored') : 'Recipe saved') + (n ? ` · updated ${n} logged item${n > 1 ? 's' : ''}` : ''));
    return out;
  };
  const setQty = (idx, qty) => { setDirty(true); setItems(items.map((it, j) => (j === idx ? { ...it, qty: Math.max(0, Math.round(qty * 100) / 100) } : it))); };

  const logIt = async () => { if (dirty) await save({ quiet: true }); setLogging(true); };
  const addLogged = async (item, servings, alsoFor) => {
    const date = todayISO();
    const entries = [toEntry(item, ctx.person.id, date, meal, servings)];
    for (const pid of alsoFor) entries.push(toEntry(recipeItem(item.recipe, ctx, pid), pid, date, meal, servings));
    await ctx.db.addEntries(entries);
    setLogging(false);
    toast(`Added to today's ${mealLabel(meal).toLowerCase()}`);
  };
  const saved = ctx.core.recipes.find((x) => x.id === r.id);

  return html`<${Sheet} full title=${isNew ? 'New recipe' : r.name || 'Recipe'} onClose=${() => (!dirty || confirm('Close without saving your changes?')) && onClose()}
    footer=${html`
      ${!isNew && html`<button class="btn secondary" onClick=${logIt}>Log it</button>`}
      <button class="btn" disabled=${!r.name.trim() || !dirty} onClick=${async () => { await save(); if (isNew) onClose(); }}>${dirty ? 'Save' : 'Saved ✓'}</button>`}>
    <label class="field"><span>Recipe name</span><input value=${r.name} placeholder="e.g. White Chili" onInput=${touch((e) => setR({ ...r, name: e.target.value }))} /></label>

    <div class="card">
      <h2>Ingredients</h2>
      <p class="small muted" style="margin:2px 0 6px">The amount is how many servings of that ingredient go in, e.g. 2 = two cans. Tap an ingredient's name to edit its calories or protein.</p>
      ${items.length === 0 && html`<div class="empty">No ingredients yet. Tap "Add ingredient".</div>`}
      <ul class="list">${items.map((it, idx) => {
        const f = ctx.foodsById[it.food_id];
        return html`<li class="item" style="cursor:default;flex-wrap:wrap">
          <div class="grow" style="min-width:140px;cursor:pointer" onClick=${() => f && setEditFood(f)}><div class="name">${f ? f.name : '(deleted food)'} ${f && html`<span class="muted small">✎</span>`}</div>
            <div class="small muted">${f ? `${fmtFrac(it.qty)} × ${f.serving || 'serving'} = ${fmtNum((f.calories || 0) * it.qty)} kcal · ${fmtNum((f.protein || 0) * it.qty, 1)} g` : ''}</div></div>
          <div class="qty">
            <button aria-label="less" onClick=${() => setQty(idx, it.qty - (it.qty > 1 ? 1 : 0.25))}>−</button>
            <${NumInput} frac value=${it.qty} onChange=${(v) => v != null && v >= 0 && setQty(idx, v)} />
            <button aria-label="more" onClick=${() => setQty(idx, it.qty + (it.qty >= 1 ? 1 : 0.25))}>+</button>
            <button aria-label="remove" style="background:none;color:var(--bad)" onClick=${touch(() => setItems(items.filter((_, j) => j !== idx)))}>✕</button>
          </div>
        </li>`;
      })}</ul>
      <button class="btn secondary block" style="margin-top:8px" onClick=${() => setPicking(true)}>+ Add ingredient</button>
    </div>

    <div class="card" style="background:var(--accent-soft)">
      <div class="small muted">Whole recipe</div>
      <div class="big">${fmtNum(t.cal)} kcal · ${fmtNum(t.pro)} g protein</div>
      ${(t.hasCarbs || t.hasFat) && html`<div class="small">Carbs ${fmtNum(t.carbs)} g · Fat ${fmtNum(t.fat)} g</div>`}
    </div>

    <div class="card">
      <h2>Portions</h2>
      <p class="small muted" style="margin:2px 0 8px">How much of the whole recipe each of you eats.</p>
      ${ctx.people.map((p) => {
        const v = portionFor({ portions }, p.id);
        return html`<div style="margin-bottom:12px">
          <div class="row between"><b style=${`color:${p.color}`}>${p.name}</b>
            <span class="small"><b>${fmtNum(t.cal * v)} kcal</b> · ${fmtNum(t.pro * v)} g protein</span></div>
          <div class="chips" style="padding-bottom:0;margin-top:6px">
            ${FRACTIONS.map((f) => html`<button class=${'chip' + (Math.abs(v - f) < 0.005 ? ' on' : '')} onClick=${touch(() => setPortions({ ...portions, [p.id]: f }))}>${f === 1 ? 'Whole' : fmtFrac(f)}</button>`)}
            <${NumInput} frac style="width:120px;flex:none" aria-label="custom portion" placeholder="other"
              value=${FRACTIONS.some((f) => Math.abs(v - f) < 0.005) ? null : v}
              onChange=${(x) => { if (x > 0) { setDirty(true); setPortions({ ...portions, [p.id]: x }); } }} />
          </div></div>`;
      })}
    </div>

    <label class="field"><span>Notes / instructions</span><textarea value=${r.notes || ''} onInput=${touch((e) => setR({ ...r, notes: e.target.value }))} /></label>
    ${!isNew && html`<div class="row" style="gap:8px">
      <button class="btn secondary grow" onClick=${async () => { await save({ asCopy: true }); onClose(); }}>Duplicate (try a new version)</button>
      <button class="btn danger" onClick=${async () => { await save({ archived: !r.archived }); onClose(); }}>${r.archived ? 'Restore' : 'Archive'}</button></div>`}

    ${editFood && html`<${FoodForm} ctx=${ctx} food=${editFood} onClose=${() => setEditFood(null)}
      onSaved=${async () => { await ctx.reload(); setEditFood(null); }} />`}
    ${picking && html`<${IngredientPicker} ctx=${ctx} onClose=${() => setPicking(false)}
      onPick=${(f, qty) => { setDirty(true); setItems([...items, { food_id: f.id, qty }]); setPicking(false); }} />`}
    ${logging && saved && html`<${ConfirmAdd} ctx=${ctx} item=${recipeItem(saved, ctx, ctx.person.id)} meal=${meal} onMealChange=${setMeal}
      onClose=${() => setLogging(false)} onAdd=${addLogged} />`}
  <//>`;
}

function IngredientPicker({ ctx, onClose, onPick }) {
  const [q, setQ] = useState('');
  const [newFood, setNewFood] = useState(null);
  const ws = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = ctx.core.foods.filter((f) => !f.archived && ws.every((w) => f.name.toLowerCase().includes(w)))
    .sort((a, b) => (a.kind === 'ingredient' ? 0 : 1) - (b.kind === 'ingredient' ? 0 : 1) || a.name.localeCompare(b.name));
  return html`<${Sheet} full title="Add ingredient" onClose=${onClose}>
    <div class="row" style="margin-bottom:10px">
      <div class="search grow"><input type="search" placeholder="Search ingredients & foods" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
      <button class="btn secondary" onClick=${() => setNewFood({ name: q, kind: 'ingredient' })}>+ New</button>
    </div>
    <div class="card" style="padding:4px 14px">
      ${list.length === 0 && html`<div class="empty">No match. Tap "+ New" to add it.</div>`}
      <ul class="list">${list.slice(0, 200).map((f) => html`
      <li class="item" onClick=${() => onPick(f, 1)}><div class="grow"><div class="name ellipsis">${f.name}</div>
        <div class="small muted">${f.serving || '1 serving'} · ${fmtNum(f.protein, 1)} g protein</div></div><div class="kcal">${fmtNum(f.calories)}</div></li>`)}</ul></div>
    ${newFood && html`<${FoodForm} ctx=${ctx} food=${newFood} onClose=${() => setNewFood(null)} onSaved=${async (f) => { await ctx.reload(); setNewFood(null); onPick(f, 1); }} />`}
  <//>`;
}
