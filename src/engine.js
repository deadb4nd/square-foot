/* =============================================================================
   engine.js — the quoting engine

   Four job types, one cost model. Every number below is a real trade rate a
   glass shop can argue with, and every one of them is a line on the printed
   quote — which is the whole point: the output is traceable, not a black box.

   Units are physical. Millimetres in, square metres under the hood, and the
   market layer decides what the shop actually sees.
   ========================================================================== */

import { getMarket, money, rate, toDisplayArea, mmToInches, dimLabel } from './market.js';

const M = getMarket;
const r2 = (n) => Math.round(n * 100) / 100;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const perM2 = (m2) => (M().area === 'm2' ? m2 : m2 * 10.7639104167);

/* ============================================================== price book ==
   Base rates, written per square metre. `factor` in market.js scales them.

   The banding is the part a shop recognises: float is cheap, low-iron costs
   real money because it comes off a different pour, and anything with a
   pattern in it or a finish has to go through a second process.
   ------------------------------------------------------------------------- */

export const GLASS = {
  '6':  { label: '6 mm',   desc: 'Float',           perM2: 31,  scene: 0.055, waste: 0.08, tough: true },
  '8':  { label: '8 mm',   desc: 'Float / low-iron', perM2: 39, scene: 0.070, waste: 0.08, tough: true },
  '10': { label: '10 mm',  desc: 'Float / low-iron', perM2: 54,  scene: 0.095, waste: 0.09, tough: true },
  '12': { label: '12 mm',  desc: 'Float / low-iron', perM2: 69,  scene: 0.118, waste: 0.09, tough: true },
  '15': { label: '15 mm',  desc: 'Float / low-iron', perM2: 97,  scene: 0.148, waste: 0.10, tough: true },
};

export const FINISH = {
  clear:   { label: 'Clear',        add: 0,  glass: 0xbfe0dc, rough: 0.03, trans: 0.94, price: 0,  atten: 3.2, abbr: 'CLR' },
  lowiron: { label: 'Low-iron',     add: 19, glass: 0xe6f4f1, rough: 0.02, trans: 0.97, price: 0,  atten: 4.5, abbr: 'LI' },
  etched:  { label: 'Acid-etched',  add: 26, glass: 0xe6efef, rough: 0.72, trans: 0.55, price: 26, atten: 1.0, abbr: 'ETCH' },
  bronze:  { label: 'Bronze tint',  add: 15, glass: 0xc78c4e, rough: 0.05, trans: 0.86, price: 15, atten: 0.40, abbr: 'BRZ' },
  grey:    { label: 'Grey tint',    add: 17, glass: 0x8792a0, rough: 0.05, trans: 0.85, price: 17, atten: 0.36, abbr: 'GRY' },
  mirror:  { label: 'Silver mirror',add: 42, glass: 0xf0f6f9, rough: 0.01, trans: 0.96, price: 42, atten: 4.0, abbr: 'MIR' },
};

export const HARDWARE = {
  chrome: { label: 'Polished chrome',   mult: 1.00, color: 0xe2e8ec, rough: 0.06, metal: 1.0 },
  nickel: { label: 'Brushed nickel',    mult: 1.03, color: 0xc6c6c2, rough: 0.34, metal: 1.0 },
  black:  { label: 'Matte black',       mult: 1.08, color: 0x1c1c1e, rough: 0.62, metal: 0.55 },
  bronze: { label: 'Oil-rubbed bronze', mult: 1.15, color: 0x6b4526, rough: 0.42, metal: 0.9 },
  brass:  { label: 'Satin brass',       mult: 1.19, color: 0xc0a05c, rough: 0.24, metal: 1.0 },
};

/* =============================================================== the rates ==
   Every figure here is a line item on the PDF. Nothing is bundled invisibly.
   ------------------------------------------------------------------------- */

export const RATES = {
  /* the toughening oven charges a minimum per lite — the single most common
     reason a small panel costs more per m² than a big one */
  toughMin: 38,
  /* arrised and polished edge, per linear metre of exposed edge */
  polishPerLinM: 6.5,
  polishMin: 24,
  /* the shop's own fitting rate, loaded */
  labourRate: 46,
  /* a second pair of hands on the same day */
  twoFitterMult: 1.7,
  defaultMargin: 0.42,
  depositPct: 0.5,
  /* what a healthy custom glass shop keeps, used by the markup reality check */
  grossBand: [0.32, 0.45],
};

/* ============================================================ vertical specs ==
   Each vertical owns its own options, defaults, add-ons and rate logic. The UI
   is generated from these, so a new job type is a data change, not a rebuild.
   ------------------------------------------------------------------------- */

