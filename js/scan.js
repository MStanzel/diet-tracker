// Barcode lookup (Open Food Facts, free) and nutrition-label photo reading (on-device OCR).
import { useState, useEffect, useRef } from '../vendor/vendor.js';
import { html, Sheet } from './ui.js';
import { r1 } from './calc.js';

const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm';
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

export async function lookupBarcode(code) {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,brands,serving_size,nutriments`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const j = await res.json();
  if (j.status !== 1 || !j.product) return null;
  const p = j.product, n = p.nutriments || {};
  const perServing = n['energy-kcal_serving'] != null || n['energy_serving'] != null;
  const g = (k) => {
    const v = perServing ? n[k + '_serving'] : n[k + '_100g'];
    return v == null || v === '' ? null : r1(Number(v));
  };
  let cal = g('energy-kcal');
  if (cal == null) { const kj = perServing ? n.energy_serving : n.energy_100g; if (kj != null) cal = Math.round(kj / 4.184); }
  const name = [p.brands?.split(',')[0], p.product_name].filter(Boolean).join(' ').trim();
  return {
    name: name || '', serving: perServing ? (p.serving_size || '1 serving') : '100 g',
    calories: cal, protein: g('proteins'), carbs: g('carbohydrates'), fat: g('fat'), barcode: code,
    _note: 'Filled in from the Open Food Facts database. Double-check against the package.',
  };
}

export function BarcodeScanner({ ctx, onClose, onExisting, onFound }) {
  const video = useRef();
  const [status, setStatus] = useState('Starting camera…');
  const [manual, setManual] = useState('');
  const done = useRef(false);

  const handle = async (code) => {
    if (done.current) return;
    done.current = true;
    const existing = ctx.core.foods.find((f) => f.barcode === code && !f.archived);
    if (existing) return onExisting(existing);
    setStatus(`Found ${code}. Looking it up…`);
    let d = null;
    try { d = await lookupBarcode(code); } catch { /* offline */ }
    onFound(d || { barcode: code, _note: `Barcode ${code} isn't in the food database. Enter the numbers from the label, or use Label photo.` });
  };

  useEffect(() => {
    let stream, timer, controls, stopped = false;
    (async () => {
      try {
        if ('BarcodeDetector' in window) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          if (stopped) return stream.getTracks().forEach((t) => t.stop());
          video.current.srcObject = stream;
          await video.current.play();
          const det = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
          setStatus('Point the camera at the barcode');
          const tick = async () => {
            if (stopped) return;
            try { const r = await det.detect(video.current); if (r[0]) return handle(r[0].rawValue); } catch {}
            timer = setTimeout(tick, 200);
          };
          tick();
        } else {
          setStatus('Loading scanner…');
          const { BrowserMultiFormatReader } = await import(ZXING_URL);
          if (stopped) return;
          const reader = new BrowserMultiFormatReader();
          setStatus('Point the camera at the barcode');
          controls = await reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, video.current, (res) => { if (res) handle(res.getText()); });
        }
      } catch (e) {
        setStatus('Camera not available (' + (e.message || e.name) + '). Type the barcode number instead.');
      }
    })();
    return () => { stopped = true; clearTimeout(timer); stream && stream.getTracks().forEach((t) => t.stop()); controls && controls.stop(); };
  }, []);

  return html`<${Sheet} title="Scan barcode" onClose=${onClose}>
    <video class="scan" ref=${video} playsinline muted></video>
    <p class="small muted">${status}</p>
    <div class="row"><input class="grow" inputmode="numeric" placeholder="…or type the number" value=${manual} onInput=${(e) => setManual(e.target.value.replace(/\D/g, ''))} />
      <button class="btn" disabled=${manual.length < 6} onClick=${() => handle(manual)}>Look up</button></div>
  <//>`;
}

// ------------------------------------------------------------ label OCR
function loadScript(src) {
  return new Promise((ok, bad) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok();
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => bad(new Error('Could not load the label reader (are you online?)'));
    document.head.appendChild(s);
  });
}
async function prepImage(file) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  const g = c.getContext('2d');
  g.filter = 'grayscale(1) contrast(1.4)';
  g.drawImage(img, 0, 0, c.width, c.height);
  return c;
}
export function parseLabel(text) {
  const t = text.replace(/\r/g, '').replace(/[|]/g, ' ');
  const num = (re) => { const m = t.match(re); return m ? r1(parseFloat(m[1].replace(/[oO]/g, '0').replace(',', '.'))) : null; };
  let calories = num(/calories(?!\s*from)[^\d\n]{0,15}(\d{1,4})/i);
  if (calories == null) calories = num(/energy[^\n]*?(\d{1,4})\s*kcal/i);
  const serving = (t.match(/serving\s*size[:\s]*([^\n]{1,45})/i) || [])[1]?.trim() || null;
  return {
    calories,
    protein: num(/protein[^\d\n]{0,10}([\doO]+(?:[.,]\d+)?)\s*g?/i),
    carbs: num(/(?:total\s*)?carbo?hydrate?s?[^\d\n]{0,10}([\doO]+(?:[.,]\d+)?)\s*g/i),
    fat: num(/total\s*fat[^\d\n]{0,10}([\doO]+(?:[.,]\d+)?)\s*g/i),
    serving,
  };
}

export function LabelScanner({ onClose, onFound }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState(null);
  const [raw, setRaw] = useState('');
  const [err, setErr] = useState('');
  const onFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true); setErr(''); setResult(null);
    try {
      setProgress('Loading label reader (first time takes a moment)…');
      await loadScript(TESSERACT_URL);
      const canvas = await prepImage(file);
      setProgress('Reading the label…');
      const { data } = await window.Tesseract.recognize(canvas, 'eng', {
        logger: (m) => m.status === 'recognizing text' && setProgress(`Reading the label… ${Math.round(m.progress * 100)}%`),
      });
      setRaw(data.text);
      setResult(parseLabel(data.text));
    } catch (x) { setErr(x.message || String(x)); }
    setBusy(false);
  };
  const found = result && (result.calories != null || result.protein != null);
  return html`<${Sheet} title="Read a nutrition label" onClose=${onClose}
    footer=${found && html`<button class="btn block" onClick=${() => onFound({ ...result, serving: result.serving || '1 serving', _note: 'Read from your photo. Check the numbers before saving.' })}>Use these numbers</button>`}>
    <p class="small muted" style="margin-top:0">Take a straight-on, well-lit photo of the Nutrition Facts panel. It's read on your phone, nothing is uploaded.</p>
    <label class="btn block" style="text-align:center;margin-bottom:12px">📷 ${result ? 'Take another photo' : 'Take photo'}
      <input type="file" accept="image/*" capture="environment" style="display:none" onChange=${onFile} /></label>
    ${busy && html`<div class="center-msg"><div class="spinner"></div><p class="small muted">${progress}</p></div>`}
    ${err && html`<p class="over small">${err}</p>`}
    ${result && html`<div class="card">
      ${found ? html`<div class="grid2 small">
        <div>Serving: <b>${result.serving || '?'}</b></div><div>Calories: <b>${result.calories ?? '?'}</b></div>
        <div>Protein: <b>${result.protein ?? '?'} g</b></div><div>Carbs: <b>${result.carbs ?? '?'} g</b></div>
        <div>Fat: <b>${result.fat ?? '?'} g</b></div></div>` :
        html`<p class="small">Couldn't find the numbers. Try a closer, sharper photo, or type them in.</p>`}
      <details style="margin-top:8px"><summary class="small muted">Text that was read</summary><pre class="small" style="white-space:pre-wrap">${raw}</pre></details>
    </div>`}
  <//>`;
}
