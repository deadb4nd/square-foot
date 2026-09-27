/* Smoke test: boot the real built page in a real browser and assert that the
   parts a visitor actually touches came up. Run with the preview server up:
     node tools/smoke.mjs                                                    */

import puppeteer from 'puppeteer-core';

const URL = process.env.URL || 'http://localhost:4173/';
const fails = [];
const ok = (cond, label) => { if (!cond) fails.push(label); };

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  args: [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
    '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-webgl',
    '--hide-scrollbars',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 950, deviceScaleFactor: 1 });

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()}`));

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 45000 });
await new Promise((r) => setTimeout(r, 1200));

/* ---------------------------------------------------------------- leak bench */
const leak = await page.evaluate(() => {
  const big = document.querySelector('#lk-big');
  const bars = [...document.querySelectorAll('.rate-track i')].map((i) => i.style.width);
  return {
    big: big?.textContent?.trim() || '',
    sub: document.querySelector('#lk-sub')?.textContent?.trim().length || 0,
    leaks: document.querySelectorAll('#lk-leaks .leak').length,
    verdicts: document.querySelector('#lk-verdict')?.textContent?.trim().length || 0,
    money: document.querySelector('#money-gap')?.textContent?.trim() || '',
    bars,
    verdictIn: document.querySelector('#lk-verdict')?.textContent?.trim() || '',
  };
});
ok(/^£[\d,]+$/.test(leak.big), `leak headline is a figure (got "${leak.big}")`);
ok(leak.sub > 40, 'leak sub-copy rendered');
ok(leak.leaks >= 1, `leak list has items (got ${leak.leaks})`);
ok(leak.verdicts > 20, 'leak verdict rendered');
ok(/^£[\d,]+$/.test(leak.money), `money section bound to leak (got "${leak.money}")`);
ok(leak.bars.length === 2 && leak.bars.every((w) => w && w.endsWith('%')), 'both rate bars sized');

/* ------------------------------------------------------------- markup check */
const mk = await page.evaluate(() => ({
  gross: document.querySelector('#mk-gross-pct')?.textContent?.trim() || '',
  rows: document.querySelectorAll('#mk-rows > div').length,
  needed: document.querySelector('#mk-needed')?.textContent?.trim() || '',
}));
ok(/%$/.test(mk.gross), `markup gross is a percentage (got "${mk.gross}")`);
ok(mk.rows >= 5, `markup breakdown has rows (got ${mk.rows})`);
ok(/^[£$€][\d,]+$/.test(mk.needed), `markup "needed" is money (got "${mk.needed}")`);

/* --------------------------------------------------------------- the desk */
const desk = await page.evaluate(() => ({
  groups: document.querySelectorAll('#ctls .ctl-group').length,
  ranges: document.querySelectorAll('#ctls input[type=range]').length,
  segs: document.querySelectorAll('#ctls [data-seg]').length,
  lines: document.querySelectorAll('#lines .ln').length,
  total: document.querySelector('#t-total')?.textContent?.trim() || '',
  cost: document.querySelector('#t-cost')?.textContent?.trim() || '',
  spec: document.querySelectorAll('#q-spec, #t-spec > div').length,
  hud: document.querySelector('#hud-size')?.textContent?.trim() || '',
  band: document.querySelector('#t-market')?.textContent?.trim().length || 0,
  draw: document.querySelector('#drawing svg') ? 1 : 0,
  mm: [...document.querySelectorAll('#ctls .range-lab .mono')].map((b) => b.textContent.trim()),
}));
ok(desk.groups === 5, `five control groups (got ${desk.groups})`);
ok(desk.ranges >= 2, `size ranges built (got ${desk.ranges})`);
ok(desk.segs >= 3, `segmented groups built (got ${desk.segs})`);
ok(desk.lines >= 5, `quote line items (got ${desk.lines})`);
ok(/^[£$€][\d,]+$/.test(desk.total), `customer total is money (got "${desk.total}")`);
ok(/^[£$€][\d,]+$/.test(desk.cost), `cost is money (got "${desk.cost}")`);
ok(desk.spec >= 4, `spec table filled (got ${desk.spec})`);
ok(desk.band > 30, 'market band line rendered');
ok(/mm$/.test(desk.mm[0] || ''), `dimension label in mm (got "${desk.mm[0]}")`);
ok(!desk.mm.some((s) => /mm\s*mm/.test(s)), 'no duplicated mm in dimension labels');
ok(desk.draw === 1, 'technical elevation drawn');

/* changing a control must move the price */
const before = desk.total;
await page.evaluate(() => {
  const r = document.querySelector('#w');
  r.value = String(Number(r.max));
  r.dispatchEvent(new Event('input', { bubbles: true }));
});
const after = await page.evaluate(() => document.querySelector('#t-total').textContent.trim());
ok(before !== after, `widening the job changes the price (${before} -> ${after})`);

/* every vertical has to build controls and a drawing */
for (const v of ['shower', 'shopfront', 'splashback', 'balustrade']) {
  await page.click(`#vert-switch button[data-vert="${v}"]`);
  await new Promise((r) => setTimeout(r, 220));
  const s = await page.evaluate(() => ({
    groups: document.querySelectorAll('#ctls .ctl-group').length,
    lines: document.querySelectorAll('#lines .ln').length,
    draw: document.querySelector('#drawing svg') ? 1 : 0,
    total: document.querySelector('#t-total')?.textContent?.trim() || '',
  }));
  ok(s.groups === 5, `${v}: control groups built (got ${s.groups})`);
  ok(s.lines >= 4, `${v}: line items present (got ${s.lines})`);
  ok(s.draw === 1, `${v}: elevation drawn`);
  ok(/^[£$€][\d,]+$/.test(s.total), `${v}: total is money (got "${s.total}")`);
}

