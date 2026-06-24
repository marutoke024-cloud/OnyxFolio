// Manual Firebase Storage sync — push (overwrite remote) / pull (overwrite local).
// Firebase modular SDK is loaded lazily from the CDN; everything is guarded so
// the app works fully offline when no config is present.
import { getFolders, getAllImages, getPortfolios, putRaw, clearAll } from './db.js';

const FB_VER = '10.12.5';
const PREFIX = 'onyx';
const CFG_KEY = 'onyx-fb-config';

export function getConfig() {
  try { return JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); } catch { return null; }
}
export function setConfig(cfg) { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); _cache = null; }
export function clearConfig() { localStorage.removeItem(CFG_KEY); _cache = null; }
export function isConfigured() { const c = getConfig(); return !!(c && c.storageBucket && c.apiKey); }

/** Parse a pasted Firebase web config (JSON or the `const firebaseConfig = {...}` snippet). */
export function parseConfig(text) {
  const t = (text || '').trim();
  if (!t) return null;
  // try strict JSON first
  try { return JSON.parse(t); } catch {}
  // extract the object literal and coerce keys/quotes to JSON
  const m = t.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let body = m[0]
    .replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":') // quote bare keys
    .replace(/'/g, '"')
    .replace(/,(\s*[}\]])/g, '$1');                       // trailing commas
  try { return JSON.parse(body); } catch { return null; }
}

let _cache = null;
async function fb() {
  const cfg = getConfig();
  if (!cfg || !cfg.storageBucket) throw new Error('Add your Firebase config first.');
  if (_cache) return _cache;
  const appMod = await import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-app.js`);
  const stMod = await import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-storage.js`);
  let app;
  try { app = appMod.initializeApp(cfg); }
  catch { app = appMod.getApp(); }
  const storage = stMod.getStorage(app);
  _cache = { storage, ...stMod };
  return _cache;
}

const stripBlobs = ({ blob, thumb, ...meta }) => meta;

/** Push the entire local library to Storage, overwriting the remote copy. */
export async function pushAll(onProgress = () => {}) {
  onProgress({ phase: 'connect', done: 0, total: 0 });
  const { storage, ref, uploadBytes, uploadString } = await fb();
  const [folders, images, portfolios] = await Promise.all([getFolders(), getAllImages(), getPortfolios()]);

  const manifest = {
    version: 1, exportedAt: Date.now(),
    folders, portfolios,
    images: images.map(stripBlobs),
  };
  onProgress({ phase: 'manifest', done: 0, total: images.length });
  await uploadString(ref(storage, `${PREFIX}/manifest.json`), JSON.stringify(manifest), 'raw', { contentType: 'application/json' });

  let done = 0;
  for (const im of images) {
    if (im.blob)  await uploadBytes(ref(storage, `${PREFIX}/img/${im.id}`), im.blob, { contentType: im.type || 'image/jpeg' });
    if (im.thumb) await uploadBytes(ref(storage, `${PREFIX}/thumb/${im.id}`), im.thumb, { contentType: 'image/jpeg' });
    onProgress({ phase: 'upload', done: ++done, total: images.length });
  }
  return { folders: folders.length, images: images.length, portfolios: portfolios.length };
}

/** Pull the remote library, overwriting everything local. */
export async function pullAll(onProgress = () => {}) {
  onProgress({ phase: 'connect', done: 0, total: 0 });
  const { storage, ref, getBytes } = await fb();
  onProgress({ phase: 'manifest', done: 0, total: 0 });
  const buf = await getBytes(ref(storage, `${PREFIX}/manifest.json`), 20 * 1024 * 1024);
  const manifest = JSON.parse(new TextDecoder().decode(buf));
  const images = manifest.images || [];

  onProgress({ phase: 'prepare', done: 0, total: images.length });
  await clearAll();
  for (const f of (manifest.folders || [])) await putRaw('folders', f);
  for (const p of (manifest.portfolios || [])) await putRaw('portfolios', p);

  let done = 0;
  for (const meta of images) {
    let blob = null, thumb = null;
    try {
      const ib = await getBytes(ref(storage, `${PREFIX}/img/${meta.id}`), 50 * 1024 * 1024);
      blob = new Blob([ib], { type: meta.type || 'image/jpeg' });
    } catch {}
    try {
      const tb = await getBytes(ref(storage, `${PREFIX}/thumb/${meta.id}`), 20 * 1024 * 1024);
      thumb = new Blob([tb], { type: 'image/jpeg' });
    } catch {}
    await putRaw('images', { ...meta, blob: blob || thumb, thumb: thumb || blob });
    onProgress({ phase: 'download', done: ++done, total: images.length });
  }
  return { folders: (manifest.folders || []).length, images: images.length, portfolios: (manifest.portfolios || []).length };
}
