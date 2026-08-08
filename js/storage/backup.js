// Local backup — the whole library packed into one .zip the user keeps themselves.
//
// This is the only path that does not depend on Firebase being configured, and the
// only one that survives a browser clearing its storage. It also handles the two
// durability primitives the app leans on: asking for persistent storage, and
// reporting how much room the library is using.
//
// The archive mirrors the Firebase layout so both backends describe a library the
// same way:  manifest.json · img/<id> · thumb/<id>
import { getFolders, getAllImages, getPortfolios, putRaw, clearAll } from './db.js';

const PREFIX_IMG = 'img/', PREFIX_THUMB = 'thumb/', MANIFEST = 'manifest.json';
const ZIP_MAX = 0xFFFFFFFF;   // stored offsets/sizes are 32-bit; ZIP64 is not written

// --- durability -----------------------------------------------------------

/** Ask the browser to exempt this origin's data from routine eviction. */
export async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) return { supported: false, persisted: false };
    if (await navigator.storage.persisted()) return { supported: true, persisted: true };
    return { supported: true, persisted: await navigator.storage.persist() };
  } catch { return { supported: false, persisted: false }; }
}

/** { usage, quota } in bytes, or null where the browser won't say. */
export async function storageUsage() {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { usage: e.usage || 0, quota: e.quota || 0 } : null;
  } catch { return null; }
}

/** iOS wipes script-writable storage after ~7 unused days unless the site was
 *  installed to the Home Screen — persist() cannot override that, only installing
 *  can. True when this device is in exactly that exposed state. */
export function iosEvictionRisk() {
  const p = navigator.platform || '';
  // iPadOS reports "MacIntel"; the touch count is what separates it from a Mac
  const ios = /iP(hone|ad|od)/.test(p) || (/Mac/.test(p) && navigator.maxTouchPoints > 1);
  const installed = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  return ios && !installed;
}

export function formatBytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
}

// --- zip primitives -------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();
function crc32(u8) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

