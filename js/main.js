// Onyx Folio — app shell + hash router with cross-fading views.
import { qs } from './lib/dom.js';
import { applyPrivate } from './lib/private.js';

const app = qs('#app');

// Lazy view loaders (keeps first paint — the landing — light).
const VIEWS = {
  landing:   () => import('./views/landing.js'),
  folders:   () => import('./views/folders.js'),
  album:     () => import('./views/album.js'),
  portfolio: () => import('./views/portfolio.js'),
};

const ROUTES = [
  { re: /^\/?$/,              name: 'landing',   params: () => ({}) },
  { re: /^\/folders\/?$/,     name: 'folders',   params: () => ({}) },
  { re: /^\/album\/([^/]+)$/, name: 'album',     params: (m) => ({ folderId: m[1] }) },
  { re: /^\/portfolio$/,      name: 'portfolio', params: () => ({}) },
  { re: /^\/portfolio\/([^/]+)$/, name: 'portfolio', params: (m) => ({ id: m[1] }) },
];

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  for (const r of ROUTES) {
    const m = raw.match(r.re);
    if (m) return { name: r.name, params: r.params(m) };
  }
  return { name: 'landing', params: {} };
}

/** Programmatic navigation used everywhere instead of touching location directly. */
export function nav(path) {
  const target = '#' + (path.startsWith('/') ? path : '/' + path);
  if (location.hash === target) handleRoute();   // re-render same route
  else location.hash = target;
}

let current = null;        // { name, instance, el }
let token = 0;             // guards against out-of-order async mounts

async function handleRoute() {
  const { name, params } = parseHash();
  const myToken = ++token;

  const mod = await VIEWS[name]();
  if (myToken !== token) return;   // a newer navigation superseded us

  // Build the new view container.
  const el = document.createElement('section');
  el.className = 'view view-' + name;
  app.append(el);

  const ctx = { nav, params };
  const instance = await mod.mount(el, params, ctx);
  if (myToken !== token) { try { instance?.destroy?.(); } catch {} el.remove(); return; }

  // Cross-fade: activate new, retire old.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add('is-active'));
  });

  const outgoing = current;
  current = { name, instance, el };

  if (outgoing) {
    outgoing.el.classList.remove('is-active');
    const cleanup = () => {
      try { outgoing.instance?.destroy?.(); } catch {}
      outgoing.el.remove();
    };
    setTimeout(cleanup, 650);   // matches --dur
  }
}

window.addEventListener('hashchange', handleRoute);
window.addEventListener('DOMContentLoaded', handleRoute);
// DOMContentLoaded may have already fired for a module script:
if (document.readyState !== 'loading') handleRoute();

// On GitHub Pages, a network-first service worker makes deploys show up on the
// next load instead of being masked by the CDN cache. (Local dev already sends
// no-store, so we skip it there.)
if ('serviceWorker' in navigator && location.hostname.endsWith('github.io')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

applyPrivate();   // restore the ♥ badge / private-mode body class on load
