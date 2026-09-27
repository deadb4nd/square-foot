/* =========================================================================
   COUNTER — boot
   ========================================================================= */

import './styles.css';
import { createScene } from './scene.js';
import { initTool, toast } from './quote-ui.js';
import { initLeak, initMarkup } from './calculators.js';
import { money, delayLabel } from './tools.js';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ nav */
(function nav() {
  const burger = $('[data-burger]');
  const menu = $('[data-mobile-nav]');

  burger?.addEventListener('click', () => {
    const open = burger.getAttribute('aria-expanded') === 'true';
    burger.setAttribute('aria-expanded', String(!open));
    menu?.classList.toggle('open', !open);
  });
  menu?.addEventListener('click', (e) => {
    if (e.target.tagName !== 'A') return;
    burger?.setAttribute('aria-expanded', 'false');
    menu.classList.remove('open');
  });
})();

/* ----------------------------------------------------------- sticky cta */
(function sticky() {
  const el = $('#sticky-cta');
  const book = $('#book');
  if (!el) return;
  document.body.classList.add('has-cta');

  const set = () => {
    const past = scrollY > 620;
    const done = book && book.getBoundingClientRect().top < innerHeight * 0.6;
    el.classList.toggle('on', past && !done);
  };

  addEventListener('scroll', set, { passive: true });
  addEventListener('resize', set);
  if (book) new IntersectionObserver(set).observe(book);
  set();
})();

/* -------------------------------------------------------------- reveals */
(function reveals() {
  const items = $$('[data-reveal]');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    items.forEach((i) => i.classList.add('in'));
    return;
  }

  /* Kept pending until the panel has actually been reached, so the sweep
     below can still catch it. */
  const pending = new Set(items);
  const show = (el) => { pending.delete(el); el.classList.add('in'); };

  const io = new IntersectionObserver(
    (entries) => { for (const e of entries) if (e.isIntersecting) { show(e.target); io.unobserve(e.target); } },
    { rootMargin: '0px 0px -6% 0px', threshold: 0 }
  );
  items.forEach((i) => io.observe(i));

  /* IntersectionObserver can coalesce a fast scroll and step straight over a
     tall panel, leaving it at opacity 0 forever. Sweep on scroll as a net. */
  let queued = false;
  const sweep = () => {
    queued = false;
    for (const el of [...pending]) {
      if (el.getBoundingClientRect().top < window.innerHeight * 0.97) {
        show(el);
        io.unobserve(el);
      }
    }
    if (!pending.size) window.removeEventListener('scroll', onScroll);
  };
  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(sweep);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

/* ----------------------------------------------------------------- faq */
(function faq() {
  for (const q of $$('[data-faq-q]')) {
    q.addEventListener('click', () => {
      const open = q.getAttribute('aria-expanded') === 'true';
      q.setAttribute('aria-expanded', String(!open));
      q.nextElementSibling?.classList.toggle('on', !open);
    });
  }
})();

/* ------------------------------------------------------- free calculators
   Both stand alone — no shared state, so a visitor can use either one without
   the other being involved at all.
   ------------------------------------------------------------------------- */
/* The leak bench splits its inputs and its result across two columns, so both
   halves are wired against the document rather than one root. */
initLeak();

const markupRoot = $('#markup-calc');
if (markupRoot) initMarkup(markupRoot);

/* ------------------------------------------------------------- the tool */
const canvas = $('#scene');
let scene = null;

if (canvas) {
  try {
    scene = createScene(canvas, {
      onFail: () => {
        const fb = $('#vp-fallback');
        if (fb) fb.hidden = false;
        canvas.style.display = 'none';
      },
    });
  } catch (err) {
    const fb = $('#vp-fallback');
    if (fb) fb.hidden = false;
    canvas.style.display = 'none';
  }
}

const tool = initTool({ scene, onQuote() {} });

/* ------------------------------------------------------------ year stamp */
const yr = $('#yr');
if (yr) yr.textContent = String(new Date().getFullYear());

/* ------------------------------------------------------------- booking CTA
   No backend, so the button opens the visitor's mail app with their own
   numbers already filled in. Point BOOK_EMAIL at a real inbox, or set
   BOOK_URL to a scheduling link and the button becomes that link instead.
   ------------------------------------------------------------------------- */
const BOOK_EMAIL = 'hello@counter.build';   // TODO(owner): real inbox
const BOOK_URL   = '';                      // TODO(owner): calendar link, if any

function bookingLink() {
  const leak = document.__leak || {};
  const m = leak.model;
  const v = leak.inputs || {};
  const rows = ['Hi,', '', 'I used the quote leak tool on your site.', ''];
  if (m) {
    rows.push(
      `Quotes I send each month: ${v.quotesPerMonth}`,
      `Price of one job: ${money(v.avgJobValue)}`,
      `Time to send a quote: ${delayLabel(v.delayMinutes)}`,
      `How many I win: ${v.closeRate}%`,
      '',
      `You worked out I lose ${money(m.unclosed)} a year by being slow.`
    );
  }
  rows.push('', 'I would like to talk about fixing it.', '', 'Thanks,');

  if (BOOK_URL) return BOOK_URL;
  return `mailto:${BOOK_EMAIL}?subject=${encodeURIComponent('Quote desk leak - 20 min call')}` +
         `&body=${encodeURIComponent(rows.join('\n'))}`;
}

for (const b of $$('[data-book]')) b.setAttribute('href', bookingLink());

/* ------------------------------------------------------ cta instrumentation
   Fires a `cta_click` event with the placement so you can plug in whatever
   analytics you use without touching the markup.
   ------------------------------------------------------------------------- */
for (const a of $$('[data-cta]')) {
  a.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('cta_click', { detail: { placement: a.dataset.cta } }));
  });
}

/* ------------------------------------------------------------- console */
console.info(
  '%cCOUNTER%c — the calculator and the demo on this page both run in your browser.',
  'background:#0d4e6b;color:#fff;padding:3px 8px;border-radius:4px;font-weight:700',
  'color:#66757f'
);
