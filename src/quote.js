/* =========================================================================
   COUNTER — quoting engine
   A working cost model for a frameless glass shower enclosure, built the way
   a glass shop actually builds one: glass by the square foot + waste, a
   tempering minimum per lite, polished edge by the linear foot, hardware off
   the shelf, labour by the hour, then a margin rule.
   Every number here is a real line item you can argue with on the build call.
   ========================================================================= */

export const SHOP = {
  wastePct: 0.08,        // cutting + breakage + tempering rejects
  temperMin: 65,         // per-lite minimum from the tempering line
  edgeworkLF: 4.2,       // polished edge, per linear foot
  labourRate: 95,        // per hour
  defaultMargin: 0.45,
  depositPct: 0.5,
};

export const THICKNESS = {
  '6mm':  { label: '1/4″ (6 mm)',  short: '1/4″',   sqft: 14.5, scene: 0.05, note: '$$' },
  '10mm': { label: '3/8″ (10 mm)', short: '3/8″',   sqft: 21.5, scene: 0.085, note: '$$$' },
  '12mm': { label: '1/2″ (12 mm)', short: '1/2″',   sqft: 27.0, scene: 0.115, note: '$$$$' },
};

export const FINISH = {
  clear:   { label: 'Clear',       short: 'clear',    add: 0,  glass: 0xbfe0dc, rough: 0.03, trans: 0.94, price: 0,  atten: 3.2 },
  lowiron: { label: 'Low-iron',    short: 'low-iron', add: 9,  glass: 0xe6f4f1, rough: 0.02, trans: 0.97, price: 0,  atten: 4.5 },
  frosted: { label: 'Acid-etched', short: 'etched',   add: 7,  glass: 0xe6efef, rough: 0.72, trans: 0.55, price: 7,  atten: 1.0 },
  bronze:  { label: 'Bronze tint', short: 'bronze',   add: 5,  glass: 0xc78c4e, rough: 0.05, trans: 0.86, price: 6,  atten: 0.40 },
  grey:    { label: 'Grey tint',   short: 'grey',     add: 5,  glass: 0x8792a0, rough: 0.05, trans: 0.85, price: 6,  atten: 0.36 },
  mirror:  { label: 'Mirror',      short: 'mirror',   add: 14, glass: 0xf0f6f9, rough: 0.01, trans: 0.96, price: 16, atten: 4.0 },
};

export const HARDWARE = {
  chrome: { label: 'Polished chrome',  mult: 1.00, color: 0xe2e8ec, rough: 0.06, metal: 1.0 },
  nickel: { label: 'Brushed nickel',   mult: 1.02, color: 0xc6c6c2, rough: 0.34, metal: 1.0 },
  black:  { label: 'Matte black',      mult: 1.06, color: 0x1c1c1e, rough: 0.62, metal: 0.55 },
  orb:    { label: 'Oil-rubbed bronze',mult: 1.13, color: 0x6b4526, rough: 0.42, metal: 0.9 },
  brass:  { label: 'Satin brass',      mult: 1.16, color: 0xc0a05c, rough: 0.24, metal: 1.0 },
};

export const LAYOUTS = {
  alcove: {
    label: 'Alcove', note: 'Fixed panel + swing door',
    door: true, hours: 3.5, corner: false,
  },
  double: {
    label: 'Double door', note: 'Two swing doors',
    door: true, hours: 4.5, corner: false, double: true,
  },
  neoangle: {
    label: 'Neo-angle', note: 'Two-wing corner',
    door: true, hours: 7.5, corner: true,
  },
  walkin: {
    label: 'Walk-in', note: 'Single fixed panel',
    door: false, hours: 2.5, corner: false, open: true,
  },
};

export const DOORS = {
  swing:  { label: 'Swing',  base: 236, hours: 0 },
  pivot:  { label: 'Pivot',  base: 303, hours: 0.75 },
  slider: { label: 'Slider', base: 309, hours: 0.5 },
};