/* ----------------------------------------------------------------- market */
const markets = [];
for (const m of ['eur', 'usd', 'gbp']) {
  await page.click(`.market-btn[data-market="${m}"]`);
  await new Promise((r) => setTimeout(r, 260));
  markets.push(await page.evaluate(() => ({
    id: document.documentElement.dataset.currency,
    total: document.querySelector('#t-total')?.textContent?.trim() || '',
    big: document.querySelector('#lk-big')?.textContent?.trim() || '',
    gross: document.querySelector('#mk-gross-pct')?.textContent?.trim() || '',
    dim: document.querySelector('#hud-size')?.textContent?.trim() || '',
    spec: document.querySelector('#t-spec')?.textContent || '',
    pressed: document.querySelector('.market-btn[aria-pressed="true"]')?.dataset.market,
  })));
}
ok(markets.every((x) => x.pressed === x.id), 'pressed state follows the market');
ok(new Set(markets.map((x) => x.total)).size === 3, `totals differ per market (${markets.map((x) => x.total).join(' / ')})`);
ok(markets.every((x) => /^€[\d,]+$/.test(x.total)), 'EUR shows euros');
ok(markets.every((x) => /^£[\d,]+$/.test(x.total)), 'GBP shows pounds');
{
  const usd = markets.find((x) => x.id === 'usd');
  ok(/"[^"]*"|'\d/.test(usd.dim), `US market reads feet and inches (got "${usd.dim}")`);
  ok(!/sq ft/.test(usd.spec) === false || /sq ft/.test(usd.spec), 'US spec is in sq ft');
}

/* ------------------------------------------------------------------- faq */
await page.click('#faq-list [data-faq-q]');
await new Promise((r) => setTimeout(r, 420));
const faq = await page.evaluate(() => {
  const open = document.querySelector('.faq-a.on');
  return { open: !!open, h: open ? open.getBoundingClientRect().height : 0, expanded: document.querySelector('[data-faq-q][aria-expanded="true"]') !== null };
});
ok(faq.open && faq.h > 20, `faq panel opens (h=${Math.round(faq.h)})`);
ok(faq.expanded, 'faq sets aria-expanded');

/* --------------------------------------------------------------- reveals */
await page.evaluate(() => scrollTo(0, document.body.scrollHeight * 0.45));
await new Promise((r) => setTimeout(r, 900));
const rev = await page.evaluate(() => {
  const all = [...document.querySelectorAll('[data-reveal]')];
  const shown = all.filter((e) => getComputedStyle(e).opacity === '1');
  return { total: all.length, shown: shown.length };
});
ok(rev.shown >= rev.total * 0.8, `most reveals fired (${rev.shown}/${rev.total})`);

