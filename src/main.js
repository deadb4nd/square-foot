/* =========================================================================
   COUNTER — boot
   ========================================================================= */

import './styles.css';
import { createScene } from './scene.js';
import { initTool, toast } from './quote-ui.js';
import { initLeak, initGate, initMarkup } from './calculators.js';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ nav */
(function nav() {
  const bar = $('#nav');
  const burger = $('[data-burger]');
  const menu = $('[data-mobile-nav]');
  onScroll();
  addEventListener('scroll', onScroll, { passive: true });
  function onScroll() { bar?.classList.toggle('stuck', scrollY > 12); }

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
  if (!el || !book) return;

  const set = () => {
    const past = scrollY > 700;
    const done = past && book.getBoundingClientRect().top < innerHeight * 0.5;
    el.classList.toggle('on', past && !done);
  };

  addEventListener('scroll', set, { passive: true });
  addEventListener('resize', set);
  new IntersectionObserver(set).observe(book);
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

/* --------------------------------------------------- sticky hero tool --- */
(function stickyHero() {
  const col = $('.hero-right');
  if (!col) return;
  const fit = () => {
    /* Only stick when the whole tool fits, otherwise the controls at the
       bottom of the column end up below the fold and unreachable. */
    const wide = window.matchMedia('(min-width: 1120px)').matches;
    const roomy = col.scrollHeight + 108 < window.innerHeight;
    col.classList.toggle('is-sticky', wide && roomy);
  };
  addEventListener('resize', fit, { passive: true });
  fit();
  setTimeout(fit, 400);
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
/* The leak calculator is deliberately split: the inputs and the headline
   number sit in the hero, the breakdown and the email gate sit in the panel
   below it. So it is wired against the document, not a single root. */
initLeak();
initGate();

const markupRoot = $('#markup');
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

/* ------------------------------------------------------ form (no backend)
   TODO(owner): point this at your inbox.
   Options, cheapest first:
     - Formspree / Basin / Web3Forms drop-in (paste the endpoint URL)
     - mailto: fallback (works with zero setup, less pretty)
     - a tiny serverless function
   Everything below is the client-side half and already handles validation,
   the success state and the analytics hook.
   ------------------------------------------------------------------------- */
const form = $('#book-form');
form?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!form.reportValidity()) return;
  const data = Object.fromEntries(new FormData(form).entries());
  window.dispatchEvent(new CustomEvent('booking_submit', { detail: data }));
  form.querySelectorAll('input,textarea,select,button').forEach((el) => { el.disabled = true; });
  $('#book-ok')?.classList.add('on');
  toast('<b>Sent.</b> I read these myself — expect an honest answer, not a brochure.');
});

/* the lead-magnet gate, same story: hand the email + model to your ESP */
window.__onGate = ({ email, model }) => {
  window.dispatchEvent(new CustomEvent('lead_gate_submit', { detail: { email, model } }));
};

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
