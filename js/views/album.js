// Album view — a 3D gallery wall. Tags on the right float their images forward.
import { h, isTouch, toast, confirmModal, qsa, rand } from '../lib/dom.js';
import { ico, icons } from '../lib/icons.js';
import { buildTopbar } from '../lib/chrome.js';
import {
  getFolder, getImages, addImage, updateImage, deleteImage, blobURL, revokeURL,
} from '../storage/db.js';
import { fileToImageRecord } from '../lib/image.js';

export async function mount(root, params, ctx) {
  const folderId = params.folderId;
  const folder = await getFolder(folderId);
  if (!folder) { ctx.nav('/folders'); return {}; }

  let images = [];
  let activeTag = null;

  // --- chrome ---
  const wall = h('div.album-wall');
  const stage = h('div.album-stage', {}, [wall]);
  const rail = h('div.album-rail');
  const layout = h('div.album-layout', {}, [stage, rail]);

  const progress = h('div.album-progress');
  const fileInput = h('input', { type: 'file', accept: 'image/*', multiple: true, style: { display: 'none' } });

  const topbar = buildTopbar({
    crumbs: [
      { label: 'Folders', onClick: () => ctx.nav('/folders') },
      { label: folder.name, jp: true },
    ],
    actions: [
      { icon: 'book', title: 'Open portfolios', onClick: () => ctx.nav('/portfolio') },
      { icon: 'upload', label: 'Add', accent: true, title: 'Add images', onClick: () => fileInput.click() },
    ],
  });

  root.append(layout, topbar, progress, fileInput);

  // --- empty state ---
  function emptyState() {
    return h('div.album-empty', {}, [
      h('button.drop', { type: 'button', onclick: () => fileInput.click() }, [
        ico('image'),
        h('h3.display', { text: 'This folder is empty' }),
        h('p', { text: 'Drop images here, or tap to choose photos from your device. Tag them and they’ll float forward on demand.' }),
        h('span.btn.btn-accent', { text: 'Choose images' }),
      ]),
    ]);
  }

  // --- render ---
  function tileEl(im, i) {
    const tags = (im.tags || []).slice(0, 3).map((t) => h('span.chip', { text: t }));
    return h('div.tile', {
      dataset: { id: im.id, index: i },
      style: { '--z': rand(-30, 30).toFixed(0) + 'px', '--td': (Math.random() * 0.18).toFixed(2) + 's' },
    }, [
      h('img', { src: blobURL('thumb-' + im.id, im.thumb), alt: im.name || '', loading: 'lazy', draggable: false }),
      tags.length ? h('div.tile-tags', {}, tags) : null,
    ]);
  }

  function renderWall() {
    wall.innerHTML = '';
    const ex = stage.querySelector('.album-empty');
    if (ex) ex.remove();
    if (!images.length) { stage.append(emptyState()); return; }
    images.forEach((im, i) => wall.append(tileEl(im, i)));
    applyFilter();
  }

  function allTags() {
    const map = new Map();
    images.forEach((im) => (im.tags || []).forEach((t) => map.set(t, (map.get(t) || 0) + 1)));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }

  function renderRail() {
    rail.innerHTML = '';
    rail.append(h('div.rail-head', { text: 'Tags' }));
    const tags = allTags();
    const allBtn = h('button.rail-tag' + (activeTag ? '' : '.active'), { onclick: () => setTag(null) }, [
      h('span', { text: 'All' }), h('span.count', { text: String(images.length) }),
    ]);
    rail.append(allBtn);
    if (tags.length) rail.append(h('div.rail-sep'));
    if (!tags.length) {
      rail.append(h('div.rail-empty', { text: 'No tags yet. Open an image to tag it — tags appear here to float matching shots forward.' }));
    }
    tags.forEach(([t, n]) => {
      rail.append(h('button.rail-tag' + (activeTag === t ? '.active' : ''), { onclick: () => setTag(t) }, [
        h('span.jp', { text: t }), h('span.count', { text: String(n) }),
      ]));
    });
  }

  function setTag(t) {
    activeTag = (t === activeTag) ? null : t;
    renderRail();
    applyFilter();
  }
  function applyFilter() {
    if (!activeTag) { wall.classList.remove('filtering'); return; }
    wall.classList.add('filtering');
    qsa('.tile', wall).forEach((tile) => {
      const im = images[+tile.dataset.index];
      tile.classList.toggle('is-match', !!im && (im.tags || []).includes(activeTag));
    });
  }

  async function reload() {
    images = await getImages(folderId);
    renderWall();
    renderRail();
  }

  // --- add images ---
  async function handleFiles(fileList) {
    const files = [...fileList].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    progress.classList.add('show');
    let n = 0;
    for (const f of files) {
      try {
        const rec = await fileToImageRecord(f, folderId);
        await addImage(rec);
      } catch (e) { console.warn('skip', f.name, e); }
      progress.textContent = `Importing ${++n} / ${files.length}`;
    }
    progress.classList.remove('show');
    toast(`Added ${n} image${n === 1 ? '' : 's'}.`);
    await reload();
  }
  fileInput.addEventListener('change', () => { handleFiles(fileInput.files); fileInput.value = ''; });

  stage.addEventListener('dragover', (e) => { e.preventDefault(); stage.classList.add('drag-over'); });
  stage.addEventListener('dragleave', (e) => { if (!stage.contains(e.relatedTarget)) stage.classList.remove('drag-over'); });
  stage.addEventListener('drop', (e) => { e.preventDefault(); stage.classList.remove('drag-over'); handleFiles(e.dataTransfer.files); });

  // --- tile click → lightbox ---
  wall.addEventListener('click', (e) => {
    const tile = e.target.closest('.tile'); if (!tile) return;
    openLightbox(+tile.dataset.index);
  });

  // --- parallax (desktop) ---
  let px = 0, py = 0, tx = 0, ty = 0, praf = 0;
  function onMove(e) {
    tx = (e.clientX / window.innerWidth - 0.5) * 2;
    ty = (e.clientY / window.innerHeight - 0.5) * 2;
    if (!praf) praf = requestAnimationFrame(parallax);
  }
  function parallax() {
    praf = 0;
    px += (tx - px) * 0.1; py += (ty - py) * 0.1;
    wall.style.transform = `rotateY(${(px * 4).toFixed(2)}deg) rotateX(${(-py * 3).toFixed(2)}deg)`;
    if (Math.abs(tx - px) > 0.01 || Math.abs(ty - py) > 0.01) praf = requestAnimationFrame(parallax);
  }
  if (!isTouch) stage.addEventListener('pointermove', onMove, { passive: true });

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
    const im = images[lbIndex];
    const tags = im.tags || [];
    if (!tags.includes(v)) { tags.push(v); im.tags = tags; updateImage(im.id, { tags }); renderTagChips(); renderRail(); }
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
      h('div', {}, [ h('div.lb-field-label', { text: 'Tags' }), lbTags,
        h('div.lb-tag-add', {}, [ lbTagInput, h('button.icon-btn', { onclick: lbAddTag, title: 'Add tag' }, [ico('plus')]) ]),
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
    (im.tags || []).forEach((t) => {
      lbTags.append(h('span.chip.jp', {}, [
        h('span', { text: t }),
        h('button', { title: 'Remove', html: icons.close, onclick: () => {
          im.tags = (im.tags || []).filter((x) => x !== t);
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

  await reload();

  return {
    destroy() {
      if (!isTouch) stage.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(praf);
      document.removeEventListener('keydown', lbKeys);
      lightbox.remove();
    },
  };
}
