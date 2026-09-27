/* =========================================================================
   SQUAREFOOT — boot

   One place for the things that are true about the business, so the rest of
   the code never has to know them: the inbox, the booking link, the seller
   identity that goes on a quote, and the domain.

   Nothing on this page is sent anywhere. The calculators and the configurator
   run in the visitor's browser, and the only outbound action is a mailto the
   visitor has to click themselves.
   ========================================================================= */

import './styles.css';
import { initMarket, setMarket, getMarket, MARKET_IDS, money } from './market.js';
import { createHeroGlass } from './hero-glass.js';
import { createScene } from './scene.js';
import { initTool } from './quote-ui.js';
import { initLeak, initMarkup } from './calculators.js';
import { initScroll } from './scroll.js';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ====================================================== business constants ==
   TODO(owner): replace every value here. Nothing else needs editing to go live.
   ------------------------------------------------------------------------ */

export const CONFIG = {
  domain:    'squarefoot.build',
  email:     'hello@squarefoot.build',
  /* A real scheduling link, if you have one. Left empty, the call to action
     opens the visitor's mail client with their own numbers already written in,
     which is better than a fake calendar page. */
  bookingURL: '',

  /* Goes on the quotation the visitor generates. */
  seller: {
    name:  'SQUAREFOOT',
    terms: 'Custom quoting desk — built on your own price book',
  },

  /* Printed under the offer, next to the calculator that produced it. */
  buildShareOfGap: 0.35,
};

/* ==================================================================== nav */

(function nav() {
  const burger = $('[data-burger]');
  const menu = $('[data-mobile-nav]');
  if (!burger || !menu) return;

  const close = () => {
    burger.setAttribute('aria-expanded', 'false');
    menu.classList.remove('open');
  };

  burger.addEventListener('click', () => {
    const open = burger.getAttribute('aria-expanded') === 'true';
    burger.setAttribute('aria-expanded', String(!open));
    menu.classList.toggle('open', !open);
  });
  menu.addEventListener('click', (e) => { if (e.target.tagName === 'A') close(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
})();

/* =============================================================== market ==
   Three buttons, one saved preference, and everything on the page re-stated
   in the new currency and units.
   ------------------------------------------------------------------------ */

function initMarketSwitch() {
  initMarket();
  const M = getMarket();
  document.documentElement.dataset.currency = M.id;

  const paint = () => {
    const cur = getMarket();
    for (const b of $$('[data-market]')) {
      b.setAttribute('aria-pressed', String(b.dataset.market === cur.id));
    }
    document.documentElement.dataset.currency = cur.id;
  };

  for (const b of $$('[data-market]')) {
    b.addEventListener('click', () => {
      const before = getMarket().id;
      setMarket(b.dataset.market);
      if (getMarket().id === before) return;
      paint();
    });
  }

  if (!MARKET_IDS.includes(M.id)) setMarket('gbp');
  paint();
}

/* ============================================================ sticky cta */

(function sticky() {
  const el = $('#sticky-cta');
  const book = $('#book');
  const txt = $('#sticky-txt');
  if (!el) return;
  document.body.classList.add('has-cta');

  let queued = false;
  const set = () => {
    queued = false;
    const past = scrollY > 560;
    const done = book ? book.getBoundingClientRect().top < innerHeight * 0.55 : false;
    el.classList.toggle('on', past && !done);

    /* the sticky line reports the visitor's own number once they have one */
    const leak = document.__leak?.model;
    if (txt && leak) {
      txt.textContent = leak.recoverable > 0
        ? `That is ${money(leak.recoverable)} a year. One call to see if it is real.`
        : 'Twenty minutes. One quote. A straight answer.';
    }
  };

  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(set); } }, { passive: true });
  addEventListener('resize', set);
  if (book) new IntersectionObserver(set).observe(book);
  set();
})();

/* =================================================================== faq */

(function faq() {
  for (const q of $$('[data-faq-q]')) {
    q.addEventListener('click', () => {
      const open = q.getAttribute('aria-expanded') === 'true';
      const panel = q.nextElementSibling;
      for (const other of $$('[data-faq-q]')) {
        if (other === q) continue;
        other.setAttribute('aria-expanded', 'false');
        other.nextElementSibling?.classList.remove('on');
      }
      q.setAttribute('aria-expanded', String(!open));
      panel?.classList.toggle('on', !open);
    });
  }
})();

