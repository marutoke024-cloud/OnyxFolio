// Album view — an image cloud. Random = a radial, overlapping spiral from the
// centre; a theme lays its matches out in a non-overlapping grid. Tap a work to
// view it large; long-press (or the edit button) to rename / tag it.
import { h, isTouch, toast, confirmModal, openModal, closeModal, qsa, rand } from '../lib/dom.js';
import { ico, icons } from '../lib/icons.js';
import { buildTopbar } from '../lib/chrome.js';
import { getFolder, getImages, addImage, updateImage, deleteImage, blobURL, revokeURL } from '../storage/db.js';
import { fileToImageRecord } from '../lib/image.js';
import { imageFileFromPasteEvent, readClipboardImageFile } from '../lib/clipboard.js';

const BASE_W = 320;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export async function mount(root, params, ctx) {
  const folderId = params.folderId;
  const folder = await getFolder(folderId);
  if (!folder) { ctx.nav('/folders'); return {}; }

  const UNTAGGED = ' untagged';   // sentinel "theme" for images with no tags
  let images = [];
  let activeTag = null;
  let items = [];

  const cloud = h('div.album-cloud');
  const rail = h('div.album-rail');
  const layout = h('div.album-layout', {}, [cloud, rail]);
  const progress = h('div.album-progress');
  const fileInput = h('input', { type: 'file', accept: 'image/*', multiple: true, style: { display: 'none' } });

  const topbar = buildTopbar({
    crumbs: [{ label: 'Folders', onClick: () => ctx.nav('/folders') }, { label: folder.name, jp: true }],
    actions: [
      { icon: 'book', title: 'Open portfolios', onClick: () => ctx.nav('/portfolio') },
      { icon: 'clipboard', title: 'Paste image from clipboard', onClick: () => pasteFromClipboard() },
      { icon: 'trash', title: 'Delete every image in this folder', onClick: () => clearFolder() },
      { icon: 'upload', label: 'Add', accent: true, title: 'Add images', onClick: () => fileInput.click() },
    ],
  });
  root.append(layout, topbar, progress, fileInput);

  let running = true, raf = 0, last = 0, t = 0, lastW = 0, lastH = 0;

  const allTagNames = () => { const s = new Set(); images.forEach((im) => (im.tags || []).forEach((tg) => s.add(tg))); return [...s]; };

  function emptyState() {
    return h('div.album-empty', {}, [
      h('button.drop', { type: 'button', onclick: () => fileInput.click() }, [
        ico('image'),
        h('h3.display', { text: 'This folder is empty' }),
        h('p', { text: 'Drop images here, or tap to choose photos. Tap a work to view it, long-press to tag it.' }),
        h('span.btn.btn-accent', { text: 'Choose images' }),
      ]),
    ]);
  }

  // The animated "cloud" doesn't scale — every image is its own GPU layer updated
  // each frame. Past this count we render a calm, scrollable, lazy-loaded grid.
  const CLOUD_MAX = 60;
  const gridMode = () => images.length > CLOUD_MAX;

  // tap → view large; long-press → edit metadata (shared by cloud items and grid cells)
  function attachItemHandlers(el, i) {
    let timer = null, moved = false, px = 0, py = 0;
    el.addEventListener('pointerdown', (e) => {
      moved = false; px = e.clientX; py = e.clientY;
      timer = setTimeout(() => { timer = null; openEditModal(i); }, 450);
    });
    el.addEventListener('pointermove', (e) => {
      if (Math.abs(e.clientX - px) > 8 || Math.abs(e.clientY - py) > 8) { moved = true; clearTimeout(timer); timer = null; }
    });
    el.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      if (timer) { clearTimeout(timer); timer = null; if (!moved) openLightbox(i); }
    });
    el.addEventListener('pointercancel', () => { clearTimeout(timer); timer = null; });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function build() {
    qsa('.cloud-item', cloud).forEach((e) => e.remove());
    cloud.querySelector('.album-grid')?.remove();
    cloud.querySelector('.album-empty')?.remove();
    items = []; stopLoop();
    if (!images.length) { cloud.classList.remove('grid-mode'); cloud.append(emptyState()); return; }
    if (gridMode()) { cloud.classList.add('grid-mode'); buildGrid(); }
    else { cloud.classList.remove('grid-mode'); buildCloud(); }
  }

  function buildGrid() {
    const grid = h('div.album-grid');
    images.forEach((im, i) => {
      const cell = h('div.grid-cell', { dataset: { index: i } }, [
        h('img', { src: blobURL('thumb-' + im.id, im.thumb), alt: im.name || '', loading: 'lazy', decoding: 'async', draggable: false }),
      ]);
      attachItemHandlers(cell, i);
      grid.append(cell);
    });
    cloud.append(grid);
    applyGridFilter();
  }
  function applyGridFilter() {
    const grid = cloud.querySelector('.album-grid'); if (!grid) return;
    grid.querySelector('.rail-empty')?.remove();
    let shown = 0;
    grid.querySelectorAll('.grid-cell').forEach((cell) => {
      const im = images[+cell.dataset.index];
      const show = !activeTag || (activeTag === UNTAGGED ? !(im.tags || []).length : (im.tags || []).includes(activeTag));
      cell.style.display = show ? '' : 'none';
      if (show) shown++;
    });
    if (!shown) grid.append(h('div.rail-empty', { text: 'No images for this theme.' }));
  }

  function buildCloud() {
    const W = cloud.clientWidth || window.innerWidth || 800;
    const H = cloud.clientHeight || window.innerHeight || 600;
    lastW = W; lastH = H;
    images.forEach((im, i) => {
      const aspect = (im.w && im.h) ? im.h / im.w : 1.3;
      const el = h('div.cloud-item', { dataset: { index: i } }, [
        h('img', { src: blobURL('thumb-' + im.id, im.thumb), alt: im.name || '', draggable: false, loading: 'lazy', decoding: 'async' }),
      ]);
      el.style.width = BASE_W + 'px';
      cloud.append(el);
      const s = {
        el, aspect, w0: BASE_W, ih0: BASE_W * aspect, hover: false,
        amp: rand(5, 11), spd: rand(0.12, 0.34), phx: rand(0, 6.28), phy: rand(0, 6.28),
        cx: W / 2, cy: H / 2, cs: 0.12, copacity: 0,
        tx: W / 2, ty: H / 2, ts: 0.3, topacity: 1, tz: 2,
      };
      el.addEventListener('pointerenter', () => { s.hover = true; el.classList.add('lift'); });
      el.addEventListener('pointerleave', () => { s.hover = false; el.classList.remove('lift'); });
      attachItemHandlers(el, i);
      items.push(s);
    });
    applyFilter();
    startLoop();
  }

  // Random → radial overlapping spiral from the centre
  function placeRadial(list, W, H) {
    const N = list.length; if (!N) return;
    const cx0 = W / 2, cy0 = H / 2, minWH = Math.min(W, H);
    let sizePx = minWH * 0.36, SP = sizePx * 0.5;
    const maxR = SP * Math.sqrt(Math.max(0, N - 0.6));
    const need = maxR + sizePx * 0.5, avail = minWH * 0.5;
    if (need > avail) { const k = avail / need; sizePx *= k; SP *= k; }
    const ex = Math.min(1.5, W / minWH);
    list.forEach((s, i) => {
      const ang = i * GOLDEN, r = i === 0 ? 0 : SP * Math.sqrt(i + 0.2);
      s.tx = cx0 + r * Math.cos(ang) * ex;
      s.ty = cy0 + r * Math.sin(ang);
      s.ts = sizePx / s.w0;
      s.tz = 60 + (N - i);
    });
  }
  // theme → centred grid, no overlap
  function placeGrid(list, W, H) {
    const N = list.length; if (!N) return;
    const cols = Math.max(1, Math.round(Math.sqrt(N * (W / H))));
    const rows = Math.ceil(N / cols);
    const cellW = (W * 0.92) / cols, cellH = (H * 0.9) / rows;
    const top = (H - rows * cellH) / 2;
    list.forEach((s, i) => {
      const row = Math.floor(i / cols), col = i % cols;
      const inRow = Math.min(cols, N - row * cols);
      const left = (W - inRow * cellW) / 2;
      s.tx = left + col * cellW + cellW / 2;
      s.ty = top + row * cellH + cellH / 2;
      s.ts = Math.min((cellW * 0.8) / s.w0, (cellH * 0.8) / s.ih0);
      s.tz = 300 + i;
    });
  }

  function applyFilter() {
    if (cloud.classList.contains('grid-mode')) { applyGridFilter(); return; }
    const W = cloud.clientWidth || 800, H = cloud.clientHeight || 600;
    if (!activeTag) {
      items.forEach((s) => { s.topacity = 1; s.el.classList.remove('recede'); });
      placeRadial(items, W, H);
      return;
    }
    const hit = (im) => activeTag === UNTAGGED ? !(im.tags || []).length : (im.tags || []).includes(activeTag);
    const match = [], other = [];
    items.forEach((s, i) => (hit(images[i]) ? match : other).push(s));
    placeGrid(match, W, H);
    match.forEach((s) => { s.topacity = 1; s.el.classList.remove('recede'); });
    other.forEach((s, k) => {
      const ang = (k / Math.max(1, other.length)) * Math.PI * 2;
      s.tx = W / 2 + Math.cos(ang) * W * 0.46;
      s.ty = H / 2 + Math.sin(ang) * H * 0.44;
      s.ts = 0.18; s.topacity = 0.1; s.tz = 1; s.el.classList.add('recede');
    });
  }

  function loop(now) {
    if (!running || document.hidden) { raf = 0; return; }
    const dt = Math.min(50, now - last); last = now; t += dt * 0.001;
    const W = cloud.clientWidth || 800, H = cloud.clientHeight || 600;
    for (const s of items) {
      s.cx += (s.tx - s.cx) * 0.06;
      s.cy += (s.ty - s.cy) * 0.06;
      s.cs += (s.ts - s.cs) * 0.07;
      s.copacity += (s.topacity - s.copacity) * 0.08;
      const driftK = activeTag ? 0.3 : 1;   // calm the drift while a theme grid is shown → no overlap
      const dx = driftK * s.amp * Math.sin(t * s.spd + s.phx);
      const dy = driftK * s.amp * 0.85 * Math.sin(t * s.spd * 0.9 + s.phy);
      let scale = s.cs, z = s.tz;
      if (s.hover) { scale = s.cs * 1.14; z = 9999; }
      const hw = s.w0 * scale / 2, hh = s.ih0 * scale / 2;
      let x = Math.max(hw + 2, Math.min(W - hw - 2, s.cx + dx));
      let y = Math.max(hh + 2, Math.min(H - hh - 2, s.cy + dy));
      s.el.style.transform = `translate3d(${(x - s.w0 / 2).toFixed(1)}px, ${(y - s.ih0 / 2).toFixed(1)}px, 0) scale(${scale.toFixed(3)})`;
      s.el.style.opacity = s.copacity.toFixed(3);
      s.el.style.zIndex = String(z);
    }
    raf = requestAnimationFrame(loop);
  }
  function startLoop() { if (running && !document.hidden && !raf && items.length) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  function stopLoop() { cancelAnimationFrame(raf); raf = 0; }

  cloud.addEventListener('click', (e) => { if (e.target === cloud && activeTag) setTag(null); });

  // --- tag rail ---
  function allTags() {
    const m = new Map();
    images.forEach((im) => (im.tags || []).forEach((tg) => m.set(tg, (m.get(tg) || 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }
  function renderRail() {
    rail.innerHTML = '';
    rail.append(h('button.rail-slideshow', { title: 'Play a full-screen random slideshow of this folder', onclick: () => startSlideshow() }, [
      ico('play'), h('span', { text: 'Slide Show' }),
    ]));
    rail.append(h('div.rail-head', { text: 'Themes' }));
    rail.append(h('button.rail-tag.random' + (activeTag ? '' : '.active'), { onclick: onRandom }, [
      h('span', { text: 'Random' }), h('span.count', { text: String(images.length) }),
    ]));
    const untagged = images.filter((im) => !(im.tags || []).length).length;
    if (untagged) rail.append(h('button.rail-tag' + (activeTag === UNTAGGED ? '.active' : ''), { onclick: () => setTag(UNTAGGED) }, [
      h('span.jp', { text: '未設定' }), h('span.count', { text: String(untagged) }),
    ]));
    const tags = allTags();
    if (tags.length) rail.append(h('div.rail-sep'));
    if (!tags.length) rail.append(h('div.rail-empty', { text: 'No tags yet. Long-press a work to tag it — themes appear here.' }));
    tags.forEach(([tg, n]) => rail.append(h('button.rail-tag' + (activeTag === tg ? '.active' : ''), { onclick: () => setTag(tg) }, [
      h('span.jp', { text: tg }), h('span.count', { text: String(n) }),
    ])));
  }
  function setTag(tg) { activeTag = (tg === activeTag) ? null : tg; renderRail(); applyFilter(); }
  function onRandom() { activeTag = null; renderRail(); applyFilter(); }

  async function reload() { images = await getImages(folderId); build(); renderRail(); }

  // empty the whole folder — one explicit warning before anything is removed
  async function clearFolder() {
    if (!images.length) { toast('This folder is already empty.'); return; }
    const ok = await confirmModal({
      title: 'Delete every image in this folder?',
      message: `All ${images.length} image${images.length === 1 ? '' : 's'} in “${folder.name}” will be permanently removed from this device. This cannot be undone.`,
      confirmText: 'Delete all', danger: true,
    });
    if (!ok) return;
    const ids = images.map((im) => im.id);
    for (const id of ids) { await deleteImage(id); revokeURL('thumb-' + id); revokeURL('full-' + id); }
    await reload();
    toast(`Deleted ${ids.length} image${ids.length === 1 ? '' : 's'}.`);
  }

  // --- add images ---
  async function handleFiles(fileList) {
    const files = [...fileList].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    progress.classList.add('show');
    let n = 0;
    for (const f of files) {
      try { await addImage(await fileToImageRecord(f, folderId)); } catch (e) { console.warn('skip', f.name, e); }
      progress.textContent = `Importing ${++n} / ${files.length}`;
    }
    progress.classList.remove('show');
    toast(`Added ${n} image${n === 1 ? '' : 's'}.`);
    await reload();
  }
  fileInput.addEventListener('change', () => { handleFiles(fileInput.files); fileInput.value = ''; });
  // paste a copied image: Ctrl/Cmd+V (desktop) or the clipboard button (mobile)
  const onPaste = (e) => {
    if (e.target && (e.target.isContentEditable || e.target.matches('input,textarea'))) return;
    const f = imageFileFromPasteEvent(e);
    if (f) { e.preventDefault(); handleFiles([f]); }
  };
  document.addEventListener('paste', onPaste);
  async function pasteFromClipboard() {
    const f = await readClipboardImageFile();
    if (f) handleFiles([f]);
    else toast('No image found in the clipboard.');
  }
  cloud.addEventListener('dragover', (e) => { e.preventDefault(); cloud.classList.add('drag-over'); });
  cloud.addEventListener('dragleave', (e) => { if (!cloud.contains(e.relatedTarget)) cloud.classList.remove('drag-over'); });
  cloud.addEventListener('drop', (e) => { e.preventDefault(); cloud.classList.remove('drag-over'); handleFiles(e.dataTransfer.files); });

  // --- edit modal (long-press / edit button): rename + tags (with suggestions) ---
  function openEditModal(i) {
    const im = images[i]; if (!im) return;
    const nameInput = h('input.field.jp', { value: im.name || '', placeholder: 'Untitled', spellcheck: false });
    const chips = h('div.lb-tags');
    const tagInput = h('input.field.jp', { placeholder: 'Add or pick a tag…', spellcheck: false, autocomplete: 'off' });
    // custom suggestion dropdown (iOS Safari ignores <datalist>)
    const suggest = h('div.tag-suggest');
    const allNames = allTagNames();
    const renderSuggest = () => {
      const v = tagInput.value.trim().toLowerCase();
      const cur = im.tags || [];
      const matches = allNames.filter((t) => !cur.includes(t) && (!v || t.toLowerCase().includes(v))).slice(0, 14);
      suggest.innerHTML = '';
      if (!matches.length) { suggest.classList.remove('show'); return; }
      matches.forEach((t) => suggest.append(h('button.tag-sug.jp', { type: 'button', text: t, onmousedown: (e) => e.preventDefault(), onclick: () => { tagInput.value = t; addTag(); } })));
      suggest.classList.add('show');
    };
    const renderChips = () => {
      chips.innerHTML = '';
      (im.tags || []).forEach((tg) => chips.append(h('span.chip.jp', {}, [
        h('span', { text: tg }),
        h('button', { title: 'Remove', html: icons.close, onclick: () => { im.tags = (im.tags || []).filter((x) => x !== tg); updateImage(im.id, { tags: im.tags }); renderChips(); renderRail(); applyFilter(); } }),
      ])));
      if (!(im.tags || []).length) chips.append(h('span.rail-empty', { text: 'No tags yet.' }));
    };
    const addTag = () => {
      const v = tagInput.value.trim(); if (!v) return;
      im.tags = im.tags || [];
      if (!im.tags.includes(v)) { im.tags.push(v); updateImage(im.id, { tags: im.tags }); renderChips(); renderRail(); applyFilter(); }
      tagInput.value = '';
      renderSuggest();
      tagInput.focus();
    };
    tagInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } });
    tagInput.addEventListener('input', renderSuggest);
    tagInput.addEventListener('focus', renderSuggest);
    renderChips();
    renderSuggest();
    const save = () => { closeModal(); im.name = nameInput.value.trim(); updateImage(im.id, { name: im.name }); };
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    const del = async () => {
      closeModal();
      const ok = await confirmModal({ title: 'Delete image?', message: 'This removes it from the folder on this device.', confirmText: 'Delete', danger: true });
      if (ok) { closeLightbox(); await deleteImage(im.id); revokeURL('thumb-' + im.id); revokeURL('full-' + im.id); await reload(); }
    };
    const modal = h('div.modal', {}, [
      h('h2.display', { text: 'Edit image' }),
      h('div.row', {}, [h('label', { text: 'Name' }), nameInput]),
      h('div.row', {}, [
        h('label', { text: 'Tags' }), chips,
        h('div.lb-tag-add', {}, [tagInput, h('button.icon-btn', { onclick: addTag, title: 'Add tag' }, [ico('plus')])]), suggest,
      ]),
      h('div.modal-actions', { style: { justifyContent: 'space-between' } }, [
        h('button.btn.btn-danger.btn-with-ico', { onclick: del }, [ico('trash'), h('span', { text: 'Delete' })]),
        h('div', { style: { display: 'flex', gap: '10px' } }, [
          h('button.btn.btn-ghost', { text: 'Close', onclick: () => closeModal() }),
          h('button.btn.btn-accent', { text: 'Save', onclick: save }),
        ]),
      ]),
    ]);
    openModal(modal);
    setTimeout(() => nameInput.focus(), 120);
  }

  // --- lightbox (view only) ---
  let lbIndex = -1;
  const lbImg = h('img', { alt: '' });
  const lbClose = h('button.icon-btn.lb-close', { onclick: closeLightbox }, [ico('close')]);
  const lbStage = h('div.lb-stage', {}, [
    h('button.icon-btn.lb-nav.prev', { onclick: () => step(-1) }, [ico('back')]),
    lbImg,
    h('button.icon-btn.lb-nav.next', { onclick: () => step(1), style: { transform: 'translateY(-50%) scaleX(-1)' } }, [ico('back')]),
  ]);
  lbStage.addEventListener('click', (e) => { if (e.target === lbStage) closeLightbox(); });
  const lightbox = h('div.lightbox', {}, [
    lbStage,
    h('div.lb-tools', {}, [
      h('button.icon-btn', { title: 'Edit', onclick: () => openEditModal(lbIndex) }, [ico('edit')]),
      h('button.icon-btn', { title: 'Delete', onclick: deleteCurrent }, [ico('trash')]),
    ]),
    lbClose,
  ]);
  document.body.append(lightbox);

  // --- zoom & pan (wheel · pinch · drag) ---
  let zScale = 1, zx = 0, zy = 0;
  const applyZoom = () => { lbImg.style.transform = `translate(${zx.toFixed(1)}px, ${zy.toFixed(1)}px) scale(${zScale.toFixed(3)})`; lbImg.style.cursor = zScale > 1 ? 'grab' : 'auto'; };
  const resetZoom = () => { zScale = 1; zx = 0; zy = 0; applyZoom(); };
  function clampPan() {
    const sr = lbStage.getBoundingClientRect();
    const mx = Math.max(0, (lbImg.clientWidth * zScale - sr.width) / 2 + 30);
    const my = Math.max(0, (lbImg.clientHeight * zScale - sr.height) / 2 + 30);
    zx = Math.max(-mx, Math.min(mx, zx)); zy = Math.max(-my, Math.min(my, zy));
  }
  function zoomAt(clientX, clientY, factor) {
    const sr = lbStage.getBoundingClientRect();
    const mx = clientX - (sr.left + sr.width / 2), my = clientY - (sr.top + sr.height / 2);
    const ns = Math.max(1, Math.min(6, zScale * factor)), k = ns / zScale;
    zx = mx - (mx - zx) * k; zy = my - (my - zy) * k; zScale = ns;
    if (zScale <= 1.001) { zScale = 1; zx = 0; zy = 0; }
    clampPan(); applyZoom();
  }
  lbStage.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.18 : 1 / 1.18); }, { passive: false });
  lbImg.addEventListener('dblclick', (e) => { e.preventDefault(); zScale > 1 ? resetZoom() : zoomAt(e.clientX, e.clientY, 2.4); });
  const pts = new Map();
  let pinchD = 0, pinchS0 = 1, panSX = 0, panSY = 0, panZX = 0, panZY = 0, panning = false;
  lbStage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.icon-btn')) return;
    pts.set(e.pointerId, e);
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinchD = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); pinchS0 = zScale; panning = false; }
    else if (zScale > 1) { panning = true; panSX = e.clientX; panSY = e.clientY; panZX = zx; panZY = zy; lbImg.style.cursor = 'grabbing'; try { lbStage.setPointerCapture(e.pointerId); } catch {} }
  });
  lbStage.addEventListener('pointermove', (e) => {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, e);
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      zoomAt((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2, (Math.max(1, Math.min(6, pinchS0 * d / (pinchD || 1)))) / zScale);
    } else if (panning) { zx = panZX + (e.clientX - panSX); zy = panZY + (e.clientY - panSY); clampPan(); applyZoom(); }
  });
  const endPt = (e) => { pts.delete(e.pointerId); if (pts.size < 2) { panning = false; lbImg.style.cursor = zScale > 1 ? 'grab' : 'auto'; } };
  lbStage.addEventListener('pointerup', endPt);
  lbStage.addEventListener('pointercancel', endPt);

  // iOS Safari refuses to render very large originals straight into an <img>
  // (the broken-image glyph the user saw). Decode + downscale to a screen-sized
  // bitmap first — createImageBitmap copes with images <img> chokes on — and keep
  // the result keyed by id. On any failure we fall back to the thumbnail, so the
  // lightbox never shows a broken icon. Nothing is written back to the DB.
  const VIEW_MAX = 2048;            // long-edge px — well under iOS canvas limits
  const viewCache = new Map();      // id → object URL of the downscaled view
  const ownedViewURLs = new Set();  // only URLs we created here are ours to revoke
  async function viewURLFor(im) {
    if (viewCache.has(im.id)) return viewCache.get(im.id);
    const srcBlob = im.blob || im.thumb;
    if (!srcBlob) return '';
    if ('createImageBitmap' in window) {
      try {
        const lw = im.w || 0, lh = im.h || 0, long = Math.max(lw, lh);
        const opts = (long > VIEW_MAX && lw && lh)
          ? { resizeWidth: Math.round(lw * VIEW_MAX / long), resizeHeight: Math.round(lh * VIEW_MAX / long), resizeQuality: 'high' }
          : {};
        const bmp = await createImageBitmap(srcBlob, opts);
        const cv = document.createElement('canvas');
        cv.width = bmp.width; cv.height = bmp.height;
        cv.getContext('2d').drawImage(bmp, 0, 0);
        if (bmp.close) bmp.close();
        const out = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.9));
        if (out) { const u = URL.createObjectURL(out); viewCache.set(im.id, u); ownedViewURLs.add(u); return u; }
      } catch { /* fall through to the raw blob / thumbnail */ }
    }
    const u = blobURL('full-' + im.id, srcBlob);
    viewCache.set(im.id, u);
    return u;
  }
  let showToken = 0;
  async function showCurrent() {
    const im = images[lbIndex]; if (!im) return;
    const token = ++showToken;
    resetZoom();
    // Hide the <img> until the NEW picture is ready. showCurrent is async (the view
    // is decoded on demand), so without this the lightbox keeps painting the
    // PREVIOUS image during the gap — the brief flash the user saw on iOS.
    lbImg.classList.remove('ready');
    lbImg.onload = () => { if (token === showToken) lbImg.classList.add('ready'); };
    lbImg.onerror = () => { if (token === showToken && im.thumb) lbImg.src = blobURL('thumb-' + im.id, im.thumb); };
    const url = await viewURLFor(im);
    if (token !== showToken) return;   // a newer step()/open() superseded this one
    const next = url || (im.thumb ? blobURL('thumb-' + im.id, im.thumb) : '');
    if (lbImg.src === next && next) lbImg.classList.add('ready');   // same src won't refire onload
    else lbImg.src = next;
  }
  function openLightbox(i) { lbIndex = i; showCurrent(); lightbox.classList.add('in'); document.addEventListener('keydown', lbKeys); }
  function closeLightbox() { lightbox.classList.remove('in'); document.removeEventListener('keydown', lbKeys); }
  // when a theme is active, prev/next walk the FILTERED set (the images actually
  // on screen) rather than the whole folder order
  const matchesTag = (im) => !activeTag || (activeTag === UNTAGGED ? !(im.tags || []).length : (im.tags || []).includes(activeTag));
  const visibleSeq = () => images.map((_, i) => i).filter((i) => matchesTag(images[i]));
  function step(d) {
    const seq = visibleSeq();
    if (!seq.length) return;
    let pos = seq.indexOf(lbIndex);
    if (pos === -1) pos = 0;
    pos = (pos + d + seq.length) % seq.length;
    lbIndex = seq[pos];
    showCurrent();
  }
  function lbKeys(e) {
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  }
  async function deleteCurrent() {
    const im = images[lbIndex]; if (!im) return;
    const ok = await confirmModal({ title: 'Delete image?', message: 'This removes it from the folder on this device.', confirmText: 'Delete', danger: true });
    if (!ok) return;
    await deleteImage(im.id); revokeURL('thumb-' + im.id); revokeURL('full-' + im.id);
    await reload();
    if (!images.length) return closeLightbox();
    lbIndex = Math.min(lbIndex, images.length - 1); showCurrent();
  }

  // --- slideshow (full-screen, random, no repeat until the folder is exhausted) ---
  const SS_SPEEDS = [3, 5, 10, 20, 30];
  let ssInterval = 5, ssTimer = 0, ssOrder = [], ssPos = 0, ssActive = false, ssPaused = false, ssToken = 0, ssLast = -1, ssFront = 0;
  // two stacked images → crossfade with no black frame between slides
  const ssImgs = [h('img.ss-img', { alt: '', draggable: false }), h('img.ss-img', { alt: '', draggable: false })];
  const ssStage = h('div.ss-stage', {}, ssImgs);
  const ssSpeedBtns = new Map();
  const ssBar = h('div.ss-bar', {}, SS_SPEEDS.map((s) => {
    const b = h('button.ss-speed', { text: s + '秒', onclick: () => { setSpeed(s); ssBar.classList.remove('open'); } });
    ssSpeedBtns.set(s, b); return b;
  }));
  // controls collapse into translucent corner buttons (speed = bottom-left, pause = bottom-right)
  const ssSpeedToggle = h('button.ss-ctl.ss-speedtoggle', { title: 'Slide interval', onclick: () => ssBar.classList.toggle('open') }, [ico('timer')]);
  const ssPlayBtn = h('button.ss-ctl.ss-playpause', { title: 'Pause', onclick: () => ssTogglePause() }, [ico('pause')]);
  const slideshow = h('div.slideshow', {}, [ssStage, ssBar, ssSpeedToggle, ssPlayBtn]);
  // Tap the image/margin to exit. The listener lives on the stage only — the
  // controls are siblings, so their clicks never reach it (and a control that
  // swaps its own icon mid-click can't fool a target-based guard).
  ssStage.addEventListener('click', () => ssConfirmExit());
  document.body.append(slideshow);

  const ssApplySpeed = () => ssSpeedBtns.forEach((b, s) => b.classList.toggle('active', s === ssInterval));
  function ssShuffle() {
    ssOrder = images.map((_, i) => i);
    for (let i = ssOrder.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ssOrder[i], ssOrder[j]] = [ssOrder[j], ssOrder[i]]; }
    // don't repeat the last-shown image straight across a reshuffle boundary
    if (ssLast >= 0 && ssOrder.length > 1 && ssOrder[0] === ssLast) { [ssOrder[0], ssOrder[1]] = [ssOrder[1], ssOrder[0]]; }
    ssPos = 0;
  }
  async function ssRender() {
    const im = images[ssOrder[ssPos]]; if (!im) return;
    ssLast = ssOrder[ssPos];
    const token = ++ssToken;
    const incoming = ssImgs[1 - ssFront], outgoing = ssImgs[ssFront];
    const url = await viewURLFor(im);
    if (token !== ssToken) return;
    const src = url || (im.thumb ? blobURL('thumb-' + im.id, im.thumb) : '');
    // crossfade: the incoming sits on top and fades in while the outgoing stays
    // opaque beneath, so the screen never drops to black between slides
    const reveal = () => {
      if (token !== ssToken) return;
      incoming.style.zIndex = '2'; outgoing.style.zIndex = '1';
      incoming.classList.add('show'); outgoing.classList.remove('show');
      ssFront = 1 - ssFront;
    };
    if (incoming.getAttribute('src') === src && src) reveal();
    else { incoming.onload = reveal; incoming.src = src; }
    const nx = images[ssOrder[(ssPos + 1) % ssOrder.length]];   // warm the next one
    if (nx) viewURLFor(nx);
  }
  function ssSchedule() { clearTimeout(ssTimer); if (!ssPaused) ssTimer = setTimeout(ssAdvance, ssInterval * 1000); }
  function ssAdvance() {
    ssPos++;
    if (ssPos >= ssOrder.length) ssShuffle();   // every image shown once → reshuffle & loop
    ssRender(); ssSchedule();
  }
  function setSpeed(s) { ssInterval = s; ssApplySpeed(); if (ssActive && !ssPaused) ssSchedule(); }
  function ssTogglePause() {
    ssPaused = !ssPaused;
    ssPlayBtn.innerHTML = ''; ssPlayBtn.append(ico(ssPaused ? 'play' : 'pause'));
    ssPlayBtn.title = ssPaused ? 'Resume' : 'Pause';
    ssPlayBtn.classList.toggle('paused', ssPaused);
    if (ssPaused) clearTimeout(ssTimer); else ssSchedule();   // resume continues from the current slide
  }
  function ssResetPlayBtn() { ssPlayBtn.innerHTML = ''; ssPlayBtn.append(ico('pause')); ssPlayBtn.title = 'Pause'; ssPlayBtn.classList.remove('paused'); }
  function startSlideshow() {
    if (!images.length) { toast('No images to show in this folder.'); return; }
    ssActive = true; ssPaused = false; ssLast = -1; ssFront = 0; ssShuffle(); ssApplySpeed();
    ssBar.classList.remove('open'); ssResetPlayBtn();
    ssImgs.forEach((im) => { im.classList.remove('show'); im.removeAttribute('src'); });
    // Hide the gallery underneath. On iPad a long slideshow can make iOS drop the
    // fixed overlay's backing layer, letting the album grid behind bleed through —
    // with nothing behind to show, that can't happen. (visibility keeps layout, so
    // no resize/rebuild churn.)
    root.style.visibility = 'hidden';
    stopLoop();
    slideshow.classList.add('in');
    ssRender(); ssSchedule();
  }
  function stopSlideshow() {
    ssActive = false; ssPaused = false; clearTimeout(ssTimer);
    slideshow.classList.remove('in'); ssBar.classList.remove('open');
    ssImgs.forEach((im) => { im.classList.remove('show'); im.removeAttribute('src'); });
    root.style.visibility = '';
    startLoop();
  }
  // confirm-to-exit; pause while the dialog is up, resume on "no" / backdrop tap
  function ssConfirmExit() {
    if (!ssActive) return;
    clearTimeout(ssTimer);
    const ov = document.getElementById('overlay');
    let settled = false;
    const finish = (exit) => {
      if (settled) return; settled = true;
      ov && ov.removeEventListener('click', onBackdrop);
      closeModal();
      if (exit) stopSlideshow();
      else if (ssActive && !ssPaused) ssSchedule();   // resume only if it was playing
    };
    const onBackdrop = (e) => { if (e.target === ov) finish(false); };
    openModal(h('div.modal', {}, [
      h('h2.display', { text: 'スライドショーを終了しますか？' }),
      h('div.modal-actions', { style: { justifyContent: 'center' } }, [
        h('button.btn.btn-ghost', { text: 'いいえ', onclick: () => finish(false) }),
        h('button.btn.btn-danger', { text: '終了する', onclick: () => finish(true) }),
      ]),
    ]));
    if (ov) ov.addEventListener('click', onBackdrop);
  }

  // --- lifecycle ---
  const onVis = () => { if (document.hidden) stopLoop(); else startLoop(); };
  document.addEventListener('visibilitychange', onVis);
  let rt; const ro = new ResizeObserver(() => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      if (gridMode()) return;   // the CSS grid reflows itself; only the cloud needs replacing
      const W = cloud.clientWidth, H = cloud.clientHeight;
      if (Math.abs(W - lastW) > 24 || Math.abs(H - lastH) > 24) build();
    }, 180);
  });
  ro.observe(cloud);

  await reload();

  return {
    destroy() {
      running = false; stopLoop();
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('keydown', lbKeys);
      ro.disconnect();
      ownedViewURLs.forEach((u) => URL.revokeObjectURL(u));
      ownedViewURLs.clear(); viewCache.clear();
      clearTimeout(ssTimer); slideshow.remove();
      lightbox.remove();
    },
  };
}
