// Folders view — a drifting, looping field of onyx folders.
import { h, isTouch, toast, promptModal, confirmModal } from '../lib/dom.js';
import { ico, icons } from '../lib/icons.js';
import { buildTopbar } from '../lib/chrome.js';
import { getFolders, addFolder, updateFolder, deleteFolder, getImages, blobURL } from '../storage/db.js';

export async function mount(root, params, ctx) {
  if (isTouch) root.classList.add('is-touch');

  // First run → seed a few elegant starter folders so the field is alive.
  let folders = await getFolders();
  if (!folders.length) {
    for (const n of ['Archive', 'Lookbook', 'Studio', 'Inspiration', 'Editorial', 'Travel', 'Mono', 'Material']) {
      await addFolder(n);
    }
  }

  const plane = h('div.folders-plane');
  const stage = h('div.folders-stage', {}, [plane]);
  const hint = h('div.folders-hint', { text: isTouch ? 'Drag to drift · tap a folder to open · hold to edit' : 'Scroll or drag · click to open · right-click to edit' });

  const topbar = buildTopbar({
    crumbs: [{ label: 'Folders' }],
    actions: [
      { icon: 'book', title: 'Portfolios', onClick: () => ctx.nav('/portfolio') },
      { icon: 'plus', label: 'New', accent: true, onClick: onNew },
    ],
  });

  root.append(stage, topbar, hint);

  // --- motion state ---
  let y = 0, blockH = 0, running = false, raf = 0, last = 0;
  let dragging = false, downY = 0, baseY = 0, lastMoveY = 0, lastMoveT = 0, momentum = 0, moved = false, suppress = false, longTimer = 0;
  const DRIFT = 14; // px/s

  function colCount() {
    const w = stage.clientWidth;
    return w < 560 ? 2 : w < 920 ? 3 : w < 1340 ? 4 : 5;
  }

  function folderCard(f) {
    const slots = f.thumbs.length === 1 ? ['ph2'] : f.thumbs.length === 2 ? ['ph1', 'ph3'] : ['ph1', 'ph2', 'ph3'];
    const photos = f.thumbs.length
      ? f.thumbs.slice(0, 3).map((src, i) => h('img.ph.' + slots[i], { src, alt: '', loading: 'lazy', draggable: false }))
      : [h('div.empty-frame', { html: icons.image })];

    return h('div.folder', {
      dataset: { id: f.id },
      style: { '--fd': (8 + Math.random() * 5).toFixed(1) + 's', '--fdelay': (-Math.random() * 6).toFixed(1) + 's' },
    }, [
      h('div.folder-icon', {}, [
        h('div.folder-back'),
        h('div.folder-photos', {}, photos),
        h('div.folder-front'),
        h('div.folder-actions', {}, [
          h('button.icon-btn', { dataset: { action: 'rename' }, title: 'Rename' }, [ico('edit')]),
          h('button.icon-btn', { dataset: { action: 'delete' }, title: 'Delete' }, [ico('trash')]),
        ]),
      ]),
      h('div.folder-label', {}, [
        h('div.folder-name.jp', {}, [h('span', { text: f.name }), h('span.pencil', { html: icons.edit })]),
        h('div.folder-count', { text: f.count ? `${f.count} ${f.count === 1 ? 'image' : 'images'}` : 'Empty' }),
      ]),
    ]);
  }

  let lastData = [];
  function buildPlane(data) {
    cancelAnimationFrame(raf);
    plane.innerHTML = '';
    const master = h('div.folders-block', { style: { columnCount: colCount() } }, data.map(folderCard));
    plane.append(master);

    requestAnimationFrame(() => {
      blockH = master.offsetHeight || stage.clientHeight;
      const repeats = Math.max(2, Math.ceil(stage.clientHeight / blockH) + 1);
      for (let i = 1; i < repeats; i++) {
        const clone = master.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        plane.append(clone);
      }
      y = 0; running = true; last = performance.now();
      raf = requestAnimationFrame(loop);
    });
  }

  function wrap() { if (blockH) { while (y <= -blockH) y += blockH; while (y > 0) y -= blockH; } }

  function loop(now) {
    if (!running) return;
    const dt = Math.min(50, now - last); last = now;
    if (!dragging) {
      y -= DRIFT * dt / 1000;
      if (momentum) { y += momentum * dt; momentum *= 0.94; if (Math.abs(momentum) < 0.02) momentum = 0; }
    }
    wrap();
    plane.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`;
    raf = requestAnimationFrame(loop);
  }

  // --- pointer drag / momentum ---
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.icon-btn')) return;
    dragging = true; moved = false; momentum = 0;
    downY = e.clientY; baseY = y; lastMoveY = e.clientY; lastMoveT = performance.now();
    stage.classList.add('dragging');
    try { stage.setPointerCapture(e.pointerId); } catch {}
    longTimer = setTimeout(() => {
      if (!moved) {
        const fEl = e.target.closest('.folder');
        if (fEl) { dragging = false; stage.classList.remove('dragging'); openCtxMenu(e.clientX, e.clientY, fEl.dataset.id); }
      }
    }, 480);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dy = e.clientY - downY;
    if (Math.abs(dy) > 6) { moved = true; clearTimeout(longTimer); }
    y = baseY + dy;
    const t = performance.now(), gap = t - lastMoveT;
    if (gap > 0) momentum = (e.clientY - lastMoveY) / gap;
    lastMoveY = e.clientY; lastMoveT = t;
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false; clearTimeout(longTimer); stage.classList.remove('dragging');
    if (moved) { suppress = true; setTimeout(() => (suppress = false), 60); } else momentum = 0;
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('wheel', (e) => { e.preventDefault(); momentum = 0; y -= e.deltaY * 0.7; }, { passive: false });

  // --- click / context delegation ---
  stage.addEventListener('click', (e) => {
    if (suppress) return;
    const fEl = e.target.closest('.folder'); if (!fEl) return;
    const id = fEl.dataset.id;
    if (e.target.closest('[data-action="delete"]')) return onDelete(id);
    if (e.target.closest('[data-action="rename"]')) return onRename(id);
    if (e.target.closest('.folder-name')) return onRename(id);
    if (e.target.closest('.folder-icon')) return ctx.nav('/album/' + id);
  });
  stage.addEventListener('contextmenu', (e) => {
    const fEl = e.target.closest('.folder');
    if (fEl) { e.preventDefault(); openCtxMenu(e.clientX, e.clientY, fEl.dataset.id); }
  });

  // --- context menu ---
  let curMenu = null;
  const ctxItem = (label, svg, fn, danger) =>
    h('div.ctx-item' + (danger ? '.danger' : ''), { onclick: () => { closeCtxMenu(); fn(); } }, [h('span', { html: svg }), label]);
  function openCtxMenu(x, y0, id) {
    closeCtxMenu();
    const menu = h('div.ctx-menu', {}, [
      ctxItem('Open', icons.folder, () => ctx.nav('/album/' + id)),
      ctxItem('Rename', icons.edit, () => onRename(id)),
      ctxItem('Delete', icons.trash, () => onDelete(id), true),
    ]);
    document.body.append(menu);
    menu.style.left = Math.min(x, innerWidth - 188) + 'px';
    menu.style.top = Math.min(y0, innerHeight - 150) + 'px';
    requestAnimationFrame(() => menu.classList.add('in'));
    curMenu = menu;
    setTimeout(() => document.addEventListener('pointerdown', closeOnOut), 0);
  }
  function closeOnOut(e) { if (curMenu && !curMenu.contains(e.target)) closeCtxMenu(); }
  function closeCtxMenu() { if (curMenu) { curMenu.remove(); curMenu = null; document.removeEventListener('pointerdown', closeOnOut); } }

  // --- actions ---
  async function onNew() {
    const name = await promptModal({ title: 'New folder', label: 'Name', placeholder: 'Untitled', jp: true, confirmText: 'Create' });
    if (name === null) return;
    await addFolder(name || 'Untitled');
    toast('Folder created.');
    await render();
  }
  async function onRename(id) {
    const f = folders.find((x) => x.id === id);
    const name = await promptModal({ title: 'Rename folder', label: 'Name', value: f?.name || '', jp: true });
    if (name === null) return;
    await updateFolder(id, { name: name || 'Untitled' });
    await render();
  }
  async function onDelete(id) {
    const f = folders.find((x) => x.id === id);
    const ok = await confirmModal({ title: 'Delete folder?', message: `“${f?.name || 'This folder'}” and its images will be removed from this device.`, confirmText: 'Delete', danger: true });
    if (!ok) return;
    await deleteFolder(id);
    toast('Folder deleted.');
    await render();
  }

  async function render() {
    folders = await getFolders();
    lastData = await Promise.all(folders.map(async (f) => {
      const imgs = await getImages(f.id);
      return { ...f, count: imgs.length, thumbs: imgs.slice(0, 3).map((im) => blobURL('thumb-' + im.id, im.thumb)) };
    }));
    buildPlane(lastData);
  }

  // --- lifecycle ---
  const onVis = () => {
    if (document.hidden) { running = false; cancelAnimationFrame(raf); }
    else if (!running && blockH) { running = true; last = performance.now(); raf = requestAnimationFrame(loop); }
  };
  document.addEventListener('visibilitychange', onVis);
  let rT; const onResize = () => { clearTimeout(rT); rT = setTimeout(() => lastData.length && buildPlane(lastData), 220); };
  window.addEventListener('resize', onResize);

  await render();

  return {
    destroy() {
      running = false; cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('resize', onResize);
      closeCtxMenu();
    },
  };
}
