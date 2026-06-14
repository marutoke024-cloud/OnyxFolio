// Portfolio view — a list of lookbooks, and an editable book that turns like paper.
import { h, qs, qsa, uid, isTouch, toast, promptModal, confirmModal, openModal, closeModal } from '../lib/dom.js';
import { ico, icons } from '../lib/icons.js';
import { buildTopbar } from '../lib/chrome.js';
import {
  getPortfolios, getPortfolio, savePortfolio, deletePortfolio,
  getFolders, getImages, getAllImages, getImage, blobURL,
} from '../storage/db.js';

const LAYOUTS = [
  { id: 'cover', name: 'Cover' }, { id: 'full', name: 'Full' }, { id: 'split', name: 'Split' },
  { id: 'caption', name: 'Caption' }, { id: 'duo', name: 'Duo' }, { id: 'text', name: 'Text' },
];

export async function mount(root, params, ctx) {
  if (params.id) return openEditor(root, params.id, ctx);
  return openList(root, ctx);
}

// =====================================================================
// LIST
// =====================================================================
async function openList(root, ctx) {
  const grid = h('div.pf-grid');
  const topbar = buildTopbar({
    crumbs: [{ label: 'Folders', onClick: () => ctx.nav('/folders') }, { label: 'Portfolios' }],
  });
  root.append(h('div.pf-list', {}, [
    h('div.pf-list-head', {}, [
      h('h1.display', { text: 'Portfolios' }),
      h('p', { text: 'Bound lookbooks, composed from the images in your folders.' }),
    ]),
    grid,
  ]), topbar);

  async function render() {
    grid.innerHTML = '';
    grid.append(h('div.pf-card.pf-new', { onclick: createNew }, [
      h('div.cover', {}, [ico('plus'), h('span', { text: 'New portfolio' })]),
    ]));
    const list = await getPortfolios();
    for (const p of list) grid.append(await cardEl(p));
  }

  async function cardEl(p) {
    let coverId = null;
    for (const pg of (p.pages || [])) {
      const v = pg.slots && Object.values(pg.slots).find(Boolean);
      if (v) { coverId = v; break; }
    }
    let src = '';
    if (coverId) { const im = await getImage(coverId); if (im) src = blobURL('thumb-' + coverId, im.thumb); }
    const title = p.pages?.[0]?.texts?.title || p.name;
    const card = h('div.pf-card', {}, [
      h('div.cover', {}, [src ? h('img', { src, alt: '' }) : null, h('div.spine'), h('div.cv-title.jp', { text: title })]),
      h('div.pf-name.jp', { text: p.name }),
      h('div.pf-meta', { text: `${p.pages?.length || 0} pages` }),
    ]);
    card.addEventListener('click', () => ctx.nav('/portfolio/' + p.id));
    card.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      const ok = await confirmModal({ title: 'Delete portfolio?', message: `“${p.name}” will be removed.`, confirmText: 'Delete', danger: true });
      if (ok) { await deletePortfolio(p.id); toast('Portfolio deleted.'); render(); }
    });
    return card;
  }

  async function createNew() {
    const name = await promptModal({ title: 'New portfolio', label: 'Title', placeholder: 'Untitled', jp: true, confirmText: 'Create' });
    if (name === null) return;
    const p = blankPortfolio(name || 'Untitled');
    await savePortfolio(p);
    ctx.nav('/portfolio/' + p.id);
  }

  await render();
  return {};
}

function blankPortfolio(name) {
  return {
    id: uid(), name, createdAt: Date.now(), updatedAt: Date.now(),
    pages: [
      { id: uid(), layout: 'cover', bg: 'dark', slots: {}, texts: { kicker: 'LOOKBOOK', title: name, body: '2026' } },
      { id: uid(), layout: 'split', bg: 'dark', slots: {}, texts: {} },
      { id: uid(), layout: 'full', bg: 'dark', slots: {} },
    ],
  };
}

