import { useState } from '../vendor/vendor.js';
import { html, Sheet, toast, NumInput, confirmBox } from './ui.js';
import { uuid } from './db.js';
import { fmtNum } from './calc.js';
import { syncLoggedEntries } from './sync.js';
import { BarcodeScanner, LabelScanner } from './scan.js';

export function FoodsScreen({ ctx }) {
  return html`<${FoodsList} ctx=${ctx} />`;
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
    const n = isNew ? 0 : await syncLoggedEntries(ctx.db);
    toast((extra.archived === true ? 'Archived' : extra.archived === false ? 'Restored' : 'Saved') + (n ? ` · updated ${n} logged item${n > 1 ? 's' : ''}` : ''));
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

