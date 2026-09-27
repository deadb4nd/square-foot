/* =============================================================================
   market.js — the one place a country lives

   The cost model is physical: millimetres, square metres, and a base price book.
   Everything a market changes — currency, the area unit a shop sells in, the
   word a shop uses for "it breaks instead of bending" — is applied here, at the
   edge, so no pricing code ever has to know where it is running.
   ========================================================================== */

const M2_PER_SQFT = 0.09290304;   // 1 m² = 10.7639 ft²
const MM_PER_INCH = 25.4;

/* A price book is written in base units (GBP per m²). A market is a multiplier
   on that book plus its own currency and units. The multiplier is a real
   difference in the underlying trade price, not a conversion rate — glass and
   labour both cost more per m² in New York than in Leeds, and a page that
   pretended otherwise would be quoting nonsense. */
export const MARKETS = {
  gbp: {
    id: 'gbp',
    flag: '🇬🇧',
    name: 'United Kingdom',
    currency: 'GBP',
    symbol: '£',
    dec: 0,
    area: 'm2',
    areaLong: 'square metre',
    areaShort: 'm²',
    priceUnit: 'm²',
    perM2: 1,
    factor: 1,
    safetyTerm: 'toughened safety glass',
    labourWord: 'fitters',
    leadDays: '3–5 working days',
    taxNote: 'prices exclude VAT',
    page: 'A4',
  },
  eur: {
    id: 'eur',
    flag: '🇪🇺',
    name: 'Ireland / EU',
    currency: 'EUR',
    symbol: '€',
    dec: 0,
    area: 'm2',
    areaLong: 'square metre',
    areaShort: 'm²',
    priceUnit: 'm²',
    perM2: 1,
    factor: 1.16,
    safetyTerm: 'tempered safety glass',
    labourWord: 'glaziers',
    leadDays: '5–10 working days',
    taxNote: 'prices exclude VAT',
    page: 'A4',
  },
  usd: {
    id: 'usd',
    flag: '🇺🇸',
    name: 'United States',
    currency: 'USD',
    symbol: '$',
    dec: 0,
    area: 'sqft',
    areaLong: 'square foot',
    areaShort: 'sq ft',
    priceUnit: 'sq ft',
    perM2: M2_PER_SQFT,
    factor: 1.44,
    safetyTerm: 'tempered safety glass',
    labourWord: 'glaziers',
    leadDays: '5–10 working days',
    showInches: true,
    taxNote: 'plus applicable sales tax',
    page: 'letter',
  },
};

export const MARKET_IDS = Object.keys(MARKETS);

let current = MARKETS.gbp;
const listeners = new Set();

export function getMarket() { return current; }

export function setMarket(id) {
  const m = MARKETS[id];
  if (!m || m === current) return current;
  current = m;
  try { localStorage.setItem('sf-market', m.id); } catch { /* private mode */ }
  for (const fn of listeners) fn(m);
  document.documentElement.lang = 'en';
  return m;
}

export function onMarketChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function initMarket() {
  let saved = null;
  try { saved = localStorage.getItem('sf-market'); } catch { /* ignore */ }
  if (saved && MARKETS[saved]) current = MARKETS[saved];
  return current;
}

/* ------------------------------------------------------------------ units --
   Area is stored in m² everywhere. These are the only two conversions in the
   codebase, and both are exact.
   ------------------------------------------------------------------------ */

export const toDisplayArea = (m2) => (current.area === 'm2' ? m2 : m2 * 10.7639104167);
export const fromDisplayArea = (v) => (current.area === 'm2' ? v : v / 10.7639104167);
export const areaScale = () => (current.area === 'm2' ? 1 : 10.7639104167);

export const mmToInches = (mm) => mm / MM_PER_INCH;
export const mmToFeetInches = (mm) => {
  const total = mmToInches(mm);
  const ft = Math.floor(total / 12);
  const inch = Math.round((total - ft * 12) * 8) / 8;   // nearest 1/8"
  return inch === 12 ? `${ft + 1}'0"` : `${ft}'${inch}"`;
};

/** A dimension as it gets said out loud in the current market. */
export const dimLabel = (mm) => (current.showInches
  ? mmToFeetInches(mm)
  : `${Math.round(mm).toLocaleString('en-GB')} mm`);

/* ----------------------------------------------------------------- money --
   Base-currency cost → local currency, rounded the way a shop rounds: to the
   nearest whole unit for a quote, and to the nearest 5 when a per-unit rate
   needs to look like a rate rather than a number.
   ------------------------------------------------------------------------ */

export const toLocal = (baseAmount) => baseAmount * current.factor;

export function money(baseAmount, opts = {}) {
  const v = toLocal(baseAmount);
  return current.symbol + Math.round(v).toLocaleString('en-GB');
}

/** A price-per-unit rate, rounded to a believable rate rather than to the penny. */
export function rate(baseAmount) {
  const v = toLocal(baseAmount);
  const step = v < 40 ? 0.5 : v < 200 ? 1 : 5;
  return current.symbol + (Math.round(v / step) * step).toLocaleString('en-GB', {
    minimumFractionDigits: step < 1 ? 1 : 0,
    maximumFractionDigits: step < 1 ? 1 : 0,
  });
}

export const perUnit = () => `${current.symbol}/${current.priceUnit}`;
export const areaUnit = () => current.areaShort;