// =====================================================================
// EDITOR
// =====================================================================
async function openEditor(root, id, ctx) {
  const portfolio = await getPortfolio(id);
  if (!portfolio) { ctx.nav('/portfolio'); return {}; }
  const pages = portfolio.pages = portfolio.pages || [];

  // preload referenced image URLs
  const urlMap = new Map();
  const ensureURL = async (imgId) => {
    if (!imgId) return '';
    if (urlMap.has(imgId)) return urlMap.get(imgId);
    const im = await getImage(imgId);
    const u = im ? blobURL('full-' + imgId, im.blob || im.thumb) : '';
    urlMap.set(imgId, u); return u;
  };
  const getURL = (imgId) => urlMap.get(imgId) || '';
  const ids = new Set();
  pages.forEach((p) => p.slots && Object.values(p.slots).forEach((v) => v && ids.add(v)));
  await Promise.all([...ids].map(ensureURL));

  // --- DOM scaffold ---
  const book = h('div.book');
  const bookWrap = h('div.book-wrap', {}, [book]);
  const editor = h('div.pf-editor', {}, [bookWrap]);

  const indicator = h('span.page-ind');
  const prevBtn = h('button.icon-btn', { title: 'Previous', onclick: () => prev() }, [ico('back')]);
  const nextBtn = h('button.icon-btn', { title: 'Next', onclick: () => next(), style: { transform: 'scaleX(-1)' } }, [ico('back')]);
  const addBtn = h('button.icon-btn', { title: 'Add page', onclick: (e) => openLayoutMenu(e.currentTarget, 'add') }, [ico('plus')]);
  const layoutBtn = h('button.icon-btn', { title: 'Change layout', onclick: (e) => openLayoutMenu(e.currentTarget, 'change') }, [ico('layout')]);
  const bgBtn = h('button.icon-btn', { title: 'Page tone', onclick: () => cycleBg() }, [ico('image')]);
  const moveBtn = h('button.icon-btn', { title: 'Reframe image (drag inside the slot)', onclick: () => toggleMove() }, [ico('move')]);
  const delBtn = h('button.icon-btn', { title: 'Delete page', onclick: () => deletePage() }, [ico('trash')]);
  const bar = h('div.pf-bar', {}, [
    prevBtn, indicator, nextBtn,
    h('span.sepv'), addBtn, layoutBtn, bgBtn, moveBtn, delBtn,
  ]);

  const topbar = buildTopbar({
    crumbs: [
      { label: 'Folders', onClick: () => ctx.nav('/folders') },
      { label: 'Portfolios', onClick: () => ctx.nav('/portfolio') },
      { label: portfolio.name, jp: true, onClick: renamePortfolio },
    ],
  });
  root.append(editor, bar, topbar);
  const titleSpan = topbar.querySelector('.crumbs .cur');

  // --- state ---
  let mode = 'spread', cur = 0, nUnits = 1, leaves = [], activePageIdx = 0, moveMode = false;

  // --- persistence ---
  let saveT = 0;
  function persist() {
    const clean = { ...portfolio, pages: pages.map(({ _idx, ...rest }) => rest), updatedAt: Date.now() };
    savePortfolio(clean);
  }
  function scheduleSave() { clearTimeout(saveT); saveT = setTimeout(persist, 600); }

  // --- page rendering ---
  function txtEl(page, key, cls, ph) {
    const el = h('div', { class: 'txt ' + cls, dataset: { key, ph }, contenteditable: 'false' });
    el.textContent = page.texts?.[key] || '';
    el.classList.toggle('is-empty', !el.textContent);
    el.addEventListener('input', () => {
      page.texts = page.texts || {};
      page.texts[key] = el.textContent;
      el.classList.toggle('is-empty', !el.textContent.trim());
      activePageIdx = page._idx; scheduleSave();
    });
    el.addEventListener('focus', () => { activePageIdx = page._idx; });
    return el;
  }
  async function chooseImage(page, key) {
    const picked = await pickImage(page.slots?.[key]);
    if (picked === null) return;
    page.slots = page.slots || {};
    page.offsets = page.offsets || {};
    if (picked === '__remove__') { delete page.slots[key]; delete page.offsets[key]; }
    else { page.slots[key] = picked; page.offsets[key] = { x: 50, y: 50 }; await ensureURL(picked); }
    activePageIdx = page._idx; scheduleSave(); rebuild(true);
  }
  function slotEl(page, key, extra = '') {
    const sid = page.slots?.[key];
    const off = (page.offsets && page.offsets[key]) || { x: 50, y: 50 };
    const el = h('div', { class: 'slot' + (sid ? '' : ' empty') + (extra ? ' ' + extra : ''), dataset: { key } });
    if (sid) {
      const img = h('img', { src: getURL(sid), alt: '', draggable: false });
      img.style.objectPosition = `${off.x}% ${off.y}%`;
      el.append(img);
    } else {
      el.append(h('div.add-hint', {}, [ico('image'), h('span', { text: 'Add image' })]));
    }
    const live = () => el.closest('.face')?.classList.contains('live');
    el.addEventListener('click', () => { if (moveMode || !live()) return; chooseImage(page, key); });
    // move mode → drag the picture to reframe it inside the slot
    if (sid) el.addEventListener('pointerdown', (e) => {
      if (!moveMode || !live()) return;
      e.preventDefault();
      const img = el.querySelector('img'); if (!img) return;
      const rect = el.getBoundingClientRect();
      const startX = e.clientX, startY = e.clientY;
      const base = page.offsets?.[key] || { x: 50, y: 50 };
      const ox = base.x, oy = base.y;
      const onMove = (ev) => {
        const nx = Math.max(0, Math.min(100, ox - (ev.clientX - startX) / rect.width * 130));
        const ny = Math.max(0, Math.min(100, oy - (ev.clientY - startY) / rect.height * 130));
        page.offsets = page.offsets || {}; page.offsets[key] = { x: nx, y: ny };
        img.style.objectPosition = `${nx}% ${ny}%`;
      };
      const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); scheduleSave(); };
      window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
    });
    return el;
  }

  function renderPage(page) {
    const el = h('div', { class: `page bg-${page.bg || 'dark'} lay-${page.layout}`, dataset: { idx: page._idx } });
    switch (page.layout) {
      case 'cover':
        el.append(
          slotEl(page, 'a', 'cover-img'),
          h('div.cover-veil'),
          h('div.cover-inner', {}, [
            txtEl(page, 'kicker', 'txt-kicker', 'LOOKBOOK'),
            txtEl(page, 'title', 'txt-title', '無題のルックブック'),
            txtEl(page, 'body', 'txt-caption', '2026'),
          ]),
        );
        break;
      case 'full':
        el.append(slotEl(page, 'a'));
        break;
      case 'caption':
        el.append(slotEl(page, 'a'), h('div.cap.pad', {}, [
          txtEl(page, 'kicker', 'txt-kicker', 'PLATE'),
          txtEl(page, 'caption', 'txt-caption', 'Caption'),
        ]));
        break;
      case 'duo':
        el.append(slotEl(page, 'a'), slotEl(page, 'b'));
        break;
      case 'split':
        el.append(slotEl(page, 'a'), h('div.split-text', {}, [
          txtEl(page, 'kicker', 'txt-kicker', 'SECTION'),
          txtEl(page, 'title', 'txt-title', '見出し'),
          txtEl(page, 'body', 'txt-body', '本文をここに入力'),
        ]));
        break;
      case 'text':
      default:
        el.append(h('div.pad', {}, [
          txtEl(page, 'kicker', 'txt-kicker', 'CHAPTER'),
          txtEl(page, 'title', 'txt-title', '見出し'),
          txtEl(page, 'body', 'txt-body', '本文をここに入力してください。'),
        ]));
        break;
    }
    return el;
  }

  // --- book build ---
  function vpWidth() { return editor.clientWidth || window.innerWidth || 360; }
  function computeMode() { return vpWidth() >= 760 ? 'spread' : 'single'; }
  function sizeBook() {
    const w = vpWidth();
    // bar moved to the right edge → use almost the full height, leave room on the right
    const hBudget = (window.innerHeight || 640) - 96;
    let ph = Math.min(Math.max(hBudget, 300), 1200);
    let pw = ph * 0.72;
    const m = computeMode();
    const bw = (m === 'spread' ? pw * 2 : pw);
    const availW = Math.max(260, w - 92);
    if (bw > availW) { const s = availW / bw; pw *= s; ph *= s; }
    pw = Math.max(60, pw); ph = Math.max(80, pw / 0.72);
    book.style.setProperty('--pw', pw.toFixed(1) + 'px');
    book.style.setProperty('--ph', ph.toFixed(1) + 'px');
    book.style.setProperty('--bw', (m === 'spread' ? pw * 2 : pw).toFixed(1) + 'px');
    return m;
  }
  function faceEl(side, page) {
    const f = h('div', { class: 'face ' + side });
    f.append(page ? renderPage(page) : h('div', { class: 'page bg-paper' }));
    f._page = page;
    return f;
  }
  function buildLeaf(frontPage, backPage) {
    const front = faceEl('front', frontPage);
    const leaf = h('div.leaf', {}, [front]);
    let back = null;
    if (mode === 'spread') { back = faceEl('back', backPage); leaf.append(back); }
    leaf._front = front; leaf._back = back;
    return leaf;
  }

  function rebuild(keep) {
    pages.forEach((p, i) => (p._idx = i));
    mode = sizeBook();
    book.classList.add('no-anim');
    book.classList.toggle('single', mode === 'single');
    book.innerHTML = '';
    leaves = [];
    if (mode === 'spread') {
      book.append(h('div.book-well'));
      nUnits = Math.max(1, Math.ceil(pages.length / 2));
      for (let j = 0; j < nUnits; j++) {
        const leaf = buildLeaf(pages[2 * j], pages[2 * j + 1]);
        leaves.push(leaf); book.append(leaf);
      }
    } else {
      nUnits = pages.length;
      for (let j = 0; j < pages.length; j++) {
        const leaf = buildLeaf(pages[j], null);
        leaves.push(leaf); book.append(leaf);
      }
    }
    cur = Math.min(Math.max(0, cur), nUnits - 1);
    applyFlips(); updateZ(); setLive(); updateInd();
    requestAnimationFrame(() => book.classList.remove('no-anim'));
  }

  function applyFlips() { leaves.forEach((lf, j) => lf.classList.toggle('flipped', j < cur)); }
  function updateZ() { leaves.forEach((lf, j) => { lf.style.zIndex = String(j < cur ? j : nUnits - j); }); }
  function updateInd() {
    const rightPage = (mode === 'spread' ? 2 * cur : cur) + 1;
    indicator.textContent = `${Math.min(rightPage, pages.length)} / ${pages.length}`;
    prevBtn.disabled = cur <= 0;
    nextBtn.disabled = cur >= nUnits - 1;
  }
  function setLive() {
    leaves.forEach((lf) => [lf._front, lf._back].forEach((f) => {
      if (!f) return;
      f.classList.remove('live');
      f.querySelector('.page')?.classList.remove('editing');
      qsa('.txt', f).forEach((t) => (t.contentEditable = 'false'));
    }));
    const live = [];
    if (leaves[cur]) live.push(leaves[cur]._front);
    if (mode === 'spread' && cur > 0 && leaves[cur - 1]) live.push(leaves[cur - 1]._back);
    live.forEach((f) => {
      if (!f) return;
      f.classList.add('live');
      f.querySelector('.page')?.classList.add('editing');
      qsa('.txt', f).forEach((t) => (t.contentEditable = 'true'));
    });
    activePageIdx = (mode === 'spread' ? 2 * cur : cur);
  }

  // --- navigation ---
  function next() { if (cur >= nUnits - 1) return; leaves[cur].classList.add('flipped'); cur++; updateZ(); setLive(); updateInd(); }
  function prev() { if (cur <= 0) return; cur--; leaves[cur].classList.remove('flipped'); updateZ(); setLive(); updateInd(); }
  function goTo(pageIdx) { cur = (mode === 'spread') ? Math.min(Math.floor(pageIdx / 2), nUnits - 1) : Math.min(pageIdx, nUnits - 1); applyFlips(); updateZ(); setLive(); updateInd(); }

  // --- edit ops ---
  function addPage(layout) {
    const np = { id: uid(), layout, bg: 'dark', slots: {}, texts: {} };
    const at = Math.min(activePageIdx + 1, pages.length);
    pages.splice(at, 0, np);
    scheduleSave(); rebuild(); goTo(at);
  }
  async function deletePage() {
    if (pages.length <= 1) { toast('A portfolio needs at least one page.'); return; }
    const ok = await confirmModal({ title: 'Delete this page?', confirmText: 'Delete', danger: true });
    if (!ok) return;
    pages.splice(activePageIdx, 1);
    scheduleSave(); rebuild(); goTo(Math.min(activePageIdx, pages.length - 1));
  }
  function changeLayout(layout) { pages[activePageIdx].layout = layout; scheduleSave(); rebuild(true); }
  function cycleBg() {
    const order = ['dark', 'light', 'paper'];
    const p = pages[activePageIdx];
    p.bg = order[(order.indexOf(p.bg || 'dark') + 1) % order.length];
    scheduleSave(); rebuild(true);
  }
  function toggleMove() {
    moveMode = !moveMode;
    moveBtn.classList.toggle('active', moveMode);
    book.classList.toggle('move-mode', moveMode);
    toast(moveMode ? 'Move mode: drag a picture to reframe it.' : 'Move mode off.');
  }
  async function renamePortfolio() {
    const n = await promptModal({ title: 'Rename portfolio', value: portfolio.name, jp: true });
    if (n === null) return;
    portfolio.name = n || 'Untitled'; titleSpan.textContent = portfolio.name; scheduleSave();
  }

  // --- layout / add menu ---
  let menu = null;
  function miniFor(idn) {
    const I = (g, img) => h('i', { style: { flex: String(g), background: 'var(--ink-3)', opacity: img ? '.85' : '.4', borderRadius: '1px', minHeight: img ? '0' : '3px', maxHeight: img ? 'none' : '3px' } });
    const map = {
      full: [I(1, true)], duo: [I(1, true), I(1, true)],
      split: [I(2, true), I(0, false), I(0, false)], caption: [I(2, true), I(0, false)],
      text: [I(0, false), I(0, false), I(0, false)], cover: [I(2, true), I(0, false)],
    };
    return h('div.mini', {}, map[idn] || map.full);
  }
  function openLayoutMenu(anchor, kind) {
    closeMenu();
    menu = h('div.pop-menu', {}, LAYOUTS.map((L) =>
      h('button.lay-opt', { onclick: () => { closeMenu(); kind === 'add' ? addPage(L.id) : changeLayout(L.id); } }, [miniFor(L.id), h('span', { text: L.name })])));
    document.body.append(menu);
    const r = anchor.getBoundingClientRect();
    const mw = 3 * 64 + 2 * 6 + 16;
    menu.style.left = Math.max(8, Math.min(r.left + r.width / 2 - mw / 2, window.innerWidth - mw - 8)) + 'px';
    menu.style.bottom = (window.innerHeight - r.top + 10) + 'px';
    requestAnimationFrame(() => menu.classList.add('in'));
    setTimeout(() => document.addEventListener('pointerdown', closeOnOut), 0);
  }
  function closeOnOut(e) { if (menu && !menu.contains(e.target)) closeMenu(); }
  function closeMenu() { if (menu) { menu.remove(); menu = null; document.removeEventListener('pointerdown', closeOnOut); } }

  // --- image picker ---
  async function pickImage(currentId) {
    const folders = await getFolders();
    const privateIds = new Set(folders.filter((f) => f.private).map((f) => f.id));
    return new Promise((resolve) => {
      let curFolder = '__all__';   // default: every non-private image in Onyx Folio
      let showPrivate = false;
      const grid = h('div.pick-grid');
      const tabs = h('div.pick-folders');
      const done = (v) => { closeModal(); resolve(v); };
      const visible = (im) => showPrivate || !privateIds.has(im.folderId);
      async function loadGrid() {
        grid.innerHTML = '';
        let imgs = curFolder === '__all__' ? await getAllImages() : await getImages(curFolder);
        imgs = imgs.filter(visible).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        if (!imgs.length) { grid.append(h('div.rail-empty', { text: 'No images here yet.' })); return; }
        imgs.forEach((im) => grid.append(h('div', { class: 'pick-cell' + (im.id === currentId ? ' sel' : ''), onclick: () => done(im.id) }, [h('img', { src: blobURL('thumb-' + im.id, im.thumb), alt: '' })])));
      }
      function buildTabs() {
        tabs.innerHTML = '';
        const tabEls = [];
        const mkTab = (id, label, jp) => {
          const b = h('button', { class: 'pick-folder' + (id === curFolder ? ' active' : ''), onclick: () => { curFolder = id; tabEls.forEach((c) => c.classList.remove('active')); b.classList.add('active'); loadGrid(); } }, [h(jp ? 'span.jp' : 'span', { text: label })]);
          tabEls.push(b); return b;
        };
        tabs.append(mkTab('__all__', 'All'));
        folders.filter((f) => showPrivate || !f.private).forEach((f) => tabs.append(mkTab(f.id, f.name, true)));
      }
      const heart = privateIds.size
        ? h('button.icon-btn.pick-heart', { title: 'Show private folders', onclick: () => {
            showPrivate = !showPrivate;
            heart.classList.toggle('on', showPrivate);
            if (!showPrivate && privateIds.has(curFolder)) curFolder = '__all__';
            buildTabs(); loadGrid();
          } }, ['♥'])
        : null;
      buildTabs();
      openModal(h('div.modal', { style: { width: 'min(720px, 100%)' } }, [
        h('div.pick-head', {}, [h('h2.display', { text: 'Choose an image' }), heart]),
        tabs,
        grid,
        h('div.modal-actions', {}, [
          currentId ? h('button.btn.btn-ghost', { text: 'Remove', onclick: () => done('__remove__') }) : null,
          h('button.btn.btn-ghost', { text: 'Cancel', onclick: () => done(null) }),
        ]),
      ]));
      loadGrid();
    });
  }

  // --- gestures / keys / resize ---
  let sx = 0, sy = 0, swiping = false;
  const onDown = (e) => { if (e.target.closest('.txt,.slot,.pf-bar,.pop-menu,.topbar')) return; swiping = true; sx = e.clientX; sy = e.clientY; };
  const onUp = (e) => {
    if (!swiping) return; swiping = false;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) { dx < 0 ? next() : prev(); }
  };
  const onKey = (e) => {
    if (e.target.isContentEditable || e.target.matches('input,textarea')) return;
    if (e.key === 'ArrowRight') next(); else if (e.key === 'ArrowLeft') prev();
  };
  let rT; const onResize = () => { clearTimeout(rT); rT = setTimeout(() => { const m = computeMode(); sizeBook(); if (m !== mode) rebuild(true); }, 160); };

  bookWrap.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);
  // React when the editor first gets real dimensions (and on orientation change).
  const ro = new ResizeObserver(onResize);
  ro.observe(editor);

  rebuild();

  return {
    destroy() {
      clearTimeout(saveT); persist();
      ro.disconnect();
      window.removeEventListener('pointerup', onUp);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      closeMenu();
    },
  };
}