export const VERTICALS = {
  shower: {
    id: 'shower',
    label: 'Shower enclosure',
    blurb: 'Frameless. The one you quote with the customer standing in the bathroom.',
    dims: { w: { label: 'Opening width', min: 700, max: 1800, step: 50, def: 900, unit: 'mm' },
            h: { label: 'Opening height', min: 1900, max: 2400, step: 50, def: 2000, unit: 'mm' } },
    areaBasis: 'openings',
    areaRate: 78,
    glass: ['6', '8', '10', '12'],
    finishes: ['clear', 'lowiron', 'etched', 'bronze', 'grey'],
    hardware: true,
    layouts: {
      alcove:  { label: 'Alcove',    note: 'Fixed panel + one door', hours: 3.5, door: true },
      double:  { label: 'Double',    note: 'Two doors, centre opening', hours: 4.5, door: true, dbl: true },
      corner:  { label: 'Corner',    note: 'Two wings, one door', hours: 7.5, door: true, corner: true },
      walkin:  { label: 'Walk-in',   note: 'Single fixed panel, open', hours: 2.5, door: false, open: true },
    },
    doors: {
      swing:  { label: 'Swing',  base: 148, hours: 0,    note: 'two wall hinges' },
      pivot:  { label: 'Pivot',  base: 205, hours: 0.75, note: 'floor pivot, heavy lite' },
      slider: { label: 'Sliding',base: 212, hours: 0.5,  note: 'top track' },
    },
    hardwareBase: { walkin: 52, corner: 78 },
    addons: {
      coat:   { label: 'Water-repellent coating', perM2: 9,  note: 'per m², applied after toughening' },
      seal:   { label: 'Silicone & seals kit',     flat: 38,  note: 'one kit per enclosure' },
      plumb:  { label: 'Out-of-plumb allowance',    hours: 1.5, note: 'walls out by more than 6 mm' },
      haul:   { label: 'Remove & take away old unit',flat: 145,note: 'disposal included' },
      bar:    { label: 'Support bar',              flat: 96, walkinOnly: true, note: 'walk-in only' },
      two:    { label: 'Two fitters on the day',   labourMult: 1.7, note: 'instead of one' },
    },
  },

  shopfront: {
    id: 'shopfront',
    label: 'Shopfront',
    blurb: 'A bay count, not a size. Quoted per m² installed, the way you already quote it.',
    dims: { w: { label: 'Overall width', min: 1800, max: 9000, step: 300, def: 3600, unit: 'mm' },
            h: { label: 'Overall height', min: 2200, max: 3600, step: 100, def: 2700, unit: 'mm' } },
    areaBasis: 'elevation',
    areaRate: 0,          // priced per m² installed, see ratesFor()
    glass: ['6', '8', '10', '12'],
    finishes: ['clear', 'lowiron', 'etched', 'grey'],
    hardware: false,
    layouts: {
      single: { label: 'Single glazed', note: '6 mm monolithic', hours: 5.5, glazeMult: 1, insulated: false },
      double: { label: 'Double glazed', note: '6-16-6 sealed unit', hours: 6.5, glazeMult: 1.34, insulated: true },
      obscure:{ label: 'Obscured',     note: 'Cillini / patterned interlayer', hours: 6, glazeMult: 1.12 },
    },
    frames: {
      slim:   { label: 'Slim aluminium', perLinM: 88,  mult: 1,    note: '50 mm face' },
      standard:{label: 'Standard alu',   perLinM: 62,  mult: 0.93, note: 'the usual system' },
      steel:  { label: 'Steel',          perLinM: 174, mult: 1.22, note: 'slimline steel' },
    },
    addons: {
      transom:   { label: 'Fixed transom',        perM2: 24, note: 'over the door' },
      manifest:  { label: 'Manifestation banding', perM2: 19, note: 'safety bands, required by BS 6266' },
      sign:      { label: 'Vinyl sign face',       flat: 120, note: 'one panel' },
      bulkhead:  { label: 'Bulkhead over',         perM2: 34, note: 'box section + capping' },
      haul:      { label: 'Take down old shopfront', flat: 340, note: 'disposal included' },
      two:       { label: 'Two fitters on the day', labourMult: 1.7 },
    },
  },

  splashback: {
    id: 'splashback',
    label: 'Splashback / mirror',
    blurb: 'Run length, height, and the cut-outs. The job that eats an afternoon if you price it by hand.',
    dims: { w: { label: 'Run length', min: 600, max: 4000, step: 100, def: 2400, unit: 'mm' },
            h: { label: 'Height',     min: 300, max: 1500, step: 50, def: 700, unit: 'mm' } },
    areaBasis: 'run',
    areaRate: 0,
    glass: ['6', '8', '10', '12'],
    finishes: ['clear', 'lowiron', 'etched', 'bronze', 'grey', 'mirror'],
    hardware: false,
    layouts: {
      splash:  { label: 'Splashback only', note: 'One run of glass', hours: 0.9,  both: false },
      mirror:  { label: 'Mirror only',     note: 'One run of mirror', hours: 0.7,  both: false, mirrorRun: true },
      both:    { label: 'Splashback + mirror', note: 'Two runs, matched', hours: 1.6, both: true },
      tileset: { label: 'Shower panel',    note: 'Full height, sealed', hours: 2.4, tall: true },
    },
    fixings: {
      studs:    { label: 'Visible studs',  flat: 44,  note: 'per run, stainless' },
      channel:  { label: 'Concealed channel', flat: 78, note: 'per run, no visible fixings' },
      silicone: { label: 'Silicone only',  flat: 0,   note: 'existing masonry' },
    },
    addons: {
      template: { label: 'Template the run',  hours: 0.8, note: 'out of square, scribed' },
      socket:   { label: 'Cut-out per outlet', perUnit: 22, note: 'each' },
      upstand:  { label: 'Upstand return',  perLinM: 19, note: 'per linear metre' },
      sealant:  { label: 'Sanitary silicone', flat: 29, note: 'tube + gun' },
      haul:     { label: 'Take down old run', flat: 95, note: 'disposal included' },
      two:      { label: 'Two fitters on the day', labourMult: 1.7 },
    },
  },

  balustrade: {
    id: 'balustrade',
    label: 'Balustrade',
    blurb: 'A metre run, a glass choice, and how it is fixed. The job you never quite know the price of.',
    dims: { w: { label: 'Run length', min: 1000, max: 8000, step: 300, def: 3000, unit: 'mm' },
            h: { label: 'Glass height', min: 900, max: 1200, step: 50, def: 1000, unit: 'mm' } },
    areaBasis: 'run',
    areaRate: 0,
    glass: ['8', '10', '12', '15'],
    finishes: ['clear', 'lowiron', 'etched', 'grey'],
    hardware: true,
    layouts: {
      level: { label: 'Level run',  note: 'Flat, glass to glass', hours: 1.1 },
      stair: { label: 'Stair run',  note: 'Rake following the pitch', hours: 1.9, rake: true },
      corner:{ label: 'Corner return', note: 'Two runs meeting a post', hours: 1.6, corner: true },
    },
    fixings: {
      point:  { label: 'Point-fixed',  perM2: 96,  note: '4 fixings per lite' },
      channel:{ label: 'Channel',      perLinM: 58, note: 'base shoe + clamps' },
      shoe:   { label: 'Glazing shoe',  perLinM: 74, note: 'face-fixed, no base channel' },
    },
    addons: {
      cap:      { label: '316 stainless cap rail', perLinM: 96,  note: 'per linear metre' },
      handrail: { label: 'Timber handrail',       perLinM: 132, note: 'per linear metre, oak' },
      post:     { label: 'Intermediate posts',    perUnit: 74, note: 'each, powder coated' },
      template: { label: 'Template the rake',      hours: 0.9, note: 'set out on site' },
      sealant:  { label: 'Structural silicone',   flat: 32,   note: 'per lite' },
      two:      { label: 'Two fitters on the day', labourMult: 1.7 },
    },
  },
};

