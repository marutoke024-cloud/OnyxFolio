// Folders view — a packed, slowly looping grid of designed folder icons.
import { h, isTouch, toast, promptModal, confirmModal, openModal, closeModal } from '../lib/dom.js';
import { ico } from '../lib/icons.js';
import { buildTopbar } from '../lib/chrome.js';
import { getFolders, addFolder, updateFolder, deleteFolder, getAllImages } from '../storage/db.js';
import { FOLDER_DESIGNS, seedDesigns, SEED_EXCLUDE } from '../lib/folderDesigns.js';
import { isPrivate } from '../lib/private.js';

export async function mount(root, params, ctx) {
  if (isTouch) root.classList.add('is-touch');

  // Seed a large, varied set so the field reads like a weird-folders wall — many
  // distinct folders filling the screen, not a handful repeating row after row.
  // Also migrate the original 8-folder default on empty installs.
  // Re-seed bumps this. We only auto-replace folders that are still an untouched
  // default set (legacy 8 or a prior design seed) with no images — never the
  // user's own renamed folders or anything holding pictures.
  const SEED_V = 3;
  let folders = await getFolders();
  const LEGACY = ['Archive', 'Lookbook', 'Studio', 'Inspiration', 'Editorial', 'Travel', 'Mono', 'Material'];
  const designNames = new Set(FOLDER_DESIGNS.map((d) => d.name));
  const untouched = folders.length > 0 && folders.every((f) => designNames.has(f.name) || LEGACY.includes(f.name));
  const storedV = +(localStorage.getItem('onyx-seed-v') || 0);
  const allImgs = await getAllImages();
  if (!folders.length || (untouched && storedV < SEED_V && allImgs.length === 0)) {
    for (const f of folders) await deleteFolder(f.id);
    for (const d of seedDesigns(72)) await addFolder(d.name, d.file);
    localStorage.setItem('onyx-seed-v', String(SEED_V));
    folders = await getFolders();
  } else {
    // surgically drop excluded design folders that are still around and empty
    // (works even when other folders hold images, so the deletion always sticks)
    const exclude = new Set(SEED_EXCLUDE);
    const withImages = new Set(allImgs.map((im) => im.folderId));
    const stale = folders.filter((f) => exclude.has(f.name) && !withImages.has(f.id));
    if (stale.length) { for (const f of stale) await deleteFolder(f.id); folders = await getFolders(); }
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

  // --- motion state: drag / flick / wheel to scroll, seamless wrap loop kept,
  //     but NO idle auto-scroll → rAF only runs while a flick is decelerating ---
  let y = 0, blockH = 0, running = false, raf = 0, last = 0;
  let dragging = false, downY = 0, downX = 0, baseY = 0, lastMoveY = 0, lastMoveT = 0, momentum = 0, moved = false, longTimer = 0;

  const iconFile = (f, i) => f.icon || FOLDER_DESIGNS[(f.order ?? i) % FOLDER_DESIGNS.length].file;

  function folderCard(f, i) {
    return h('div.folder', { dataset: { id: f.id } }, [
      h('div.folder-thumb', {}, [
        h('img', { src: 'assets/folders/' + iconFile(f, i), alt: '', loading: 'lazy', decoding: 'async', draggable: false }),
        f.private ? h('span.folder-private', { text: '♥', title: 'Private' }) : null,
      ]),
      h('div.folder-name.jp', { text: f.name }),
    ]);
  }

  let lastData = [];
  const renderBlock = (list) => h('div.folders-block', {}, list.map((f, i) => folderCard(f, i)));
  const colsOf = (block) => getComputedStyle(block).gridTemplateColumns.split(' ').filter(Boolean).length;
  // repeat from the start so the final row is always full → no right-side blanks, seamless loop
  function padRows(arr, cols) {
    if (cols <= 0 || arr.length % cols === 0) return arr;
    const out = arr.slice();
    const need = cols - (arr.length % cols);
    for (let i = 0; i < need; i++) out.push(arr[i % arr.length]);
    return out;
  }

  function buildPlane(data) {
    stopLoop();
    plane.innerHTML = '';
    let master = renderBlock(data);
    plane.append(master);
    // pad to a whole number of columns now that the grid has laid out
    const padded = padRows(data, colsOf(master));
    if (padded.length !== data.length) {
      master.remove();
      master = renderBlock(padded);
      plane.append(master);
    }
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
    y = 0; running = true; applyTransform();
  }
  function stopLoop() { cancelAnimationFrame(raf); raf = 0; }

  function wrap() { if (blockH) { while (y <= -blockH) y += blockH; while (y > 0) y -= blockH; } }
  function applyTransform() { wrap(); plane.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`; }
  // run a frame loop ONLY while a flick is decelerating; idle = no rAF (no repaint cost)
  function momentumLoop(now) {
    if (!running || document.hidden || dragging) { raf = 0; return; }
    const dt = Math.min(50, now - last); last = now;
    y += momentum * dt; momentum *= 0.94;
    applyTransform();
    if (Math.abs(momentum) < 0.02) { momentum = 0; raf = 0; return; }
    raf = requestAnimationFrame(momentumLoop);
  }
  function startMomentum() { if (running && !document.hidden && momentum && !raf) { last = performance.now(); raf = requestAnimationFrame(momentumLoop); } }

  // --- pointer: drag to scroll, tap (no move) to open. No pointer-capture so
  //     the tap reliably resolves on desktop (the old click path was swallowed). ---
  function onMove(e) {
    if (!dragging) return;
    const dy = e.clientY - downY, dx = e.clientX - downX;
    if (Math.abs(dy) > 6 || Math.abs(dx) > 6) { moved = true; clearTimeout(longTimer); }
    y = baseY + dy;
    applyTransform();
    const t = performance.now(), gap = t - lastMoveT;
    if (gap > 0) momentum = (e.clientY - lastMoveY) / gap;
    lastMoveY = e.clientY; lastMoveT = t;
  }
  function endDrag() {
    dragging = false; clearTimeout(longTimer); stage.classList.remove('dragging');
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
  }
  function onUp(e) {
    if (!dragging) return;
    endDrag();
    if (!moved) {
      const fEl = e.target.closest('.folder');
      if (fEl) ctx.nav('/album/' + fEl.dataset.id);
      momentum = 0;
    } else {
      startMomentum();   // let the flick coast and settle, then rAF stops
    }
  }
  // iOS can fire pointercancel mid-gesture (system swipe, scroll hand-off). Without
  // this the drag stayed "stuck" — listeners attached, dragging never cleared —
  // which is what made finger-scroll freeze. Settle the flick and let go cleanly.
  function onCancel() {
    if (!dragging) return;
    endDrag();
    startMomentum();
  }
  stage.addEventListener('pointerdown', (e) => {
    if (e.button === 2) return;
    dragging = true; moved = false; momentum = 0;
    downY = e.clientY; downX = e.clientX; baseY = y; lastMoveY = e.clientY; lastMoveT = performance.now();
    stage.classList.add('dragging');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    longTimer = setTimeout(() => {
      if (!moved) {
        const fEl = e.target.closest('.folder');
        if (fEl) { endDrag(); openFolderEdit(fEl.dataset.id); }
      }
    }, 480);
  });
  stage.addEventListener('wheel', (e) => { e.preventDefault(); momentum = 0; y -= e.deltaY * 0.6; applyTransform(); }, { passive: false });
  stage.addEventListener('contextmenu', (e) => {
    const fEl = e.target.closest('.folder');
    if (fEl) { e.preventDefault(); openFolderEdit(fEl.dataset.id); }
  });

  // --- folder edit (long-press / right-click) → rename, with delete ---
  function openFolderEdit(id) {
    const f = folders.find((x) => x.id === id);
    if (!f) return;
    let priv = !!f.private;
    const input = h('input.field.jp', { value: f.name || '', placeholder: 'Untitled', spellcheck: false });
    const privToggle = h('button.toggle' + (priv ? '.on' : ''), { type: 'button', title: 'Private folder', onclick: () => { priv = !priv; privToggle.classList.toggle('on', priv); } }, [h('span.knob')]);
    const save = () => { closeModal(); updateFolder(id, { name: input.value.trim() || 'Untitled', private: priv }).then(render); };
    const del = async () => {
      closeModal();
      const ok = await confirmModal({ title: 'Delete folder?', message: `“${f.name || 'This folder'}” and its images will be removed from this device.`, confirmText: 'Delete', danger: true });
      if (ok) { await deleteFolder(id); toast('Folder deleted.'); await render(); }
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    const modal = h('div.modal', {}, [
      h('h2.display', { text: 'Folder' }),
      h('div.row', {}, [h('label', { text: 'Name' }), input]),
      h('div.row.toggle-row', {}, [h('label', { text: 'Private — hidden unless private mode is on' }), privToggle]),
      h('div.modal-actions', { style: { justifyContent: 'space-between' } }, [
        h('button.btn.btn-danger.btn-with-ico', { onclick: del }, [ico('trash'), h('span', { text: 'Delete' })]),
        h('div', { style: { display: 'flex', gap: '10px' } }, [
          h('button.btn.btn-ghost', { text: 'Cancel', onclick: () => closeModal() }),
          h('button.btn.btn-accent', { text: 'Save', onclick: save }),
        ]),
      ]),
    ]);
    openModal(modal);
    setTimeout(() => { input.focus(); input.select(); }, 120);
  }

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
  async function render() {
    folders = await getFolders();
    // normal → only non-private; private mode → only the private ones
    lastData = folders.filter((f) => isPrivate() ? f.private : !f.private);
    buildPlane(lastData);
  }

  // --- lifecycle ---
  const onVis = () => { if (document.hidden) stopLoop(); };
  document.addEventListener('visibilitychange', onVis);
  let rT; const onResize = () => { clearTimeout(rT); rT = setTimeout(() => lastData.length && buildPlane(lastData), 220); };
  window.addEventListener('resize', onResize);
  const onPriv = () => render();
  window.addEventListener('onyx-private-change', onPriv);

  // debug/verification handle (harmless)
  window.__fld = {
    state: () => ({ raf, y, running, blockH, hidden: document.hidden }),
    advance: (px = 100) => { y -= px; applyTransform(); return y; },
  };

  await render();

  return {
    destroy() {
      running = false; stopLoop();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('onyx-private-change', onPriv);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    },
  };
}
