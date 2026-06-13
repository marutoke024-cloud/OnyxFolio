// Tiny DOM + UI helpers shared across views.

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Hyperscript-ish element factory.
 *  h('div.card', { onclick }, [child, 'text']) */
export function h(spec, props = {}, children = []) {
  const [tag, ...classes] = spec.split('.');
  const el = document.createElement(tag || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && k !== 'list') { try { el[k] = v; } catch { el.setAttribute(k, v); } }
    else el.setAttribute(k, v);
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const c of kids) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
export const rand = (lo, hi) => lo + Math.random() * (hi - lo);

/** Detect coarse (touch) pointers so views can swap drag/hover affordances. */
export const isTouch = matchMedia('(pointer: coarse)').matches;

// --- Toast ----------------------------------------------------------------
let toastWrap;
export function toast(msg, { error = false, ms = 2600 } = {}) {
  toastWrap = toastWrap || qs('#toast-wrap');
  const t = h('div.toast' + (error ? '.is-error' : ''), { text: msg });
  toastWrap.append(t);
  requestAnimationFrame(() => t.classList.add('is-show'));
  setTimeout(() => {
    t.classList.remove('is-show');
    setTimeout(() => t.remove(), 320);
  }, ms);
}

// --- Modal ----------------------------------------------------------------
let overlay;
export function openModal(node) {
  overlay = overlay || qs('#overlay');
  overlay.innerHTML = '';
  overlay.append(node);
  overlay.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => overlay.classList.add('is-open'));
  const onKey = (e) => { if (e.key === 'Escape') closeModal(); };
  overlay._onKey = onKey;
  document.addEventListener('keydown', onKey);
  overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
  return overlay;
}
export function closeModal() {
  overlay = overlay || qs('#overlay');
  overlay.classList.remove('is-open');
  overlay.setAttribute('aria-hidden', 'true');
  if (overlay._onKey) document.removeEventListener('keydown', overlay._onKey);
  setTimeout(() => { overlay.innerHTML = ''; }, 360);
}

/** Promise-based confirm dialog. */
export function confirmModal({ title, message, confirmText = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const modal = h('div.modal', {}, [
      h('h2.display', { text: title }),
      message ? h('p.modal-sub', { text: message }) : null,
      h('div.modal-actions', {}, [
        h('button.btn.btn-ghost', { text: 'Cancel', onclick: () => { closeModal(); resolve(false); } }),
        h('button.btn' + (danger ? '.btn-danger' : '.btn-accent'), { text: confirmText, onclick: () => { closeModal(); resolve(true); } }),
      ]),
    ]);
    openModal(modal);
  });
}

/** Single-field text prompt (supports Japanese via .jp on the input). */
export function promptModal({ title, label, value = '', placeholder = '', confirmText = 'Save', jp = false }) {
  return new Promise((resolve) => {
    const input = h('input.field' + (jp ? '.jp' : ''), { value, placeholder, spellcheck: false });
    // Confirm resolves the (possibly empty) value; only Cancel/Esc resolves null.
    const done = () => { closeModal(); resolve(input.value.trim()); };
    const modal = h('div.modal', {}, [
      h('h2.display', { text: title }),
      h('div.row', {}, [ label ? h('label', { text: label }) : null, input ]),
      h('div.modal-actions', {}, [
        h('button.btn.btn-ghost', { text: 'Cancel', onclick: () => { closeModal(); resolve(null); } }),
        h('button.btn.btn-accent', { text: confirmText, onclick: done }),
      ]),
    ]);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(); });
    openModal(modal);
    setTimeout(() => { input.focus(); input.select(); }, 120);
  });
}