/* ------------------------------------------------------------- the default */

export function defaultState(vertical) {
  const V = VERTICALS[vertical];
  const s = { vertical, margin: RATES.defaultMargin, addons: {} };
  for (const [k, d] of Object.entries(V.dims)) s[k] = d.def;
  s.thickness = V.glass[Math.min(2, V.glass.length - 1)];
  s.finish = V.finishes[0];
  s.layout = Object.keys(V.layouts)[0];
  s.hardware = 'chrome';
  if (V.doors) s.door = Object.keys(V.doors)[1] || Object.keys(V.doors)[0];
  if (V.frames) s.frame = 'standard';
  if (V.fixings) s.fixing = Object.keys(V.fixings)[0];
  return s;
}

export const DEFAULT_STATE = defaultState('shower');

/* ================================================================= panels ==
   Turn the configured opening into an actual list of glass lites, in mm. Every
   downstream number — area, edge, cut list, drawing — comes off this list, so
   there is exactly one place where the geometry is decided.
   ------------------------------------------------------------------------- */

export function panelsFor(state) {
  const V = VERTICALS[state.vertical];
  const L = V.layouts[state.layout];
  const W = state.w, H = state.h;

  if (state.vertical === 'shower') {
    if (L.open) return [{ w: Math.round(W * 0.66), h: H, role: 'fixed' }];
    if (L.dbl) {
      const dw = Math.round(W / 2);
      return [{ w: dw, h: H, role: 'door', side: 'left' }, { w: W - dw, h: H, role: 'door', side: 'right' }];
    }
    if (L.corner) {
      return [{ w: W, h: H, role: 'fixed', wing: 'A' },
              { w: clamp(Math.round(W * 0.45), 500, 900), h: H, role: 'door', wing: 'B' }];
    }
    const dw = clamp(Math.round(W * 0.42), 500, 820);
    return [{ w: W - dw, h: H, role: 'fixed' }, { w: dw, h: H, role: 'door' }];
  }

  if (state.vertical === 'shopfront') {
    /* one lite per bay, plus a transom band over the door, plus a door lite */
    const bays = clamp(Math.round(W / 1200), 1, 8);
    const bayW = W / bays;
    const doorW = clamp(bayW * 0.62, 850, 1100);
    const transomH = state.addons.transom ? clamp(Math.round(H * 0.14), 320, 480) : 0;
    const doorH = H - transomH;
    const out = [];
    for (let i = 0; i < bays; i++) {
      out.push({ w: Math.round(bayW), h: H, role: 'glazing', bay: i + 1 });
    }
    out.push({ w: Math.round(doorW), h: doorH, role: 'door', side: 'left' });
    if (transomH) out.push({ w: Math.round(doorW), h: transomH, role: 'transom' });
    return out;
  }

  if (state.vertical === 'splashback') {
    const run = { w: W, h: H, role: L.tall ? 'panel' : 'splashback' };
    if (L.mirrorRun) return [{ ...run, role: 'mirror' }];
    if (L.both) return [{ ...run, role: 'splashback' }, { w: W, h: Math.min(H, 900), role: 'mirror' }];
    return [run];
  }

  /* balustrade: split the run into lites of no more than ~1.2 m glass */
  const maxLite = 1200;
  const n = clamp(Math.ceil(W / maxLite), 1, 6);
  const liteW = Math.round(W / n);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ w: i === n - 1 ? W - liteW * (n - 1) : liteW, h: H, role: 'balustrade', lite: i + 1 });
  }
  return out;
}

