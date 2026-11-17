import { useState, useEffect, useMemo } from '../vendor/vendor.js';
import { html, Sheet, Stepper, toast, NumInput } from './ui.js';
import { uuid } from './db.js';
import { MEALS, mealLabel, fmtNum, fmtFrac, r1, recipeTotals, portionFor } from './calc.js';
import { FoodForm } from './library.js';
import { BarcodeScanner, LabelScanner } from './scan.js';

// Turn a food or recipe into something addable for a given person
export function foodItem(f) {
  return { type: 'food', id: f.id, name: f.name, cal: +f.calories || 0, pro: +f.protein || 0, carbs: f.carbs, fat: f.fat, sub: f.serving, fav: f.favorite, kind: f.kind };
}
export function recipeItem(r, ctx, personId) {
  const t = recipeTotals(r, ctx.itemsByRecipe[r.id] || [], ctx.foodsById);
  const p = portionFor(r, personId);
  return {
    type: 'recipe', id: r.id, name: r.name, cal: t.cal * p, pro: t.pro * p,
    carbs: t.hasCarbs ? t.carbs * p : null, fat: t.hasFat ? t.fat * p : null,
    sub: `${fmtFrac(p)} of recipe`, recipe: r, portion: p,
  };
}
export function toEntry(item, personId, date, meal, servings) {
  return {
    id: uuid(), person_id: personId, date, meal,
    food_id: item.type === 'food' ? item.id : null, recipe_id: item.type === 'recipe' ? item.id : null,
    name: item.name, calories: r1(item.cal), protein: r1(item.pro),
    carbs: item.carbs == null ? null : r1(item.carbs), fat: item.fat == null ? null : r1(item.fat), servings,
  };
}

const words = (q) => q.toLowerCase().split(/\s+/).filter(Boolean);
const matches = (name, ws) => { const n = name.toLowerCase(); return ws.every((w) => n.includes(w)); };