export const ADDONS = {
  coat:      { label: 'Water-repellent coating', flat: 0, perSqft: 6 },
  seal:      { label: 'Silicone & seals kit',     flat: 34 },
  plumb:     { label: 'Out-of-plumb / scribe',    hours: 1.5 },
  haul:      { label: 'Remove & haul old unit',    flat: 185 },
  bar:       { label: 'Support bar',              flat: 128, walkinOnly: true },
  overnight: { label: 'Two-crew install',          labourMult: 1.6 },
};

export const DEFAULT_STATE = {
  layout: 'alcove',
  thickness: '10mm',
  finish: 'clear',
  door: 'swing',
  hardware: 'chrome',
  width: 48,
  height: 80,
  addons: {},
  margin: SHOP.defaultMargin,
};

/* ---------------------------------------------------------------- helpers */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const round2 = (n) => Math.round(n * 100) / 100;
const money = (n) =>
  '$' + Math.round(n).toLocaleString('en-US');

export { money, round2, clamp };

/** Build the actual panel list for the configured opening. */
export function panelsFor(state) {
  const W = state.width;
  const H = state.height;
  const L = LAYOUTS[state.layout];

  if (L.open) {
    return [{ w: W, h: H, role: 'fixed' }];
  }
  if (L.double) {
    const dw = Math.round(W / 2);
    return [
      { w: dw, h: H, role: 'door', side: 'left' },
      { w: W - dw, h: H, role: 'door', side: 'right' },
    ];
  }
  if (L.corner) {
    // Hinge wing runs the full opening along wall A, door sits on wall B.
    return [
      { w: W, h: H, role: 'fixed', wing: 'A' },
      { w: clamp(32, 26, Math.round(W * 0.45)), h: H, role: 'door', wing: 'B' },
    ];
  }
  const dw = clamp(32, 26, Math.round(W * 0.62));
  return [
    { w: W - dw, h: H, role: 'fixed' },
    { w: dw, h: H, role: 'door' },
  ];
}

/** The full priced quote. */
export function priceQuote(state) {
  const L = LAYOUTS[state.layout];
  const T = THICKNESS[state.thickness];
  const F = FINISH[state.finish];
  const HWF = HARDWARE[state.hardware];
  const D = L.door ? DOORS[state.door] : null;

  const panels = panelsFor(state);
  const addons = { ...state.addons };

  /* ---- area, perimeter, lite count ---- */
  const area = panels.reduce((s, p) => s + (p.w * p.h) / 144, 0);
  const edgeLf = panels.reduce((s, p) => s + (2 * (p.w + p.h)) / 12, 0);
  const lites = panels.length;

  /* ---- glass ---- */
  const glassRaw = area * (T.sqft + F.add);
  const glassWasted = glassRaw * (1 + SHOP.wastePct);
  const glassTemperMin = SHOP.temperMin * lites;
  const glass = Math.max(glassWasted, glassTemperMin);

  /* ---- edgework ---- */
  const edgework = edgeLf * SHOP.edgeworkLF;

  /* ---- hardware ---- */
  let hardware = L.open
    ? 64                                     // two wall brackets
    : D.base;
  if (L.corner) hardware += 95;              // corner post / glazing shoe
  hardware *= HWF.mult;

  /* ---- add-ons ---- */
  let addonCost = 0;
  const addonLines = [];
  for (const [k, def] of Object.entries(ADDONS)) {
    if (!addons[k]) continue;
    if (def.walkinOnly && !L.open) continue;
    if (def.perSqft) {
      const c = area * def.perSqft;
      addonCost += c;
      addonLines.push({ label: def.label, detail: `${round2(area)} sf @ $${def.perSqft}/sf`, amount: c });
    } else if (def.flat) {
      addonCost += def.flat;
      addonLines.push({ label: def.label, detail: 'flat', amount: def.flat });
    }
  }
  const labourMult = addons.overnight ? ADDONS.overnight.labourMult : 1;

  /* ---- labour ---- */
  const baseHours = L.hours + (D ? D.hours : 0);
  const plumbHours = addons.plumb ? ADDONS.plumb.hours : 0;
  const hours = (baseHours + plumbHours) * labourMult;
  const labour = hours * SHOP.labourRate;

  /* ---- cost + margin ---- */
  const cost = glass + edgework + hardware + addonCost + labour;
  const m = clamp(state.margin, 0.05, 0.9);
  const sell = cost / (1 - m);
  const gross = sell - cost;
  const deposit = sell * SHOP.depositPct;

  /* ---- display lines ---- */
  const lines = [];
  lines.push({
    label: `Glass — ${T.short} ${F.short}`,
    detail: `${round2(area)} sf`,
    amount: glass,
  });
  lines.push({ label: 'Polished edge', detail: `${round2(edgeLf)} lf`, amount: edgework });
  lines.push({
    label: L.open ? 'Hardware — brackets' : `Hardware — ${D.label.toLowerCase()} kit`,
    detail: HWF.label.replace('Polished ', '').toLowerCase(),
    amount: hardware,
  });
  for (const l of addonLines) lines.push({ label: l.label, detail: l.detail, amount: l.amount });
  lines.push({
    label: 'Glazier labour',
    detail: `${round2(hours)} h @ $${SHOP.labourRate}`,
    amount: labour,
  });

  const subLines = [];
  if (glassWasted < glassTemperMin) {
    subLines.push({ label: `Tempering minimum applied (${lites} lite${lites > 1 ? 's' : ''})`, amount: glassTemperMin });
  }
  if (addons.plumb) subLines.push({ label: 'Out-of-plumb scribe allowance', amount: 0 });
  if (addons.overnight) subLines.push({ label: 'Two-crew multiplier applied to labour', amount: 0 });

  const buckets = [
    { key: 'glass', label: 'Glass', amount: glass, color: '#5FF3DC' },
    { key: 'edge', label: 'Edgework', amount: edgework, color: '#8FD8FF' },
    { key: 'hw', label: 'Hardware', amount: hardware, color: '#A5B4FC' },
    { key: 'addons', label: 'Add-ons', amount: addonCost, color: '#FFD166' },
    { key: 'labour', label: 'Labour', amount: labour, color: '#FF9C7E' },
    { key: 'profit', label: 'Your margin', amount: gross, color: '#C6F24E' },
  ];

  return {
    lines,
    subLines,
    buckets,
    area: round2(area),
    edgeLf: round2(edgeLf),
    lites,
    hours: round2(hours),
    cost,
    sell,
    gross,
    margin: m,
    deposit,
    perSf: sell / area,
    panels,
    temperMinApplied: glassWasted < glassTemperMin,
  };
}