/* ====================================================== the money section ==
   The offer is priced against the number the visitor just produced, so the
   section reads their gap back to them rather than a figure we invented.
   ------------------------------------------------------------------------ */

function initMoneyLink() {
  const gapEl   = $('#money-gap');
  const aEl     = $('#money-share-a');
  const bEl     = $('#money-share-b');
  const cEl     = $('#money-share-c');
  if (!gapEl || !aEl) return;

  const round = (n) => {
    const step = n > 40000 ? 2500 : n > 8000 ? 500 : n > 1500 ? 100 : 50;
    return Math.round(n / step) * step;
  };

  const set = (m) => {
    const gap = m?.recoverable || 0;
    gapEl.textContent = money(gap);
    aEl.textContent = money(gap);
    bEl.textContent = money(gap / 2);
    cEl.textContent = money(round(gap * CONFIG.buildShareOfGap));
  };

  addEventListener('leak:update', (e) => set(e.detail));
  set(document.__leak?.model);
}

/* ============================================================== the 3d ==
   Two independent scenes. Either one failing takes nothing else with it:
   the hero falls back to a static gradient, the configurator to its drawing.
   ------------------------------------------------------------------------ */

function safeScene(create, canvasSel, onFail) {
  const canvas = $(canvasSel);
  if (!canvas) return null;
  try {
    return create(canvas, {
      onFail: () => {
        onFail?.();
        canvas.hidden = true;
      },
    });
  } catch (err) {
    console.warn('[SQUAREFOOT] 3D unavailable, carrying on without it', err);
    onFail?.();
    canvas.hidden = true;
    return null;
  }
}

/* ================================================================ boot */

initMarketSwitch();
initScroll();

safeScene(createHeroGlass, '#hero-canvas', () => {
  $('.hero-fallback')?.classList.add('on');
});

const scene = safeScene(createScene, '#scene', () => {
  const fb = $('#vp-fallback');
  if (fb) fb.hidden = false;
});

initLeak();
const markupRoot = $('#markup-calc');
if (markupRoot) initMarkup(markupRoot);

initTool({ scene, onQuote() {} });
initMoneyLink();

/* ============================================================= booking ==
   The call to action carries the visitor's own numbers into the conversation,
   so the first message is already specific.
   ------------------------------------------------------------------------ */

function bookingLink() {
  const leak = document.__leak?.model;
  const v = document.__leak?.inputs || {};

  const rows = ['Hi,', '', 'I used the quote leak tool on your site.'];
  if (leak) {
    rows.push(
      '',
      `Quotes I send each month: ${v.quotesPerMonth}`,
      `Price of one job: ${money(v.avgJobValue)}`,
      `Time to get the quote out: ${leak.delayMins ? Math.round(leak.delayMins / 60) + ' h' : '—'}`,
      `How many I win: ${v.closeRate}%`,
      '',
      `The tool worked out I lose ${money(leak.recoverable)} a year by being slow.`
    );
  }
  rows.push('', 'I would like to talk about fixing it.', '', 'Thanks,');

  if (CONFIG.bookingURL) return CONFIG.bookingURL;
  return `mailto:${CONFIG.email}?subject=${encodeURIComponent('Quote desk — 20 min call')}` +
         `&body=${encodeURIComponent(rows.join('\n'))}`;
}

for (const b of $$('[data-book]')) b.setAttribute('href', bookingLink());

/* ====================================================== small page chores */

const yr = $('#yr');
if (yr) yr.textContent = String(new Date().getFullYear());

for (const a of $$('[data-mail]')) a.textContent = CONFIG.email;

for (const a of $$('[data-cta]')) {
  a.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('cta_click', { detail: { placement: a.dataset.cta } }));
  });
}

/* Smooth in-page movement, but never for someone who has asked for none. */
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href').slice(1);
    const el = id && document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: 'smooth', block: id === 'top' ? 'start' : 'start' });
    history.replaceState(null, '', `#${id}`);
  });
}

console.info(
  '%cSQUAREFOOT%c — the calculators and the configurator on this page all run in your browser. Nothing is sent.',
  'background:#0b1a20;color:#63e3bd;padding:3px 8px;border-radius:4px;font-weight:700',
  'color:#6b7f88'
);
