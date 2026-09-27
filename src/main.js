/* =========================================================================
   COUNTER — boot
   ========================================================================= */

import './styles.css';
import { createScene } from './scene.js';
import { initTool, toast } from './quote-ui.js';
import { initLeak, initMargin } from './tools.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------- headline */
(function headline() {
  const el = $('#headline-swap');
  if (!el) return;
  const final = 'In 30 seconds.';
  if (reduceMotion) { el.textContent = final; return; }
  el.innerHTML = `<span class="old">In 3 minutes.</span>${final}`;
  requestAnimationFrame(() => {
    setTimeout(() => el.querySelector('.old')?.classList.add('strike'), 700);
  });
})();

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
    document.body.classList.toggle('is-locked', !open);
  });
  menu?.addEventListener('click', (e) => {
    if (e.target.tagName !== 'A') return;
    burger?.setAttribute('aria-expanded', 'false');
    menu.classList.remove('open');
    document.body.classList.remove('is-locked');
  });
})();

/* ----------------------------------------------------------- sticky cta */
(function sticky() {
  const el = $('.sticky-cta');
  const book = $('#book');
  if (!el || !book) return;
  const io = new IntersectionObserver(
    ([e]) => el.classList.toggle('show', !e.isIntersecting && scrollY > 620),
    { threshold: 0.05 }
  );
  io.observe(book);
})();

/* -------------------------------------------------------------- reveals */
(function reveals() {
  const items = $$('[data-reveal]');
  if (reduceMotion) { items.forEach((i) => i.classList.add('in')); return; }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
  );
  items.forEach((i) => io.observe(i));
})();

/* ------------------------------------------------------------- counters */
(function counters() {
  const nodes = $$('[data-count]');
  if (!nodes.length) return;
  if (reduceMotion) {
    nodes.forEach((n) => { n.textContent = (n.dataset.prefix || '') + n.dataset.count + (n.dataset.suffix || ''); });
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const n = e.target;
        io.unobserve(n);
        const to = +n.dataset.count;
        const t0 = performance.now();
        const dur = 1150;
        const step = (now) => {
          const k = Math.min(1, (now - t0) / dur);
          const e2 = 1 - Math.pow(1 - k, 4);
          const v = Math.round(to * e2);
          n.textContent = `${n.dataset.prefix || ''}${v.toLocaleString('en-US')}${n.dataset.suffix || ''}`;
          if (k < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
    },
    { threshold: 0.5 }
  );
  nodes.forEach((n) => io.observe(n));
})();

/* --------------------------------------------------------- strike marks */
(function strikes() {
  const nodes = $$('.strike');
  if (!nodes.length) return;
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('on');
        io.unobserve(e.target);
      }
    },
    { threshold: 0.6 }
  );
  nodes.forEach((n) => io.observe(n));
})();

/* ---------------------------------------------------------- value eq bars */
(function valueEq() {
  const root = $('#eq-rows');
  if (!root) return;
  const io = new IntersectionObserver(
    ([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      for (const fill of $$('.eq-fill', root)) fill.style.width = `${(+fill.dataset.fill * 100).toFixed(0)}%`;
    },
    { threshold: 0.35 }
  );
  io.observe(root);
})();

/* ---------------------------------------------------------------- year */
const yr = $('#yr');
if (yr) yr.textContent = String(new Date().getFullYear());

/* ======================================================================
   The tool
   ====================================================================== */
const canvas = $('#scene');
const fallback = $('#vp-fallback');
let scene = null;

if (canvas) {
  scene = createScene(canvas, {
    onFail() {
      canvas.style.display = 'none';
      if (fallback) fallback.hidden = false;
    },
  });
  if (!scene && fallback) {
    canvas.style.display = 'none';
    fallback.hidden = false;
  }
}

const margin = initMargin({
  onMargin(m) { tool?.setMargin(m); },
});

const tool = initTool({
  scene,
  onQuote(state, q) { margin?.render(state.margin, q); },
});

const leak = initLeak();

/* wire the leak calculator's own margin-free state into nothing else —
   it is deliberately standalone so both free tools work with no cross-talk. */
if (leak) leak.render();

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
  // eslint-disable-next-line no-console
  console.info('[COUNTER] booking form submit →', data);
  form.querySelectorAll('input,textarea,select,button').forEach((el) => (el.disabled = true));
  const ok = $('#bf-ok');
  if (ok) ok.hidden = false;
  toast('<b>Sent.</b> I read these myself — expect an honest answer, not a brochure.');
});

/* ------------------------------------------------------ cta instrumentation
   Fires a `cta_click` event with the placement so you can plug in whatever
   analytics you use without touching the markup.
   ------------------------------------------------------------------------- */
for (const a of $$('[data-cta]')) {
  a.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('cta_click', { detail: { placement: a.dataset.cta } }));
    // eslint-disable-next-line no-console
    console.info('[COUNTER] cta_click', a.dataset.cta);
  });
}

/* ------------------------------------------------------------- deep links */
if (location.hash === '#book-form') {
  setTimeout(() => $('#book-form')?.scrollIntoView({ block: 'center' }), 400);
}

/* --------------------------------------------------------------- console */
console.info(
  '%cCOUNTER%c — the demo on this page is a real cost model, not a video.',
  'background:#5FF3DC;color:#04100E;padding:3px 8px;border-radius:4px;font-weight:700',
  'color:#5F6B7B'
);