const enc = new TextEncoder();
// little-endian writer over a fixed-size record
function rec(size) {
  const u8 = new Uint8Array(size), dv = new DataView(u8.buffer);
  let p = 0;
  return {
    u8,
    u16(v) { dv.setUint16(p, v, true); p += 2; return this; },
    u32(v) { dv.setUint32(p, v >>> 0, true); p += 4; return this; },
    bytes(b) { u8.set(b, p); p += b.length; return this; },
  };
}
// DOS date/time — zip has no other option, and readers show it as the file date
function dosTime(ms) {
  const d = new Date(ms || Date.now());
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

// --- export ---------------------------------------------------------------

/** Pack the whole library into a single .zip Blob. */
export async function exportLibrary(onProgress = () => {}) {
  onProgress({ phase: 'prepare', done: 0, total: 0 });
  const [folders, images, portfolios] = await Promise.all([getFolders(), getAllImages(), getPortfolios()]);
  const manifest = {
    version: 1, exportedAt: Date.now(),
    folders, portfolios,
    images: images.map(({ blob, thumb, ...meta }) => meta),
  };

  const parts = [];       // Blob parts — the originals go in by reference, not copied
  const central = [];
  let offset = 0, count = 0;

  const put = async (name, blob, mtime) => {
    // the bytes are read once for the checksum, then dropped; only the Blob is kept
    const u8 = new Uint8Array(await blob.arrayBuffer());
    const crc = crc32(u8);
    const size = u8.length;
    const nameB = enc.encode(name);
    const { time, date } = dosTime(mtime);

    const local = rec(30 + nameB.length);
    local.u32(0x04034B50).u16(20).u16(0x0800).u16(0)   // stored, UTF-8 names
      .u16(time).u16(date).u32(crc).u32(size).u32(size)
      .u16(nameB.length).u16(0).bytes(nameB);
    parts.push(local.u8, blob);

    const cd = rec(46 + nameB.length);
    cd.u32(0x02014B50).u16(20).u16(20).u16(0x0800).u16(0)
      .u16(time).u16(date).u32(crc).u32(size).u32(size)
      .u16(nameB.length).u16(0).u16(0).u16(0).u16(0).u32(0).u32(offset).bytes(nameB);
    central.push(cd.u8);

    offset += local.u8.length + size;
    count++;
    if (offset > ZIP_MAX) throw new Error('ライブラリが 4GB を超えています。フォルダを分けて書き出してください。');
  };

  await put(MANIFEST, new Blob([JSON.stringify(manifest)], { type: 'application/json' }), Date.now());
  let done = 0;
  for (const im of images) {
    if (im.blob) await put(PREFIX_IMG + im.id, im.blob, im.createdAt);
    if (im.thumb) await put(PREFIX_THUMB + im.id, im.thumb, im.createdAt);
    onProgress({ phase: 'pack', done: ++done, total: images.length });
  }

  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = rec(22);
  eocd.u32(0x06054B50).u16(0).u16(0).u16(count).u16(count).u32(cdSize).u32(offset).u16(0);

  return {
    blob: new Blob([...parts, ...central, eocd.u8], { type: 'application/zip' }),
    counts: { folders: folders.length, images: images.length, portfolios: portfolios.length },
  };
}

/** Hand a Blob to the user as a download. */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const backupFilename = () => {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `onyx-folio-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.zip`;
};

// --- import ---------------------------------------------------------------

/** Read a zip's central directory into name → Blob (decompressing if needed). */
async function readZip(file) {
  const tailLen = Math.min(file.size, 65557);            // max comment + EOCD
  const tail = new Uint8Array(await file.slice(file.size - tailLen).arrayBuffer());
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4B && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('zip ファイルとして読めませんでした。');
  const tv = new DataView(tail.buffer, tail.byteOffset);
  const count = tv.getUint16(eocd + 10, true);
  const cdSize = tv.getUint32(eocd + 12, true);
  const cdOff = tv.getUint32(eocd + 16, true);

  const cd = new Uint8Array(await file.slice(cdOff, cdOff + cdSize).arrayBuffer());
  const cv = new DataView(cd.buffer, cd.byteOffset);
  const dec = new TextDecoder();
  const entries = new Map();
  let p = 0;
  for (let i = 0; i < count && p + 46 <= cd.length; i++) {
    if (cv.getUint32(p, true) !== 0x02014B50) break;
    const method = cv.getUint16(p + 10, true);
    const compSize = cv.getUint32(p + 20, true);
    const nameLen = cv.getUint16(p + 28, true);
    const extraLen = cv.getUint16(p + 30, true);
    const cmtLen = cv.getUint16(p + 32, true);
    const localOff = cv.getUint32(p + 42, true);
    const name = dec.decode(cd.subarray(p + 46, p + 46 + nameLen));
    entries.set(name, { method, compSize, localOff });
    p += 46 + nameLen + extraLen + cmtLen;
  }

  // the local header repeats the name/extra lengths, and only it is authoritative
  // about where the data actually starts
  const readEntry = async ({ method, compSize, localOff }) => {
    const lh = new DataView(await file.slice(localOff, localOff + 30).arrayBuffer());
    const start = localOff + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
    const raw = file.slice(start, start + compSize);
    if (method === 0) return raw;
    if (method === 8 && 'DecompressionStream' in window) {
      return new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
    }
    throw new Error('対応していない圧縮形式が含まれています。');
  };
  return { entries, readEntry };
}

/** Replace everything local with the contents of a backup zip. */
export async function importLibrary(file, onProgress = () => {}) {
  onProgress({ phase: 'manifest', done: 0, total: 0 });
  const { entries, readEntry } = await readZip(file);
  const mEntry = entries.get(MANIFEST);
  if (!mEntry) throw new Error('manifest.json が見つかりません。Onyx Folio の書き出したファイルを選んでください。');
  const manifest = JSON.parse(await (await readEntry(mEntry)).text());
  const images = manifest.images || [];

  onProgress({ phase: 'prepare', done: 0, total: images.length });
  await clearAll();
  for (const f of (manifest.folders || [])) await putRaw('folders', f);
  for (const p of (manifest.portfolios || [])) await putRaw('portfolios', p);

  let done = 0;
  for (const meta of images) {
    const ib = entries.get(PREFIX_IMG + meta.id);
    const tb = entries.get(PREFIX_THUMB + meta.id);
    let blob = null, thumb = null;
    if (ib) { const b = await readEntry(ib); blob = new Blob([b], { type: meta.type || 'image/jpeg' }); }
    if (tb) { const b = await readEntry(tb); thumb = new Blob([b], { type: 'image/jpeg' }); }
    // an entry missing one of the pair still restores, using whichever survived
    if (blob || thumb) await putRaw('images', { ...meta, blob: blob || thumb, thumb: thumb || blob });
    onProgress({ phase: 'restore', done: ++done, total: images.length });
  }
  return { folders: (manifest.folders || []).length, images: images.length, portfolios: (manifest.portfolios || []).length };
}
