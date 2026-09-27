/* =========================================================================
   COUNTER — live quote tool
   Controls → one job record → a priced PDF you can print from the browser.
   ========================================================================= */

import { DEFAULT_STATE, priceQuote, quoteToText, marketBand, LAYOUTS, THICKNESS, FINISH, HARDWARE, money } from './quote.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const INK = '#5FF3DC';
const CASH = '#C6F24E';

const JOBS = [
  ['MASTER BATH — 217 OAKRIDGE', 'Herrera residence · shower refit'],
  ['KITCHEN BACKSPLASH — UNIT 4B', 'Ridgeline Apartments'],
  ['NEW BUILD — 88 LARCH ST', 'Whitfield custom home'],
  ['STOREFRONT — 14 MILE RD', 'Calder Auto Group'],
  ['REMODEL — 302 CANAL ROW', 'Nakamura residence'],
  ['DOOR REPLACEMENT — 9 ALDER CT', 'Beaumont residence'],
  ['GLASS RAIL — 3RD FLR STAIR', 'Larkspur Condos'],
  ['SHOWER ENCLOSURE — 51 QUARRY LN', 'Delgado residence'],
];

const money0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function initTool({ scene, onQuote } = {}) {
  const state = { ...DEFAULT_STATE, addons: {} };
  const root = $('#tool');
  if (!root) return;

  /* ------------------------------------------------------------- timer */
  let t0 = null, tick = 0;
  const timerEl = $('#call-timer');
  const timeTaken = $('#time-taken');
  const fmt = (ms) => {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  function startTimer() {
    if (t0) return;
    t0 = performance.now();
    tick = setInterval(() => { timerEl.textContent = fmt(performance.now() - t0); }, 500);
  }
  function stopTimer() { clearInterval(tick); tick = 0; }
  const elapsed = () => (t0 ? performance.now() - t0 : 0);

  /* ---------------------------------------------------------- numbering */
  let qno = 4100;
  const refEl = $('#q-no');
  const newRef = () => { qno++; refEl.textContent = `Q-${qno}`; return `Q-${qno}`; };

  /* ------------------------------------------------------------ new call */
  function newCall() {
    stopTimer();
    t0 = null;
    timerEl.textContent = '00:00';
    timeTaken.textContent = '00:00';
    const [name, sub] = JOBS[Math.floor(Math.random() * JOBS.length)];
    $('#job-name').textContent = name;
    $('#job-name').title = sub;
    newRef();
    toast(`<b>Incoming call connected.</b> New job loaded — start timing.`);
  }
  $('#new-call')?.addEventListener('click', newCall);

  /* ---------------------------------------------------------- controls */
  for (const seg of $$('[data-seg]')) {
    const key = seg.dataset.seg;
    seg.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-v]');
      if (!btn) return;
      for (const b of seg.children) b.classList.toggle('on', b === btn);
      state[key] = btn.dataset.v;
      startTimer();
      render();
    });
  }

  for (const chk of $$('[data-checks] input')) {
    chk.addEventListener('change', () => {
      state.addons[chk.dataset.x] = chk.checked;
      startTimer();
      render();
    });
  }

  const sliders = [
    ['#w', '#w-out', 'width', (v) => `${v}″`, true],
    ['#h', '#h-out', 'height', (v) => `${v}″`, true],
  ];
  for (const [sel, out, key, fmtV] of sliders) {
    const el = $(sel), outEl = $(out);
    if (!el) continue;
    const upd = () => {
      const v = +el.value;
      state[key] = v;
      outEl.textContent = fmtV(v);
      const pct = ((v - el.min) / (el.max - el.min)) * 100;
      el.style.setProperty('--pct', `${pct}%`);
    };
    el.addEventListener('input', () => { upd(); startTimer(); render(); });
    upd();
  }

  /* ------------------------------------------------------- margin editor */
  const marginWrap = document.createElement('div');
  marginWrap.className = 'margin-edit';
  marginWrap.hidden = true;
  marginWrap.innerHTML = `
    <label class="range" style="margin-bottom:0">
      <span class="range-lab">Your target margin <b class="mono" id="me-out">45%</b></span>
      <input type="range" id="me" min="10" max="75" step="1" value="45" />
    </label>`;
  $('#quote .quote-actions').after(marginWrap);
  const me = marginWrap.querySelector('#me');
  const meOut = marginWrap.querySelector('#me-out');
  const syncMe = () => {
    me.value = Math.round(state.margin * 100);
    meOut.textContent = `${me.value}%`;
    me.style.setProperty('--pct', `${((me.value - 10) / 65) * 100}%`);
  };
  me.addEventListener('input', () => {
    state.margin = +me.value / 100;
    syncMe();
    render();
  });
  $('#edit-margin')?.addEventListener('click', () => {
    marginWrap.hidden = !marginWrap.hidden;
    if (!marginWrap.hidden) { syncMe(); me.focus(); }
  });

  /* ------------------------------------------------------------ render */
  const linesEl = $('#lines');
  const tCost = $('#t-cost'), tMargin = $('#t-margin'), tTotal = $('#t-total'), tDep = $('#t-dep'), mOut = $('#m-out');
  const tMarket = $('#t-market');
  const hud = { size: $('#hud-size'), glass: $('#hud-glass'), hw: $('#hud-hw') };

  let shownTotal = 0, animRaf = 0, last = null;

  function animateTotal(to) {
    cancelAnimationFrame(animRaf);
    const from = shownTotal;
    const dur = 420;
    const s = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - s) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      shownTotal = from + (to - from) * e;
      tTotal.textContent = money0.format(Math.round(shownTotal));
      if (k < 1) animRaf = requestAnimationFrame(step);
    };
    animRaf = requestAnimationFrame(step);
  }

  function render() {
    const q = priceQuote(state);
    last = q;

    /* HUD */
    hud.size.textContent = `${state.width}″ × ${state.height}″`;
    hud.glass.textContent = `${THICKNESS[state.thickness].short} ${FINISH[state.finish].short}`;
    hud.hw.textContent = HARDWARE[state.hardware].label.replace('Polished ', '');
    mOut.textContent = `${Math.round(q.margin * 100)}%`;

    /* lines */
    linesEl.replaceChildren();
    for (const l of q.lines) {
      const row = document.createElement('div');
      row.className = 'ln';
      row.innerHTML = `<span>${l.label}<i>${l.detail}</i></span><b>${money0.format(Math.round(l.amount))}</b>`;
      linesEl.appendChild(row);
    }
    if (q.temperMinApplied) {
      const row = document.createElement('div');
      row.className = 'ln ln-sub';
      row.innerHTML = `<span><i style="margin:0">tempering minimum applied · ${q.lites} lites @ $65</i></span><b>auto</b>`;
      linesEl.appendChild(row);
    }
    if (state.addons.overnight) {
      const row = document.createElement('div');
      row.className = 'ln ln-sub';
      row.innerHTML = `<span><i style="margin:0">two-crew multiplier ×1.6 applied</i></span><b>auto</b>`;
      linesEl.appendChild(row);
    }

    /* market sanity band for the same spec */
    if (tMarket) {
      const b = marketBand(state);
      const sell = q.sell;
      /* Only worth saying something when the gap is big enough to matter. */
      const off = sell < b.low ? (b.low - sell) / b.low : sell > b.high ? (sell - b.high) / b.high : 0;
      const verdict = off === 0
        ? ` Yours sits in that range.`
        : off < 0.09
          ? ` Yours is close to it.`
          : sell < b.low
            ? ` <span class="q-market-flag">Yours is under the band. Check you are not leaving money on the table.</span>`
            : ` <span class="q-market-flag">Yours is over the band. Be ready to say why.</span>`;
      tMarket.innerHTML =
        `Most shops charge <b>${money0.format(b.low)} – ${money0.format(b.high)}</b> for this one.` + verdict;
    }

    tCost.textContent = money0.format(Math.round(q.cost));
    tMargin.textContent = money0.format(Math.round(q.gross));
    tDep.textContent = money0.format(Math.round(q.deposit));
    animateTotal(q.sell);

    /* conditional add-ons */
    const barChk = $('[data-x="bar"]');
    if (barChk) {
      const applicable = !!LAYOUTS[state.layout].open;
      barChk.disabled = !applicable;
      barChk.closest('.chk').style.opacity = applicable ? '' : '.34';
      barChk.closest('.chk').style.pointerEvents = applicable ? '' : 'none';
      if (!applicable) { barChk.checked = false; state.addons.bar = false; }
    }
    const doubleSeg = $('[data-seg="door"]');
    if (doubleSeg && !LAYOUTS[state.layout].door) {
      for (const b of doubleSeg.children) b.disabled = true;
    } else if (doubleSeg) {
      for (const b of doubleSeg.children) b.disabled = false;
    }

    /* the 3D view is a bonus — never let it take the pricing down with it */
    try {
      scene?.setState(state);
    } catch (err) {
      console.error('[COUNTER] 3D preview failed; pricing continues', err);
    }
    onQuote?.(state, q);
  }

  /* ------------------------------------------------------------- output */
  const ref = () => refEl.textContent;

  function printable() {
    const q = last;
    const L = LAYOUTS[state.layout];
    const rows = q.lines
      .map((l) => `<tr><td>${l.label}<span>${l.detail}</span></td><td class="r">${money0.format(Math.round(l.amount))}</td></tr>`)
      .join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>${ref()} — Quotation</title>
<style>
  @page{size:letter;margin:16mm}
  *{box-sizing:border-box}
  body{font:13px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#111;margin:0;padding:28px;max-width:760px}
  header{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;border-bottom:2px solid #111;padding-bottom:16px}
  h1{font-size:26px;letter-spacing:-.02em;margin:0 0 4px}
  .muted{color:#666;font-size:12px}
  .no{font:700 12px ui-monospace,Menlo,monospace;letter-spacing:.1em}
  section{margin-top:24px}
  h2{font:700 10px ui-monospace,Menlo,monospace;letter-spacing:.16em;text-transform:uppercase;color:#888;margin:0 0 10px}
  .spec{display:grid;grid-template-columns:repeat(2,1fr);gap:4px 20px;font-size:13px}
  .spec div{display:flex;justify-content:space-between;border-bottom:1px dotted #ddd;padding:5px 0}
  .spec b{font-weight:600}
  table{width:100%;border-collapse:collapse;font-size:13px}
  td{padding:8px 0;border-bottom:1px solid #eee}
  td span{color:#888;font-size:11px;margin-left:8px}
  .r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  .tot{margin-top:14px;margin-left:auto;width:340px}
  .tot div{display:flex;justify-content:space-between;padding:6px 0}
  .tot .grand{border-top:2px solid #111;border-bottom:none;padding:10px 0;font-size:19px;font-weight:800}
  .terms{margin-top:26px;font-size:11px;color:#666;line-height:1.6;border-top:1px solid #ddd;padding-top:14px}
  .sign{margin-top:34px;display:grid;grid-template-columns:1fr 1fr;gap:32px}
  .sign div{border-top:1px solid #111;padding-top:7px;font-size:11px;color:#666}
  footer{margin-top:34px;border-top:1px solid #ddd;padding-top:12px;font-size:10px;color:#999;letter-spacing:.04em}
</style></head><body>
<header>
  <div>
    <h1>Quotation ${ref()}</h1>
    <div class="muted">${L.label} — ${L.note}</div>
    <div class="muted">Prepared live · valid 14 days</div>
  </div>
  <div style="text-align:right">
    <div class="no">${ref()}</div>
    <div class="muted">${q.lites} lite${q.lites > 1 ? 's' : ''} · ${q.area} sf · ${q.hours} h</div>
  </div>
</header>
<section>
  <h2>Specification</h2>
  <div class="spec">
    <div><span class="muted">Enclosure</span><b>${L.label}</b></div>
    <div><span class="muted">Opening</span><b>${state.width}" × ${state.height}"</b></div>
    <div><span class="muted">Glass</span><b>${THICKNESS[state.thickness].label}</b></div>
    <div><span class="muted">Finish</span><b>${FINISH[state.finish].label}</b></div>
    <div><span class="muted">Door</span><b>${LAYOUTS[state.layout].door ? state.door : 'Open walk-in'}</b></div>
    <div><span class="muted">Hardware</span><b>${HARDWARE[state.hardware].label}</b></div>
  </div>
</section>
<section>
  <h2>Cost build-up</h2>
  <table>${rows}</table>
  <div class="tot">
    <div><span>Material &amp; labour cost</span><span class="r">${money0.format(Math.round(q.cost))}</span></div>
    <div><span>Margin @ ${Math.round(q.margin * 100)}%</span><span class="r">${money0.format(Math.round(q.gross))}</span></div>
    <div class="grand"><span>Total</span><span class="r">${money0.format(Math.round(q.sell))}</span></div>
    <div><span>Deposit to book (50%)</span><span class="r">${money0.format(Math.round(q.deposit))}</span></div>
    <div><span>Balance on completion</span><span class="r">${money0.format(Math.round(q.sell - q.deposit))}</span></div>
  </div>
</section>
<section class="sign">
  <div>Customer signature</div>
  <div>Date</div>
</section>
<p class="terms">All glass is tempered safety glass to ANSI Z97.1. Dimensions confirmed on site before
fabrication. Price per square foot ${money0.format(Math.round(q.perSf))}. Quotation valid 14 days.
Excludes removal of obstructions, wall repair and any work outside the enclosure opening.</p>
<footer>Generated from a single job record. Every figure above is traceable to a line item.</footer>
</body></html>`;
  }

  $('#pdf-quote')?.addEventListener('click', () => {
    startTimer();
    const w = window.open('', '_blank');
    if (!w) { toast('Pop-up blocked — allow pop-ups to preview the PDF quote.'); return; }
    w.document.open();
    w.document.write(printable());
    w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 420);
  });

  $('#mail-quote')?.addEventListener('click', () => {
    startTimer();
    const subject = `Your quotation ${ref()} — ${LAYOUTS[state.layout].label}, ${state.width}" × ${state.height}"`;
    const body = quoteToText(state, last, ref());
    location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    toast('Opened in your mail client with the quote already written out.');
  });

  /* Nothing is sent anywhere from this page — the button just puts the whole
     quote on the clipboard so the shop can paste it wherever it works. */
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch { /* older browsers, or a page served without a secure context */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }

  $('#send-quote')?.addEventListener('click', async () => {
    startTimer();
    const text = quoteToText(state, last, ref());
    toast(await copyText(text)
      ? `<b>Copied.</b> ${ref()} is on your clipboard — ${money0.format(Math.round(last.sell))}, ` +
        `priced in ${fmt(elapsed())}. Paste it into a text or email and send it on.`
      : 'Your browser would not copy that. Use Print or Email instead.');
    stopTimer();
  });

  /* ------------------------------------------------------------- boot */
  $('#job-name').textContent = JOBS[0][0];
  $('#job-name').title = JOBS[0][1];
  newRef();
  render();
  timeTaken.textContent = '00:00';

  return {
    state,
    render,
    newCall,
    setMargin(m) {
      state.margin = m;
      syncMe();
      render();
    },
  };
}

/* --------------------------------------------------------------- toast */
let toastT = 0;
export function toast(html, ms = 5200) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.innerHTML = html;
  el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), ms);
}
