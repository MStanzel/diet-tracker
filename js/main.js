import { render, useState, useEffect, useMemo } from '../vendor/vendor.js';
import { html, ToastHost, toast } from './ui.js';
import { makeDB } from './db.js';
import { todayISO } from './calc.js';
import { TodayScreen } from './today.js';
import { ProgressScreen } from './progress.js';
import { FoodsScreen } from './library.js';
import { RecipesScreen } from './recipes.js';
import { CalculatorScreen } from './calculator.js';
import { SettingsSheet } from './more.js';

const db = makeDB();
const PREF_KEY = 'diet-device-prefs';
const prefs = (() => { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { return {}; } })();
const savePrefs = () => localStorage.setItem(PREF_KEY, JSON.stringify(prefs));

function Login({ onDone }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await db.signIn(email.trim(), pw); onDone(); } catch (x) { setErr(x.message || 'Sign-in failed'); }
    setBusy(false);
  };
  return html`<form class="login card" onSubmit=${submit}>
    <h2 style="margin-bottom:14px">${window.APP_CONFIG.APP_NAME || 'Diet Tracker'}</h2>
    <label class="field"><span>Email</span><input type="email" autocomplete="username" value=${email} onInput=${(e) => setEmail(e.target.value)} required /></label>
    <label class="field"><span>Password</span><input type="password" autocomplete="current-password" value=${pw} onInput=${(e) => setPw(e.target.value)} required /></label>
    ${err && html`<p class="over small">${err}</p>`}
    <button class="btn block" disabled=${busy}>${busy ? 'Signing in…' : 'Sign in'}</button>
    <p class="small muted">You only need to sign in once on each phone.</p>
  </form>`;
}

function App() {
  const [session, setSession] = useState(undefined);
  const [core, setCore] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('today');
  const [date, setDate] = useState(todayISO());
  const [personId, setPersonIdRaw] = useState(prefs.personId || null);
  const [settings, setSettings] = useState(false);

  const setPersonId = (id) => { setPersonIdRaw(id); prefs.personId = id; savePrefs(); };

  const reload = async () => {
    try { setCore(await db.loadCore()); setError(''); } catch (e) { setError(e.message); }
  };
  useEffect(() => { db.session().then((s) => setSession(s || null)); }, []);
  useEffect(() => { if (session) reload(); }, [session]);
  // Refresh when coming back to the app (picks up changes from the other phone)
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible' && session) { reload(); setDate((d) => d); window.dispatchEvent(new Event('app-refresh')); } };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [session]);
  // New day while app stayed open
  useEffect(() => {
    let last = todayISO();
    const t = setInterval(() => { const n = todayISO(); if (n !== last) { if (date === last) setDate(n); last = n; } }, 60000);
    return () => clearInterval(t);
  }, [date]);

  const derived = useMemo(() => {
    if (!core) return null;
    const foodsById = Object.fromEntries(core.foods.map((f) => [f.id, f]));
    const itemsByRecipe = {};
    for (const it of core.items) (itemsByRecipe[it.recipe_id] ||= []).push(it);
    return { foodsById, itemsByRecipe };
  }, [core]);

  if (session === undefined) return html`<div class="center-msg"><div class="spinner"></div></div>`;
  if (session === null) return html`<${Login} onDone=${() => db.session().then(setSession)} />`;
  if (error && !core) return html`<div class="card" style="margin:20px">
    <h2>Couldn't load your data</h2><p class="small">${error}</p>
    <button class="btn" onClick=${reload}>Try again</button></div>`;
  if (!core) return html`<div class="center-msg"><div class="spinner"></div><p class="muted">Loading…</p></div>`;

  const people = core.people;
  const person = people.find((p) => p.id === personId) || people[0];
  document.documentElement.style.setProperty('--accent', person?.color || '#2f6fde');

  const ctx = {
    db, core, reload, people, person, setPersonId, date, setDate, ...derived, prefs, savePrefs,
    otherPeople: people.filter((p) => p.id !== person.id),
    patchCore: (fn) => setCore((c) => { const n = { ...c }; fn(n); return n; }),
  };

  const tabs = [
    ['today', '📅', 'Today'],
    ['recipes', '🍲', 'Recipes'],
    ['foods', '🥫', 'Foods'],
    ['calc', '🧮', 'Calculator'],
    ['progress', '📈', 'Progress'],
  ];
  const signOut = async () => { setSettings(false); await db.signOut(); setCore(null); setSession(db.mode === 'demo' ? await db.session() : null); };
  return html`
    <div class="topbar">
      <h1>${tabs.find((t) => t[0] === tab)[2]}</h1>
      <div class="people">${people.map((p) => html`<button class=${p.id === person.id ? 'on' : ''}
        style=${`--pc:${p.color}`} onClick=${() => setPersonId(p.id)}>${p.name}</button>`)}</div>
      <button class="gear" aria-label="Settings" onClick=${() => setSettings(true)}>⚙️</button>
    </div>
    <main>
      ${db.mode === 'demo' && html`<div class="banner">Demo mode: data is saved on this device only. Follow the setup guide to sync between phones.</div>`}
      ${error && html`<div class="banner">Connection problem: ${error}</div>`}
      ${tab === 'today' && html`<${TodayScreen} ctx=${ctx} />`}
      ${tab === 'progress' && html`<${ProgressScreen} ctx=${ctx} />`}
      ${tab === 'recipes' && html`<${RecipesScreen} ctx=${ctx} />`}
      ${tab === 'foods' && html`<${FoodsScreen} ctx=${ctx} />`}
      ${tab === 'calc' && html`<${CalculatorScreen} ctx=${ctx} />`}
      ${settings && html`<${SettingsSheet} ctx=${ctx} onClose=${() => setSettings(false)} onSignOut=${signOut} />`}
    </main>
    <nav class="tabs"><div class="in">${tabs.map(([id, ic, label]) => html`<button class=${tab === id ? 'on' : ''} onClick=${() => { setTab(id); scrollTo(0, 0); }}>
      <span class="ic">${ic}</span>${label}</button>`)}</div></nav>
    <${ToastHost} />`;
}

render(html`<${App} />`, document.getElementById('app'));

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
window.addEventListener('unhandledrejection', (e) => toast('Something went wrong: ' + (e.reason?.message || e.reason)));
