// Calculator tab: the spreadsheet's "Calorie Calc", one person at a time.
import { useState, useEffect, useRef } from '../vendor/vendor.js';
import { html, NumInput, toast } from './ui.js';
import { ACTIVITY, GOALS, todayISO, fmtNum, fmtDate, r1, weightOn, maintenance, calorieGoal, proteinGoal, ageOn } from './calc.js';

export function CalculatorScreen({ ctx }) {
  const { person, core, db } = ctx;
  const today = todayISO();
  const latest = weightOn(core.weights, person.id, today);
  const [p, setP] = useState({ ...person });
  const [weight, setWeight] = useState(latest?.weight != null ? Number(latest.weight) : null);
  const timer = useRef();
  const first = useRef(true);

  // Switching person: load their values
  useEffect(() => {
    first.current = true;
    setP({ ...person });
    const w = weightOn(core.weights, person.id, today);
    setWeight(w?.weight != null ? Number(w.weight) : null);
  }, [person.id]);

  // Autosave profile changes shortly after you stop typing
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await db.savePerson(p);
      ctx.patchCore((c) => { c.people = c.people.map((x) => (x.id === p.id ? { ...p } : x)); });
      toast('Saved');
    }, 700);
    return () => clearTimeout(timer.current);
  }, [p]);

  const set = (k) => (v) => setP((x) => ({ ...x, [k]: v }));
  const saveWeight = async () => {
    if (!weight || (latest && Number(latest.weight) === weight && latest.date === today)) return;
    await db.setWeight(person.id, today, r1(weight));
    await ctx.reload();
    toast(`Weight ${r1(weight)} lb saved for today`);
  };

  const maint = maintenance(p, weight, today);
  const bmr = maint ? Math.round(maint / (Number(p.activity) || 1.2)) : null;
  const ft = Math.floor((p.height_in || 0) / 12), inch = r1((p.height_in || 0) % 12);
  const options = GOALS.map((g) => ({ ...g, kcal: calorieGoal({ ...p, goal: g.id }, weight, today) }));
  const goalKcal = calorieGoal(p, weight, today);

  return html`
    <div class="card" style=${`border-top:4px solid ${person.color}`}>
      <div class="row between"><h2>${person.name}'s daily goal</h2></div>
      <div class="grid2" style="margin-top:8px">
        <div><div class="small muted">Calories</div><div class="big">${goalKcal ? fmtNum(goalKcal) : '—'}</div></div>
        <div><div class="small muted">Protein</div><div class="big">${proteinGoal(p, weight) ? fmtNum(proteinGoal(p, weight)) + ' g' : '—'}</div></div>
      </div>
      <div class="small muted" style="margin-top:6px">Maintenance ${maint ? fmtNum(maint) : '—'} kcal · BMR ${bmr ? fmtNum(bmr) : '—'} kcal</div>
    </div>

    <h3 style="margin:16px 0 8px">Choose a goal</h3>
    <div class="card" style="padding:4px 14px">
      <ul class="list">${options.map((o) => {
        const on = p.goal === o.id;
        const diff = o.kcal != null && maint != null ? o.kcal - maint : null;
        return html`<li class="item" onClick=${() => set('goal')(o.id)}>
          <span class=${'radio' + (on ? ' on' : '')}></span>
          <div class="grow">
            <div class="name">${o.label}</div>
            ${o.id === 'gain_pct' && on && html`<div class="row small" style="margin-top:6px" onClick=${(e) => e.stopPropagation()}>
              <${NumInput} value=${p.goal_pct} onChange=${set('goal_pct')} style="width:80px;padding:8px" /> <span>% above maintenance</span></div>`}
            ${o.id === 'custom' && on && html`<div class="row small" style="margin-top:6px" onClick=${(e) => e.stopPropagation()}>
              <${NumInput} value=${p.goal_kcal} onChange=${set('goal_kcal')} placeholder="kcal" style="width:110px;padding:8px" /> <span>kcal per day</span></div>`}
            ${diff != null && o.id !== 'custom' && html`<div class="small muted">${diff === 0 ? 'Same as maintenance' : `${diff > 0 ? '+' : '−'}${fmtNum(Math.abs(diff))} kcal/day`}</div>`}
          </div>
          <div class="kcal">${o.kcal != null ? fmtNum(o.kcal) : '—'}</div>
        </li>`;
      })}</ul>
    </div>

    <h3 style="margin:16px 0 8px">Your details</h3>
    <div class="card">
      <label class="field"><span>Current weight (lb)${latest ? ` · last logged ${latest.date === today ? 'today' : fmtDate(latest.date)}` : ''}</span>
        <div class="row"><${NumInput} value=${weight} onChange=${setWeight} />
          <button class="btn" disabled=${!weight || (latest && Number(latest.weight) === weight && latest.date === today)} onClick=${saveWeight}>Log</button></div></label>
      <div class="grid2">
        <label class="field"><span>Height (feet)</span><${NumInput} value=${ft} onChange=${(v) => set('height_in')((v || 0) * 12 + inch)} /></label>
        <label class="field"><span>Height (inches)</span><${NumInput} value=${inch} onChange=${(v) => set('height_in')(ft * 12 + (v || 0))} /></label>
        <label class="field"><span>Birthday (age ${ageOn(p.birthdate)})</span><input type="date" value=${p.birthdate || ''} onChange=${(e) => set('birthdate')(e.target.value)} /></label>
        <label class="field"><span>Sex (for the formula)</span><select value=${p.sex} onChange=${(e) => set('sex')(e.target.value)}>
          <option value="male">Male</option><option value="female">Female</option></select></label>
      </div>
      <label class="field"><span>Activity level</span><select value=${String(p.activity)} onChange=${(e) => set('activity')(Number(e.target.value))}>
        ${ACTIVITY.map(([v, l]) => html`<option value=${String(v)}>${l}</option>`)}</select></label>
      <label class="field" style="margin-bottom:0"><span>Protein target (grams per lb of body weight)</span>
        <div class="row"><${NumInput} value=${p.protein_per_lb} onChange=${set('protein_per_lb')} />
          <span class="small" style="white-space:nowrap">= ${proteinGoal(p, weight) ? fmtNum(proteinGoal(p, weight)) : '—'} g/day</span></div></label>
    </div>
    <div class="card">
      <div class="grid2">
        <label class="field" style="margin:0"><span>Name</span><input value=${p.name} onChange=${(e) => set('name')(e.target.value)} /></label>
        <label class="field" style="margin:0"><span>Color</span><input type="color" style="height:48px;padding:4px" value=${p.color} onChange=${(e) => set('color')(e.target.value)} /></label>
      </div>
    </div>
    <p class="small muted">Formula: Mifflin-St Jeor, the same one your spreadsheet used. Changes save automatically.</p>`;
}
