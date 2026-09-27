/* =========================================================================
   COUNTER — the free tools
   Two calculators that a shop would otherwise pay someone to build for them.
   They work with no email, no gate, no call. That is the point.
   ========================================================================= */

import { money } from './quote.js';
import { toast } from './quote-ui.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmtMoney = (n) => '$' + Math.round(n).toLocaleString('en-US');

/* ==========================================================================
   1. The 10-Minute Revenue Leak Test
   ========================================================================== */

const DELAY_STEPS = [
  { max: 1, mult: 1.35, label: 'on the call' },
  { max: 6, mult: 0.78, label: 'same day' },
  { max: 24, mult: 0.52, label: 'next morning' },
  { max: 72, mult: 0.3, label: 'three days later' },
  { max: 168, mult: 0.16, label: 'a week later' },
  { max: Infinity, mult: 0.08, label: 'whenever it lands' },
];

export function initLeak() {
  const root = $('#leak');
  if (!root) return null;

  const inp = {
    q: $('#l-q', root), v: $('#l-v', root), c: $('#l-c', root), h: $('#l-h', root),
  };
  if (!inp.q) return null;

  const out = {
    q: $('#l-q-out', root), v: $('#l-v-out', root), c: $('#l-c-out', root), h: $('#l-h-out', root),
    big: $('#leak-big', root),
    now: $('#lb-now-win', root), call: $('#lb-call-win', root), both: $('#lb-both-win', root),
    barNow: $('#bar-now', root), barCall: $('#bar-call', root), barBoth: $('#bar-both', root),
    verdict: $('#leak-verdict-text', root),
  };

  const state = { q: 40, v: 3400, c: 28, h: 48 };

  function calc() {
    const perYear = state.q * 12;
    const step = DELAY_STEPS.find((s) => state.h <= s.max);
    const nowRate = Math.min(0.95, (state.c / 100) * step.mult);
    const callRate = Math.min(0.95, (state.c / 100) * 1.35);
    const bothRate = Math.min(0.95, (state.c / 100) * 2);
    return {
      step, perYear, nowRate, callRate, bothRate,
      nowWin: perYear * nowRate,
      callWin: perYear * callRate,
      bothWin: perYear * bothRate,
      gapCall: perYear * (callRate - nowRate) * state.v,
      gapBoth: perYear * (bothRate - nowRate) * state.v,
      gapStep: perYear * (bothRate - callRate) * state.v,
    };
  }

  function render() {
    const r = calc();
    out.q.textContent = state.q;
    out.v.textContent = fmtMoney(state.v);
    out.c.textContent = `${state.c}%`;
    out.h.textContent = state.h < 24 ? `${state.h} h` : `${Math.round(state.h / 24)} d`;

    out.big.textContent = fmtMoney(r.gapBoth);
    out.now.textContent = `${Math.round(r.nowWin)} jobs · ${fmtMoney(r.nowWin * state.v)}`;
    out.call.textContent = `${Math.round(r.callWin)} jobs · ${fmtMoney(r.callWin * state.v)}`;
    out.both.textContent = `${Math.round(r.bothWin)} jobs · ${fmtMoney(r.bothWin * state.v)}`;

    const max = Math.max(r.nowWin, r.callWin, r.bothWin) || 1;
    out.barNow.style.width = `${(r.nowWin / max) * 100}%`;
    out.barCall.style.width = `${(r.callWin / max) * 100}%`;
    out.barBoth.style.width = `${(r.bothWin / max) * 100}%`;

    const gap = r.gapBoth;
    out.verdict.innerHTML = verdict(r, gap);
    return r;
  }

  function verdict(r, gap) {
    if (state.h <= 1) {
      return `You are already quoting on the call — so the ${fmtMoney(gap)} still on the table is almost
        entirely the <b>follow-up</b>. Landing the PDF inside ten minutes is the step you're skipping, and it is
        worth ${fmtMoney(r.gapStep)} a year on ${state.q} jobs a month.`;
    }
    if (state.h >= 168) {
      return `You are sending quotes <b>a week late</b>. That timing alone drops you to roughly
        ${(r.nowRate * 100).toFixed(0)}% close. Getting the number to them on the call is worth
        <b>${fmtMoney(gap)} a year</b> — ${Math.round(r.gapBoth)} extra jobs, every year, for a change in process
        rather than a change in price.`;
    }
    return `You are sending quotes <b>${r.step.label}</b>, which drops you to about
      ${(r.nowRate * 100).toFixed(0)}% close. Pricing it on the call instead is worth
      <b>${fmtMoney(r.gapCall)} a year</b>. Adding the ten-minute PDF on top of that takes it to
      <b>${fmtMoney(gap)} a year</b> — about ${Math.round(r.gapBoth)} extra jobs, every year, for a change in
      process rather than a change in price.`;
  }

  const pairs = [[inp.q, 'q'], [inp.v, 'v'], [inp.c, 'c'], [inp.h, 'h']];
  for (const [el, k] of pairs) {
    const upd = () => {
      state[k] = +el.value;
      const pct = ((state[k] - el.min) / (el.max - el.min)) * 100;
      el.style.setProperty('--pct', `${pct}%`);
      render();
    };
    el.addEventListener('input', upd);
    upd();
  }

  /* free one-pager — value first, the download is the opt-in */
  $('#leak-sheet')?.addEventListener('click', () => {
    const r = calc();
    const lines = [
      'THE 10-MINUTE REVENUE LEAK TEST — worked example',
      '='.repeat(52),
      '',
      `Quoted jobs per month      ${state.q}`,
      `Average job value          ${fmtMoney(state.v)}`,
      `Quoted jobs per year       ${r.perYear}`,
      `Current quote turnaround   ${out.h.textContent}`,
      '',
      'CLOSE RATE AT EACH STAGE',
      `  As-is (${r.step.label})   ${(r.nowRate * 100).toFixed(1)}%  →  ${Math.round(r.nowWin)} jobs  ${fmtMoney(r.nowWin * state.v)}`,
      `  Quote on the call        ${(r.callRate * 100).toFixed(1)}%  →  ${Math.round(r.callWin)} jobs  ${fmtMoney(r.callWin * state.v)}`,
      `  Call + PDF in 10 min     ${(r.bothRate * 100).toFixed(1)}%  →  ${Math.round(r.bothWin)} jobs  ${fmtMoney(r.bothWin * state.v)}`,
      '',
      'THE GAP',
      `  Worth of quoting on the call        ${fmtMoney(r.gapCall)}/yr`,
      `  Worth of the 10-minute follow-up    ${fmtMoney(r.gapStep)}/yr`,
      `  TOTAL ON THE TABLE                  ${fmtMoney(r.gapBoth)}/yr`,
      '',
      'THE FOLLOW-UP SEQUENCE THAT GOES WITH IT',
      '  1. Price the job while they are still on the phone.',
      '  2. Say the number. Say it out loud. Do not soften it.',
      '  3. Send the PDF before you hang up, not after.',
      '  4. If there is no answer in 10 minutes, text one line:',
      '       "Quote sent — anything you want me to change, say the word."',
      '  5. One follow-up at 48h. One at 7 days. Then stop.',
      '',
      'The sequence is free. The tooling is not. The tooling is what makes',
      'step 1 possible while you are still on the call.',
    ].join('\n');

    openTextSheet(lines, `${state.q}-jobs-per-month — 10-minute revenue leak test.txt`);
  });

  return { render, state };
}