/* ================================================================== rates ==
   The per-vertical cost logic. Each returns the line items for that job type.
   ------------------------------------------------------------------------- */

function edgeAndGlass(panels, state, G, F) {
  const m2 = panels.reduce((s, p) => s + (p.w / 1000) * (p.h / 1000), 0);
  const linM = panels.reduce((s, p) => s + 2 * ((p.w + p.h) / 1000), 0);
  const perM2Glass = G.perM2 + F.add;
  const withWaste = m2 * (1 + G.waste);
  const toughMin = RATES.toughMin * panels.length;
  return {
    m2, linM, perM2Glass,
    glassRaw: m2 * perM2Glass,
    glassWasted: withWaste * perM2Glass,
    toughMin,
    glass: Math.max(withWaste * perM2Glass, toughMin),
    edge: Math.max(linM * RATES.polishPerLinM, RATES.polishMin),
    temperMinApplied: withWaste * perM2Glass < toughMin,
  };
}

function ratesFor(state) {
  const V = VERTICALS[state.vertical];
  const L = V.layouts[state.layout];
  const G = GLASS[state.thickness];
  const F = FINISH[state.finish];
  const HW = HARDWARE[state.hardware] || HARDWARE.chrome;
  const add = state.addons || {};
  const lines = [];
  const notes = [];

  /* ---- shared add-on maths, resolved per vertical by the rules below ---- */
  const panelArea = (panels) => panels.reduce((s, p) => s + (p.w / 1000) * (p.h / 1000), 0);
  const panelEdge = (panels) => panels.reduce((s, p) => s + 2 * ((p.w + p.h) / 1000), 0);
  const panels = panelsFor(state);

  /* ================================================================= shower */
  if (state.vertical === 'shower') {
    const D = L.door ? V.doors[state.door] : null;
    const g = edgeAndGlass(panels, state, G, F);
    const fix = V.hardwareBase[L.open ? 'walkin' : ''] || 0;
    const cornerShoe = L.corner ? V.hardwareBase.corner : 0;
    const hardware = ((L.door ? D.base : fix) + cornerShoe) * HW.mult;

    lines.push({ label: `Glass — ${G.label} ${F.label}`, detail: `${r2(perM2(g.m2))} m²`, amount: g.glass, key: 'glass' });
    lines.push({ label: 'Arrised & polished edge', detail: `${r2(g.linM)} lin m`, amount: g.edge, key: 'edge' });
    lines.push({ label: L.door ? `Hardware — ${D.label.toLowerCase()} kit` : 'Hardware — wall brackets',
                 detail: HW.label.replace('Polished ', ''), amount: hardware, key: 'hw' });

    if (g.temperMinApplied) notes.push(`Toughening minimum applied (${panels.length} lite${panels.length > 1 ? 's' : ''})`);

    /* labour */
    const baseHours = L.hours + (D ? D.hours : 0);
    const plumb = add.plumb ? V.addons.plumb.hours : 0;
    const hours = (baseHours + plumb) * (add.two ? RATES.twoFitterMult : 1);
    lines.push({ label: 'Fitting labour', detail: `${r2(hours)} h @ ${rate(RATES.labourRate)}`, amount: hours * RATES.labourRate, key: 'labour' });

    /* per-m² and flat add-ons */
    for (const [k, def] of Object.entries(V.addons)) {
      if (!add[k]) continue;
      if (def.walkinOnly && !L.open) continue;
      if (def.perM2) lines.push({ label: def.label, detail: `${r2(perM2(g.m2))} m²`, amount: perM2(g.m2) * def.perM2, key: 'add' });
      else if (def.flat) lines.push({ label: def.label, detail: 'fixed', amount: def.flat, key: 'add' });
    }

    return { lines, notes, panels, m2: g.m2, hours, hardware: HW, glassUnit: G, finish: F,
             meta: { lites: panels.length, glass: `${G.label} ${F.label}`, edgeLinM: r2(g.linM) } };
  }

  /* ============================================================= shopfront */
  if (state.vertical === 'shopfront') {
    const F0 = V.frames[state.frame];
    const elev = (state.w / 1000) * (state.h / 1000);
    const perM2Installed = 148 * (L.glazeMult || 1) * F0.mult;

    /* the trade prices a shopfront per m² of elevation, then adjusts the
       perimeter work (frame, transom, door) as separate lines */
    const perimM = 2 * ((state.w + state.h) / 1000);
    const frame = perimM * F0.perLinM;
    const glaze = elev * perM2Installed;
    const doorSet = 640 * F0.mult;
    const transom = add.transom ? panelsFor(state).filter((p) => p.role === 'transom')
      .reduce((s, p) => s + (p.w / 1000) * (p.h / 1000), 0) * 24 : 0;
    const bulk = add.bulkhead ? elev * 34 : 0;

    lines.push({ label: `Glazing — ${L.label}`, detail: `${r2(elev)} m² @ ${rate(perM2Installed)}/m²`, amount: glaze, key: 'glass' });
    lines.push({ label: `Frame — ${F0.label}`, detail: `${r2(perimM)} lin m`, amount: frame, key: 'edge' });
    lines.push({ label: 'Door set & ironmongery', detail: F0.label, amount: doorSet, key: 'hw' });
    if (transom) lines.push({ label: 'Fixed transom', detail: `${r2(perM2(0.3))} m²`, amount: transom, key: 'add' });
    if (bulk) lines.push({ label: 'Bulkhead over', detail: `${r2(elev)} m²`, amount: bulk, key: 'add' });
    if (add.manifest) lines.push({ label: 'Manifestation banding', detail: `${r2(perM2(elev))} m²`, amount: perM2(elev) * 19, key: 'add' });
    if (add.sign) lines.push({ label: 'Vinyl sign face', detail: 'one panel', amount: 120, key: 'add' });
    if (add.haul) lines.push({ label: 'Take down old shopfront', detail: 'disposal included', amount: 340, key: 'add' });

    const hours = L.hours * (add.two ? RATES.twoFitterMult : 1);
    lines.push({ label: 'Installation labour', detail: `${r2(hours)} h @ ${rate(RATES.labourRate)}`, amount: hours * RATES.labourRate, key: 'labour' });

    return { lines, notes, panels, m2: elev, hours, hardware: HW, glassUnit: G, finish: F,
             meta: { lites: panels.length, bays: panels.filter((p) => p.role === 'glazing').length, frame: F0.label } };
  }

  /* ============================================================ splashback */
  if (state.vertical === 'splashback') {
    const fix = V.fixings[state.fixing];
    const runs = panelsFor(state);
    const area = panelArea(runs);
    const perM = G.perM2 + F.add;
    const withWaste = area * (1 + G.waste);
    const toughMin = RATES.toughMin * runs.length;

    /* a mirror and a splashback are priced as separate lines because that is
       how they are bought — mirror on a different sheet, often a different
       supplier, always a different per-m² */
    const mirrorRuns = runs.filter((p) => p.role === 'mirror');
    const glassRuns = runs.filter((p) => p.role !== 'mirror');
    const mirrorArea = panelArea(mirrorRuns);
    const glassArea = panelArea(glassRuns);

    if (glassArea > 0) {
      const amt = Math.max(glassArea * (1 + G.waste) * (G.perM2 + F.add), toughMin * glassRuns.length / Math.max(1, runs.length));
      lines.push({ label: `Glass — ${G.label} ${F.label}`, detail: `${r2(glassArea)} m²`, amount: amt, key: 'glass' });
    }
    if (mirrorArea > 0) {
      const mAmt = mirrorArea * (1 + 0.12) * (G.perM2 + 42);
      lines.push({ label: `Mirror — ${G.label} silver`, detail: `${r2(mirrorArea)} m²`, amount: mAmt, key: 'glass' });
    }

    const cut = runs.reduce((s, p) => s + 2 * ((p.w + p.h) / 1000), 0);
    const edgeAmt = Math.max(cut * RATES.polishPerLinM, RATES.polishMin);
    lines.push({ label: 'Arrised edges', detail: `${r2(cut)} lin m`, amount: edgeAmt, key: 'edge' });

    if (fix.flat) lines.push({ label: `Fixings — ${fix.label}`, detail: fix.note, amount: fix.flat * runs.length, key: 'hw' });

    const tmpl = add.template ? V.addons.template.hours : 0;
    const hours = (L.hours + tmpl) * (add.two ? RATES.twoFitterMult : 1);
    lines.push({ label: 'Fitting labour', detail: `${r2(hours)} h @ ${rate(RATES.labourRate)}`, amount: hours * RATES.labourRate, key: 'labour' });

    for (const [k, def] of Object.entries(V.addons)) {
      if (!add[k] || k === 'template' || k === 'two') continue;
      if (def.perUnit) lines.push({ label: def.label, detail: 'each', amount: def.perUnit, key: 'add' });
      else if (def.perLinM) lines.push({ label: def.label, detail: `${r2(panelEdge(runs))} lin m`, amount: panelEdge(runs) * def.perLinM, key: 'add' });
      else if (def.flat) lines.push({ label: def.label, detail: 'fixed', amount: def.flat, key: 'add' });
    }

    return { lines, notes, panels: runs, m2: area, hours, hardware: HW, glassUnit: G, finish: F,
             meta: { lites: runs.length, glass: `${G.label}`, fixings: fix.label } };
  }

  /* ============================================================= balustrade */
  const fix = V.fixings[state.fixing];
  const runs = panelsFor(state);
  const area = panelArea(runs);
  const linM = runs.reduce((s, p) => s + p.w / 1000, 0);
  const withWaste = area * (1 + G.waste);
  const toughMin = RATES.toughMin * runs.length;
  const glassAmt = Math.max(withWaste * (G.perM2 + F.add), toughMin);

  lines.push({ label: `Glass — ${G.label} ${F.label}`, detail: `${r2(area)} m²`, amount: glassAmt, key: 'glass' });
  lines.push({ label: 'Arrised & polished edge', detail: `${r2(linM * 2 + runs.length * (state.h / 1000))} lin m`,
               amount: Math.max((linM * 2 + runs.length * (state.h / 1000)) * RATES.polishPerLinM, RATES.polishMin), key: 'edge' });

  const fixAmt = fix.perM2 ? area * fix.perM2 : linM * fix.perLinM;
  lines.push({ label: `Fixings — ${fix.label}`, detail: fix.perM2 ? `${r2(area)} m²` : `${r2(linM)} lin m`, amount: fixAmt, key: 'hw' });

  for (const [k, def] of Object.entries(V.addons)) {
    if (!add[k] || k === 'template' || k === 'two') continue;
    if (def.perLinM) lines.push({ label: def.label, detail: `${r2(linM)} lin m`, amount: linM * def.perLinM, key: 'add' });
    else if (def.perUnit) lines.push({ label: def.label, detail: 'each', amount: def.perUnit, key: 'add' });
    else if (def.flat) lines.push({ label: def.label, detail: 'fixed', amount: def.flat * (def.label.includes('per lite') ? runs.length : 1), key: 'add' });
  }
  if (add.template) notes.push('Template set out on site');

  const tmpl = add.template ? V.addons.template.hours : 0;
  const hours = (L.hours + tmpl) * (add.two ? RATES.twoFitterMult : 1);
  lines.push({ label: 'Fitting labour', detail: `${r2(hours)} h @ ${rate(RATES.labourRate)}`, amount: hours * RATES.labourRate, key: 'labour' });

  return { lines, notes, panels: runs, m2: area, hours, hardware: HW, glassUnit: G, finish: F,
           meta: { lites: runs.length, glass: `${G.label} ${F.label}`, fixings: fix.label } };
}

