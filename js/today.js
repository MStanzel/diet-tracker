import { useState, useEffect } from '../vendor/vendor.js';
import { html, Sheet, Stepper, Ring, toast, NumInput } from './ui.js';
import { uuid } from './db.js';
import {
  MEALS, mealForNow, todayISO, addDays, friendlyDate, fmtDate, fmtNum, fmtFrac, r0, r1,
  sumEntries, entryTotals, weightOn, calorieGoal, proteinGoal,
} from './calc.js';
import { AddSheet } from './add.js';

export function TodayScreen({ ctx }) {
  const { db, person, date, setDate } = ctx;
  const [entries, setEntries] = useState(null);
  const [adding, setAdding] = useState(null); // meal id
  const [editing, setEditing] = useState(null); // entry
  const [weighing, setWeighing] = useState(false);

  const load = async () => setEntries(await db.getEntries(date));
  useEffect(() => { setEntries(null); load(); }, [date]);
  useEffect(() => { const f = () => load(); addEventListener('app-refresh', f); return () => removeEventListener('app-refresh', f); }, [date]);

  const mine = (entries || []).filter((e) => e.person_id === person.id);
  const tot = sumEntries(mine);
  const w = weightOn(ctx.core.weights, person.id, date);
  const calGoal = calorieGoal(person, w?.weight, date);
  const proGoal = proteinGoal(person, w?.weight);
  const calLeft = calGoal ? calGoal - tot.cal : null;
  const isToday = date === todayISO();

  const copyFrom = async (fromDate, meal) => {
    const src = (await db.getEntries(fromDate)).filter((e) => e.person_id === person.id && (!meal || e.meal === meal));
    if (!src.length) { toast(`Nothing logged ${meal ? 'for that meal ' : ''}on ${friendlyDate(fromDate).toLowerCase()}`); return; }
    const copies = src.map((e) => ({ ...e, id: uuid(), date, created_at: undefined }));
    await db.addEntries(copies);
    await load();
    toast(`Copied ${copies.length} item${copies.length > 1 ? 's' : ''}`, {
      label: 'Undo', run: async () => { for (const c of copies) await db.deleteEntry(c.id); load(); },
    });
  };

  return html`
    <div class="datebar">
      <button aria-label="previous day" onClick=${() => setDate(addDays(date, -1))}>‹</button>
      <div class="label" onClick=${() => setDate(todayISO())}>
        ${friendlyDate(date)}${!isToday && html`<div class="small muted" style="font-weight:400">${fmtDate(date)} · tap for today</div>`}
      </div>
      <button aria-label="next day" onClick=${() => setDate(addDays(date, 1))}>›</button>
    </div>

    <div class="card summary">
      <${Ring} value=${tot.cal} goal=${calGoal}
        label=${calLeft == null ? fmtNum(tot.cal) : fmtNum(Math.abs(calLeft))}
        sub=${calLeft == null ? 'kcal eaten' : calLeft >= 0 ? 'kcal left' : 'kcal over'} />
      <div class="grow">
        <div class="stat">
          <div class="row between small"><b>Calories</b><span>${fmtNum(tot.cal)} / ${calGoal ? fmtNum(calGoal) : '—'}</span></div>
          <div class="bar"><div style=${`width:${calGoal ? Math.min(100, (tot.cal / calGoal) * 100) : 0}%`}></div></div>
        </div>
        <div class="stat">
          <div class="row between small"><b>Protein</b><span>${fmtNum(tot.pro)} / ${proGoal ? proGoal + ' g' : '—'}</span></div>
          <div class="bar"><div style=${`width:${proGoal ? Math.min(100, (tot.pro / proGoal) * 100) : 0}%`}></div></div>
          ${proGoal && html`<div class="small muted" style="margin-top:3px">${tot.pro >= proGoal ? 'Protein goal reached 🎉' : `${fmtNum(proGoal - tot.pro)} g to go`}</div>`}
        </div>
        ${(tot.hasCarbs || tot.hasFat) && html`<div class="small muted">Carbs ${fmtNum(tot.carbs)} g · Fat ${fmtNum(tot.fat)} g</div>`}
      </div>
    </div>

    <div class="card row" style="padding:10px 14px" onClick=${() => setWeighing(true)}>
      <span style="font-size:22px">⚖️</span>
      <div class="grow">
        <div><b>${w ? `${r1(w.weight)} lb` : 'No weight yet'}</b></div>
        <div class="small muted">${w ? (w.date === date ? `Weighed ${friendlyDate(date).toLowerCase()}` : `Last weighed ${fmtDate(w.date)}`) : 'Tap to add your weight'}</div>
      </div>
      <button class="btn secondary" style="padding:8px 12px">Update</button>
    </div>

    ${entries === null ? html`<div class="spinner"></div>` : html`
      ${mine.length === 0 && html`<div class="card">
        <p style="margin:0 0 10px">Nothing logged ${isToday ? 'yet today' : 'for this day'}.</p>
        <button class="btn secondary block" onClick=${() => copyFrom(addDays(date, -1))}>Copy everything from the day before</button>
      </div>`}
      ${MEALS.map((m) => {
        const list = mine.filter((e) => e.meal === m.id);
        const mt = sumEntries(list);
        if (m.id === 'misc' && !list.length) return html`<button class="btn ghost" onClick=${() => setAdding(m.id)}>+ Add to Other</button>`;
        return html`<div class="card">
          <div class="row between">
            <div><h2>${m.label}</h2>${list.length > 0 && html`<span class="small muted">${fmtNum(mt.cal)} kcal · ${fmtNum(mt.pro)} g protein</span>`}</div>
            <button class="iconbtn" aria-label=${'Add to ' + m.label} onClick=${() => setAdding(m.id)}>+</button>
          </div>
          ${list.length > 0 ? html`<ul class="list" style="margin-top:6px">${list.map((e) => {
            const t = entryTotals(e);
            return html`<li class="item" onClick=${() => setEditing(e)}>
              <div class="grow"><div class="name ellipsis">${e.name}</div>
                <div class="small muted">${Number(e.servings) !== 1 ? fmtFrac(e.servings) + ' × · ' : ''}${fmtNum(t.pro)} g protein</div></div>
              <div class="kcal">${fmtNum(t.cal)}</div></li>`;
          })}</ul>` : html`<div class="row" style="margin-top:4px">
            <button class="btn ghost small" style="padding-left:0" onClick=${() => copyFrom(addDays(date, -1), m.id)}>↻ Same as yesterday</button></div>`}
        </div>`;
      })}
    `}

    <button class="fab" aria-label="Add food" onClick=${() => setAdding(isToday ? mealForNow() : 'dinner')}>+</button>

    ${adding && html`<${AddSheet} ctx=${ctx} date=${date} meal=${adding} onClose=${() => setAdding(null)} onAdded=${load} />`}
    ${editing && html`<${EntrySheet} ctx=${ctx} entry=${editing} onClose=${() => setEditing(null)} onChanged=${load} />`}
    ${weighing && html`<${WeightSheet} ctx=${ctx} current=${w} onClose=${() => setWeighing(false)} />`}
  `;
}