/* ==========================================================================
   2. The Margin Stack
   Same job record, one question: where does the number actually come from?
   ========================================================================== */

export function initMargin({ onMargin } = {}) {
  const root = $('.sec-margin');
  if (!root) return null;
  const stack = $('#stack', root);
  const legend = $('#stack-legend', root);
  const slider = $('#g-margin', root);
  const out = $('#g-margin-out', root);
  if (!stack) return null;

  let quote = null;
  const set = (pct) => {
    const p = (pct - 10) / 65 * 100;
    slider.style.setProperty('--pct', `${p}%`);
  };

  function render(m, q) {
    if (q) quote = { ...q, margin: m };
    if (!quote) return;
    quote.margin = m;

    const total = quote.buckets.reduce((s, b) => s + b.amount, 0) || 1;
    out.textContent = `${Math.round(m * 100)}%`;

    stack.replaceChildren();
    legend.replaceChildren();
    for (const b of quote.buckets) {
      const share = (b.amount / total) * 100;
      if (b.amount <= 0) continue;
      const seg = document.createElement('div');
      seg.className = 'seg-s' + (share > 9 ? ' wide' : '');
      seg.style.flexGrow = String(Math.max(0.4, b.amount));
      seg.innerHTML = `<i style="background:${b.color}"></i><span>${b.label}<br>${Math.round(share)}%</span>`;
      stack.appendChild(seg);

      const l = document.createElement('div');
      l.className = 'sleg';
      l.innerHTML = `<i style="background:${b.color}"></i>${b.label}<b>${fmtMoney(b.amount)}</b>`;
      legend.appendChild(l);
    }
  }

  const pct = +slider.value;
  set(pct);
  render(pct / 100, null);
  slider.addEventListener('input', () => {
    const p = +slider.value;
    set(p);
    render(p / 100);
    onMargin?.(p / 100);
  });

  return { render: (m, q) => render(m, q) };
}

/* --------------------------------------------------------------- sheets */

export function openTextSheet(text, filename) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('<b>One-pager downloaded.</b> Open it next to your next quote — the follow-up sequence on the last page is the part most shops skip.');
}
