// Data layer. Two interchangeable backends with the same methods:
//  - SupabaseDB: shared, synced between phones (real use)
//  - DemoDB: stored in this browser only (try-out / before setup)
import { createClient } from '../vendor/vendor.js';

export const uuid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  }));

const byName = (a, b) => a.name.localeCompare(b.name);
const ENTRY_FIELDS = ['id', 'person_id', 'date', 'meal', 'food_id', 'recipe_id', 'name', 'calories', 'protein', 'carbs', 'fat', 'servings', 'created_at'];
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));

// ======================================================================
export class SupabaseDB {
  constructor(url, key) {
    this.mode = 'supabase';
    this.sb = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
  }
  // ---- auth ----
  async session() { return (await this.sb.auth.getSession()).data.session; }
  async signIn(email, password) {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }
  async signOut() { await this.sb.auth.signOut(); }

  _check({ data, error }) { if (error) throw new Error(error.message); return data; }
  async _all(build) {
    // Supabase returns max 1000 rows per request: page through.
    const out = [];
    for (let from = 0; ; from += 1000) {
      const rows = this._check(await build().range(from, from + 999));
      out.push(...rows);
      if (rows.length < 1000) break;
    }
    return out;
  }

  // ---- core data ----
  async loadCore() {
    const [people, foods, recipes, items, weights, notes] = await Promise.all([
      this._all(() => this.sb.from('people').select('*').order('sort')),
      this._all(() => this.sb.from('foods').select('*').order('name')),
      this._all(() => this.sb.from('recipes').select('*').order('name')),
      this._all(() => this.sb.from('recipe_items').select('*').order('id')),
      this._all(() => this.sb.from('weights').select('*').order('date')),
      this.sb.from('app_notes').select('*').eq('id', 1).maybeSingle().then((r) => this._check(r)),
    ]);
    return { people, foods, recipes, items, weights, notes: notes?.body || '' };
  }

  async getEntries(date) {
    return this._check(await this.sb.from('log_entries').select('*').eq('date', date).order('created_at'));
  }
  async getRecent(personId, limit = 400) {
    return this._check(await this.sb.from('log_entries').select('*').eq('person_id', personId)
      .order('created_at', { ascending: false }).limit(limit));
  }
  async addEntries(list) {
    // Every row must carry every column with a real value: when several rows are sent
    // together, a missing value is stored as empty (null) instead of the default.
    const now = Date.now();
    const rows = list.map((e, i) => {
      const r = pick(e, ENTRY_FIELDS);
      for (const k of Object.keys(r)) if (r[k] === undefined) delete r[k];
      if (!r.created_at) r.created_at = new Date(now + i).toISOString(); // keeps the order they were added
      if (!r.id) r.id = uuid();
      for (const k of ['food_id', 'recipe_id', 'carbs', 'fat']) if (!(k in r)) r[k] = null;
      if (r.servings == null) r.servings = 1;
      return r;
    });
    this._check(await this.sb.from('log_entries').insert(rows));
  }
  async updateEntry(id, patch) { this._check(await this.sb.from('log_entries').update(patch).eq('id', id)); }
  async deleteEntry(id) { this._check(await this.sb.from('log_entries').delete().eq('id', id)); }
  async dailyTotals() { return this._all(() => this.sb.from('daily_totals').select('*').order('date')); }
  async allEntries() { return this._all(() => this.sb.from('log_entries').select('*').order('date').order('created_at')); }

  async setWeight(personId, date, weight) {
    if (weight == null) this._check(await this.sb.from('weights').delete().eq('person_id', personId).eq('date', date));
    else this._check(await this.sb.from('weights').upsert({ person_id: personId, date, weight }));
  }
  async saveFood(f) { this._check(await this.sb.from('foods').upsert(f)); }
  async savePerson(p) { this._check(await this.sb.from('people').upsert(p)); }
  async saveRecipe(r, items) {
    this._check(await this.sb.from('recipes').upsert(r));
    this._check(await this.sb.from('recipe_items').delete().eq('recipe_id', r.id));
    if (items.length) this._check(await this.sb.from('recipe_items').insert(items.map((i) => ({ ...i, recipe_id: r.id }))));
  }
  async saveNotes(body) { this._check(await this.sb.from('app_notes').upsert({ id: 1, body, updated_at: new Date().toISOString() })); }
}

