/* =============================================================================
   calculators.js — wiring for the quote-desk leak test and the markup check

   Both stand alone. They share no state, so a visitor can use either one
   without the other being involved at all.
   ========================================================================== */

import { ASSUMPTIONS, leakModel, markupModel, sheet, money, rate, num, delayLabel, area } from './tools.js';
import { getMarket, onMarketChange, areaUnit } from './market.js';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ============================================================== leak test == */

export function initLeak(root = document) {
  const inputs = {
    quotesPerMonth: 40,
    avgJobValue:    3200,
    hoursPerQuote:  1.5,
    delayMinutes:   26 * 60,
    closeRate:      22,
  };

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
  const fastPhrase = $('#lk-fast-phrase', root);

  const A = ASSUMPTIONS;

  function run() {
    const m = leakModel(inputs);

    big.textContent = money(m.recoverable);
    box.classList.toggle('result-good', m.recoverable <= 0);
    const ceiling = m.revenueIfFast - m.revenueNow;

    sub.innerHTML =
      `is what you could win on the ${money(m.annualQuoted)} you already send out. ` +
      `It is the top end, if every quote closed the way your fastest ones do. ` +
      `You will not get all of it. <b>Half of that gap is ${money(ceiling / 2)}</b> a year, ` +
      `and it comes from jobs you are already quoting.`;

    const pctNow  = (m.nowRate * 100).toFixed(1);
    const pctFast = (m.fastRate * 100).toFixed(1);
    if (phrase) phrase.textContent = delayLabel(inputs.delayMinutes);
    if (fastPhrase) fastPhrase.textContent = delayLabel(A.fastTargetMin);
    rNow.textContent  = `${pctNow}%`;
    rFast.textContent = `${pctFast}%`;
    barNow.style.width  = `${Math.min(100, m.nowRate * 100)}%`;
    barFast.style.width = `${Math.min(100, m.fastRate * 100)}%`;

    qTotal.textContent   = money(m.annualQuoted);
    deskHrs.textContent  = `${num(m.annualDeskHours)} h`;
    unclosed.textContent = money(m.unclosed);

    leaksEl.innerHTML = m.leaks.map((l) => `
      <div class="leak">
        <div class="leak-top">
          <span class="leak-name">${l.name}</span>
          <span class="leak-val">${money(l.value)} a year</span>
        </div>
        <p class="leak-why">${l.why}</p>
        <p class="leak-fix">${l.fix}</p>
      </div>`).join('');

    verdict.innerHTML = m.top
      ? `Start with the <b>${m.top.name.toLowerCase()}</b>. It costs you <b>${money(m.top.value)}</b> a year. ` +
        `Right now a customer waits ${delayLabel(inputs.delayMinutes)} for a price.`
      : `Nothing is leaking on these numbers. Either your desk is already fast, or your answers are too good. Worth a check.`;

    current = m;
    document.dispatchEvent(new CustomEvent('leak:update', { detail: m }));
  }

  let current = null;
  document.__leak = { get model() { return current; }, inputs };
  run();

  /* the money on this panel is in the visitor's own currency, so the whole
     readout has to be re-stated when the market changes */
  onMarketChange(() => {
    for (const key of Object.keys(inputs)) {
      const el = $(`#lk-${key}`, root);
      const out = $(`#lk-${key}-out`, root);
      if (!el || !out) continue;
      const v = Number(el.value);
      if (key === 'avgJobValue') out.textContent = money(v);
      else if (key === 'closeRate') out.textContent = `${v}%`;
      else if (key === 'delayMinutes') out.textContent = delayLabel(v);
      else if (key === 'hoursPerQuote') out.textContent = `${v.toFixed(2)} h`;
      else out.textContent = num(v);
    }
    run();
  });
}

/* ================================================== the markup calculator */

