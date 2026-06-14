// Sync & settings modal — Firebase config + manual push/pull.
import { h, openModal, closeModal, toast, confirmModal } from './dom.js';
import { ico } from './icons.js';
import {
  getConfig, setConfig, clearConfig, parseConfig, isConfigured, pushAll, pullAll,
} from '../storage/sync.js';
import { isPrivate, setPrivate } from './private.js';

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
  const setProg = ({ phase, done, total }) => { progress.textContent = `${phase}…  ${done} / ${total}`; };

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

  const downBtn = h('button.btn.btn-with-ico', {}, [ico('cloudDown'), h('span', { text: 'Download · overwrite local' })]);
  downBtn.onclick = async () => {
    if (!isConfigured()) return toast('Add your Firebase config first.', { error: true });
    const ok = await confirmModal({
      title: 'Replace local library?',
      message: 'Downloading will overwrite everything currently stored on this device with the cloud copy.',
      confirmText: 'Download & replace', danger: true,
    });
    if (!ok) return;
    openModal(workingModal('Downloading from cloud…', progressClone));
    try {
      const r = await pullAll((p) => { progressClone.textContent = `${p.phase}…  ${p.done} / ${p.total}`; });
      toast(`Restored ${r.images} images.`);
      setTimeout(() => location.reload(), 600);
    } catch (e) {
      closeModal();
      toast(e.message || 'Download failed.', { error: true });
    }
  };

  const progressClone = h('div.note', { text: 'Starting…' });

  const modal = h('div.modal', {}, [
    h('h2.display', { text: 'Sync & Settings' }),
    h('p.modal-sub', { text: 'Connect your Firebase Storage to back up or move your library between devices.' }),

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
}

function workingModal(title, progressNode) {
  return h('div.modal', {}, [
    h('h2.display', { text: title }),
    h('div.spinner'),
    progressNode,
  ]);
}