/* ============================================================== the quote ==
   Cost in, price out. Margin is a margin (a share of the sell price), not a
   markup, because that is the only version that survives someone asking "what
   do I actually keep?".
   ------------------------------------------------------------------------- */

export function priceQuote(state) {
  const V = VERTICALS[state.vertical];
  const L = V.layouts[state.layout];
  const built = ratesFor(state);

  const cost = built.lines.reduce((s, l) => s + l.amount, 0);
  const m = clamp(state.margin, 0.05, 0.9);
  const sell = cost / (1 - m);
  const gross = sell - cost;
  const deposit = sell * RATES.depositPct;
  const m2Display = perM2(built.m2);
  const line = (a) => ({ ...a, amount: a.amount, display: a.amount });

  return {
    vertical: state.vertical,
    lines: built.lines,
    notes: built.notes,
    panels: built.panels,
    meta: built.meta,
    m2: built.m2,
    m2Display,
    hours: r2(built.hours),
    cost, sell, gross, margin: m, deposit,
    perUnitPrice: m2Display > 0 ? sell / m2Display : 0,
    glass: built.glassUnit,
    finish: built.finish,
    hardware: built.hardware,
    layoutLabel: L.label,
    layoutNote: L.note,
    spec: specFor(state, built),
    line,
  };
}

