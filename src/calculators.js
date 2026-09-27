/* =============================================================================
   calculators.js — wiring for the quote-desk leak test and the markup check
   ========================================================================== */

import { ASSUMPTIONS, leakModel, markupModel, sheet, money, num, delayLabel } from './tools.js';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ============================================================== leak test == */

export function initLeak(root = document) {
  const inputs = {
    quotesPerMonth: 45,
    avgJobValue:    4200,
    hoursPerQuote:  1.5,
    delayMinutes:   26 * 60,
    closeRate:      22,
  };

  /* mirror the slider values into the big number beside each label */
  for (const key of Object.keys(inputs)) {
    const el = $(`#lk-${key}`, root);
    if (!el) continue;
    const out = $(`#lk-${key}-out`, root);
    const paint = () => {
      const v = Number(el.value);
      if (key === 'avgJobValue') out.textContent = money(v);
      else if (key === 'closeRate') out.textContent = `${v}%`;
      else if (key === 'delayMinutes') out.textContent = delayLabel(v);
      else if (key === 'hoursPerQuote') out.textContent = `${v.toFixed(2)} h`;
      else out.textContent = num(v);
    };
    el.addEventListener('input', () => { inputs[key] = Number(el.value); paint(); run(); });
    paint();
  }

  const box      = $('#lk-result', root);
  const big      = $('#lk-big', root);
  const sub      = $('#lk-sub', root);
  const leaksEl  = $('#lk-leaks', root);
  const verdict  = $('#lk-verdict', root);
  const barNow   = $('#lk-bar-now', root);
  const barFast  = $('#lk-bar-fast', root);
  const rNow     = $('#lk-rate-now', root);
  const rFast    = $('#lk-rate-fast', root);
  const qTotal   = $('#lk-annual-quoted', root);
  const deskHrs  = $('#lk-desk-hours', root);
  const unclosed = $('#lk-unclosed', root);
  const phrase   = $('#lk-delay-phrase', root);

  function run() {
    const m = leakModel(inputs);

    big.textContent = money(m.recoverable);
    box.classList.toggle('result-good', m.recoverable <= 0);
    const ceiling = m.revenueIfFast - m.revenueNow;
    sub.innerHTML =
      `is the <b>ceiling</b> on the ${money(m.annualQuoted)} you already quote — if every quote ` +
      `closed the way your fastest ones do. Nobody captures all of it. Half of this gap, done ` +
      `properly, is <b>${money(ceiling / 2)}</b> a year without a single new customer.`;

    const pctNow  = (m.nowRate * 100).toFixed(1);
    const pctFast = (m.fastRate * 100).toFixed(1);
    if (phrase) phrase.textContent = delayLabel(inputs.delayMinutes);
    rNow.textContent  = `${pctNow}%`;
    rFast.textContent = `${pctFast}%`;
    barNow.style.width  = `${Math.min(100, m.nowRate * 100)}%`;
    barFast.style.width = `${Math.min(100, m.fastRate * 100)}%`;

    qTotal.textContent   = money(m.annualQuoted);
    deskHrs.textContent  = `${num(m.annualDeskHours)} h`;
    unclosed.textContent = money(m.unclosed);

    leaksEl.innerHTML = m.leaks.map((l) => `
      <div class="leak${l.top ? ' leak-top' : ''}">
        <span class="leak-name">${l.name}${l.top ? ' <span class="micro-label">biggest</span>' : ''}</span>
        <span class="leak-val">${money(l.value)}</span>
        <span class="leak-why">${l.why}</span>
        <span class="leak-fix">${l.fix}</span>
      </div>`).join('');

    verdict.innerHTML = m.top
      ? `Start with the <b>${m.top.name.toLowerCase()}</b>. It is worth <b>${money(m.top.value)}</b> a year, ` +
        `and you are currently ${delayLabel(inputs.delayMinutes)} between "I'll send a quote" and the customer having one.`
      : `Nothing is leaking on these numbers. Either your desk is already fast, or these figures are optimistic — worth checking.`;

    /* keep the emailed sheet in sync with whatever is on screen */
    current = m;
    const dl = $('#lk-download', root);
    if (dl) dl.onclick = () => downloadSheet(m, inputs.closeRate);
  }

  let current = null;
  root.__leak = { get model() { return current; }, inputs };
  run();
}

