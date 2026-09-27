/* =========================================================================
   toast.js — one line of feedback, bottom centre, never in the way
   ========================================================================= */

let t = 0;

export function toast(html, ms = 5200) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.innerHTML = html;
  el.classList.add('on');
  clearTimeout(t);
  t = setTimeout(() => el.classList.remove('on'), ms);
}
