/* =========================================================================
   scroll.js — the deliberate part

   A landing page that is one long column gives a visitor no signal that there
   is more of it. This module makes reading the page a visible act:

     · a progress bar, so length is never a surprise
     · a section rail with live position, so the shape of the page is known
       before it is reached
     · a cue in the hero that names what is below it, and never returns
     · staggered reveals and counted-up numbers, so a section arrives rather
       than simply existing
     · a timeline that draws itself as the process is scrolled through

   Everything degrades to "visible and static" under prefers-reduced-motion.
   ========================================================================= */

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ============================================================ progress bar */

export function initProgress() {
  const bar = $('#progress-fill');
  if (!bar) return;
  let queued = false;
  const set = () => {
    queued = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? clamp(scrollY / max, 0, 1) : 0})`;
  };
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(set); } }, { passive: true });
  addEventListener('resize', set);
  set();
}

/* =============================================================== hero cue ==
   A named promise about what is underneath, which retires itself the first
   time the visitor takes it up.
   ------------------------------------------------------------------------- */

export function initCue() {
  const cue = $('#scroll-cue');
  if (!cue) return;
  const retire = () => {
    if (!cue.classList.contains('gone')) cue.classList.add('gone');
    removeEventListener('scroll', retire);
  };
  addEventListener('scroll', retire, { passive: true });
  /* a keyboard user tabbing past the hero should not be left staring at a cue
     that will not go away */
  addEventListener('keydown', (e) => { if (e.key === 'Tab') retire(); });
  setTimeout(retire, 12000);
}

/* ============================================================== section rail */

export function initRail() {
  const rail = $('#rail');
  if (!rail) return;

  const links = $$('a[data-rail]', rail);
  const targets = links
    .map((a) => ({ a, el: document.getElementById(a.getAttribute('href').slice(1)) }))
    .filter((t) => t.el);
  if (!targets.length) return;

  const readout = $('#rail-count');
  let current = -1;
  let queued = false;

  const set = () => {
    queued = false;
    const line = innerHeight * 0.34;
    let idx = 0;
    for (let i = 0; i < targets.length; i++) {
      if (targets[i].el.getBoundingClientRect().top <= line) idx = i;
    }
    /* the last section is short — claim it as soon as it is properly entered */
    const last = targets[targets.length - 1];
    if (last.el.getBoundingClientRect().top < innerHeight * 0.6) idx = targets.length - 1;

    if (idx !== current) {
      current = idx;
      targets.forEach((t, i) => t.a.classList.toggle('on', i === idx));
      if (readout) readout.textContent = String(idx + 1).padStart(2, '0');
    }
  };

  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(set); } }, { passive: true });
  addEventListener('resize', set);
  set();
}

/* ================================================================= reveals ==
   Staggered, and with a sweep fallback: a fast flick can step straight over a
   short section, which would otherwise leave it at zero opacity forever.
   ------------------------------------------------------------------------- */

export function initReveals() {
  const items = $$('[data-reveal]');
  if (!items.length) return;

  if (reduceMotion || !('IntersectionObserver' in window)) {
    items.forEach((i) => i.classList.add('in'));
    return;
  }

  const pending = new Set(items);
  const show = (el) => { if (pending.has(el)) { pending.delete(el); el.classList.add('in'); } };

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      show(e.target);
      io.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.01 });
  items.forEach((i) => io.observe(i));

  let queued = false;
  const sweep = () => {
    queued = false;
    for (const el of [...pending]) {
      if (el.getBoundingClientRect().top < innerHeight * 0.98) { show(el); io.unobserve(el); }
    }
    if (!pending.size) removeEventListener('scroll', sweep);
  };
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(sweep); } }, { passive: true });
  sweep();
}

/* ============================================================ count-up nums */

export function initCounters() {
  const nums = $$('[data-count]');
  if (!nums.length) return;

  const fmt = (el, v) => {
    const kind = el.dataset.count;
    if (kind === 'money') {
      const s = document.documentElement.dataset.currency === 'gbp' ? '£'
        : document.documentElement.dataset.currency === 'usd' ? '$' : '€';
      return s + Math.round(v).toLocaleString('en-GB');
    }
    if (kind === 'dec') return v.toFixed(1);
    if (kind === 'pct') return `${Math.round(v)}%`;
    return Math.round(v).toLocaleString('en-GB');
  };

  const run = (el) => {
    const to = Number(el.dataset.count);
    const ms = Number(el.dataset.countMs || 1100);
    if (reduceMotion) { el.textContent = fmt(el, to); return; }
    const from = Number(el.dataset.countFrom || 0);
    const s = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - s) / ms);
      const e = 1 - Math.pow(1 - k, 4);
      el.textContent = fmt(el, from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
      else el.classList.add('counted');
    };
    requestAnimationFrame(step);
  };

  if (!('IntersectionObserver' in window)) { nums.forEach(run); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      run(e.target);
      io.unobserve(e.target);
    }
  }, { threshold: 0.4 });
  nums.forEach((n) => io.observe(n));
}

/* ======================================================= the drawn timeline ==
   A process that fills in as it is read. The line is a single path with its
   length normalised to 1, so the mapping from scroll to ink is exact.
   ------------------------------------------------------------------------- */

export function initTimeline() {
  const wrap = $('#timeline');
  if (!wrap) return;
  const path = $('path.tl-line', wrap);
  if (!path) return;

  const len = path.getTotalLength();
  path.style.strokeDasharray = `${len}`;
  path.style.strokeDashoffset = reduceMotion ? '0' : `${len}`;
  if (reduceMotion) { path.classList.add('drawn'); return; }

  const dots = $$('.tl-dot', wrap);
  let queued = false;

  const set = () => {
    queued = false;
    const r = wrap.getBoundingClientRect();
    /* fill from the point the top of the section hits 80% of the viewport,
       finishing when its bottom passes 35% */
    const start = innerHeight * 0.8;
    const end = innerHeight * 0.35;
    const k = clamp((start - r.top) / Math.max(1, start - end + r.height), 0, 1);
    path.style.strokeDashoffset = `${len * (1 - k)}`;
    path.classList.toggle('drawn', k > 0.01);

    for (const d of dots) {
      const at = Number(d.dataset.at || 0);
      d.classList.toggle('lit', k >= at);
    }
  };

  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(set); } }, { passive: true });
  addEventListener('resize', set);
  set();
}

/* =========================================================== active nav link */

export function initNavSpy() {
  const links = $$('[data-spy]');
  if (!links.length) return;
  const map = links
    .map((a) => ({ a, el: document.getElementById(a.getAttribute('href').slice(1)) }))
    .filter((t) => t.el);
  let queued = false;
  const set = () => {
    queued = false;
    const line = innerHeight * 0.4;
    let hit = null;
    for (const m of map) if (m.el.getBoundingClientRect().top <= line) hit = m;
    map.forEach((m) => m.a.classList.toggle('on', m === hit));
  };
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(set); } }, { passive: true });
  addEventListener('resize', set);
  set();
}

/* ============================================================ pointer sheen ==
   A card that catches the light where the cursor is. Set once, moved with a
   single style write, and only on pointers that can actually hover.
   ------------------------------------------------------------------------- */

export function initSheen() {
  if (reduceMotion || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  for (const el of $$('[data-sheen]')) {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
      el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
    });
  }
}

/* =================================================== mouse parallax on hero ==
   Depth on the hero headline and the badge, and only a little of it — enough
   that the plane of the page is not quite what it was a second ago.
   ------------------------------------------------------------------------- */

export function initParallax() {
  const layer = $('#hero-layer');
  if (!layer || reduceMotion || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const bits = $$('[data-depth]', layer);
  let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;

  const loop = () => {
    cx += (tx - cx) * 0.08;
    cy += (ty - cy) * 0.08;
    for (const b of bits) {
      const d = Number(b.dataset.depth || 10);
      b.style.transform = `translate3d(${(-cx * d).toFixed(2)}px, ${(-cy * d).toFixed(2)}px, 0)`;
    }
    if (Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001) raf = requestAnimationFrame(loop);
    else raf = 0;
  };

  addEventListener('pointermove', (e) => {
    tx = (e.clientX / innerWidth - 0.5) * 2;
    ty = (e.clientY / innerHeight - 0.5) * 2;
    if (!raf) raf = requestAnimationFrame(loop);
  }, { passive: true });
}

/* ==================================================================== boot */

export function initScroll() {
  initProgress();
  initCue();
  initRail();
  initReveals();
  initCounters();
  initTimeline();
  initNavSpy();
  initSheen();
  initParallax();
}