function specFor(state, built) {
  const V = VERTICALS[state.vertical];
  const L = V.layouts[state.layout];
  const G = GLASS[state.thickness];
  const F = FINISH[state.finish];
  const rows = [];
  const dim = (k) => {
    const d = V.dims[k];
    if (!d) return;
    rows.push([d.label, dimLabel(state[k])]);
  };
  dim('w'); dim('h');
  rows.push(['Total glass area', `${q_m2Display(state)} ${M().areaShort}`]);
  rows.push(['Job type', `${L.label} — ${L.note}`]);
  rows.push(['Glass', `${G.label} ${G.desc}`]);
  rows.push(['Finish', F.label]);
  if (V.doors && L.door) rows.push(['Opening', `${V.doors[state.door].label} — ${V.doors[state.door].note}`]);
  if (V.frames) rows.push(['Frame', V.frames[state.frame].label]);
  if (V.fixings) rows.push(['Fixings', V.fixings[state.fixing].label]);
  if (V.hardware) rows.push(['Hardware finish', HARDWARE[state.hardware].label]);
  const ons = Object.entries(state.addons || {}).filter(([, v]) => v).map(([k]) => V.addons[k]?.label).filter(Boolean);
  if (ons.length) rows.push(['Extras', ons.join(', ')]);
  return rows;
}

