// Shared UI building blocks.
import { h, htm, useState, useEffect, useRef } from '../vendor/vendor.js';
import { fmtFrac, parseFrac } from './calc.js';
export const html = htm.bind(h);

const sheetStack = [];
let ignorePops = 0;
addEventListener('popstate', () => {
  if (ignorePops > 0) { ignorePops--; return; }
  const top = sheetStack[sheetStack.length - 1];
  if (top) { top.popped = true; top.close(); }
});

export function Sheet({ title, onClose, children, footer, full = false, headerRight }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    // Android back button closes the top-most sheet instead of leaving the app
    const entry = { close: () => closeRef.current(), popped: false };
    sheetStack.push(entry);
    history.pushState({ sheet: sheetStack.length }, '');
    return () => {
      const i = sheetStack.indexOf(entry);
      if (i >= 0) sheetStack.splice(i, 1);
      if (!entry.popped) { ignorePops++; history.back(); }
    };
  }, []);
  return html`<div class="sheet-back" onClick=${(e) => e.target === e.currentTarget && onClose()}>
    <div class=${'sheet' + (full ? ' full' : '')} role="dialog" aria-label=${title}>
      <header><h3>${title}</h3>${headerRight}<button class="btn ghost" onClick=${onClose}>Close</button></header>
      <div class="body">${children}</div>
      ${footer && html`<footer>${footer}</footer>`}
    </div>
  </div>`;
}

export function Stepper({ value, onChange, step = 0.5, min = 0 }) {
  const [text, setText] = useState(fmtFrac(value));
  useEffect(() => { if (parseFrac(text) !== value) setText(fmtFrac(value)); }, [value]);
  const bump = (d) => onChange(Math.max(min, Math.round((value + d) * 100) / 100));
  return html`<div class="stepper">
    <button type="button" aria-label="less" onClick=${() => bump(-step)}>−</button>
    <input inputmode="decimal" value=${text} onInput=${(e) => {
      setText(e.target.value);
      const v = parseFrac(e.target.value);
      if (!isNaN(v) && v >= min) onChange(v);
    }} onFocus=${(e) => e.target.select()} />
    <button type="button" aria-label="more" onClick=${() => bump(step)}>+</button>
  </div>`;
}

export function Ring({ value, goal, size = 132, label, sub }) {
  const pct = goal ? Math.min(value / goal, 1) : 0;
  const over = goal && value > goal;
  const r = size / 2 - 10, c = 2 * Math.PI * r;
  return html`<div class="ring" style=${`width:${size}px;height:${size}px`}>
    <svg width=${size} height=${size}>
      <circle cx=${size / 2} cy=${size / 2} r=${r} stroke="var(--line)" stroke-width="12" fill="none" />
      ${pct > 0 && html`<circle cx=${size / 2} cy=${size / 2} r=${r} stroke=${over ? 'var(--bad)' : 'var(--accent)'} stroke-width="12" fill="none"
        stroke-linecap="round" stroke-dasharray=${`${pct * c} ${c}`} style="transition: stroke-dasharray .4s" />`}
    </svg>
    <div class="center"><b class=${over ? 'over' : ''}>${label}</b><span class="small muted">${sub}</span></div>
  </div>`;
}

let toastSetter = null;
export function ToastHost() {
  const [t, setT] = useState(null);
  const timer = useRef();
  toastSetter = (msg, action) => {
    clearTimeout(timer.current);
    setT({ msg, action });
    timer.current = setTimeout(() => setT(null), action ? 5000 : 2200);
  };
  if (!t) return null;
  return html`<div class="toast" role="status">${t.msg}
    ${t.action && html`<button onClick=${() => { t.action.run(); setT(null); }}>${t.action.label}</button>`}</div>`;
}
export const toast = (msg, action) => toastSetter && toastSetter(msg, action);

export function Field({ label, children }) {
  return html`<label class="field"><span>${label}</span>${children}</label>`;
}

// Number input that allows empty (null)
export function NumInput({ value, onChange, placeholder, ...rest }) {
  return html`<input inputmode="decimal" placeholder=${placeholder || ''} value=${value == null ? '' : value}
    onInput=${(e) => { const v = e.target.value.trim(); onChange(v === '' ? null : Number(v)); }} ...${rest} />`;
}

export function confirmBox(msg) { return window.confirm(msg); }
