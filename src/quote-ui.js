/* =========================================================================
   quote-ui.js — the live quoting desk

   Controls → one job record → a price you can say out loud, a technical
   elevation, and a PDF the customer can sign.

   Every control is generated from the vertical's own definition in engine.js,
   so a new job type is a data change rather than a rebuild of this file.
   ========================================================================= */

import {
  VERTICALS, GLASS, FINISH, HARDWARE, RATES,
  defaultState, priceQuote, quoteToText, marketBand, elevationSVG,
} from './engine.js';
import { getMarket, onMarketChange, money, rate, mmToFeetInches } from './market.js';
import { sheet } from './tools.js';
import { toast } from './toast.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* A trade in the US talks in feet and inches. The cost model stays in mm, but
   the number a rep reads out loud has to be in the units the customer uses. */
const fmtLocal = (base) => money(base);
const fmtLen = (mm) => (getMarket().showInches
  ? mmToFeetInches(mm)
  : `${Math.round(mm).toLocaleString('en-GB')} mm`);

const SWATCH = {
  clear:   '#e9f7f5', lowiron: '#f4fffd', etched: '#d8e6e4',
  bronze:  '#c08b55', grey:    '#7d868f', mirror:  '#e6eef2',
  chrome:  '#dfe6ea', nickel:  '#c9c9c6', black:   '#2a2a2c', brass: '#c3a35c',
};

const JOBS = [
  ['RESIDENCE — SHOWER REFIT',      'shower'],
  ['SHOPFRONT — 3 BAY + DOOR',      'shopfront'],
  ['KITCHEN — RUN + MIRROR',         'splashback'],
  ['STAIR — BALUSTRADE, RAKED',     'balustrade'],
];

/* ------------------------------------------------------------ control model ==
   Turn the vertical's definition into an ordered list of control groups.
   ------------------------------------------------------------------------- */

function groupsFor(state) {
  const V = VERTICALS[state.vertical];
  const g = [];

  /* 01 — the shape of the job */
  const shape = [{ kind: 'seg', key: 'layout', wide: Object.keys(V.layouts).length > 3,
                   options: Object.entries(V.layouts).map(([v, d]) => ({ v, label: d.label, note: d.note })) }];
  if (V.doors) shape.push({ kind: 'seg', key: 'door', small: true,
    options: Object.entries(V.doors).map(([v, d]) => ({ v, label: d.label, note: d.note })) });
  g.push({ n: '01', title: 'Type of job', controls: shape });

  /* 02 — the glass */
  const glass = [{ kind: 'seg', key: 'thickness', small: true,
    options: V.glass.map((v) => ({ v, label: GLASS[v].label, note: GLASS[v].desc })) }];
  glass.push({ kind: 'swatch', key: 'finish',
    options: V.finishes.map((v) => ({ v, label: FINISH[v].label, colour: SWATCH[v] })) });
  g.push({ n: '02', title: 'Glass', controls: glass });

  /* 03 — what holds it up */
  const parts = [];
  if (V.hardware) parts.push({ kind: 'swatch', key: 'hardware', cols: 5,
    options: Object.entries(HARDWARE).map(([v, d]) => ({ v, label: d.label.replace('Polished ', '').replace('Brushed ', '').replace('Matte ', ''), colour: '#' + d.color.toString(16).padStart(6, '0') })) });
  if (V.frames) parts.push({ kind: 'seg', key: 'frame',
    options: Object.entries(V.frames).map(([v, d]) => ({ v, label: d.label, note: d.note })) });
  if (V.fixings) parts.push({ kind: 'seg', key: 'fixing',
    options: Object.entries(V.fixings).map(([v, d]) => ({ v, label: d.label, note: d.note })) });
  if (parts.length) g.push({ n: '03', title: V.hardware && V.fixings ? 'Fixings' : (V.frames ? 'Frame' : 'Fittings'), controls: parts });

  /* 04 — the size */
  g.push({ n: '04', title: 'Size', controls: Object.entries(V.dims).map(([k, d]) => ({
    kind: 'range', key: k, label: d.label, min: d.min, max: d.max, step: d.step, def: d.def, unit: d.unit,
  })) });

  /* 05 — the extras, each of which is a real line on the quote */
  g.push({ n: '05', title: 'Extras', controls: [{ kind: 'checks', key: 'addons',
    options: Object.entries(V.addons).map(([v, d]) => ({ v, label: d.label, note: d.note })) }] });

  return g;
}