/* ========================================================== the shop drawing ==
   A proper technical elevation, drawn from the same lite list that prices the
   job. An estimator does not need a 3D render of a shopfront — they need the
   cut sizes and the run dimensions, on something they could screenshot into a
   folder. This is that.
   ------------------------------------------------------------------------- */

export function elevationSVG(state, q, { ink = '#0d2430', acc = '#0e6b52', bg = '#ffffff' } = {}) {
  const V = VERTICALS[state.vertical];
  const P = q.panels;
  const W = state.w, H = state.h;
  const PAD = 118;
  const scale = Math.min(520 / W, 340 / H);
  const dw = W * scale, dh = H * scale;

  const vb = `-130 -70 ${dw + 290} ${dh + 190}`;
  const glassFill = { clear: '#eaf4f2', lowiron: '#f2fbf9', etched: '#e6eaea', bronze: '#f0dfc9', grey: '#dfe3e7', mirror: '#eef3f6' };
  const fill = glassFill[state.finish] || '#eaf4f2';

  let s = `<svg viewBox="${vb}" class="elev" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Technical elevation of the quoted job">
  <defs>
    <pattern id="hatch" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
      <line x1="0" y1="0" x2="0" y2="7" stroke="${acc}" stroke-opacity=".22" stroke-width="1.1"/>
    </pattern>
    <marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 1 L9 5 L0 9 z" fill="${ink}"/>
    </marker>
  </defs>
  <rect x="-130" y="-70" width="${dw + 290}" height="${dh + 190}" fill="${bg}"/>`;

  /* floor line + setting-out */
  s += `<line x1="-70" y1="${dh}" x2="${dw + 70}" y2="${dh}" stroke="${ink}" stroke-width="2.4"/>`;
  for (let i = 0; i < 9; i++) {
    s += `<line x1="${-70 + i * 22}" y1="${dh}" x2="${-92 + i * 22}" y2="${dh + 20}" stroke="${ink}" stroke-opacity=".3" stroke-width="1.2"/>`;
  }

  /* lites */
  const roles = P.map((p) => p.role);
  let cursor = 0;
  P.forEach((p, i) => {
    const pw = p.w * scale, ph = p.h * scale;
    const x = cursor, y = dh - ph;
    const isDoor = p.role === 'door';
    /* a shopfront's lites are drawn as a frame elevation; a shower's as sheets */
    const framed = state.vertical === 'shopfront' || state.vertical === 'balustrade';
    const t = framed ? 7 : 3.2;
    s += `<g>`;
    if (framed) {
      s += `<rect x="${x}" y="${y}" width="${pw}" height="${ph}" fill="none" stroke="${ink}" stroke-width="${t}"/>`;
      s += `<rect x="${x + t / 2}" y="${y + t / 2}" width="${pw - t}" height="${ph - t}" fill="${fill}" stroke="${acc}" stroke-opacity=".5" stroke-width="1"/>`;
    } else {
      s += `<rect x="${x}" y="${y}" width="${pw}" height="${ph}" fill="${fill}" stroke="${acc}" stroke-width="1.6"/>`;
      s += `<rect x="${x}" y="${y}" width="${pw}" height="${ph}" fill="url(#hatch)"/>`;
    }
    /* lite tag */
    const tag = isDoor ? 'DR' : (p.bay ? `G${p.bay}` : p.lite ? `G${p.lite}` : `G${i + 1}`);
    s += `<text x="${x + pw / 2}" y="${y + ph / 2 - 5}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="17" font-weight="700" fill="${ink}">${tag}</text>`;
    s += `<text x="${x + pw / 2}" y="${y + ph / 2 + 17}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="14" fill="${ink}" fill-opacity=".72">${p.w}×${p.h}</text>`;
    s += `</g>`;
    cursor += pw;
  });

  /* overall dimension, below */
  s += `<line x1="0" y1="${dh + 52}" x2="${dw}" y2="${dh + 52}" stroke="${ink}" stroke-width="1.3" marker-start="url(#ar)" marker-end="url(#ar)"/>`;
  s += `<line x1="0" y1="${dh + 6}" x2="0" y2="${dh + 62}" stroke="${ink}" stroke-opacity=".45" stroke-width="1" stroke-dasharray="4 3"/>`;
  s += `<line x1="${dw}" y1="${dh + 6}" x2="${dw}" y2="${dh + 62}" stroke="${ink}" stroke-opacity=".45" stroke-width="1" stroke-dasharray="4 3"/>`;
  s += `<rect x="${dw / 2 - 62}" y="${dh + 40}" width="124" height="24" fill="${bg}"/>`;
  s += `<text x="${dw / 2}" y="${dh + 57}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="16" font-weight="600" fill="${ink}">${dimLabel(W)}</text>`;

  /* height dimension, left */
  s += `<line x1="-64" y1="0" x2="-64" y2="${dh}" stroke="${ink}" stroke-width="1.3" marker-start="url(#ar)" marker-end="url(#ar)"/>`;
  s += `<rect x="-122" y="${dh / 2 - 12}" width="24" height="24" fill="${bg}"/>`;
  s += `<text x="-76" y="${dh / 2}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="16" font-weight="600" fill="${ink}" transform="rotate(-90 -76 ${dh / 2})">${dimLabel(H)}</text>`;

  /* title block */
  const tbY = dh + 74;
  s += `<line x1="-70" y1="${tbY}" x2="${dw + 120}" y2="${tbY}" stroke="${ink}" stroke-opacity=".35" stroke-width="1"/>`;
  s += `<text x="-70" y="${tbY + 22}" font-family="JetBrains Mono, monospace" font-size="13" letter-spacing="1.6" fill="${ink}" fill-opacity=".62">ELEVATION 1:10  ·  ${V.label.toUpperCase()}  ·  ${q.meta.lites} LITE${q.meta.lites > 1 ? 'S' : ''}</text>`;
  s += `<text x="${dw + 120}" y="${tbY + 22}" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="13" letter-spacing="1.6" fill="${acc}">${q.m2Display.toFixed(1)} ${M().areaShort} TOTAL</text>`;

  s += `</svg>`;
  return s;
}