// ======================================================================
const DEMO_KEY = 'diet-demo-v1';
export class DemoDB {
  constructor() { this.mode = 'demo'; this.d = null; }
  async _load() {
    if (this.d) return;
    try { this.d = JSON.parse(localStorage.getItem(DEMO_KEY)); } catch { this.d = null; }
    if (!this.d) {
      const seed = await (await fetch('data/demo.json')).json();
      this.d = { ...seed, items: seed.recipe_items, entries: seed.log_entries };
      delete this.d.recipe_items; delete this.d.log_entries;
      this._save();
    }
  }
  _save() { try { localStorage.setItem(DEMO_KEY, JSON.stringify(this.d)); } catch (e) { console.warn(e); } }
  async session() { return { user: { email: 'demo' } }; }
  async signIn() {}
  async signOut() { localStorage.removeItem(DEMO_KEY); this.d = null; }

  async loadCore() {
    await this._load();
    const c = structuredClone(this.d);
    return {
      people: c.people.sort((a, b) => a.sort - b.sort), foods: c.foods.sort(byName),
      recipes: c.recipes.sort(byName), items: c.items,
      weights: c.weights.sort((a, b) => (a.date < b.date ? -1 : 1)), notes: c.notes || '',
    };
  }
  async getEntries(date) { await this._load(); return structuredClone(this.d.entries.filter((e) => e.date === date)); }
  async getRecent(personId, limit = 400) {
    await this._load();
    return structuredClone(this.d.entries.filter((e) => e.person_id === personId)
      .sort((a, b) => ((b.created_at || b.date) > (a.created_at || a.date) ? 1 : -1)).slice(0, limit));
  }
  async addEntries(list) {
    await this._load();
    const now = Date.now();
    list.forEach((e, i) => this.d.entries.push({ ...pick(e, ENTRY_FIELDS), created_at: e.created_at || new Date(now + i).toISOString() }));
    this._save();
  }
  async updateEntry(id, patch) { const e = this.d.entries.find((x) => x.id === id); Object.assign(e, patch); this._save(); }
  async deleteEntry(id) { this.d.entries = this.d.entries.filter((x) => x.id !== id); this._save(); }
  async dailyTotals() {
    await this._load();
    const m = new Map();
    for (const e of this.d.entries) {
      const k = e.person_id + e.date;
      const t = m.get(k) || { person_id: e.person_id, date: e.date, calories: 0, protein: 0, carbs: 0, fat: 0 };
      const s = Number(e.servings) || 0;
      t.calories += (Number(e.calories) || 0) * s; t.protein += (Number(e.protein) || 0) * s;
      t.carbs += (Number(e.carbs) || 0) * s; t.fat += (Number(e.fat) || 0) * s;
      m.set(k, t);
    }
    return [...m.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  }
  async allEntries() { await this._load(); return structuredClone(this.d.entries).sort((a, b) => (a.date < b.date ? -1 : 1)); }
  async setWeight(personId, date, weight) {
    this.d.weights = this.d.weights.filter((w) => !(w.person_id === personId && w.date === date));
    if (weight != null) this.d.weights.push({ person_id: personId, date, weight });
    this._save();
  }
  _upsert(list, obj) { const i = list.findIndex((x) => x.id === obj.id); if (i >= 0) list[i] = { ...list[i], ...obj }; else list.push(obj); }
  async saveFood(f) { this._upsert(this.d.foods, f); this._save(); }
  async savePerson(p) { this._upsert(this.d.people, p); this._save(); }
  async saveRecipe(r, items) {
    this._upsert(this.d.recipes, r);
    this.d.items = this.d.items.filter((i) => i.recipe_id !== r.id).concat(items.map((i) => ({ ...i, recipe_id: r.id })));
    this._save();
  }
  async saveNotes(body) { this.d.notes = body; this._save(); }
}

export function makeDB() {
  const c = window.APP_CONFIG || {};
  if (c.SUPABASE_URL && c.SUPABASE_ANON_KEY) return new SupabaseDB(c.SUPABASE_URL.trim(), c.SUPABASE_ANON_KEY.trim());
  return new DemoDB();
}
