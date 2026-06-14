// Portfolio view — a list of lookbooks, and an editable book that turns like paper.
import { h, qs, qsa, uid, isTouch, toast, promptModal, confirmModal, openModal, closeModal } from '../lib/dom.js';
import { ico, icons } from '../lib/icons.js';
import { buildTopbar } from '../lib/chrome.js';
import {
  getPortfolios, getPortfolio, savePortfolio, deletePortfolio,
  getFolders, getImages, getAllImages, getImage, addFolder, addImage, blobURL,
} from '../storage/db.js';
import { fileToImageRecord } from '../lib/image.js';
import { imageFileFromPasteEvent, readClipboardImageFile } from '../lib/clipboard.js';
import { isPrivate } from '../lib/private.js';

const LAYOUTS = [
  { id: 'cover', name: 'Cover' }, { id: 'full', name: 'Full' }, { id: 'spread', name: 'Spread' },
  { id: 'split', name: 'Split' }, { id: 'splitR', name: 'Split ↑' },
  { id: 'split82', name: 'Wide 8:2' }, { id: 'split82R', name: 'Wide 8:2 ↑' },
  { id: 'caption', name: 'Caption' }, { id: 'duo', name: 'Duo' }, { id: 'trio', name: 'Trio' }, { id: 'text', name: 'Text' },
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
    const all = await getPortfolios();
    // normal → only non-private lookbooks; private mode → only the private ones
    const list = all.filter((p) => isPrivate() ? p.private : !p.private);
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
      h('div.cover', {}, [src ? h('img', { src, alt: '' }) : null, h('div.spine'), h('div.cv-title.jp', { text: title }), p.private ? h('div.pf-private', { text: '♥', title: 'Private' }) : null]),
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
  window.addEventListener('onyx-private-change', render);
  return { destroy() { window.removeEventListener('onyx-private-change', render); } };
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
  // viewing-mode page turn: click the right edge → next, left edge → previous
  const turnLeft = h('div.turn-zone.left', { title: 'Previous page', onclick: () => prev() });
  const turnRight = h('div.turn-zone.right', { title: 'Next page', onclick: () => next() });
  const editor = h('div.pf-editor', {}, [bookWrap, turnLeft, turnRight]);

  const indicator = h('span.page-ind');
  const prevBtn = h('button.icon-btn', { title: 'Previous', onclick: () => prev() }, [ico('back')]);
  const nextBtn = h('button.icon-btn', { title: 'Next', onclick: () => next(), style: { transform: 'scaleX(-1)' } }, [ico('back')]);
  const addBtn = h('button.icon-btn', { title: 'Add page', onclick: (e) => openLayoutMenu(e.currentTarget, 'add') }, [ico('plus')]);
  const layoutBtn = h('button.icon-btn', { title: 'Change layout', onclick: (e) => openLayoutMenu(e.currentTarget, 'change') }, [ico('layout')]);
  const pasteBtn = h('button.icon-btn', { title: 'Paste image from clipboard', onclick: () => pasteImage() }, [ico('clipboard')]);
  const textBtn = h('button.icon-btn', { title: 'Add text over the image', onclick: () => addOverlay() }, [ico('text')]);
  const styleBtn = h('button.icon-btn', { title: 'Text style (size · colour · opacity · border)', onclick: () => openOverlayStyle(selectedOverlay) }, [ico('sliders')]);
  const textbgBtn = h('button.icon-btn', { title: 'Text panel colour', onclick: (e) => openTextBgPanel(e.currentTarget) }, [ico('palette')]);
  const pageBtn = h('button.icon-btn', { title: 'Select an image section (then zoom / reframe / change just that one)', onclick: () => cycleSection() }, [ico('pages')]);
  const bgBtn = h('button.icon-btn', { title: 'Page tone', onclick: () => cycleBg() }, [ico('image')]);
  const moveBtn = h('button.icon-btn', { title: 'Reframe image (drag inside the slot)', onclick: () => toggleMove() }, [ico('move')]);
  const zoomInBtn = h('button.icon-btn', { title: 'Zoom the image in', onclick: () => adjustZoom(1.15) }, [ico('zoomIn')]);
  const zoomOutBtn = h('button.icon-btn', { title: 'Zoom the image out', onclick: () => adjustZoom(1 / 1.15) }, [ico('zoomOut')]);
  const delBtn = h('button.icon-btn', { title: 'Delete page', onclick: () => deletePage() }, [ico('trash')]);
  const bar = h('div.pf-bar', {}, [
    prevBtn, indicator, nextBtn,
    h('span.sepv'), pageBtn, addBtn, layoutBtn, pasteBtn,
    h('span.sepv'), textBtn, styleBtn, textbgBtn,
    h('span.sepv'), bgBtn, moveBtn, zoomInBtn, zoomOutBtn, delBtn,
  ]);
  // viewing mode is the default — a small floating toggle reveals the editor chrome
  const viewToggle = h('button.icon-btn.pf-viewtoggle', { title: 'Toggle edit mode', onclick: () => toggleView() }, [ico('edit')]);
  // back to the lookbook list (always reachable, incl. chrome-free viewing mode)
  const backToList = h('button.icon-btn.pf-backbtn', { title: 'Back to lookbooks', onclick: () => ctx.nav('/portfolio') }, [ico('back')]);

  const topbar = buildTopbar({
    crumbs: [
      { label: 'Folders', onClick: () => ctx.nav('/folders') },
      { label: 'Portfolios', onClick: () => ctx.nav('/portfolio') },
      { label: portfolio.name, jp: true, onClick: renamePortfolio },
    ],
  });
  root.append(editor, bar, topbar, viewToggle, backToList);
  const titleSpan = topbar.querySelector('.crumbs .cur');

  // --- state ---
  let mode = 'spread', cur = 0, nUnits = 1, leaves = [], activePageIdx = 0, moveMode = false;
  let viewMode = true, selectedOverlay = null, selectedSlot = null;

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
    el.setAttribute('spellcheck', 'false'); el.setAttribute('autocapitalize', 'off'); el.setAttribute('autocorrect', 'off');
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
    // a spread picture is shared by both half-pages
    if (page.layout === 'spread' && page.spreadId) {
      const sib = pages.find((p) => p !== page && p.spreadId === page.spreadId);
      if (sib) {
        sib.slots = sib.slots || {}; sib.offsets = sib.offsets || {};
        if (picked === '__remove__') { delete sib.slots.a; delete sib.offsets.a; }
        else { sib.slots.a = picked; sib.offsets.a = { x: 50, y: 50 }; }
      }
    }
    activePageIdx = page._idx; scheduleSave(); rebuild(true);
  }
  function slotEl(page, key, extra = '') {
    const sid = page.slots?.[key];
    const off = (page.offsets && page.offsets[key]) || { x: 50, y: 50 };
    const el = h('div', { class: 'slot' + (sid ? '' : ' empty') + (extra ? ' ' + extra : ''), dataset: { key } });
    if (sid) {
      const url = getURL(sid);
      const zoom = (page.zoom && page.zoom[key]) || 1;
      const zoomedOut = zoom < 1 && page.layout !== 'spread';
      if (zoomedOut) {
        // a blurred copy of the picture fills the gap, so a shrunk image sits on its
        // own soft colour instead of a hard black frame
        const fill = h('div.slot-fill');
        fill.style.backgroundImage = `url("${url}")`;
        el.append(fill);
      }
      const img = h('img', { src: url, alt: '', draggable: false });
      img.style.objectPosition = `${off.x}% ${off.y}%`;
      if (zoom !== 1 && page.layout !== 'spread') {
        img.style.transform = `scale(${zoom})`;
        img.style.transformOrigin = `${off.x}% ${off.y}%`;
        if (zoom < 1) { img.style.objectFit = 'contain'; img.style.position = 'relative'; img.style.zIndex = '1'; }
      }
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
    const textBg = page.textBg || portfolio.textBg || '';
    // a text panel whose background colour follows the page / portfolio setting
    const sect = (cls, kids) => { const s = h('div', { class: cls }, kids); if (textBg) s.style.background = textBg; return s; };
    switch (page.layout) {
      case 'cover':
        el.append(
          slotEl(page, 'a', 'cover-img'),
          h('div.cover-grad'),
          h('div.cover-cap', {}, [
            txtEl(page, 'kicker', 'txt-kicker', 'LOOKBOOK'),
            txtEl(page, 'title', 'txt-title', '無題のルックブック'),
          ]),
        );
        break;
      case 'full':
        el.append(slotEl(page, 'a'));
        break;
      case 'spread':
        el.append(slotEl(page, 'a', 'spread-img half-' + (page.half || 'l')));
        break;
      case 'caption':
        el.append(slotEl(page, 'a'), sect('cap pad', [
          txtEl(page, 'kicker', 'txt-kicker', 'PLATE'),
          txtEl(page, 'caption', 'txt-caption', 'Caption'),
        ]));
        break;
      case 'duo':
        el.append(slotEl(page, 'a'), slotEl(page, 'b'));
        break;
      case 'trio':
        el.append(slotEl(page, 'a'), slotEl(page, 'b'), slotEl(page, 'c'));
        break;
      case 'split':
      case 'splitR':
      case 'split82':
      case 'split82R':
        el.append(slotEl(page, 'a'), sect('split-text', [
          txtEl(page, 'kicker', 'txt-kicker', 'SECTION'),
          txtEl(page, 'title', 'txt-title', '見出し'),
          txtEl(page, 'body', 'txt-body', '本文をここに入力'),
        ]));
        break;
      case 'text':
      default:
        if (textBg) el.style.background = textBg;
        el.append(h('div.pad', {}, [
          txtEl(page, 'kicker', 'txt-kicker', 'CHAPTER'),
          txtEl(page, 'title', 'txt-title', '見出し'),
          txtEl(page, 'body', 'txt-body', '本文をここに入力してください。'),
        ]));
        break;
    }
    (page.overlays || []).forEach((ov) => el.append(overlayEl(page, ov)));
    return el;
  }

  // free-floating text laid over a page (size / colour / opacity / border)
  function overlayEl(page, ov) {
    const el = h('div', { class: 'txt txt-ovl', dataset: { ovid: ov.id }, contenteditable: 'false' });
    el.setAttribute('spellcheck', 'false'); el.setAttribute('autocapitalize', 'off'); el.setAttribute('autocorrect', 'off');
    el.textContent = ov.text || '';
    const apply = () => {
      el.style.left = (ov.x ?? 50) + '%';
      el.style.top = (ov.y ?? 50) + '%';
      el.style.fontSize = (ov.size || 8) + 'cqw';
      el.style.color = ov.color || '#ffffff';
      el.style.opacity = String(ov.opacity ?? 1);
      el.style.webkitTextStroke = ov.border ? `${(ov.borderW || 0.8).toFixed(2)}px ${ov.borderColor || '#000000'}` : '0 transparent';
    };
    apply(); el._apply = apply;
    el.addEventListener('input', () => { ov.text = el.textContent; activePageIdx = page._idx; scheduleSave(); });
    el.addEventListener('focus', () => { activePageIdx = page._idx; selectedOverlay = { page, ov, el }; });
    // drag to reposition (a small move-threshold lets a plain click edit the text)
    el.addEventListener('pointerdown', (e) => {
      if (!el.closest('.face')?.classList.contains('live')) return;
      const r = el.parentElement.getBoundingClientRect();
      const sx = e.clientX, sy = e.clientY, ox = ov.x ?? 50, oy = ov.y ?? 50;
      let dragging = false;
      const onMove = (ev) => {
        if (!dragging && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 6) { dragging = true; el.blur(); }
        if (!dragging) return;
        ov.x = Math.max(0, Math.min(100, ox + (ev.clientX - sx) / r.width * 100));
        ov.y = Math.max(0, Math.min(100, oy + (ev.clientY - sy) / r.height * 100));
        el.style.left = ov.x + '%'; el.style.top = ov.y + '%';
      };
      const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); if (dragging) { activePageIdx = page._idx; scheduleSave(); } };
      window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
    });
    return el;
  }

  // --- book build ---
  function vpWidth() { return editor.clientWidth || window.innerWidth || 360; }
  function computeMode() { return vpWidth() >= 760 ? 'spread' : 'single'; }
  function sizeBook() {
    const w = vpWidth();
    // viewing mode hides the chrome → let the book use almost the whole screen
    const vReserve = viewMode ? 24 : 96;
    const hReserve = viewMode ? 24 : 92;
    const hBudget = (window.innerHeight || 640) - vReserve;
    let ph = Math.min(Math.max(hBudget, 300), 1600);
    let pw = ph * 0.72;
    const m = computeMode();
    const bw = (m === 'spread' ? pw * 2 : pw);
    const availW = Math.max(260, w - hReserve);
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
  function updateZ() {
    leaves.forEach((lf, j) => { lf.style.zIndex = String(j < cur ? j : nUnits - j); });
    // the cover is a single page → centre it and hide the left well until the book is opened
    book.classList.toggle('cover-mode', mode === 'spread' && cur === 0);
  }
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
    if (viewMode) { activePageIdx = (mode === 'spread' ? 2 * cur : cur); return; }  // read-only while viewing
    const live = [];
    if (leaves[cur]) live.push(leaves[cur]._front);
    if (mode === 'spread' && cur > 0 && leaves[cur - 1]) live.push(leaves[cur - 1]._back);
    live.forEach((f) => {
      if (!f) return;
      f.classList.add('live');
      f.querySelector('.page')?.classList.add('editing');
      qsa('.txt', f).forEach((t) => (t.contentEditable = 'true'));
    });
    // default target = the right page of the spread (or the single page)
    activePageIdx = mode === 'spread' ? 2 * cur : cur;
    // keep the section selection if it is still on the open spread, else drop it
    const liveIdxs = live.filter(Boolean).map((f) => f._page && f._page._idx);
    if (selectedSlot && liveIdxs.includes(selectedSlot.idx)) {
      activePageIdx = selectedSlot.idx;
    } else if (selectedSlot) {
      selectedSlot = null;
      pageBtn.classList.remove('active');
    }
    applySectionHighlight();
  }

  // --- navigation ---
  // keep the turning leaf on top for the whole flip, then restore the stack — otherwise
  // updateZ() drops it behind immediately and the next page flashes into view first.
  let flipT = 0;
  function settleZ() { clearTimeout(flipT); flipT = setTimeout(updateZ, 940); }
  function next() {
    if (cur >= nUnits - 1) return;
    const lf = leaves[cur];
    lf.style.zIndex = '999';
    lf.classList.add('flipped');
    cur++;
    book.classList.toggle('cover-mode', mode === 'spread' && cur === 0);
    setLive(); updateInd(); settleZ();
  }
  function prev() {
    if (cur <= 0) return;
    cur--;
    const lf = leaves[cur];
    lf.style.zIndex = '999';
    lf.classList.remove('flipped');
    book.classList.toggle('cover-mode', mode === 'spread' && cur === 0);
    setLive(); updateInd(); settleZ();
  }
  function goTo(pageIdx) { clearTimeout(flipT); cur = (mode === 'spread') ? Math.min(Math.floor(pageIdx / 2), nUnits - 1) : Math.min(pageIdx, nUnits - 1); applyFlips(); updateZ(); setLive(); updateInd(); }

  // --- edit ops ---
  function addPage(layout) {
    if (layout === 'spread') return addSpread();
    const np = { id: uid(), layout, bg: 'dark', slots: {}, texts: {} };
    const at = Math.min(activePageIdx + 1, pages.length);
    pages.splice(at, 0, np);
    scheduleSave(); rebuild(); goTo(at);
  }
  // a spread = two linked half-pages that share one picture across the open book
  function addSpread() {
    const spreadId = uid();
    const L = { id: uid(), layout: 'spread', half: 'l', spreadId, bg: 'dark', slots: {}, texts: {} };
    const R = { id: uid(), layout: 'spread', half: 'r', spreadId, bg: 'dark', slots: {}, texts: {} };
    // align to a real spread: the left half must sit on an odd index (1,3,5…)
    let at = (mode === 'spread') ? (2 * cur + 1) : (activePageIdx + 1);
    at = Math.min(Math.max(at, 0), pages.length);
    pages.splice(at, 0, L, R);
    scheduleSave(); rebuild(); goTo(at);
  }
  async function deletePage() {
    if (pages.length <= 1) { toast('A portfolio needs at least one page.'); return; }
    const ok = await confirmModal({ title: 'Delete this page?', confirmText: 'Delete', danger: true });
    if (!ok) return;
    const p = pages[activePageIdx];
    const idxs = [activePageIdx];
    if (p.spreadId) { const si = pages.findIndex((q) => q !== p && q.spreadId === p.spreadId); if (si >= 0) idxs.push(si); }
    if (pages.length - idxs.length < 1) { toast('A portfolio needs at least one page.'); return; }
    idxs.sort((a, b) => b - a).forEach((i) => pages.splice(i, 1));
    scheduleSave(); rebuild(); goTo(Math.min(activePageIdx, pages.length - 1));
  }
  function changeLayout(layout) {
    if (layout === 'spread') return addSpread();   // a spread can only be created as a pair
    pages[activePageIdx].layout = layout; scheduleSave(); rebuild(true);
  }

  // --- text overlays (request: text laid over an image) ---
  function addOverlay() {
    const page = pages[activePageIdx] || pages[0];
    page.overlays = page.overlays || [];
    const ov = { id: uid(), text: 'テキスト', x: 50, y: 50, size: 9, color: '#ffffff', opacity: 1, border: false, borderColor: '#000000' };
    page.overlays.push(ov);
    scheduleSave(); rebuild(true);
    setTimeout(() => {
      const el = book.querySelector(`.txt-ovl[data-ovid="${ov.id}"]`);
      selectedOverlay = { page, ov, el };
      openOverlayStyle(selectedOverlay);
    }, 60);
  }
  function openOverlayStyle(sel) {
    if (!sel || !sel.ov) { toast('Add a text first (the T+ button), then style it.'); return; }
    const { page, ov, el } = sel;
    const row = (label, input) => h('label.ov-row', {}, [h('span', { text: label }), input]);
    const sizeIn = h('input', { type: 'range', min: '3', max: '26', step: '0.5', value: String(ov.size || 9) });
    const colorIn = h('input', { type: 'color', value: ov.color || '#ffffff' });
    const opacIn = h('input', { type: 'range', min: '0.1', max: '1', step: '0.05', value: String(ov.opacity ?? 1) });
    const borderIn = h('input', { type: 'checkbox' }); borderIn.checked = !!ov.border;
    const borderColorIn = h('input', { type: 'color', value: ov.borderColor || '#000000' });
    const live = el || book.querySelector(`.txt-ovl[data-ovid="${ov.id}"]`);
    const upd = () => {
      ov.size = +sizeIn.value; ov.color = colorIn.value; ov.opacity = +opacIn.value;
      ov.border = borderIn.checked; ov.borderColor = borderColorIn.value;
      live && live._apply && live._apply(); scheduleSave();
    };
    [sizeIn, colorIn, opacIn, borderIn, borderColorIn].forEach((i) => i.addEventListener('input', upd));
    const del = () => {
      page.overlays = (page.overlays || []).filter((o) => o !== ov);
      selectedOverlay = null; scheduleSave(); rebuild(true); closeModal();
    };
    openModal(h('div.modal.ov-style', { style: { width: 'min(360px, 100%)' } }, [
      h('h2.display', { text: 'Text style' }),
      row('Size', sizeIn), row('Colour', colorIn), row('Opacity', opacIn),
      row('Border', borderIn), row('Border colour', borderColorIn),
      h('div.modal-actions', { style: { justifyContent: 'space-between' } }, [
        h('button.btn.btn-danger', { text: 'Delete', onclick: del }),
        h('button.btn.btn-accent', { text: 'Done', onclick: () => closeModal() }),
      ]),
    ]));
  }

  // --- text-panel colour (request: pick the text-section background, reusable) ---
  function openTextBgPanel() {
    const page = pages[activePageIdx] || pages[0];
    const curColor = page.textBg || portfolio.textBg || '#14141a';
    const colorIn = h('input', { type: 'color', value: curColor });
    const applyAll = h('input', { type: 'checkbox' });
    const reset = h('button.btn.btn-ghost', { text: 'Reset to default', onclick: () => { delete page.textBg; if (applyAll.checked) { pages.forEach((p) => delete p.textBg); portfolio.textBg = null; } scheduleSave(); rebuild(true); closeModal(); } });
    const apply = () => {
      const c = colorIn.value;
      page.textBg = c;
      if (applyAll.checked) { portfolio.textBg = c; pages.forEach((p) => { p.textBg = c; }); }  // reuse on every page
      scheduleSave(); rebuild(true); closeModal();
    };
    openModal(h('div.modal', { style: { width: 'min(340px, 100%)' } }, [
      h('h2.display', { text: 'Text panel colour' }),
      h('label.ov-row', {}, [h('span', { text: 'Colour' }), colorIn]),
      h('label.ov-row', {}, [h('span', { text: 'Apply to every page' }), applyAll]),
      h('div.modal-actions', { style: { justifyContent: 'space-between' } }, [
        reset,
        h('button.btn.btn-accent', { text: 'Apply', onclick: apply }),
      ]),
    ]));
  }

  // --- viewing ⇄ editing ---
  function applyViewMode() {
    editor.classList.toggle('viewing', viewMode);
    viewToggle.innerHTML = '';
    viewToggle.append(ico(viewMode ? 'edit' : 'eye'));
    viewToggle.title = viewMode ? 'Edit' : 'Done — view';
  }
  function toggleView() { viewMode = !viewMode; applyViewMode(); sizeBook(); rebuild(true); }

  // --- paste an image from the clipboard into the active page ---
  let pasteFolderId = null;
  async function ensurePasteFolder() {
    if (pasteFolderId) return pasteFolderId;
    const folders = await getFolders();
    let f = folders.find((x) => x.name === 'Clipboard');
    if (!f) f = await addFolder('Clipboard');
    pasteFolderId = f.id; return f.id;
  }
  async function placePasted(file) {
    try {
      const fid = await ensurePasteFolder();
      const img = await addImage(await fileToImageRecord(file, fid));
      await ensureURL(img.id);
      const page = pages[activePageIdx] || pages[0];
      const key = (page.layout === 'duo' && page.slots && page.slots.a && !page.slots.b) ? 'b' : 'a';
      page.slots = page.slots || {}; page.offsets = page.offsets || {};
      page.slots[key] = img.id; page.offsets[key] = { x: 50, y: 50 };
      if (page.layout === 'spread' && page.spreadId) {
        const sib = pages.find((p) => p !== page && p.spreadId === page.spreadId);
        if (sib) { sib.slots = sib.slots || {}; sib.offsets = sib.offsets || {}; sib.slots.a = img.id; sib.offsets.a = { x: 50, y: 50 }; }
      }
      scheduleSave(); rebuild(true);
      toast('Pasted image added (saved to “Clipboard” folder).');
    } catch (e) { console.warn('paste failed', e); toast('Could not read that image.'); }
  }
  async function pasteImage() {
    const f = await readClipboardImageFile();
    if (f) placePasted(f);
    else toast('No image found in the clipboard.');
  }
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
  // zoom the selected section's picture (or every picture on the active page) in / out
  function adjustZoom(factor) {
    let page, keys;
    if (selectedSlot) {
      page = pages[selectedSlot.idx];
      keys = page && page.slots && page.slots[selectedSlot.key] ? [selectedSlot.key] : [];
    } else {
      page = pages[activePageIdx];
      keys = page && page.slots ? Object.keys(page.slots).filter((k) => page.slots[k]) : [];
    }
    if (!keys.length) { toast(selectedSlot ? 'Add an image to that section first.' : 'Add an image to this page first.'); return; }
    page.zoom = page.zoom || {};
    keys.forEach((k) => { page.zoom[k] = Math.max(0.5, Math.min(4, (page.zoom[k] || 1) * factor)); });
    scheduleSave(); rebuild(true);
  }
  // step through the individual image sections of the open spread; the chosen one
  // is highlighted and becomes the target for zoom / reframe / layout / delete
  function cycleSection() {
    const slots = qsa('.face.live .slot[data-key]', book).map((el) => ({ key: el.dataset.key, idx: el.closest('.face')?._page?._idx }));
    if (!slots.length) { toast('No image sections on the open pages.'); return; }
    let i = selectedSlot ? slots.findIndex((s) => s.idx === selectedSlot.idx && s.key === selectedSlot.key) : -1;
    i = (i + 1) % slots.length;
    selectedSlot = { idx: slots[i].idx, key: slots[i].key };
    activePageIdx = selectedSlot.idx;
    pageBtn.classList.add('active');
    applySectionHighlight();
    toast(`Section ${i + 1} / ${slots.length} selected.`);
  }
  function applySectionHighlight() {
    qsa('.slot.sel-slot', book).forEach((s) => s.classList.remove('sel-slot'));
    if (!selectedSlot) return;
    qsa('.face.live .slot[data-key]', book).forEach((el) => {
      if (el.dataset.key === selectedSlot.key && el.closest('.face')?._page?._idx === selectedSlot.idx) el.classList.add('sel-slot');
    });
  }
  function renamePortfolio() {
    const nameIn = h('input.field.jp', { value: portfolio.name, placeholder: 'Untitled', spellcheck: false });
    const privToggle = h('button.toggle' + (portfolio.private ? '.on' : ''), {
      type: 'button', role: 'switch', 'aria-checked': String(!!portfolio.private), title: 'Toggle private',
      onclick: () => { portfolio.private = !portfolio.private; privToggle.classList.toggle('on', !!portfolio.private); privToggle.setAttribute('aria-checked', String(!!portfolio.private)); },
    }, [h('span.knob')]);
    const save = () => { portfolio.name = nameIn.value.trim() || 'Untitled'; titleSpan.textContent = portfolio.name; scheduleSave(); closeModal(); };
    nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    openModal(h('div.modal', {}, [
      h('h2.display', { text: 'Lookbook settings' }),
      h('div.row', {}, [h('label', { text: 'Title' }), nameIn]),
      h('div.row.toggle-row', {}, [h('label', { text: 'Private (shown only in private mode)' }), privToggle]),
      h('div.modal-actions', {}, [
        h('button.btn.btn-ghost', { text: 'Cancel', onclick: () => closeModal() }),
        h('button.btn.btn-accent', { text: 'Save', onclick: save }),
      ]),
    ]));
    setTimeout(() => nameIn.focus(), 120);
  }

  // --- layout / add menu ---
  let menu = null;
  function miniFor(idn) {
    const I = (g, img) => h('i', { style: { flex: String(g), background: 'var(--ink-3)', opacity: img ? '.85' : '.4', borderRadius: '1px', minHeight: img ? '0' : '3px', maxHeight: img ? 'none' : '3px' } });
    const map = {
      full: [I(1, true)], duo: [I(1, true), I(1, true)], trio: [I(1, true), I(1, true), I(1, true)], spread: [I(1, true)],
      split: [I(2, true), I(0, false), I(0, false)], splitR: [I(0, false), I(0, false), I(2, true)],
      split82: [I(4, true), I(0, false)], split82R: [I(0, false), I(4, true)],
      caption: [I(2, true), I(0, false)], text: [I(0, false), I(0, false), I(0, false)],
      cover: [I(2, true), I(0, false)],
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
  const onPaste = (e) => {
    if (e.target && (e.target.isContentEditable || e.target.matches('input,textarea'))) return;
    const f = imageFileFromPasteEvent(e);
    if (f) { e.preventDefault(); placePasted(f); }
  };
  let rT; const onResize = () => { clearTimeout(rT); rT = setTimeout(() => { const m = computeMode(); sizeBook(); if (m !== mode) rebuild(true); }, 160); };

  bookWrap.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);
  document.addEventListener('keydown', onKey);
  document.addEventListener('paste', onPaste);
  window.addEventListener('resize', onResize);
  // React when the editor first gets real dimensions (and on orientation change).
  const ro = new ResizeObserver(onResize);
  ro.observe(editor);

  applyViewMode();   // lookbooks open in viewing mode by default
  rebuild();

  return {
    destroy() {
      clearTimeout(saveT); persist();
      ro.disconnect();
      window.removeEventListener('pointerup', onUp);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('paste', onPaste);
      window.removeEventListener('resize', onResize);
      closeMenu();
    },
  };
}
