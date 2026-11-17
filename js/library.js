import { useState } from '../vendor/vendor.js';
import { html, Sheet, Stepper, toast, NumInput, confirmBox } from './ui.js';
import { uuid } from './db.js';
import { fmtNum, fmtFrac, parseFrac, recipeTotals, portionFor } from './calc.js';
import { BarcodeScanner, LabelScanner } from './scan.js';

export function LibraryScreen({ ctx }) {
  const [seg, setSeg] = useState('foods');
  return html`
    <div class="chips">
      <button class=${'chip' + (seg === 'foods' ? ' on' : '')} onClick=${() => setSeg('foods')}>Foods</button>
      <button class=${'chip' + (seg === 'recipes' ? ' on' : '')} onClick=${() => setSeg('recipes')}>Recipes</button>
    </div>
    ${seg === 'foods' ? html`<${FoodsList} ctx=${ctx} />` : html`<${RecipesList} ctx=${ctx} />`}`;
}

// ---------------------------------------------------------------- foods
function FoodsList({ ctx }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('food');
  const [edit, setEdit] = useState(null);
  const ws = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = ctx.core.foods.filter((f) =>
    (filter === 'archived' ? f.archived : !f.archived) &&
    (filter === 'food' ? f.kind !== 'ingredient' : filter === 'ingredient' ? f.kind === 'ingredient' : filter === 'fav' ? f.favorite : true) &&
    ws.every((w) => f.name.toLowerCase().includes(w)));
  const toggleFav = async (f, e) => {
    e.stopPropagation();
    await ctx.db.saveFood({ ...f, favorite: !f.favorite });
    ctx.patchCore((c) => { c.foods = c.foods.map((x) => (x.id === f.id ? { ...x, favorite: !f.favorite } : x)); });
  };
  return html`
    <div class="row" style="margin-bottom:8px">
      <div class="search grow"><input type="search" placeholder="Search" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
      <button class="btn" onClick=${() => setEdit({})}>+ New</button>
    </div>
    <div class="chips">${[['food', 'Foods'], ['ingredient', 'Ingredients'], ['fav', '★ Favorites'], ['archived', 'Archived']].map(([id, l]) =>
      html`<button class=${'chip' + (filter === id ? ' on' : '')} onClick=${() => setFilter(id)}>${l}</button>`)}</div>
    <div class="card" style="padding:4px 14px">
      ${list.length === 0 ? html`<div class="empty">Nothing here.</div>` : html`<ul class="list">${list.map((f) => html`
        <li class="item" onClick=${() => setEdit(f)}>
          <button class=${'star' + (f.favorite ? '' : ' off')} aria-label="favorite" onClick=${(e) => toggleFav(f, e)}>${f.favorite ? '★' : '☆'}</button>
          <div class="grow"><div class="name ellipsis">${f.name}</div>
            <div class="small muted ellipsis">${f.serving || '1 serving'} · ${fmtNum(f.protein, 1)} g protein</div></div>
          <div class="kcal">${fmtNum(f.calories)}</div></li>`)}</ul>`}
    </div>
    ${edit && html`<${FoodForm} ctx=${ctx} food=${edit} onClose=${() => setEdit(null)} onSaved=${async () => { await ctx.reload(); setEdit(null); }} />`}`;
}

