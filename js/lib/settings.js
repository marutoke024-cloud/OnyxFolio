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

function workingModal(title, ...nodes) {
  return h('div.modal', {}, [
    h('h2.display', { text: title }),
    h('div.spinner'),
    ...nodes,
  ]);
}