/* ============================================================ the one-pager */

function downloadSheet(m, closePct) {
  const body = sheet(m);
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!doctype html><meta charset="utf-8"><title>Your quote desk leak</title>
  <style>
    body{font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;color:#0d1117;
         background:#fff;max-width:760px;margin:0 auto;padding:48px 28px;white-space:pre-wrap}
    @media print{body{padding:0}}
  </style><body>${escapeHtml(body)}</body>`);
  w.document.close();
  setTimeout(() => w.print(), 250);
}

const escapeHtml = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/* --------------------------------------------------------- the email gate -- */

export function initGate(root = document) {
  const form = $('#lk-gate-form', root);
  if (!form) return;
  const unlocked = $('#lk-unlocked', root);
  const email = $('#lk-email', root);
  const btn = form.querySelector('button[type="submit"]');
  const note = $('#lk-gate-note', root);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val)) {
      note.textContent = 'That address does not look complete — check for a typo.';
      note.style.color = 'var(--loss)';
      return;
    }
    const m = root.__leak.model;
    unlocked.classList.add('on');
    form.closest('.gate-in').style.display = 'none';

    /* TODO(owner): POST { email, m } to your ESP / CRM. See main.js form handler. */
    if (window.__onGate) window.__onGate({ email: val, model: m });

    const dl = $('#lk-download-btn', root);
    if (dl && m) {
      dl.onclick = () => downloadSheet(m, root.__leak.inputs.closeRate);
      unlocked.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });
}

/* ========================================================== markup reality == */

export function initMarkup(root) {
  const inputs = { sqFt: 26, matPerSf: 38, labourHours: 3.5, labourRate: 95, extras: 0, markupPct: 45 };

  for (const key of Object.keys(inputs)) {
    const el = $(`#mk-${key}`, root);
    if (!el) continue;
    const out = $(`#mk-${key}-out`, root);
    const paint = () => {
      const v = Number(el.value);
      out.textContent = key === 'extras' ? money(v)
        : key === 'sqFt' ? `${num(v)} sf`
        : key === 'labourRate' ? money(v) + '/h'
        : key === 'labourHours' ? `${v.toFixed(1)} h`
        : key === 'markupPct' ? `${v}%`
        : money(v);
    };
    el.addEventListener('input', () => { inputs[key] = Number(el.value); paint(); run(); });
    paint();
  }

  const res  = $('#mk-result', root);
  const big  = $('#mk-gross-pct', root);
  const cost = $('#mk-cost', root);
  const sell = $('#mk-sell', root);
  const gross= $('#mk-gross', root);
  const rows = $('#mk-rows', root);
  const note = $('#mk-note', root);
  const bar  = $('#mk-bar', root);
  const mark = $('#mk-marker', root);

  function run() {
    const m = markupModel(inputs);
    res.className = 'result' + (m.tone === 'loss' ? '' : ' result-good');
    big.textContent = `${(m.grossPct * 100).toFixed(1)}%`;
    cost.textContent  = money(m.cost);
    sell.textContent  = money(m.sell);
    gross.textContent = money(m.gross);
    note.innerHTML = m.verdict;

    rows.innerHTML = `
      <div><span>Glass · ${num(m.sf, 0)} sf at ${money(m.matPerSf)}/sf</span><span class="v">${money(m.material)}</span></div>
      <div><span>Labour · ${m.hours.toFixed(1)} h at ${money(m.rate)}/h</span><span class="v">${money(m.labour)}</span></div>
      ${m.extra > 0 ? `<div><span>Hardware, seals, delivery</span><span class="v">${money(m.extra)}</span></div>` : ''}
      <div><span>Total cost</span><span class="v">${money(m.cost)}</span></div>
      <div><span>You sell at ${inputs.markupPct}% markup</span><span class="v">${money(m.sell)}</span></div>
      <div><span>Gross profit</span><span class="v">${money(m.gross)}</span></div>`;

    bar.style.width = `${Math.min(100, m.grossPct * 100)}%`;
    const [lo, hi] = ASSUMPTIONS.glassGrossBand;
    mark.style.left = `${(lo + hi) / 2 * 100}%`;
  }

  run();
}
