// Sync & settings modal — Firebase config + manual push/pull.
import { h, openModal, closeModal, toast, confirmModal } from './dom.js';
import { ico } from './icons.js';
import {
  getConfig, setConfig, clearConfig, parseConfig, isConfigured, pushAll, pullAll,
} from '../storage/sync.js';
import { isPrivate, setPrivate } from './private.js';
import {
  exportLibrary, importLibrary, saveBlob, backupFilename,
  storageUsage, requestPersistence, iosEvictionRisk, formatBytes,
} from '../storage/backup.js';

export function openSettings() {
  const privToggle = h('button.toggle' + (isPrivate() ? '.on' : ''), {
    type: 'button', role: 'switch', 'aria-checked': String(isPrivate()), title: 'Toggle private mode',
    onclick: () => { const v = !isPrivate(); setPrivate(v); privToggle.classList.toggle('on', v); privToggle.setAttribute('aria-checked', String(v)); },
  }, [h('span.knob')]);

  const status = h('div.sync-status');
  const renderStatus = () => {
    const ok = isConfigured();
    const cfg = getConfig();
    status.className = 'sync-status ' + (ok ? 'ok' : 'off');
    status.innerHTML = '';
    status.append(
      h('span.dot'),
      h('span', { text: ok ? `Connected · ${cfg.projectId || cfg.storageBucket}` : 'Local only — not connected' }),
    );
  };

  const ta = h('textarea.field.field-mono', { rows: 6, placeholder: 'Paste your Firebase web config object here…', spellcheck: false });
  const cfg = getConfig();
  if (cfg) ta.value = JSON.stringify(cfg, null, 2);
  renderStatus();

  const saveBtn = h('button.btn.btn-accent', {
    text: 'Save config',
    onclick: () => {
      const parsed = parseConfig(ta.value);
      if (!parsed || !parsed.storageBucket) { toast('Could not read config — needs storageBucket.', { error: true }); return; }
      setConfig(parsed);
      ta.value = JSON.stringify(parsed, null, 2);
      renderStatus();
      toast('Firebase config saved.');
    },
  });
  const clearBtn = h('button.btn.btn-ghost', {
    text: 'Clear',
    onclick: () => { clearConfig(); ta.value = ''; renderStatus(); toast('Config cleared.'); },
  });

  const progress = h('div.note', { text: 'Sync is manual — nothing leaves this device until you press a button.' });

  // human phase labels + a shared progress renderer (text + bar gauge)
  const PHASE = { connect: 'Connecting', manifest: 'Reading manifest', prepare: 'Preparing', upload: 'Uploading', download: 'Downloading' };
  // indeterminate phases (no total yet) get a small token width so the bar moves
  const STEP = { connect: 6, manifest: 14, prepare: 18 };
  const fmt = ({ phase, done, total }) => {
    const name = PHASE[phase] || phase;
    return total ? `${name}…  ${done} / ${total}  (${Math.round(done / total * 100)}%)` : `${name}…`;
  };
  const pct = ({ phase, done, total }) => (total ? Math.round(done / total * 100) : (STEP[phase] || 0));
  const setProg = (p) => { progress.textContent = fmt(p); };

  const upBtn = h('button.btn.btn-with-ico', {}, [ico('cloudUp'), h('span', { text: 'Upload · overwrite cloud' })]);
  upBtn.onclick = async () => {
    if (!isConfigured()) return toast('Add your Firebase config first.', { error: true });
    upBtn.disabled = true; downBtn.disabled = true;
    try {
      const r = await pushAll(setProg);
      progress.textContent = `Uploaded ${r.images} images, ${r.folders} folders, ${r.portfolios} portfolios.`;
      toast('Library uploaded to cloud.');
    } catch (e) {
      progress.textContent = 'Error: ' + (e.message || e);
      toast(e.message || 'Upload failed.', { error: true });
    } finally { upBtn.disabled = false; downBtn.disabled = false; }
  };

  const dlBar = h('div.sync-bar', {}, [h('div.sync-bar-fill')]);
  const dlFill = dlBar.querySelector('.sync-bar-fill');
  const dlLabel = h('div.note', { text: 'Starting…' });

  const downBtn = h('button.btn.btn-with-ico', {}, [ico('cloudDown'), h('span', { text: 'Download · overwrite local' })]);
  downBtn.onclick = async () => {
    if (!isConfigured()) return toast('Add your Firebase config first.', { error: true });
    const ok = await confirmModal({
      title: 'Replace local library?',
      message: 'Downloading will overwrite everything currently stored on this device with the cloud copy.',
      confirmText: 'Download & replace', danger: true,
    });
    if (!ok) return;
    dlFill.style.width = '0%'; dlLabel.textContent = 'Starting…';
    openModal(workingModal('Downloading from cloud…', dlBar, dlLabel));
    try {
      const r = await pullAll((p) => { dlFill.style.width = pct(p) + '%'; dlLabel.textContent = fmt(p); });
      dlFill.style.width = '100%';
      toast(`Restored ${r.images} images.`);
      setTimeout(() => location.reload(), 600);
    } catch (e) {
      const msg = String((e && (e.code || e.message)) || e || '');
      // A read that hangs and retry-times-out is almost always the bucket's CORS
      // not allowing this site — uploads work without it, browser downloads don't.
      const corsLikely = /retry|timeout|timed out|exceeded|network|unknown|cors|app\/|0/i.test(msg);
      openModal(h('div.modal', {}, [
        h('h2.display', { text: 'Download failed' }),
        h('p.modal-sub', { text: corsLikely
          ? 'The download timed out reading from Cloud Storage. This is almost always because the Storage bucket has no CORS rule for this site — uploads work without CORS, but browser downloads (getBytes) require it.'
          : ('Error: ' + msg) }),
        corsLikely ? h('div.note', { html: 'Fix: add a CORS rule to your bucket that allows this origin to <em>GET</em>, then try again.' }) : null,
        h('div.modal-actions', {}, [h('button.btn.btn-ghost', { text: 'Close', onclick: () => closeModal() })]),
      ]));
      toast(corsLikely ? 'Download timed out — bucket CORS not set.' : (e.message || 'Download failed.'), { error: true });
    }
  };

  // --- On this device: how much room the library uses, whether the browser has
  //     promised to keep it, and a backup that needs no cloud account at all ---
  const useLabel = h('div.note', { text: 'Measuring…' });
  const useBar = h('div.sync-bar', {}, [h('div.sync-bar-fill')]);
  const useFill = useBar.querySelector('.sync-bar-fill');
  const persistNote = h('div.note');
  const evictNote = h('div.note.note-warn');
  async function renderStorage() {
    const est = await storageUsage();
    if (est && est.quota) {
      const p = Math.min(100, Math.round(est.usage / est.quota * 100));
      useFill.style.width = p + '%';
      useLabel.textContent = `${formatBytes(est.usage)} used of about ${formatBytes(est.quota)} available (${p}%).`;
    } else {
      useBar.style.display = 'none';
      useLabel.textContent = est ? `${formatBytes(est.usage)} used.` : 'This browser does not report storage usage.';
    }
    const { supported, persisted } = await requestPersistence();
    persistNote.innerHTML = !supported
      ? 'This browser cannot mark storage as persistent — keep a <em>backup file</em>.'
      : persisted
        ? 'Storage is <em>persistent</em> — the browser will not evict this library on its own.'
        : 'Storage is <em>not</em> persistent yet — the browser may evict it under pressure. Keep a <em>backup file</em>.';
    if (iosEvictionRisk()) {
      evictNote.innerHTML = 'On iPhone / iPad, Safari erases a site’s stored data after about <em>7 days without a visit</em>. Add Onyx Folio to your Home Screen (Share → Add to Home Screen) to be exempt — and keep a backup file either way.';
    } else evictNote.remove();
  }

  const expBtn = h('button.btn.btn-with-ico', {}, [ico('download'), h('span', { text: 'Save backup file' })]);
  expBtn.onclick = async () => {
    const bar = h('div.sync-bar', {}, [h('div.sync-bar-fill')]);
    const fill = bar.querySelector('.sync-bar-fill');
    const label = h('div.note', { text: 'Starting…' });
    openModal(workingModal('Packing your library…', bar, label));
    try {
      const { blob, counts } = await exportLibrary(({ phase, done, total }) => {
        fill.style.width = (total ? Math.round(done / total * 100) : 4) + '%';
        label.textContent = total ? `Packing…  ${done} / ${total}` : 'Reading library…';
      });
      saveBlob(blob, backupFilename());
      closeModal();
      toast(`Backup saved — ${counts.images} images, ${formatBytes(blob.size)}.`);
    } catch (e) {
      closeModal();
      toast(e.message || 'Backup failed.', { error: true });
    }
  };

  const impInput = h('input', { type: 'file', accept: '.zip,application/zip', style: { display: 'none' } });
  const impBtn = h('button.btn.btn-with-ico', { onclick: () => impInput.click() }, [ico('upload'), h('span', { text: 'Restore from file' })]);
  impInput.addEventListener('change', async () => {
    const file = impInput.files[0]; impInput.value = '';
    if (!file) return;
    const ok = await confirmModal({
      title: 'Replace local library?',
      message: `Restoring “${file.name}” will overwrite everything currently stored on this device.`,
      confirmText: 'Restore & replace', danger: true,
    });
    if (!ok) return;
    const bar = h('div.sync-bar', {}, [h('div.sync-bar-fill')]);
    const fill = bar.querySelector('.sync-bar-fill');
    const label = h('div.note', { text: 'Reading…' });
    openModal(workingModal('Restoring from file…', bar, label));
    try {
      const r = await importLibrary(file, ({ phase, done, total }) => {
        fill.style.width = (total ? Math.round(done / total * 100) : 6) + '%';
        label.textContent = total ? `Restoring…  ${done} / ${total}` : 'Reading archive…';
      });
      fill.style.width = '100%';
      toast(`Restored ${r.images} images.`);
      setTimeout(() => location.reload(), 600);
    } catch (e) {
      closeModal();
      toast(e.message || 'Restore failed.', { error: true });
    }
  });

  const modal = h('div.modal', {}, [
    h('h2.display', { text: 'Sync & Settings' }),
    h('p.modal-sub', { text: 'Keep a backup file so nothing depends on this browser — and optionally connect Firebase Storage to move the library between devices.' }),

    h('div.modal-section', {}, [
      h('span.mono-label', { text: 'On this device' }),
      useBar, useLabel, persistNote, evictNote,
      h('div.sync-grid', {}, [ expBtn, impBtn ]),
      h('div.note', { text: 'The backup is one .zip holding every image and all your folders — it needs no account, and it is the only copy that survives this browser losing its data.' }),
      impInput,
    ]),

    h('div.modal-section', {}, [
      h('div.section-head', {}, [ h('span.mono-label', { text: 'Firebase Storage' }), status ]),
      h('div.row', {}, [ ta ]),
      h('div.note', { html: 'Project Settings → Your apps → Web → <em>SDK setup & configuration</em>. Make sure Storage rules permit your access (e.g. authenticated, or open for a private project).' }),
      h('div.btn-line', {}, [ saveBtn, clearBtn ]),
    ]),

    h('div.modal-section', {}, [
      h('span.mono-label', { text: 'Manual sync' }),
      h('div.sync-grid', {}, [ upBtn, downBtn ]),
      progress,
    ]),

    h('div.modal-section', {}, [
      h('div.section-head', {}, [h('span.mono-label', { text: 'Private mode' }), privToggle]),
      h('div.note', { html: 'Hide folders you mark private. A white <em>♥</em> shows in the header while it’s on. Per-device toggle — not a password.' }),
    ]),

    h('div.modal-actions', {}, [
      h('button.btn.btn-ghost', { text: 'Close', onclick: () => closeModal() }),
    ]),
  ]);

  openModal(modal);
  renderStorage();
}

function workingModal(title, ...nodes) {
  return h('div.modal', {}, [
    h('h2.display', { text: title }),
    h('div.spinner'),
    ...nodes,
  ]);
}