export function initMarkup(root) {
  const inputs = { glassM2: 6, matPerUnit: 38, labourHours: 3.5, labourRate: 46, extras: 0, markupPct: 45 };

  for (const key of Object.keys(inputs)) {
    const el = $(`#mk-${key}`, root);
    if (!el) continue;
    const out = $(`#mk-${key}-out`, root);
    const paint = () => {
      const v = Number(el.value);
      out.textContent = key === 'extras' ? money(v)
        : key === 'glassM2' ? `${area(v).toFixed(1)} ${areaUnit()}`
        : key === 'labourRate' ? `${rate(v)}/h`
        : key === 'labourHours' ? `${v.toFixed(1)} h`
        : key === 'markupPct' ? `${v}%`
        : key === 'matPerUnit' ? rate(v) : money(v);
    };
    el.addEventListener('input', () => { inputs[key] = Number(el.value); paint(); run(); });
    paint();
  }

  const big  = $('#mk-gross-pct', root);
  const cost = $('#mk-cost', root);
  const sell = $('#mk-sell', root);
  const gross= $('#mk-gross', root);
  const rows = $('#mk-rows', root);
  const note = $('#mk-note', root);
  const bar  = $('#mk-bar', root);
  const mark = $('#mk-marker', root);
  const need = $('#mk-needed', root);
  const gap  = $('#mk-gap', root);
  const areaSlot = $('#mk-area-row', root);

  function run() {
    const m = markupModel(inputs);

    big.textContent = `${(m.grossPct * 100).toFixed(1)}%`;
    cost.textContent  = money(m.cost);
    sell.textContent  = money(m.sell);
    gross.textContent = money(m.gross);
    need.textContent  = money(m.needed);
    gap.textContent   = m.gap > 0
      ? `That is ${money(m.gap)} more than you charge now.`
      : `You already clear that, with ${money(-m.gap)} to spare.`;
    note.innerHTML = m.verdict;

    if (areaSlot) areaSlot.textContent = `${m.shown.toFixed(1)} ${areaUnit()}`;

    rows.innerHTML = `
      <div><span>Glass · ${m.shown.toFixed(1)} ${areaUnit()} at ${rate(m.matPerUnit)}/${areaUnit()}</span><span class="v">${money(m.material)}</span></div>
      <div><span>Labour · ${m.hours.toFixed(1)} h at ${rate(m.rate)}/h</span><span class="v">${money(m.labour)}</span></div>
      ${m.extra > 0 ? `<div><span>Hardware, seals, delivery</span><span class="v">${money(m.extra)}</span></div>` : ''}
      <div><span>Total cost</span><span class="v">${money(m.cost)}</span></div>
      <div><span>You sell at ${inputs.markupPct}% markup</span><span class="v">${money(m.sell)}</span></div>
      <div><span>Gross profit</span><span class="v">${money(m.gross)}</span></div>
      <div><span>Price to keep ${Math.round(ASSUMPTIONS.glassGrossBand[0] * 100)}%</span><span class="v">${money(m.needed)}</span></div>`;

    const [lo, hi] = ASSUMPTIONS.glassGrossBand;
    const good = m.tone !== 'loss';
    bar.style.width = `${Math.min(100, m.grossPct * 100)}%`;
    bar.style.background = good ? 'var(--acc)' : 'var(--bad)';
    mark.style.left = `${((lo + hi) / 2) * 100}%`;
  }

  root.__markup = { inputs };
  run();

  /* the area unit and the currency both move when the market does */
  onMarketChange(() => {
    for (const key of Object.keys(inputs)) {
      const el = $(`#mk-${key}`, root);
      const out = $(`#mk-${key}-out`, root);
      if (!el || !out) continue;
      const v = Number(el.value);
      out.textContent = key === 'extras' ? money(v)
        : key === 'glassM2' ? `${area(v).toFixed(1)} ${areaUnit()}`
        : key === 'labourRate' ? `${rate(v)}/h`
        : key === 'labourHours' ? `${v.toFixed(1)} h`
        : key === 'markupPct' ? `${v}%`
        : key === 'matPerUnit' ? rate(v) : money(v);
    }
    run();
  });
}
