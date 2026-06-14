// Album view — an image cloud. Random = a radial, overlapping spiral from the
// centre; a theme lays its matches out in a non-overlapping grid. Tap a work to
// view it large; long-press (or the edit button) to rename / tag it.
import { h, isTouch, toast, confirmModal, openModal, closeModal, qsa, rand } from '../lib/dom.js';
import { ico, icons } from '../lib/icons.js';
import { buildTopbar } from '../lib/chrome.js';
import { getFolder, getImages, addImage, updateImage, deleteImage, blobURL, revokeURL } from '../storage/db.js';
import { fileToImageRecord } from '../lib/image.js';

const BASE_W = 320;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export async function mount(root, params, ctx) {
  const folderId = params.folderId;
  const folder = await getFolder(folderId);
  if (!folder) { ctx.nav('/folders'); return {}; }

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

  function buildCloud() {
    qsa('.cloud-item', cloud).forEach((e) => e.remove());
    const ex = cloud.querySelector('.album-empty'); if (ex) ex.remove();
    items = [];
    if (!images.length) { cloud.append(emptyState()); return; }
    const W = cloud.clientWidth || window.innerWidth || 800;
    const H = cloud.clientHeight || window.innerHeight || 600;
    lastW = W; lastH = H;
    images.forEach((im, i) => {
      const aspect = (im.w && im.h) ? im.h / im.w : 1.3;
      const el = h('div.cloud-item', { dataset: { index: i } }, [
        h('img', { src: blobURL('thumb-' + im.id, im.thumb), alt: im.name || '', draggable: false }),
      ]);
      el.style.width = BASE_W + 'px';
      cloud.append(el);
      const s = {
        el, aspect, w0: BASE_W, ih0: BASE_W * aspect, hover: false,
        amp: rand(5, 11), spd: rand(0.12, 0.34), phx: rand(0, 6.28), phy: rand(0, 6.28),
        cx: W / 2, cy: H / 2, cs: 0.12, copacity: 0,
        tx: W / 2, ty: H / 2, ts: 0.3, topacity: 1, tz: 2,
      };
      // tap → view large; long-press → edit metadata
      let timer = null, moved = false, px = 0, py = 0;
      el.addEventListener('pointerenter', () => { s.hover = true; el.classList.add('lift'); });
      el.addEventListener('pointerleave', () => { s.hover = false; el.classList.remove('lift'); });
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
    const W = cloud.clientWidth || 800, H = cloud.clientHeight || 600;
    if (!activeTag) {
      items.forEach((s) => { s.topacity = 1; s.el.classList.remove('recede'); });
      placeRadial(items, W, H);
      return;
    }
    const match = [], other = [];
    items.forEach((s, i) => ((images[i].tags || []).includes(activeTag) ? match : other).push(s));
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
    rail.append(h('div.rail-head', { text: 'Themes' }));
    rail.append(h('button.rail-tag.random' + (activeTag ? '' : '.active'), { onclick: onRandom }, [
      h('span', { text: 'Random' }), h('span.count', { text: String(images.length) }),
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

  async function reload() { images = await getImages(folderId); buildCloud(); renderRail(); }

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
  cloud.addEventListener('dragover', (e) => { e.preventDefault(); cloud.classList.add('drag-over'); });
  cloud.addEventListener('dragleave', (e) => { if (!cloud.contains(e.relatedTarget)) cloud.classList.remove('drag-over'); });
  cloud.addEventListener('drop', (e) => { e.preventDefault(); cloud.classList.remove('drag-over'); handleFiles(e.dataTransfer.files); });

  // --- edit modal (long-press / edit button): rename + tags (with suggestions) ---
  function openEditModal(i) {
    const im = images[i]; if (!im) return;
    const nameInput = h('input.field.jp', { value: im.name || '', placeholder: 'Untitled', spellcheck: false });
    const chips = h('div.lb-tags');
    const tagInput = h('input.field.jp', { placeholder: 'Add or pick a tag…', spellcheck: false, list: 'onyx-tag-suggest' });
    const datalist = h('datalist', { id: 'onyx-tag-suggest' }, allTagNames().map((tg) => h('option', { value: tg })));
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
    };
    tagInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } });
    tagInput.addEventListener('change', () => { if (tagInput.value.trim()) addTag(); });  // picking a suggestion
    renderChips();
    const save = () => { closeModal(); im.name = nameInput.value.trim(); updateImage(im.id, { name: im.name }); };
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    const del = async () => {
      closeModal();
      const ok = await confirmModal({ title: 'Delete image?', message: 'This removes it from the folder on this device.', confirmText: 'Delete', danger: true });
      if (ok) { await deleteImage(im.id); revokeURL('thumb-' + im.id); revokeURL('full-' + im.id); await reload(); }
    };
    const modal = h('div.modal', {}, [
      h('h2.display', { text: 'Edit image' }),
      h('div.row', {}, [h('label', { text: 'Name' }), nameInput]),
      h('div.row', {}, [
        h('label', { text: 'Tags' }), chips,
        h('div.lb-tag-add', {}, [tagInput, h('button.icon-btn', { onclick: addTag, title: 'Add tag' }, [ico('plus')])]), datalist,
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
      h('button.icon-btn', { title: 'Edit', onclick: () => { const i = lbIndex; closeLightbox(); openEditModal(i); } }, [ico('edit')]),
      h('button.icon-btn', { title: 'Delete', onclick: deleteCurrent }, [ico('trash')]),
    ]),
    lbClose,
  ]);
  document.body.append(lightbox);

  function showCurrent() { const im = images[lbIndex]; if (im) lbImg.src = blobURL('full-' + im.id, im.blob || im.thumb); }
  function openLightbox(i) { lbIndex = i; showCurrent(); lightbox.classList.add('in'); document.addEventListener('keydown', lbKeys); }
  function closeLightbox() { lightbox.classList.remove('in'); document.removeEventListener('keydown', lbKeys); }
  function step(d) { if (!images.length) return; lbIndex = (lbIndex + d + images.length) % images.length; showCurrent(); }
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

  // --- lifecycle ---
  const onVis = () => { if (document.hidden) stopLoop(); else startLoop(); };
  document.addEventListener('visibilitychange', onVis);
  let rt; const ro = new ResizeObserver(() => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      const W = cloud.clientWidth, H = cloud.clientHeight;
      if (Math.abs(W - lastW) > 24 || Math.abs(H - lastH) > 24) buildCloud();
    }, 180);
  });
  ro.observe(cloud);

  await reload();

  return {
    destroy() {
      running = false; stopLoop();
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('keydown', lbKeys);
      ro.disconnect();
      lightbox.remove();
    },
  };
}