export function FoodForm({ ctx, food, onClose, onSaved }) {
  const isNew = !food || !food.id;
  const [f, setF] = useState(() => ({
    name: '', serving: '1 serving', calories: null, protein: null, carbs: null, fat: null,
    kind: 'food', favorite: false, barcode: null, archived: false, ...(food || {}),
  }));
  const [scan, setScan] = useState(null);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const save = async (extra = {}) => {
    const out = { ...f, ...extra, id: f.id || uuid(), name: f.name.trim(), calories: f.calories ?? 0, protein: f.protein ?? 0 };
    await ctx.db.saveFood(out);
    toast(extra.archived === true ? 'Archived' : extra.archived === false ? 'Restored' : 'Saved');
    onSaved(out);
  };
  return html`<${Sheet} title=${isNew ? 'New food' : 'Edit food'} onClose=${onClose}
    footer=${html`${!isNew && html`<button class="btn danger" onClick=${() => (f.archived ? save({ archived: false }) : confirmBox('Archive this food? It will be hidden from lists but kept in your history.') && save({ archived: true }))}>${f.archived ? 'Restore' : 'Archive'}</button>`}
      <button class="btn" disabled=${!f.name.trim() || f.calories == null} onClick=${() => save()}>Save</button>`}>
    ${isNew && html`<div class="row" style="gap:8px;margin-bottom:12px">
      <button class="btn secondary grow" onClick=${() => setScan('barcode')}>▥ Scan barcode</button>
      <button class="btn secondary grow" onClick=${() => setScan('label')}>📷 Label photo</button></div>`}
    ${food && food._note && html`<div class="banner">${food._note}</div>`}
    <label class="field"><span>Name</span><input value=${f.name} onInput=${(e) => set('name')(e.target.value)} placeholder="e.g. Greek yogurt" /></label>
    <label class="field"><span>Serving size</span><input value=${f.serving || ''} onInput=${(e) => set('serving')(e.target.value)} placeholder="e.g. 1 cup, 28g, 1 bar" /></label>
    <div class="grid2">
      <label class="field"><span>Calories</span><${NumInput} value=${f.calories} onChange=${set('calories')} /></label>
      <label class="field"><span>Protein (g)</span><${NumInput} value=${f.protein} onChange=${set('protein')} /></label>
      <label class="field"><span>Carbs (g, optional)</span><${NumInput} value=${f.carbs} onChange=${set('carbs')} /></label>
      <label class="field"><span>Fat (g, optional)</span><${NumInput} value=${f.fat} onChange=${set('fat')} /></label>
    </div>
    <label class="field"><span>Shows up in</span><select value=${f.kind} onChange=${(e) => set('kind')(e.target.value)}>
      <option value="food">Food lists (and recipes)</option>
      <option value="ingredient">Recipes only (ingredient)</option></select></label>
    <label class="check"><input type="checkbox" checked=${f.favorite} onChange=${(e) => set('favorite')(e.target.checked)} />★ Favorite</label>
    ${f.barcode && html`<p class="small muted">Barcode: ${f.barcode}</p>`}
    ${scan === 'barcode' && html`<${BarcodeScanner} ctx=${ctx} onClose=${() => setScan(null)}
      onExisting=${(ex) => { setScan(null); setF({ ...ex }); toast('You already have this food'); }}
      onFound=${(d) => { setScan(null); setF((x) => ({ ...x, ...clean(d) })); }} />`}
    ${scan === 'label' && html`<${LabelScanner} onClose=${() => setScan(null)} onFound=${(d) => { setScan(null); setF((x) => ({ ...x, ...clean(d) })); }} />`}
  <//>`;
}
const clean = (d) => Object.fromEntries(Object.entries(d).filter(([k, v]) => v != null && v !== '' && !k.startsWith('_')));

// ---------------------------------------------------------------- recipes
function RecipesList({ ctx }) {
  const [edit, setEdit] = useState(null);
  const [showArch, setShowArch] = useState(false);
  const list = ctx.core.recipes.filter((r) => !!r.archived === showArch);
  return html`
    <div class="row between" style="margin-bottom:8px">
      <button class=${'chip' + (showArch ? ' on' : '')} onClick=${() => setShowArch(!showArch)}>Archived</button>
      <button class="btn" onClick=${() => setEdit({})}>+ New recipe</button>
    </div>
    ${list.length === 0 && html`<div class="card empty">No recipes here.</div>`}
    ${list.map((r) => {
      const t = recipeTotals(r, ctx.itemsByRecipe[r.id] || [], ctx.foodsById);
      return html`<div class="card" onClick=${() => setEdit(r)} style="cursor:pointer">
        <div class="row between"><h2>${r.name}</h2><span class="small muted">${fmtNum(t.cal)} kcal total</span></div>
        <div class="row" style="gap:16px;margin-top:6px;flex-wrap:wrap">${ctx.people.map((p) => {
          const pp = portionFor(r, p.id);
          return html`<span class="small"><b style=${`color:${p.color}`}>${p.name}</b> ${fmtFrac(pp)}: ${fmtNum(t.cal * pp)} kcal · ${fmtNum(t.pro * pp)} g</span>`;
        })}</div></div>`;
    })}
    ${edit && html`<${RecipeEditor} ctx=${ctx} recipe=${edit} onClose=${() => setEdit(null)} />`}`;
}