export function AddSheet({ ctx, date, meal: meal0, onClose, onAdded }) {
  const { person, core } = ctx;
  const [meal, setMeal] = useState(meal0);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('recent');
  const [recent, setRecent] = useState(null);
  const [picked, setPicked] = useState(null);
  const [mode, setMode] = useState(null); // quick | newfood | barcode | label
  const [draft, setDraft] = useState(null); // prefilled food for FoodForm
  const [added, setAdded] = useState([]);

  useEffect(() => { ctx.db.getRecent(person.id).then(setRecent); }, [person.id]);

  const foods = core.foods.filter((f) => !f.archived);
  const recipes = core.recipes.filter((r) => !r.archived);

  const recentItems = useMemo(() => {
    if (!recent) return null;
    const seen = new Map();
    for (const e of recent) {
      if (e.name === 'Daily total (from spreadsheet)') continue;
      const key = e.food_id || e.recipe_id || 'q:' + e.name;
      const cur = seen.get(key) || { count: 0, sameMeal: 0, last: e.created_at, e };
      cur.count++; if (e.meal === meal) cur.sameMeal++;
      seen.set(key, cur);
    }
    const out = [];
    for (const v of seen.values()) {
      const e = v.e;
      let item = null;
      if (e.food_id && ctx.foodsById[e.food_id]) item = foodItem(ctx.foodsById[e.food_id]);
      else if (e.recipe_id) { const r = core.recipes.find((x) => x.id === e.recipe_id); if (r) item = recipeItem(r, ctx, person.id); }
      if (!item) item = { type: 'quick', id: 'q:' + e.name, name: e.name, cal: +e.calories || 0, pro: +e.protein || 0, carbs: e.carbs, fat: e.fat, sub: 'quick add' };
      if (item.kind === 'ingredient' || ctx.foodsById[e.food_id]?.archived) continue;
      out.push({ ...item, score: v.sameMeal * 3 + v.count });
    }
    // Items usually eaten at this meal first, then everything else by how often
    return out.sort((a, b) => b.score - a.score).slice(0, 40);
  }, [recent, meal, core]);

  let list;
  if (q.trim()) {
    const ws = words(q);
    const rs = recipes.filter((r) => matches(r.name, ws)).map((r) => recipeItem(r, ctx, person.id));
    const fs = foods.filter((f) => matches(f.name, ws)).map(foodItem);
    const first = q.trim().toLowerCase();
    list = [...rs, ...fs].sort((a, b) => (b.name.toLowerCase().startsWith(first) - a.name.toLowerCase().startsWith(first)) || (a.kind === 'ingredient') - (b.kind === 'ingredient') || a.name.localeCompare(b.name));
  } else if (tab === 'recent') list = recentItems;
  else if (tab === 'fav') list = foods.filter((f) => f.favorite).map(foodItem);
  else if (tab === 'recipes') list = recipes.map((r) => recipeItem(r, ctx, person.id));
  else list = foods.filter((f) => f.kind !== 'ingredient').map(foodItem);

  const addItem = async (item, servings, alsoFor = []) => {
    const entries = [toEntry(item, person.id, date, meal, servings)];
    for (const pid of alsoFor) {
      const it = item.type === 'recipe' ? recipeItem(item.recipe, ctx, pid) : item;
      entries.push(toEntry(it, pid, date, meal, servings));
    }
    await ctx.db.addEntries(entries);
    setAdded((a) => [...a, item.name]);
    setPicked(null); setQ('');
    onAdded();
    const others = alsoFor.map((id) => ctx.people.find((p) => p.id === id)?.name).filter(Boolean);
    toast(`Added ${item.name}${others.length ? ` (also for ${others.join(', ')})` : ''}`);
  };

  const afterFoodSaved = async (food) => {
    await ctx.reload();
    setMode(null); setDraft(null);
    setPicked(foodItem(food));
  };

  return html`<${Sheet} full title=${`Add to ${person.name}'s ${mealLabel(meal).toLowerCase()}`} onClose=${onClose}
    footer=${added.length > 0 && html`<button class="btn" onClick=${onClose}>Done · ${added.length} added</button>`}>
    <div class="chips">${MEALS.map((m) => html`<button class=${'chip' + (meal === m.id ? ' on' : '')} onClick=${() => setMeal(m.id)}>${m.label}</button>`)}</div>
    <div class="search" style="margin-bottom:10px"><input type="search" placeholder="Search foods & recipes" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
    ${!q.trim() && html`
      <div class="actions">
        <button class="action" onClick=${() => setMode('quick')}><span class="ic">⚡</span>Quick add</button>
        <button class="action" onClick=${() => setMode('barcode')}><span class="ic">▥</span>Barcode</button>
        <button class="action" onClick=${() => setMode('label')}><span class="ic">📷</span>Label photo</button>
        <button class="action" onClick=${() => { setDraft({}); setMode('newfood'); }}><span class="ic">＋</span>New food</button>
      </div>
      <div class="chips">${[['recent', 'Recent'], ['fav', '★ Favorites'], ['recipes', 'Recipes'], ['all', 'All foods']].map(([id, l]) =>
        html`<button class=${'chip' + (tab === id ? ' on' : '')} onClick=${() => setTab(id)}>${l}</button>`)}</div>`}
    <div class="card" style="padding:4px 14px">
      ${list === null ? html`<div class="spinner"></div>` : list.length === 0 ? html`<div class="empty">${q ? 'No matches. Try Quick add or New food.' : tab === 'fav' ? 'Tap ☆ on a food in the Foods tab to make it a favorite.' : 'Nothing here yet.'}</div>` :
      html`<ul class="list">${list.map((it) => html`<li class="item" onClick=${() => setPicked(it)}>
        <div class="grow"><div class="name ellipsis">${it.name}${it.type === 'recipe' && html`<span class="tag">recipe</span>`}${it.kind === 'ingredient' && html`<span class="tag">ingredient</span>`}</div>
          <div class="small muted ellipsis">${it.sub ? it.sub + ' · ' : ''}${fmtNum(it.pro)} g protein</div></div>
        <div class="kcal">${fmtNum(it.cal)}</div></li>`)}</ul>`}
    </div>

    ${picked && html`<${ConfirmAdd} ctx=${ctx} item=${picked} meal=${meal} onClose=${() => setPicked(null)} onAdd=${addItem} />`}
    ${mode === 'quick' && html`<${QuickAdd} ctx=${ctx} onClose=${() => setMode(null)} onAdd=${async (item, save) => {
      if (save) { const f = { id: uuid(), name: item.name, calories: item.cal, protein: item.pro, carbs: item.carbs, fat: item.fat, serving: '1 serving', kind: 'food', favorite: false, barcode: null, archived: false }; await ctx.db.saveFood(f); await ctx.reload(); item = foodItem(f); }
      setMode(null); await addItem(item, 1);
    }} />`}
    ${mode === 'newfood' && html`<${FoodForm} ctx=${ctx} food=${draft} onClose=${() => { setMode(null); setDraft(null); }} onSaved=${afterFoodSaved} />`}
    ${mode === 'barcode' && html`<${BarcodeScanner} ctx=${ctx} onClose=${() => setMode(null)}
      onExisting=${(f) => { setMode(null); setPicked(foodItem(f)); }}
      onFound=${(d) => { setDraft(d); setMode('newfood'); }} />`}
    ${mode === 'label' && html`<${LabelScanner} onClose=${() => setMode(null)} onFound=${(d) => { setDraft(d); setMode('newfood'); }} />`}
  <//>`;
}

