// Folders view — a packed, slowly looping grid of designed folder icons.
import { h, isTouch, toast, promptModal, confirmModal } from '../lib/dom.js';
import { ico, icons } from '../lib/icons.js';
import { buildTopbar } from '../lib/chrome.js';
import { getFolders, addFolder, updateFolder, deleteFolder } from '../storage/db.js';
import { FOLDER_DESIGNS, seedDesigns } from '../lib/folderDesigns.js';

export async function mount(root, params, ctx) {
  if (isTouch) root.classList.add('is-touch');

  // First run → seed a varied set of designed folders so the grid is alive.
  let folders = await getFolders();
  if (!folders.length) {
    for (const d of seedDesigns(30)) await addFolder(d.name, d.file);
  }

  const plane = h('div.folders-plane');
  const stage = h('div.folders-stage', {}, [plane]);
  const hint = h('div.folders-hint', { text: isTouch ? 'Drag to scroll · tap to open · hold to edit' : 'Scroll or drag · click to open · right-click to edit' });

  const topbar = buildTopbar({
    crumbs: [{ label: 'Folders' }],
    actions: [
      { icon: 'book', title: 'Portfolios', onClick: () => ctx.nav('/portfolio') },
      { icon: 'plus', label: 'New', accent: true, onClick: onNew },
    ],
  });
  root.append(stage, topbar, hint);

  // --- motion state (gentle upward drift, half the old speed) ---
  let y = 0, blockH = 0, running = false, raf = 0, last = 0;
  let dragging = false, downY = 0, downX = 0, baseY = 0, lastMoveY = 0, lastMoveT = 0, momentum = 0, moved = false, longTimer = 0;
  const DRIFT = 7;

  const iconFile = (f, i) => f.icon || FOLDER_DESIGNS[(f.order ?? i) % FOLDER_DESIGNS.length].file;

  function folderCard(f, i) {
    return h('div.folder', { dataset: { id: f.id } }, [
      h('div.folder-thumb', {}, [h('img', { src: 'assets/folders/' + iconFile(f, i), alt: '', loading: 'lazy', draggable: false })]),
      h('div.folder-name.jp', { text: f.name }),
    ]);
  }

  let lastData = [];
  function buildPlane(data) {
    stopLoop();
    plane.innerHTML = '';
    const master = h('div.folders-block', {}, data.map((f, i) => folderCard(f, i)));
    plane.append(master);
    // offsetHeight forces a synchronous layout, so measure right away — no rAF,
    // which would be starved while the tab is hidden and never start the drift.
    const stageH = stage.clientHeight || window.innerHeight || 800;
    blockH = master.offsetHeight || stageH;
    const repeats = Math.max(2, Math.ceil(stageH / blockH) + 1);
    for (let r = 1; r < repeats; r++) {
      const clone = master.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      plane.append(clone);
    }
    y = 0; running = true; startLoop();
  }
  function startLoop() { if (running && !document.hidden && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  function stopLoop() { cancelAnimationFrame(raf); raf = 0; }

  function wrap() { if (blockH) { while (y <= -blockH) y += blockH; while (y > 0) y -= blockH; } }
  function loop(now) {
    if (!running || document.hidden) { raf = 0; return; }
    const dt = Math.min(50, now - last); last = now;
    if (!dragging) {
      y -= DRIFT * dt / 1000;
      if (momentum) { y += momentum * dt; momentum *= 0.94; if (Math.abs(momentum) < 0.02) momentum = 0; }
    }
    wrap();
    plane.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`;
    raf = requestAnimationFrame(loop);
  }

  // --- pointer: drag to scroll, tap (no move) to open. No pointer-capture so
  //     the tap reliably resolves on desktop (the old click path was swallowed). ---
  function onMove(e) {
    if (!dragging) return;
    const dy = e.clientY - downY, dx = e.clientX - downX;
    if (Math.abs(dy) > 6 || Math.abs(dx) > 6) { moved = true; clearTimeout(longTimer); }
    y = baseY + dy;
    const t = performance.now(), gap = t - lastMoveT;
    if (gap > 0) momentum = (e.clientY - lastMoveY) / gap;
    lastMoveY = e.clientY; lastMoveT = t;
  }
  function onUp(e) {
    if (!dragging) return;
    dragging = false; clearTimeout(longTimer); stage.classList.remove('dragging');
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    if (!moved) {
      const fEl = e.target.closest('.folder');
      if (fEl) ctx.nav('/album/' + fEl.dataset.id);
      momentum = 0;
    }
  }
  stage.addEventListener('pointerdown', (e) => {
    if (e.button === 2) return;
    dragging = true; moved = false; momentum = 0;
    downY = e.clientY; downX = e.clientX; baseY = y; lastMoveY = e.clientY; lastMoveT = performance.now();
    stage.classList.add('dragging');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    longTimer = setTimeout(() => {
      if (!moved) {
        const fEl = e.target.closest('.folder');
        if (fEl) { dragging = false; stage.classList.remove('dragging'); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); openCtxMenu(e.clientX, e.clientY, fEl.dataset.id); }
      }
    }, 480);
  });
  stage.addEventListener('wheel', (e) => { e.preventDefault(); momentum = 0; y -= e.deltaY * 0.6; }, { passive: false });
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
    const used = (await getFolders()).length;
    const d = FOLDER_DESIGNS[used % FOLDER_DESIGNS.length];
    await addFolder(name || 'Untitled', d.file);
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
    lastData = folders;
    buildPlane(folders);
  }

  // --- lifecycle ---
  const onVis = () => { if (document.hidden) stopLoop(); else startLoop(); };
  document.addEventListener('visibilitychange', onVis);
  let rT; const onResize = () => { clearTimeout(rT); rT = setTimeout(() => lastData.length && buildPlane(lastData), 220); };
  window.addEventListener('resize', onResize);

  // debug/verification handle (harmless)
  window.__fld = {
    state: () => ({ raf, y, running, blockH, drift: DRIFT, hidden: document.hidden }),
    advance: (sec = 1) => { y -= DRIFT * sec; wrap(); plane.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`; return y; },
  };

  await render();

  return {
    destroy() {
      running = false; stopLoop();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      closeCtxMenu();
    },
  };
}