function RecipeEditor({ ctx, recipe, onClose }) {
  const isNew = !recipe.id;
  const [r, setR] = useState(() => ({ name: '', notes: '', portions: {}, archived: false, ...recipe, portions: { ...(recipe.portions || {}) } }));
  const [items, setItems] = useState(() => (ctx.itemsByRecipe[recipe.id] || []).map((i) => ({ ...i })));
  const [picking, setPicking] = useState(false);
  const [portionText, setPortionText] = useState(() => Object.fromEntries(ctx.people.map((p) => [p.id, fmtFrac(portionFor(recipe, p.id))])));
  const t = recipeTotals(r, items, ctx.foodsById);

  const save = async (extra = {}, asCopy = false) => {
    const portions = {};
    for (const p of ctx.people) { const v = parseFrac(portionText[p.id]); portions[p.id] = v > 0 ? v : 0.25; }
    const id = asCopy || !r.id ? uuid() : r.id;
    const out = { id, name: (asCopy ? r.name + ' (copy)' : r.name).trim(), notes: r.notes || '', portions, archived: !!r.archived, ...extra };
    await ctx.db.saveRecipe(out, items.map((i) => ({ id: uuid(), food_id: i.food_id, qty: i.qty })));
    await ctx.reload();
    toast(asCopy ? 'Copy created' : 'Recipe saved');
    onClose();
  };
  const setQty = (idx, qty) => setItems(items.map((i, j) => (j === idx ? { ...i, qty } : i)));

  return html`<${Sheet} full title=${isNew ? 'New recipe' : 'Edit recipe'} onClose=${onClose}
    footer=${html`${!isNew && html`<button class="btn secondary" onClick=${() => save({}, true)}>Duplicate</button>`}
      <button class="btn" disabled=${!r.name.trim()} onClick=${() => save()}>Save</button>`}>
    <label class="field"><span>Recipe name</span><input value=${r.name} onInput=${(e) => setR({ ...r, name: e.target.value })} /></label>
    <div class="card">
      <div class="row between"><h2>Ingredients</h2><span class="small muted">amount = number of servings</span></div>
      ${items.length === 0 && html`<div class="empty">No ingredients yet.</div>`}
      <ul class="list">${items.map((it, idx) => {
        const f = ctx.foodsById[it.food_id];
        return html`<li class="item" style="cursor:default">
          <div class="grow"><div class="name ellipsis">${f ? f.name : '(deleted food)'}</div>
            <div class="small muted ellipsis">${f ? `${f.serving || '1 serving'} · ${fmtNum((f.calories || 0) * it.qty)} kcal` : ''}</div></div>
          <input inputmode="decimal" style="width:74px;text-align:center;padding:8px" value=${fmtFrac(it.qty)}
            onChange=${(e) => { const v = parseFrac(e.target.value); if (v >= 0) setQty(idx, v); }} />
          <button class="btn danger" style="padding:6px" aria-label="remove" onClick=${() => setItems(items.filter((_, j) => j !== idx))}>✕</button>
        </li>`;
      })}</ul>
      <button class="btn secondary block" style="margin-top:8px" onClick=${() => setPicking(true)}>+ Add ingredient</button>
      <p style="margin-bottom:0"><b>Whole recipe: ${fmtNum(t.cal)} kcal · ${fmtNum(t.pro)} g protein</b></p>
    </div>
    <div class="card">
      <h2>Portions</h2>
      <p class="small muted" style="margin-top:4px">How much of the whole recipe each person usually eats, like 1/3 or 1/6.</p>
      ${ctx.people.map((p) => {
        const v = parseFrac(portionText[p.id]);
        return html`<div class="row" style="margin-bottom:8px">
          <b class="grow" style=${`color:${p.color}`}>${p.name}</b>
          <input style="width:80px;text-align:center" value=${portionText[p.id]} onInput=${(e) => setPortionText({ ...portionText, [p.id]: e.target.value })} />
          <span class="small" style="width:130px;text-align:right">${v > 0 ? `${fmtNum(t.cal * v)} kcal · ${fmtNum(t.pro * v)} g` : '—'}</span></div>`;
      })}
    </div>
    <label class="field"><span>Notes / instructions</span><textarea value=${r.notes || ''} onInput=${(e) => setR({ ...r, notes: e.target.value })} /></label>
    ${!isNew && html`<button class="btn danger" onClick=${() => save({ archived: !r.archived })}>${r.archived ? 'Restore recipe' : 'Archive recipe'}</button>`}
    ${picking && html`<${FoodPicker} ctx=${ctx} onClose=${() => setPicking(false)} onPick=${(f) => { setItems([...items, { food_id: f.id, qty: 1 }]); setPicking(false); }} />`}
  <//>`;
}

function FoodPicker({ ctx, onClose, onPick }) {
  const [q, setQ] = useState('');
  const [newFood, setNewFood] = useState(null);
  const ws = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = ctx.core.foods.filter((f) => !f.archived && ws.every((w) => f.name.toLowerCase().includes(w)))
    .sort((a, b) => (a.kind === 'ingredient' ? 0 : 1) - (b.kind === 'ingredient' ? 0 : 1) || a.name.localeCompare(b.name));
  return html`<${Sheet} full title="Add ingredient" onClose=${onClose}>
    <div class="row" style="margin-bottom:10px">
      <div class="search grow"><input type="search" placeholder="Search" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
      <button class="btn secondary" onClick=${() => setNewFood({ name: q, kind: 'ingredient' })}>+ New</button>
    </div>
    <div class="card" style="padding:4px 14px"><ul class="list">${list.slice(0, 150).map((f) => html`
      <li class="item" onClick=${() => onPick(f)}><div class="grow"><div class="name ellipsis">${f.name}</div>
        <div class="small muted">${f.serving || '1 serving'}</div></div><div class="kcal">${fmtNum(f.calories)}</div></li>`)}</ul></div>
    ${newFood && html`<${FoodForm} ctx=${ctx} food=${newFood} onClose=${() => setNewFood(null)} onSaved=${async (f) => { await ctx.reload(); setNewFood(null); onPick(f); }} />`}
  <//>`;
}
