/* =============================================================================
   tools.js — the two calculators

   The quote-desk leak model is built out of arithmetic the reader can check by
   hand, and every assumed constant is named in ASSUMPTIONS and printed on the
   page. Nothing here is a black box.
   ========================================================================== */

import { getMarket, money, rate, toDisplayArea, areaUnit } from './market.js';

const M = getMarket;

export { money, rate };

export const num = (n, dp = 0) =>
  Number(n || 0).toLocaleString('en-GB', { maximumFractionDigits: dp, minimumFractionDigits: dp });

export const area = (m2) => toDisplayArea(m2);

/* ------------------------------------------------------------------ assumptions

   The first two multipliers are not research and the page says so. They are
   what happened in the founder's own glass shop: quotes finished before the
   customer got off the phone, and PDFs out inside ten minutes, against the
   same customer base. Everything below "next morning" is interpolation between
   that and doing nothing, not a claim about the trade.
   ------------------------------------------------------------------------- */

export const ASSUMPTIONS = {
  /* measured, own shop */
  speedOnCall: 3.0,
  speedTenMin: 2.0,
  /* interpolated, and labelled as interpolated on the page */
  speedNextDay: 1.35,
  speedThreeDays: 1.12,

  /* what an hour of quoting-desk time actually costs the business */
  loadedRate: 48,

  /* share of desk time that is re-typing, lookup and rebuilding the same
     quote — the part a real cost model removes */
  avoidableShare: 0.4,

  /* the shop sends quotes at this speed; the calculator prices the gap */
  fastTargetMin: 10,

  /* gross margin band for a custom glass shop, used by the markup check */
  glassGrossBand: [0.32, 0.45],
};

/* ------------------------------------------------------------- speed curve --

   Monotone, anchored on the measured points, interpolated in log space so the
   penalty for 2h → 4h is not absurdly larger than 20h → 22h.
   ------------------------------------------------------------------------ */

const lerp = (a, b, t) => a + (b - a) * t;

export function speedMult(hours) {
  const h = Math.max(1 / 60, Number(hours) || 0);
  const A = ASSUMPTIONS;
  const T = A.fastTargetMin / 60;
  if (h <= T) return A.speedTenMin;                    // 10 minutes or better
  if (h <= 1) return lerp(A.speedTenMin, 1.7, (h - T) / (1 - T));
  if (h <= 24) {
    const t = (Math.log(h) - Math.log(1)) / (Math.log(24) - Math.log(1));
    return lerp(1.7, A.speedNextDay, t);
  }
  if (h <= 96) {
    const t = (Math.log(h) - Math.log(24)) / (Math.log(96) - Math.log(24));
    return lerp(A.speedNextDay, A.speedThreeDays, t);
  }
  return A.speedThreeDays;
}

const hrs = (mins) => mins / 60;

/* ------------------------------------------------------------- the model -- */

export function leakModel(v) {
  const quotes = clamp(v.quotesPerMonth, 1, 2000);
  const value = clamp(v.avgJobValue, 100, 1e7);
  const deskHrs = clamp(v.hoursPerQuote, 0.05, 40);
  const closePct = clamp(v.closeRate, 0.1, 99) / 100;
  const delayMins = clamp(v.delayMinutes, 1, 60 * 24 * 30);
  const A = ASSUMPTIONS;

  const annualQuotes = quotes * 12;
  const annualQuoted = annualQuotes * value;
  const annualDeskHours = annualQuotes * deskHrs;

  const nowMult = speedMult(hrs(delayMins));
  const fastMult = speedMult(hrs(A.fastTargetMin));
  const nowRate = Math.min(closePct * nowMult, 0.95);
  const fastRate = Math.min(closePct * fastMult, 0.95);

  const revenueNow = annualQuoted * nowRate;

  /* Leak 1 — the speed gap. Direct: the extra jobs the same pipeline closes
     when the quote lands in minutes instead of hours. */
  const speedGain = annualQuoted * (fastRate - nowRate);

  /* Leak 2 — desk time. Only the avoidable share, priced at loaded rate. */
  const deskRecovery = annualDeskHours * A.avoidableShare * A.loadedRate;

  const leaks = [
    {
      key: 'speed',
      name: 'Speed gap',
      value: speedGain,
      why: `Your quotes take ${fmtDelay(delayMins)} to reach the customer. In the shop this page was built from, a quote finished before the customer got off the phone closed at ${A.speedOnCall}× the rate of one sent the next day. Inside ten minutes it was ${A.speedTenMin}×.`,
      fix: `<b>Fix:</b> build the quote during the call, not after it. That is ${money(annualQuoted * (fastRate - nowRate))} of extra close rate on ${money(annualQuoted)} you already quote.`,
      top: true,
    },
    {
      key: 'desk',
      name: 'Re-pricing the same job from scratch',
      value: deskRecovery,
      why: `${num(annualDeskHours)} hours a year go into pricing ${num(annualQuotes)} quotes at ${deskHrs.toFixed(2)}h each. Roughly ${Math.round(A.avoidableShare * 100)}% of that is typing, looking up hardware and rebuilding a quote you priced last month.`,
      fix: `<b>Fix:</b> a cost model that remembers your glass, your hardware and your margin rule, so the second shower takes seconds. Worth about ${rate(A.loadedRate)}/h against ${money(deskRecovery)} a year.`,
      top: false,
    },
  ].filter((l) => l.value > 0);

  leaks.sort((a, b) => b.value - a.value);
  if (leaks[0]) leaks[0].top = true;

  const recoverable = leaks.reduce((s, l) => s + l.value, 0);

  return {
    annualQuoted, annualQuotes, annualDeskHours,
    nowMult, fastMult, nowRate, fastRate,
    revenueNow,
    revenueIfFast: annualQuoted * fastRate,
    unclosed: annualQuoted * (1 - nowRate),
    speedGain, deskRecovery,
    recoverable,
    leaks,
    top: leaks[0] || null,
    delayMins,
    deskHrs,
    value,
    quotes,
  };
}