const bar = await page.evaluate(() => document.querySelector('#progress-fill').style.transform);
ok(/scaleX\(0?\.?[1-9]/.test(bar) || /scaleX\(1\)/.test(bar), `progress bar advanced (${bar})`);

/* ------------------------------------------------------------- a11y basics */
const a11y = await page.evaluate(() => ({
  h1: document.querySelectorAll('h1').length,
  imgNoAlt: [...document.querySelectorAll('img')].filter((i) => !i.alt).length,
  inputNoLabel: [...document.querySelectorAll('input, select')].filter((i) => {
    if (i.type === 'hidden') return false;
    return !i.closest('label') && !i.getAttribute('aria-label') && !document.querySelector(`label[for="${i.id}"]`);
  }).length,
  btnNoName: [...document.querySelectorAll('button, a')].filter((b) =>
    !(b.textContent || '').trim() && !b.getAttribute('aria-label') && !b.querySelector('[class*=sr], .sr-only, i[class]')).length,
  lang: document.documentElement.lang,
  title: document.title,
}));
ok(a11y.h1 === 1, `exactly one h1 (got ${a11y.h1})`);
ok(a11y.imgNoAlt === 0, 'no images without alt text');
ok(a11y.inputNoLabel === 0, `every input is labelled (${a11y.inputNoLabel} unlabelled)`);
ok(a11y.btnNoName === 0, `every control has a name (${a11y.btnNoName} unnamed)`);
ok(!!a11y.lang && !!a11y.title, 'document has lang and title');

/* ------------------------------------------------------------ mobile pass */
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await new Promise((r) => setTimeout(r, 700));
const mob = await page.evaluate(() => {
  const de = document.documentElement;
  const over = [...document.querySelectorAll('body *')]
    .filter((e) => e.getBoundingClientRect().width > 0)
    .map((e) => ({ t: e.tagName + '.' + (e.className?.toString?.().slice(0, 30) || ''), r: Math.round(e.getBoundingClientRect().right) }))
    .filter((x) => x.r > window.innerWidth + 2)
    .slice(0, 6);
  return { scrollW: de.scrollWidth, innerW: window.innerWidth, over, railShown: getComputedStyle(document.querySelector('#rail')).display };
});
ok(mob.scrollW <= mob.innerW + 2, `no horizontal scroll on mobile (${mob.scrollW} vs ${mob.innerW})`);
ok(mob.railShown === 'none', `section rail hidden on mobile (${mob.railShown})`);
if (mob.over.length) console.log('  overflow candidates:', JSON.stringify(mob.over));

/* ------------------------------------------------------------------ print */
const printable = await page.evaluate(() => {
  const a = [...document.querySelectorAll('[data-book]')][0];
  return { href: a?.getAttribute('href') || '', mailto: (a?.getAttribute('href') || '').startsWith('mailto:') };
});
ok(printable.mailto, `booking is a mailto (${printable.href.slice(0, 40)}…)`);
ok(printable.href.includes('quote'), 'booking mailto is a live mailto');

/* ------------------------------------------------------------------ shots */
await page.setViewport({ width: 1440, height: 950 });
await page.evaluate(() => scrollTo(0, 0));
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: '/tmp/opencode/sf-1-hero.png' });
for (const [name, sel] of [['2-leak', '#lk-result'], ['3-desk', '#desk'], ['4-markup', '#markup-calc'], ['5-stack', '#stack'], ['6-how', '#how'], ['7-money', '#money'], ['8-proof', '#proof'], ['9-faq', '#faq'], ['10-book', '#book']]) {
  await page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'start' }), sel);
  await new Promise((r) => setTimeout(r, 550));
  await page.screenshot({ path: `/tmp/opencode/sf-${name}.png` });
}
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await page.evaluate(() => scrollTo(0, 0));
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: '/tmp/opencode/sf-m1-hero.png' });
await page.evaluate(() => document.querySelector('#ctls')?.scrollIntoView({ block: 'center' }));
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: '/tmp/opencode/sf-m2-desk.png' });

/* ------------------------------------------------------------------ report */
const ignorable = (m) => /favicon|ERR_|net::|Failed to load resource|WebGL|SwiftShader|GPU|swiftshader|GroupMarkerNotSet|Automatic fallback/i.test(m);
const real = errors.filter((e) => !ignorable(e));

await browser.close();

console.log('');
console.log('leak      :', leak.big, '|', leak.money, 'in the offer |', leak.leaks, 'leaks');
console.log('markup    :', mk.gross, '| needs', mk.needed);
console.log('markets   :', markets.map((m) => `${m.id}=${m.total}/${m.big}`).join('  '));
console.log('desk dim  :', desk.mm.join(' , '), '| usd dim:', markets.find((m) => m.id === 'usd')?.dim);
console.log('reveals   :', `${rev.shown}/${rev.total}`);
console.log('mobile    :', mob.scrollW, 'vs', mob.innerW);
console.log('');
if (real.length) { console.log('CONSOLE ERRORS'); for (const e of real) console.log('  !', e); }
if (fails.length) { console.log('FAILED'); for (const f of fails) console.log('  x', f); process.exitCode = 1; }
else console.log('all assertions passed');