/** A plain-text quote, used for the PDF/print view and the email fallback. */
export function quoteToText(state, q, ref) {
  const L = LAYOUTS[state.layout];
  const T = THICKNESS[state.thickness];
  const F = FINISH[state.finish];
  const rows = q.lines
    .map((l) => `  ${l.label.padEnd(34, ' ')} ${money(l.amount).padStart(10, ' ')}`)
    .join('\n');
  return [
    `QUOTATION  ${ref}`,
    `Prepared live. Valid 14 days.`,
    ``,
    `ENCLOSURE`,
    `  ${L.label} — ${L.note}`,
    `  Opening ${state.width}" × ${state.height}"  (${q.lites} lite${q.lites > 1 ? 's' : ''}, ${q.area} sf)`,
    `  Glass ${T.label}, ${F.label}`,
    `  Hardware ${HARDWARE[state.hardware].label}`,
    ``,
    `COST BUILD-UP`,
    rows,
    ``,
    `  Material & labour cost            ${money(q.cost).padStart(10, ' ')}`,
    `  Margin @ ${(q.margin * 100).toFixed(0)}%                   ${money(q.gross).padStart(10, ' ')}`,
    ``,
    `  TOTAL                            ${money(q.sell).padStart(10, ' ')}`,
    `  Deposit to book (${SHOP.depositPct * 100}%)              ${money(q.deposit).padStart(10, ' ')}`,
    `  Balance on completion            ${money(q.sell - q.deposit).padStart(10, ' ')}`,
    ``,
    `TERMS`,
    `  All glass is tempered safety glass to ANSI Z97.1. Measurement confirmed`,
    `  on site before fabrication. Quote valid 14 days. Excludes removal of`,
    `  obstructions, wall repair, and any work outside the enclosure opening.`,
    ``,
    `  Price per linear/square foot: ${money(q.perSf)} / sf`,
  ].join('\n');
}