function fmtDelay(mins) {
  if (mins < 60) return `${Math.round(mins)} minutes`;
  if (mins < 60 * 24) {
    const h = mins / 60;
    return `${h < 1.5 ? h.toFixed(1) : Math.round(h)} hours`;
  }
  const d = mins / 1440;
  return d < 1.5 ? `${d.toFixed(1)} days` : `${Math.round(d)} days`;
}

export const delayLabel = fmtDelay;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number(n) || 0));

/* ==================================================== markup reality check -- */

export function markupModel(v) {
  const A = ASSUMPTIONS;
  const m2 = clamp(v.glassM2, 0.5, 400);
  const matPerUnit = clamp(v.matPerUnit, 1, 900);
  const hours = clamp(v.labourHours, 0.1, 400);
  const ratePerHour = clamp(v.labourRate, 5, 500);
  const extra = clamp(v.extras, 0, 200000);
  const shown = toDisplayArea(m2);

  const material = shown * matPerUnit;
  const labour = hours * ratePerHour;
  const cost = material + labour + extra;
  const sell = cost * (1 + clamp(v.markupPct, 0, 500) / 100);

  const gross = sell - cost;
  const grossPct = sell > 0 ? gross / sell : 0;
  const [lo, hi] = A.glassGrossBand;

  /* A markup percentage fixes the margin rate, so the rate alone cannot tell
     you whether the price is big enough. What matters is the gap between the
     price you are asking and the price this job needs for a healthy margin. */
  const needed = cost / (1 - lo);
  const gap = needed - sell;

  let verdict, tone, band;
  if (grossPct < lo) {
    band = lo; tone = 'loss';
    verdict = `You keep ${(grossPct * 100).toFixed(1)}% of each sale. A shop running well keeps ${(lo * 100).toFixed(0)}% to ${(hi * 100).toFixed(0)}%. To keep ${(lo * 100).toFixed(0)}% on this job you need to ask ${money(needed)} — that is ${money(gap)} more than you charge now.`;
  } else if (grossPct > hi) {
    band = hi; tone = 'good';
    verdict = `You keep ${(grossPct * 100).toFixed(1)}% of each sale. That is above the ${(lo * 100).toFixed(0)}–${(hi * 100).toFixed(0)}% band. Good prices, or you are losing jobs. Worth knowing which one.`;
  } else {
    band = null; tone = 'ok';
    verdict = `You keep ${(grossPct * 100).toFixed(1)}% of each sale. That is inside the ${(lo * 100).toFixed(0)}–${(hi * 100).toFixed(0)}% band. On this job you could ask ${money(gap)} more and still be in the band.`;
  }

  return { m2, shown, matPerUnit, hours, rate: ratePerHour, extra, material, labour, cost, sell, gross, grossPct, needed, gap, band, tone, verdict };
}

/* ------------------------------------------------------------- the sheet -- */

export function sheet(model) {
  return [
    'QUOTE DESK LEAK — YOUR NUMBERS',
    '='.repeat(52),
    '',
    `Quotes sent / month        ${num(model.quotes)}`,
    `Average job value          ${money(model.value)}`,
    `Hours to price one quote   ${model.deskHrs.toFixed(2)} h`,
    `Time to deliver the quote  ${fmtDelay(model.delayMins)}`,
    `Close rate                 ${(model.nowRate * 100).toFixed(1)}%`,
    '',
    '-'.repeat(52),
    'THE THREE NUMBERS',
    '-'.repeat(52),
    `Quoted a year              ${money(model.annualQuoted)}`,
    `Won a year (at your rate)  ${money(model.revenueNow)}`,
    `If you delivered in 10 min ${money(model.revenueIfFast)}`,
    '',
    '-'.repeat(52),
    'WHERE IT LEAKS',
    '-'.repeat(52),
    ...model.leaks.map((l, i) => `${i + 1}. ${l.name} — ${money(l.value)} a year\n   ${stripTags(l.why)}\n   ${stripTags(l.fix)}`),
    '',
    `THE GAP, A YEAR            ${money(model.recoverable)}`,
    '',
    'That figure is a ceiling, not a promise. It assumes every quote',
    'closed the way your fastest ones do. Nobody captures all of it.',
    `Half of the gap, done properly, is ${money(model.recoverable / 2)} a year`,
    'with no new customers.',
    '',
    `If ${fmtDelay(ASSUMPTIONS.fastTargetMin)} became your norm, you would`,
    `close ${(model.fastRate * 100).toFixed(1)}% instead of ${(model.nowRate * 100).toFixed(1)}%,`,
    'on the same pipeline you already have.',
    '',
    '='.repeat(52),
    'Where the multipliers come from:',
    'the shop this page was built from, where a quote finished on',
    `the call closed at ${ASSUMPTIONS.speedOnCall}x and one out inside`,
    `${ASSUMPTIONS.fastTargetMin} minutes at ${ASSUMPTIONS.speedTenMin}x, against`,
    'the same customers. Next-day and beyond are interpolated, not measured.',
    `Desk time is priced at ${rate(ASSUMPTIONS.loadedRate)}/h loaded,`,
    `${Math.round(ASSUMPTIONS.avoidableShare * 100)}% avoidable.`,
    'Change any input and the maths moves.',
  ].join('\n');
}

export const stripTags = (s) => String(s).replace(/<[^>]+>/g, '');
