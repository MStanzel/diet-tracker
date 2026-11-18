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

export function Stepper({ value, onChange, step = 0.5, min = 0, frac = true }) {
  const bump = (d) => onChange(Math.max(min, Math.round(((Number(value) || 0) + d) * 100) / 100));
  return html`<div class="stepper">
    <button type="button" aria-label="less" onClick=${() => bump(-step)}>−</button>
    <${NumInput} value=${value} frac=${frac} onChange=${(v) => v != null && v >= min && onChange(v)} />
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

// Number box that lets you type freely ("0.", ".5", "1/8") and only reports
// complete numbers. With frac, shows a "/" key, since Android's number
// keyboard has no slash.
const parseNum = (t) => parseFrac(String(t).replace(',', '.').replace(/[a-z\s]+$/i, ''));
const show = (v, frac) => (v == null || isNaN(v) ? '' : frac ? fmtFrac(v) : String(Math.round(v * 1000) / 1000));
export function NumInput({ value, onChange, placeholder, frac = false, style, ...rest }) {
  const [text, setText] = useState(() => show(value, frac));
  const ref = useRef();
  useEffect(() => {
    // Outside change (e.g. +/- buttons): update the box unless it already means this number
    const cur = parseNum(text);
    if (!(value == null && text.trim() === '') && !(cur === Number(value))) setText(show(value, frac));
  }, [value]);
  const update = (t) => {
    setText(t);
    if (t.trim() === '') return onChange(null);
    const v = parseNum(t);
    if (isFinite(v)) onChange(v);
  };
  const insertSlash = (e) => {
    e.preventDefault(); // keep the keyboard open
    const el = ref.current, st = el.selectionStart ?? text.length, en = el.selectionEnd ?? text.length;
    const t = text.slice(0, st) + '/' + text.slice(en);
    update(t);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(st + 1, st + 1); });
  };
  const input = html`<input ref=${ref} type="text" inputmode="decimal" autocomplete="off" placeholder=${placeholder || ''} value=${text}
    style=${frac ? '' : style} onInput=${(e) => update(e.target.value)} onFocus=${(e) => e.target.select()}
    onBlur=${() => { const v = parseNum(text); if (text.trim() && isFinite(v)) setText(show(v, frac)); }} ...${rest} />`;
  if (!frac) return input;
  return html`<span class="fracbox" style=${style}>${input}<button type="button" class="slash" tabindex="-1" aria-label="insert slash"
    onPointerDown=${insertSlash} onMouseDown=${(e) => e.preventDefault()}>/</button></span>`;
}

export function confirmBox(msg) { return window.confirm(msg); }