/* ------------------------------------------------------------------ the tool */

export function initTool({ scene, onQuote } = {}) {
  const root = $('#tool');
  if (!root) return null;

  let state = { ...defaultState('shower'), addons: {} };
  let q = null;
  let jobIdx = 0;
  let qno = 4100;

  /* ----------------------------------------------------------------- timer */
  let t0 = null, tick = 0;
  const timerEl = $('#call-timer');
  const timeTaken = $('#time-taken');
  const fmt = (ms) => {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  const elapsed = () => (t0 ? performance.now() - t0 : 0);
  function startTimer() {
    if (t0) return;
    t0 = performance.now();
    tick = setInterval(() => { timerEl.textContent = fmt(performance.now() - t0); }, 500);
  }
  const stopTimer = () => { clearInterval(tick); tick = 0; };

  /* ------------------------------------------------------- vertical switch */
  const switcher = $('#vert-switch');
  if (switcher) {
    switcher.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-vert]');
      if (!btn || btn.dataset.vert === state.vertical) return;
      const v = btn.dataset.vert;
      state = { ...defaultState(v), addons: {}, margin: state.margin };
      jobIdx = JOBS.findIndex((j) => j[1] === v);
      for (const b of switcher.children) b.classList.toggle('on', b === btn);
      buildControls();
      render(true);
      startTimer();
      toast(`<b>${VERTICALS[v].label}.</b> ${VERTICALS[v].blurb}`);
    });
  }

  /* ---------------------------------------------------------- new incoming */
  const jobName = $('#job-name');
  const refEl = $('#q-no');
  const nextRef = () => { qno++; refEl.textContent = `Q-${qno}`; return `Q-${qno}`; };

  function newCall() {
    stopTimer(); t0 = null;
    timerEl.textContent = '00:00';
    timeTaken.textContent = '00:00';
    nextRef();
    jobName.textContent = JOBS[jobIdx][0];
    jobName.title = JOBS[jobIdx][1];
    toast('<b>Incoming call connected.</b> New job loaded — start timing.');
  }
  $('#new-call')?.addEventListener('click', newCall);

  /* --------------------------------------------------- generate the controls */
  const ctls = $('#ctls');

  function buildControls() {
    ctls.replaceChildren();
    for (const grp of groupsFor(state)) {
      const box = document.createElement('div');
      box.className = 'ctl-group';
      const head = document.createElement('div');
      head.className = 'ctl-head';
      head.innerHTML = `<span class="idx">${grp.n}</span> ${grp.title}`;
      box.appendChild(head);

      for (const c of grp.controls) {
        if (c.kind === 'seg') {
          const seg = document.createElement('div');
          seg.className = `seg ${c.wide ? 'seg-auto' : 'seg-3'}`;
          seg.dataset.seg = c.key;
          for (const o of c.options) {
            const b = document.createElement('button');
            b.type = 'button';
            b.dataset.v = o.v;
            b.innerHTML = `${o.label}<em>${o.note}</em>`;
            b.classList.toggle('on', state[c.key] === o.v);
            seg.appendChild(b);
          }
          box.appendChild(seg);
        }

        if (c.kind === 'swatch') {
          const sw = document.createElement('div');
          sw.className = `swatches${c.cols === 5 ? ' sw-hw' : ''}`;
          sw.dataset.seg = c.key;
          for (const o of c.options) {
            const b = document.createElement('button');
            b.type = 'button';
            b.dataset.v = o.v;
            b.className = 'sw';
            b.innerHTML = `<span style="--a:${o.colour}"></span>${o.label}`;
            b.classList.toggle('on', state[c.key] === o.v);
            sw.appendChild(b);
          }
          box.appendChild(sw);
        }

        if (c.kind === 'range') {
          const l = document.createElement('label');
          l.className = 'range';
          l.innerHTML = `<span class="range-lab">${c.label} <b class="mono" data-dim="${c.key}"></b></span>
            <input type="range" id="${c.key}" min="${c.min}" max="${c.max}" step="${c.step}" value="${c.def}" />`;
          box.appendChild(l);
        }

        if (c.kind === 'checks') {
          const ch = document.createElement('div');
          ch.className = 'checks';
          for (const o of c.options) {
            const id = `x-${c.key}-${o.v}`;
            const l = document.createElement('label');
            l.className = 'chk';
            l.innerHTML = `<input type="checkbox" id="${id}" data-x="${o.v}" />
              <span class="box"></span>${o.label}${o.note ? `<em>${o.note}</em>` : ''}`;
            ch.appendChild(l);
          }
          box.appendChild(ch);
        }
      }
      ctls.appendChild(box);
    }
    syncControls();
  }

  /* push state into the freshly built DOM */
  function syncControls() {
    for (const seg of $$('[data-seg]', ctls)) {
      const key = seg.dataset.seg;
      for (const b of seg.children) b.classList.toggle('on', state[key] === b.dataset.v);
    }
    for (const i of $$('[data-x]', ctls)) i.checked = !!(state.addons || {})[i.dataset.x];
    for (const r of $$('input[type=range]', ctls)) {
      if (state[r.id] === undefined) continue;
      r.value = state[r.id];
      r.style.setProperty('--pct', `${((state[r.id] - r.min) / (r.max - r.min)) * 100}%`);
      const out = $(`[data-dim="${r.id}"]`, ctls);
      if (out) out.textContent = fmtLen(state[r.id]);
    }
    /* disabled add-ons that cannot apply to the chosen layout */
    const V = VERTICALS[state.vertical];
    const L = V.layouts[state.layout];
    for (const i of $$('[data-x]', ctls)) {
      const def = V.addons[i.dataset.x];
      if (!def) continue;
      const off = def.walkinOnly && !L.open;
      i.disabled = off;
      i.closest('.chk').classList.toggle('off', off);
      if (off) { i.checked = false; state.addons[i.dataset.x] = false; }
    }
  }

  /* --------------------------------------------------------------- events */
  ctls.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    const seg = b.closest('[data-seg]');
    const key = seg.dataset.seg;
    if (state[key] === b.dataset.v) return;
    state[key] = b.dataset.v;
    for (const sib of seg.children) sib.classList.toggle('on', sib === b);
    startTimer();
    syncControls();
    render();
  });

  ctls.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('input[type=range]')) {
      state[t.id] = +t.value;
      t.style.setProperty('--pct', `${((+t.value - t.min) / (t.max - t.min)) * 100}%`);
      const out = $(`[data-dim="${t.id}"]`, ctls);
      if (out) out.textContent = fmtLen(+t.value);
      startTimer();
      render();
    }
  });

  ctls.addEventListener('change', (e) => {
    const t = e.target;
    if (!t.matches('[data-x]')) return;
    state.addons[t.dataset.x] = t.checked;
    startTimer();
    render();
  });

  /* --------------------------------------------------------- margin editor */
  const marginWrap = document.createElement('div');
  marginWrap.className = 'margin-edit';
  marginWrap.innerHTML = `
    <label class="range" style="margin-bottom:0">
      <span class="range-lab">Your target margin <b class="mono" id="me-out"></b></span>
      <input type="range" id="me" min="10" max="75" step="1" />
    </label>
    <p class="micro-note">A margin is what you keep, not what you add on. Set it once — every quote uses it.</p>`;
  $('#quote .quote-actions')?.after(marginWrap);
  const me = marginWrap.querySelector('#me');
  const meOut = marginWrap.querySelector('#me-out');
  const syncMe = () => {
    me.value = Math.round(state.margin * 100);
    meOut.textContent = `${me.value}%`;
    me.style.setProperty('--pct', `${((me.value - 10) / 65) * 100}%`);
  };
  me.addEventListener('input', () => { state.margin = +me.value / 100; syncMe(); render(); });
  $('#edit-margin')?.addEventListener('click', () => {
    marginWrap.hidden = !marginWrap.hidden;
    if (!marginWrap.hidden) { syncMe(); me.focus(); }
  });

  /* ------------------------------------------------------------- the render */
  const linesEl = $('#lines');
  const tCost = $('#t-cost'), tMargin = $('#t-margin'), tTotal = $('#t-total');
  const tDep = $('#t-dep'), mOut = $('#m-out'), tRate = $('#t-rate');
  const tMarket = $('#t-market'), tSpec = $('#t-spec'), tNotes = $('#t-notes');
  const hud = { size: $('#hud-size'), glass: $('#hud-glass'), hw: $('#hud-hw') };
  const drawing = $('#drawing');
  const vp = $('#vp'), vpFallback = $('#vp-fallback');

  let shownTotal = 0, animRaf = 0;

  function animateTotal(to) {
    cancelAnimationFrame(animRaf);
    const from = shownTotal, dur = 460, s = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - s) / dur);
      shownTotal = from + (to - from) * (1 - Math.pow(1 - k, 3));
      tTotal.textContent = fmtLocal(shownTotal);
      if (k < 1) animRaf = requestAnimationFrame(step);
    };
    animRaf = requestAnimationFrame(step);
  }

  function render(rebuilt = false) {
    q = priceQuote(state);
    const V = VERTICALS[state.vertical];
    const G = GLASS[state.thickness], F = FINISH[state.finish];

    /* HUD */
    if (hud.size) hud.size.textContent = `${fmtLen(state.w)} × ${fmtLen(state.h)}`;
    if (hud.glass) hud.glass.textContent = `${G.label} ${F.label}`;
    if (hud.hw) {
      const last = Object.keys(V.hardware ? HARDWARE : V.frames || {}).length
        ? (V.hardware ? HARDWARE[state.hardware].label
                      : V.frames ? V.frames[state.frame].label
                                 : V.fixings[state.fixing].label)
        : '';
      hud.hw.textContent = last.replace('Polished ', '');
    }

    /* line items */
    linesEl.replaceChildren();
    for (const l of q.lines) {
      const row = document.createElement('div');
      row.className = `ln ln-${l.key || 'x'}`;
      row.innerHTML = `<span>${l.label}<i>${l.detail}</i></span><b>${fmtLocal(l.amount)}</b>`;
      linesEl.appendChild(row);
    }
    for (const n of q.notes) {
      const row = document.createElement('div');
      row.className = 'ln ln-sub';
      row.innerHTML = `<span><i style="margin:0">${n}</i></span><b>auto</b>`;
      linesEl.appendChild(row);
    }

    /* the price, and what it is a rate of */
    if (tRate) tRate.textContent = `${rate(q.perUnitPrice)} / ${getMarket().areaShort}`;
    mOut.textContent = `${Math.round(q.margin * 100)}%`;
    tCost.textContent = fmtLocal(q.cost);
    tMargin.textContent = fmtLocal(q.gross);
    tDep.textContent = fmtLocal(q.deposit);
    animateTotal(q.sell);

    /* market sanity band — a second opinion, not a quote */
    if (tMarket) {
      const b = marketBand(state);
      const off = q.sell < b.low ? (b.low - q.sell) / b.low
                : q.sell > b.high ? (q.sell - b.high) / b.high : 0;
      const verdict = off === 0 ? ' Yours sits in that range.'
        : off < 0.10 ? ' Yours is close to it.'
        : q.sell < b.low
          ? ' <span class="q-market-flag">Yours is under the band. Check you are not leaving money on the table.</span>'
          : ' <span class="q-market-flag">Yours is over the band. Be ready to say why.</span>';
      tMarket.innerHTML = `Most shops charge <b>${fmtLocal(b.low)}–${fmtLocal(b.high)}</b> for this one.${verdict}`;
    }

    /* the drawing */
    if (drawing) drawing.innerHTML = elevationSVG(state, q, {
      ink: drawing.dataset.ink || '#0d2430',
      acc: drawing.dataset.acc || '#0e6b52',
      bg: drawing.dataset.bg || '#ffffff',
    });

    /* spec table */
    if (tSpec) {
      tSpec.replaceChildren();
      for (const [k, v] of q.spec) {
        const d = document.createElement('div');
        d.innerHTML = `<span>${k}</span><b>${v}</b>`;
        tSpec.appendChild(d);
      }
    }

    /* the 3D view is a bonus for the shower only — never let it take pricing down */
    const wants3D = state.vertical === 'shower';
    if (vp) vp.hidden = !wants3D;
    if (drawing) drawing.parentElement.hidden = wants3D;
    if (vpFallback) vpFallback.hidden = !wants3D;
    if (wants3D) {
      try { scene?.setState({ ...state, width: state.w, height: state.h, layout: state.layout,
        door: state.door, thickness: state.thickness, finish: state.finish, hardware: state.hardware }); }
      catch (err) { console.error('[SQUAREFOOT] 3D preview failed; pricing continues', err); }
    }

    const vMeta = $('#v-meta');
    if (vMeta) {
      vMeta.innerHTML = `<span class="chip">${V.label}</span>
        <span class="chip">${q.meta.lites} lite${q.meta.lites > 1 ? 's' : ''}</span>
        <span class="chip">${q.m2Display.toFixed(2)} ${getMarket().areaShort}</span>`;
    }

    onQuote?.(state, q);
  }

  /* ---------------------------------------------------------------- output */
  const ref = () => refEl.textContent;

  function printable() {
    const V = VERTICALS[state.vertical];
    const rows = q.lines
      .map((l) => `<tr><td>${l.label}<span>${l.detail}</span></td><td class="r">${fmtLocal(l.amount)}</td></tr>`).join('');
    const spec = q.spec.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    const M = getMarket();
    const tax = M.taxNote;
    return `<!doctype html><html><head><meta charset="utf-8"><title>${ref()} — Quotation</title>
<style>
  @page{size:${M.page};margin:15mm}
  *{box-sizing:border-box}
  body{font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#111;margin:0;padding:26px;max-width:780px}
  header{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;border-bottom:2px solid #111;padding-bottom:14px}
  h1{font-size:25px;letter-spacing:-.02em;margin:0 0 3px}
  .muted{color:#666;font-size:11.5px}
  .no{font:700 11.5px ui-monospace,Menlo,monospace;letter-spacing:.1em}
  section{margin-top:20px}
  h2{font:700 9.5px ui-monospace,Menlo,monospace;letter-spacing:.16em;text-transform:uppercase;color:#8a8a8a;margin:0 0 8px}
  .spec{display:grid;grid-template-columns:1fr 1fr;gap:2px 20px;font-size:12.5px}
  .spec div{display:flex;justify-content:space-between;gap:12px;border-bottom:1px dotted #ddd;padding:4px 0}
  .spec b{font-weight:600;text-align:right}
  table{width:100%;border-collapse:collapse;font-size:12.5px}
  td{padding:7px 0;border-bottom:1px solid #eee}
  td span{color:#888;font-size:10.5px;margin-left:8px}
  .r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;font-family:ui-monospace,Menlo,monospace}
  .tot{margin-top:12px;margin-left:auto;width:330px}
  .tot div{display:flex;justify-content:space-between;padding:5px 0}
  .tot .grand{border-top:2px solid #111;padding:9px 0;font-size:18px;font-weight:800}
  .terms{margin-top:22px;font-size:10.5px;color:#666;line-height:1.6;border-top:1px solid #ddd;padding-top:12px}
  .sign{margin-top:30px;display:grid;grid-template-columns:1fr 1fr;gap:28px}
  .sign div{border-top:1px solid #111;padding-top:6px;font-size:11px;color:#666}
  footer{margin-top:28px;border-top:1px solid #ddd;padding-top:10px;font-size:9.5px;color:#999;letter-spacing:.04em}
</style></head><body>
<header>
  <div>
    <h1>Quotation ${ref()}</h1>
    <div class="muted">${V.label} — ${q.layoutNote}</div>
    <div class="muted">Prepared live · valid 14 days · ${tax}</div>
  </div>
  <div style="text-align:right">
    <div class="no">${ref()}</div>
    <div class="muted">${q.meta.lites} lite${q.meta.lites > 1 ? 's' : ''} · ${q.m2Display.toFixed(2)} ${M.areaShort} · ${q.hours} h</div>
  </div>
</header>
<section>
  <h2>Specification</h2>
  <div class="spec">${spec}</div>
</section>
<section>
  <h2>Carrying items</h2>
  <table>${rows}</table>
  <div class="tot">
    <div><span>Total cost</span><span class="r">${fmtLocal(q.cost)}</span></div>
    <div><span>Margin @ ${Math.round(q.margin * 100)}%</span><span class="r">${fmtLocal(q.gross)}</span></div>
    <div class="grand"><span>Total</span><span class="r">${fmtLocal(q.sell)}</span></div>
    <div><span>Deposit to book (${RATES.depositPct * 100}%)</span><span class="r">${fmtLocal(q.deposit)}</span></div>
    <div><span>Balance on completion</span><span class="r">${fmtLocal(q.sell - q.deposit)}</span></div>
  </div>
</section>
<section class="sign"><div>Customer signature</div><div>Date</div></section>
<p class="terms">All glass is ${M.safetyTerm} to the standard named on your certificate. Dimensions confirmed
before fabrication. Quotation valid 14 days. Excludes making good, out-of-hours working and concealed
services. Lead time ${M.leadDays}. Price of ${rate(q.perUnitPrice)} per ${M.areaShort}.</p>
<footer>Every figure above traces to a line item. Nothing is bundled.</footer>
</body></html>`;
  }

  $('#pdf-quote')?.addEventListener('click', () => {
    startTimer();
    const w = window.open('', '_blank');
    if (!w) { toast('Pop-up blocked — allow pop-ups to preview the PDF quote.'); return; }
    w.document.open();
    w.document.write(printable());
    w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch { /* user closed it */ } }, 420);
  });

  $('#mail-quote')?.addEventListener('click', () => {
    startTimer();
    const subject = `Your quotation ${ref()} — ${VERTICALS[state.vertical].label}, ${state.w} × ${state.h} mm`;
    location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(quoteToText(state, q, ref()))}`;
    toast('Opened in your mail client with the quote already written out.');
  });

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* insecure context */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = ta.setAttribute('readonly', '') || text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch { return false; }
  }

  $('#send-quote')?.addEventListener('click', async () => {
    startTimer();
    const text = quoteToText(state, q, ref());
    toast(await copyText(text)
      ? `<b>Copied.</b> ${ref()} is on your clipboard — ${fmtLocal(q.sell)}, priced in ${fmt(elapsed())}. Paste it into a text or an email and send it on.`
      : 'Your browser would not copy that. Use Print or Email instead.');
    stopTimer();
  });

  $('#send-sheet')?.addEventListener('click', async () => {
    const text = sheet(document.__leak.model);
    toast(await copyText(text)
      ? '<b>Copied.</b> The whole leak calculation is on your clipboard as a plain-text sheet.'
      : 'Your browser would not copy that.');
  });

  /* -------------------------------------------------------------- boot */
  jobName.textContent = JOBS[0][0];
  jobName.title = JOBS[0][1];
  nextRef();
  buildControls();
  syncMe();
  render(true);
  if (timeTaken) timeTaken.textContent = '00:00';

  onMarketChange(() => { syncControls(); render(); });

  return {
    get state() { return state; },
    get quote() { return q; },
    render, newCall,
    setMargin(m) { state.margin = m; syncMe(); render(); },
  };
}
