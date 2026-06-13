// Album view — an image cloud: works lie freely in space, overlapping and
// drifting irregularly. Selecting a tag floats matching works forward.
import { h, isTouch, toast, confirmModal, qsa, rand, clamp } from '../lib/dom.js';
import { ico, icons } from '../lib/icons.js';
import { buildTopbar } from '../lib/chrome.js';
import { getFolder, getImages, addImage, updateImage, deleteImage, blobURL, revokeURL } from '../storage/db.js';
import { fileToImageRecord } from '../lib/image.js';

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

  // --- cloud animation state ---
  let running = true, raf = 0, last = 0, t = 0, lastW = 0, lastH = 0;

  function emptyState() {
    return h('div.album-empty', {}, [
      h('button.drop', { type: 'button', onclick: () => fileInput.click() }, [
        ico('image'),
        h('h3.display', { text: 'This folder is empty' }),
        h('p', { text: 'Drop images here, or tap to choose photos. Tag them and they’ll float forward on demand.' }),
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
      const w = clamp(rand(0.13, 0.2) * Math.min(W, 1100), 130, 300);
      const ih = w * aspect;
      const el = h('div.cloud-item', { dataset: { index: i } }, [
        h('img', { src: blobURL('thumb-' + im.id, im.thumb), alt: im.name || '', draggable: false }),
      ]);
      el.style.width = w + 'px';
      cloud.append(el);
      const depth = rand(0.8, 1.16);
      const s = {
        el, w, ih,
        bx: rand(0.15, 0.85) * W, by: rand(0.16, 0.84) * H,
        rot: rand(-13, 13), depth, z: Math.round(depth * 100),
        amp: rand(9, 24), spd: rand(0.1, 0.4), phx: rand(0, 6.28), phy: rand(0, 6.28), hover: false,
      };
      s.tx = s.bx; s.ty = s.by; s.ts = depth; s.topacity = 1; s.tz = s.z;
      s.cx = s.bx; s.cy = s.by; s.cs = depth; s.copacity = 1;
      el.addEventListener('pointerenter', () => { s.hover = true; el.classList.add('lift'); });
      el.addEventListener('pointerleave', () => { s.hover = false; el.classList.remove('lift'); });
      el.addEventListener('click', () => openLightbox(i));
      items.push(s);
    });
    applyFilter();
    startLoop();
  }

  function applyFilter() {
    const W = cloud.clientWidth || 800, H = cloud.clientHeight || 600;
    items.forEach((s, i) => {
      const im = images[i];
      if (!activeTag) {
        s.tx = s.bx; s.ty = s.by; s.ts = s.depth; s.topacity = 1; s.tz = s.z;
        s.el.classList.remove('recede');
      } else if ((im.tags || []).includes(activeTag)) {
        s.tx = (0.3 + Math.random() * 0.4) * W;
        s.ty = (0.22 + Math.random() * 0.56) * H;
        s.ts = s.depth * 1.32; s.topacity = 1; s.tz = 300 + i;
        s.el.classList.remove('recede');
      } else {
        s.tx = s.bx; s.ty = s.by; s.ts = s.depth * 0.66; s.topacity = 0.12; s.tz = s.z;
        s.el.classList.add('recede');
      }
    });
  }

  function loop(now) {
    if (!running || document.hidden) { raf = 0; return; }
    const dt = Math.min(50, now - last); last = now; t += dt * 0.001;
    for (const s of items) {
      s.cx += (s.tx - s.cx) * 0.06;
      s.cy += (s.ty - s.cy) * 0.06;
      s.cs += (s.ts - s.cs) * 0.08;
      s.copacity += (s.topacity - s.copacity) * 0.08;
      const dx = s.amp * Math.sin(t * s.spd + s.phx);
      const dy = s.amp * 0.8 * Math.sin(t * s.spd * 0.85 + s.phy);
      const wob = 2.2 * Math.sin(t * s.spd * 0.5 + s.phy);
      let scale = s.cs, z = s.tz, rot = s.rot + wob;
      if (s.hover) { scale = s.cs * 1.12; z = 9999; rot = s.rot * 0.25; }
      s.el.style.transform = `translate3d(${(s.cx - s.w / 2 + dx).toFixed(1)}px, ${(s.cy - s.ih / 2 + dy).toFixed(1)}px, 0) rotate(${rot.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
      s.el.style.opacity = s.copacity.toFixed(3);
      s.el.style.zIndex = String(z);
    }
    raf = requestAnimationFrame(loop);
  }
  function startLoop() { if (running && !document.hidden && !raf && items.length) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  function stopLoop() { cancelAnimationFrame(raf); raf = 0; }

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
    if (!tags.length) rail.append(h('div.rail-empty', { text: 'No tags yet. Open an image to tag it — themes appear here to float matching works forward.' }));
    tags.forEach(([tg, n]) => rail.append(h('button.rail-tag' + (activeTag === tg ? '.active' : ''), { onclick: () => setTag(tg) }, [
      h('span.jp', { text: tg }), h('span.count', { text: String(n) }),
    ])));
  }
  function setTag(tg) { activeTag = (tg === activeTag) ? null : tg; renderRail(); applyFilter(); }
  function onRandom() { activeTag = null; reshuffle(); renderRail(); applyFilter(); }
  function reshuffle() {
    const W = cloud.clientWidth || 800, H = cloud.clientHeight || 600;
    items.forEach((s) => { s.bx = rand(0.15, 0.85) * W; s.by = rand(0.16, 0.84) * H; s.rot = rand(-13, 13); });
  }

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

  // --- lightbox ---
  let lbIndex = -1;
  const lbImg = h('img', { alt: '' });
  const lbName = h('input.lb-name.jp', { spellcheck: false, placeholder: 'Untitled' });
  const lbTags = h('div.lb-tags');
  const lbTagInput = h('input.field.jp', { placeholder: 'Add a tag…', spellcheck: false });
  const lbMeta = h('div.lb-meta');
  const lbClose = h('button.icon-btn.lb-close', { onclick: closeLightbox }, [ico('close')]);

  const lbAddTag = () => {
    const v = lbTagInput.value.trim(); if (!v) return;
    const im = images[lbIndex]; const tags = im.tags || [];
    if (!tags.includes(v)) { tags.push(v); im.tags = tags; updateImage(im.id, { tags }); renderTagChips(); renderRail(); applyFilter(); }
    lbTagInput.value = '';
  };
  lbTagInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') lbAddTag(); });

  const lightbox = h('div.lightbox', {}, [
    h('div.lb-stage', {}, [
      h('button.icon-btn.lb-nav.prev', { onclick: () => step(-1) }, [ico('back')]),
      lbImg,
      h('button.icon-btn.lb-nav.next', { onclick: () => step(1), style: { transform: 'translateY(-50%) scaleX(-1)' } }, [ico('back')]),
    ]),
    h('div.lb-side', {}, [
      lbName,
      h('div', {}, [h('div.lb-field-label', { text: 'Tags' }), lbTags,
        h('div.lb-tag-add', {}, [lbTagInput, h('button.icon-btn', { onclick: lbAddTag, title: 'Add tag' }, [ico('plus')])]),
      ]),
      lbMeta,
      h('div.lb-actions', {}, [
        h('button.btn.btn-danger.btn-with-ico', { onclick: deleteCurrent }, [ico('trash'), h('span', { text: 'Delete image' })]),
      ]),
    ]),
    lbClose,
  ]);
  document.body.append(lightbox);

  function renderTagChips() {
    const im = images[lbIndex]; if (!im) return;
    lbTags.innerHTML = '';
    (im.tags || []).forEach((tg) => {
      lbTags.append(h('span.chip.jp', {}, [
        h('span', { text: tg }),
        h('button', { title: 'Remove', html: icons.close, onclick: () => {
          im.tags = (im.tags || []).filter((x) => x !== tg);
          updateImage(im.id, { tags: im.tags }); renderTagChips(); renderRail(); applyFilter();
        } }),
      ]));
    });
    if (!(im.tags || []).length) lbTags.append(h('span.rail-empty', { text: 'No tags yet.' }));
  }
  function showCurrent() {
    const im = images[lbIndex]; if (!im) return;
    lbImg.src = blobURL('full-' + im.id, im.blob || im.thumb);
    lbName.value = im.name || '';
    const dims = im.w && im.h ? `${im.w} × ${im.h}` : '';
    lbMeta.textContent = [dims, new Date(im.createdAt).toLocaleDateString()].filter(Boolean).join('  ·  ');
    renderTagChips();
  }
  function openLightbox(i) { lbIndex = i; showCurrent(); lightbox.classList.add('in'); document.addEventListener('keydown', lbKeys); }
  function closeLightbox() { lightbox.classList.remove('in'); document.removeEventListener('keydown', lbKeys); }
  function step(d) { if (!images.length) return; lbIndex = (lbIndex + d + images.length) % images.length; showCurrent(); }
  function lbKeys(e) {
    if (e.target.matches('input,textarea')) { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  }
  lbName.addEventListener('change', () => { const im = images[lbIndex]; if (im) { im.name = lbName.value.trim(); updateImage(im.id, { name: im.name }); } });
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

  // debug/verification handle (harmless)
  function paintAll() {
    for (const s of items) {
      s.el.style.transform = `translate3d(${(s.cx - s.w / 2).toFixed(1)}px, ${(s.cy - s.ih / 2).toFixed(1)}px, 0) rotate(${s.rot.toFixed(2)}deg) scale(${s.cs.toFixed(3)})`;
      s.el.style.opacity = s.copacity.toFixed(3); s.el.style.zIndex = String(s.tz);
    }
  }
  window.__cloud = {
    snap() { items.forEach((s) => { s.cx = s.tx; s.cy = s.ty; s.cs = s.ts; s.copacity = s.topacity; }); paintAll(); },
    state: () => ({ items: items.length, recede: items.filter((s) => s.el.classList.contains('recede')).length, activeTag }),
  };

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