export function ConfirmAdd({ ctx, item, meal, onClose, onAdd, onMealChange }) {
  const [servings, setServings] = useState(1);
  const isShared = item.type === 'recipe';
  const [also, setAlso] = useState(() => isShared && (meal === 'dinner' || meal === 'lunch') ? ctx.otherPeople.map((p) => p.id) : []);
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); await onAdd(item, servings, also); setBusy(false); };
  return html`<${Sheet} title=${item.name} onClose=${onClose}
    footer=${html`<button class="btn block" disabled=${busy || !servings} onClick=${go}>Add ${fmtNum(item.cal * servings)} kcal</button>`}>
    ${onMealChange && html`<div class="chips">${MEALS.map((m) => html`<button class=${'chip' + (meal === m.id ? ' on' : '')} onClick=${() => onMealChange(m.id)}>${m.label}</button>`)}</div>`}
    <p class="muted" style="margin-top:0">${item.sub ? item.sub + ' · ' : ''}${fmtNum(item.cal)} kcal · ${fmtNum(item.pro)} g protein per serving</p>
    <label class="field"><span>${isShared ? `Portions (1 = ${ctx.person.name}'s usual portion)` : 'Servings'}</span>
      <${Stepper} value=${servings} onChange=${setServings} /></label>
    <div class="chips">${[0.5, 1, 1.5, 2, 3].map((v) => html`<button class=${'chip' + (servings === v ? ' on' : '')} onClick=${() => setServings(v)}>${fmtFrac(v)}</button>`)}</div>
    <p><b>${fmtNum(item.cal * servings)} kcal</b> · ${fmtNum(item.pro * servings)} g protein
      ${item.carbs != null && html` · ${fmtNum(item.carbs * servings)} g carbs`}${item.fat != null && html` · ${fmtNum(item.fat * servings)} g fat`}</p>
    ${ctx.otherPeople.map((p) => {
      const it = isShared ? recipeItem(item.recipe, ctx, p.id) : item;
      return html`<label class="check"><input type="checkbox" checked=${also.includes(p.id)}
        onChange=${(e) => setAlso(e.target.checked ? [...also, p.id] : also.filter((x) => x !== p.id))} />
        <span>Also add for <b>${p.name}</b> <span class="muted small">(${isShared ? 'their portion, ' : ''}${fmtNum(it.cal * servings)} kcal)</span></span></label>`;
    })}
  <//>`;
}

function QuickAdd({ onClose, onAdd }) {
  const [name, setName] = useState('');
  const [cal, setCal] = useState(null);
  const [pro, setPro] = useState(null);
  const [carbs, setCarbs] = useState(null);
  const [fat, setFat] = useState(null);
  const [save, setSave] = useState(false);
  return html`<${Sheet} title="Quick add" onClose=${onClose}
    footer=${html`<button class="btn block" disabled=${cal == null} onClick=${() => onAdd({ type: 'quick', name: name.trim() || 'Quick add', cal, pro: pro || 0, carbs, fat }, save && name.trim())}>Add</button>`}>
    <label class="field"><span>What was it? (optional)</span><input value=${name} onInput=${(e) => setName(e.target.value)} placeholder="e.g. Tostada" /></label>
    <div class="grid2">
      <label class="field"><span>Calories</span><${NumInput} value=${cal} onChange=${setCal} autofocus /></label>
      <label class="field"><span>Protein (g)</span><${NumInput} value=${pro} onChange=${setPro} /></label>
      <label class="field"><span>Carbs (g, optional)</span><${NumInput} value=${carbs} onChange=${setCarbs} /></label>
      <label class="field"><span>Fat (g, optional)</span><${NumInput} value=${fat} onChange=${setFat} /></label>
    </div>
    <label class="check"><input type="checkbox" checked=${save} disabled=${!name.trim()} onChange=${(e) => setSave(e.target.checked)} />Save as a food for next time</label>
  <//>`;
}