function EntrySheet({ ctx, entry, onClose, onChanged }) {
  const [servings, setServings] = useState(Number(entry.servings) || 1);
  const [meal, setMeal] = useState(entry.meal);
  const [cal, setCal] = useState(entry.calories);
  const [pro, setPro] = useState(entry.protein);
  const t = entryTotals({ ...entry, servings, calories: cal, protein: pro });
  const save = async () => {
    await ctx.db.updateEntry(entry.id, { servings, meal, calories: cal ?? 0, protein: pro ?? 0 });
    onChanged(); onClose();
  };
  const del = async () => {
    await ctx.db.deleteEntry(entry.id);
    onChanged(); onClose();
    toast(`Removed ${entry.name}`, { label: 'Undo', run: async () => { await ctx.db.addEntries([entry]); onChanged(); } });
  };
  return html`<${Sheet} title=${entry.name} onClose=${onClose}
    footer=${html`<button class="btn danger" onClick=${del}>Delete</button><button class="btn" onClick=${save}>Save</button>`}>
    <p class="muted small" style="margin-top:0">${fmtNum(t.cal)} kcal · ${fmtNum(t.pro)} g protein</p>
    <label class="field"><span>Servings</span><${Stepper} value=${servings} onChange=${setServings} /></label>
    <div class="chips">${[0.5, 1, 1.5, 2, 3].map((v) => html`<button class=${'chip' + (servings === v ? ' on' : '')} onClick=${() => setServings(v)}>${fmtFrac(v)}</button>`)}</div>
    <label class="field"><span>Meal</span><select value=${meal} onChange=${(e) => setMeal(e.target.value)}>
      ${MEALS.map((m) => html`<option value=${m.id}>${m.label}</option>`)}</select></label>
    <div class="grid2">
      <label class="field"><span>Calories per serving</span><${NumInput} value=${cal} onChange=${setCal} /></label>
      <label class="field"><span>Protein per serving (g)</span><${NumInput} value=${pro} onChange=${setPro} /></label>
    </div>
    <p class="small muted">Changing these only affects this entry, not the saved food.</p>
  <//>`;
}

function WeightSheet({ ctx, current, onClose }) {
  const { db, person, date } = ctx;
  const [val, setVal] = useState(current?.weight ?? null);
  const hasToday = current && current.date === date;
  const save = async (v) => {
    await db.setWeight(person.id, date, v);
    await ctx.reload();
    onClose();
    toast(v == null ? 'Weight removed' : `Saved ${r1(v)} lb`);
  };
  return html`<${Sheet} title=${`${person.name}'s weight · ${friendlyDate(date)}`} onClose=${onClose}
    footer=${html`${hasToday && html`<button class="btn danger" onClick=${() => save(null)}>Remove</button>`}
      <button class="btn" disabled=${!val} onClick=${() => save(r1(val))}>Save</button>`}>
    <label class="field"><span>Weight (lb)</span>
      <${Stepper} value=${val || 0} step=${0.2} onChange=${setVal} /></label>
    <p class="small muted">Your calorie and protein goals update automatically from your latest weight.</p>
  <//>`;
}