/* =============================================================== plain text ==
   The fallback and the paste-into-your-system path. Same numbers, no layout.
   ------------------------------------------------------------------------- */

export function quoteToText(state, q, ref, seller = {}) {
  const V = VERTICALS[state.vertical];
  const L = V.layouts[state.layout];
  const pad = (s, n) => String(s).padEnd(n, ' ');
  const padL = (s, n) => String(s).padStart(n, ' ');
  const rows = q.lines.map((l) => `  ${pad(l.label, 36)}${padL(money(l.amount), 11)}`).join('\n');
  const spec = q.spec.map(([k, v]) => `  ${pad(k, 20)}${v}`).join('\n');

  return [
    `QUOTATION  ${ref}`,
    seller.name ? seller.name : '',
    seller.terms ? seller.terms : '',
    `Prepared live · valid 14 days`,
    ``,
    `JOB`,
    spec,
    ``,
    `CARRYING ITEMS`,
    rows,
    ``,
    `  ${pad('Total cost', 36)}${padL(money(q.cost), 11)}`,
    `  ${pad(`Margin @ ${Math.round(q.margin * 100)}%`, 36)}${padL(money(q.gross), 11)}`,
    `  ${pad('TOTAL', 36)}${padL(money(q.sell), 11)}`,
    `  ${pad(`Deposit to book (${RATES.depositPct * 100}%)`, 36)}${padL(money(q.deposit), 11)}`,
    `  ${pad('Balance on completion', 36)}${padL(money(q.sell - q.deposit), 11)}`,
    ``,
    `TERMS`,
    `  All glass is ${M().safetyTerm} to the standard on your certificate.`,
    `  Dimensions confirmed before fabrication. Price valid 14 days.`,
    `  Excludes making good, out-of-hours working and concealed services.`,
    ``,
    `  Rate: ${rate(q.perUnitPrice)} per ${M().areaShort} · Lead time ${M().leadDays}`,
  ].filter(Boolean).join('\n');
}

/* ============================================================== market band ==
   A second opinion on whether the number looks about right, worked out from
   the spec rather than from our own cost model. Deliberately wide: shops are
   far enough apart that a small difference means nothing, so a job only gets
   flagged well outside the range.
   ------------------------------------------------------------------------- */

export function marketBand(state) {
  const V = VERTICALS[state.vertical];
  const L = V.layouts[state.layout];
  const G = GLASS[state.thickness];
  const F = FINISH[state.finish];
  const panels = panelsFor(state);
  const area = panels.reduce((s, p) => s + (p.w / 1000) * (p.h / 1000), 0);
  const dis = perM2(area);

  let per;
  if (state.vertical === 'shower') {
    per = 175;
    per *= 0.42 + 0.58 * (G.perM2 / 54);
    per *= 1 + (F.price / 100) * 0.8;
    per *= 1 + (L.hours - 2.5) * 0.055;
    if (L.corner) per *= 1.06;
    if (dis > 7) per *= 1 - Math.min(0.10, (dis - 7) * 0.008);
    if (dis < 3.6) per *= 1 + (3.6 - dis) * 0.035;
  } else if (state.vertical === 'shopfront') {
    per = 210;
    per *= L.glazeMult || 1;
    per *= (V.frames[state.frame]?.mult ?? 1);
    if (state.h > 3000) per *= 1.05;
  } else if (state.vertical === 'splashback') {
    per = 96;
    per *= 0.46 + 0.54 * ((G.perM2 + F.add) / 60);
    per *= L.both ? 1.18 : 1;
    per *= L.tall ? 1.12 : 1;
  } else {
    per = 190;
    per *= 0.4 + 0.6 * (G.perM2 / 97);
    per *= L.rake ? 1.12 : 1;
    if (state.h > 1100) per *= 1.06;
  }

  const mid = Math.max(per * dis, state.vertical === 'splashback' ? 260 : 1400);
  const round = (n) => Math.round(n / 10) * 10;
  return { low: round(mid * 0.80), high: round(mid * 1.24), mid: round(mid) };
}
