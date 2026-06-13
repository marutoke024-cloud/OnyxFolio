// IndexedDB persistence for Onyx Folio.
// Stores: folders, images (binary blobs), portfolios.
import { uid } from '../lib/dom.js';

const DB_NAME = 'onyx-folio';
const DB_VERSION = 1;
let _db = null;

function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('folders')) {
        db.createObjectStore('folders', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('images')) {
        const s = db.createObjectStore('images', { keyPath: 'id' });
        s.createIndex('folderId', 'folderId', { unique: false });
      }
      if (!db.objectStoreNames.contains('portfolios')) {
        db.createObjectStore('portfolios', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode = 'readonly') {
  return open().then((db) => db.transaction(store, mode).objectStore(store));
}
const done = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt ?? 0) - (b.createdAt ?? 0);

// --- Folders --------------------------------------------------------------
export async function getFolders() {
  const s = await tx('folders');
  const all = await done(s.getAll());
  return all.sort(byOrder);
}
export async function addFolder(name, icon = null) {
  const folders = await getFolders();
  const folder = {
    id: uid(), name: name || 'Untitled', order: folders.length,
    createdAt: Date.now(), accent: null, icon,
  };
  const s = await tx('folders', 'readwrite');
  await done(s.put(folder));
  return folder;
}
export async function updateFolder(id, patch) {
  const s = await tx('folders', 'readwrite');
  const f = await done(s.get(id));
  if (!f) return null;
  Object.assign(f, patch);
  await done(s.put(f));
  return f;
}
export async function deleteFolder(id) {
  // cascade: remove the folder's images too
  const imgs = await getImages(id);
  const si = await tx('images', 'readwrite');
  await Promise.all(imgs.map((im) => done(si.delete(im.id))));
  const sf = await tx('folders', 'readwrite');
  await done(sf.delete(id));
}
export async function getFolder(id) {
  const s = await tx('folders');
  return done(s.get(id));
}

// --- Images ---------------------------------------------------------------
export async function getImages(folderId) {
  const s = await tx('images');
  const idx = s.index('folderId');
  const all = await done(idx.getAll(folderId));
  return all.sort(byOrder);
}
export async function getAllImages() {
  const s = await tx('images');
  return done(s.getAll());
}
export async function getImage(id) {
  const s = await tx('images');
  return done(s.get(id));
}
export async function addImage(record) {
  const existing = await getImages(record.folderId);
  const img = {
    id: uid(), order: existing.length, createdAt: Date.now(),
    tags: [], name: '', ...record,
  };
  const s = await tx('images', 'readwrite');
  await done(s.put(img));
  return img;
}
export async function updateImage(id, patch) {
  const s = await tx('images', 'readwrite');
  const im = await done(s.get(id));
  if (!im) return null;
  Object.assign(im, patch);
  await done(s.put(im));
  return im;
}
export async function deleteImage(id) {
  const s = await tx('images', 'readwrite');
  await done(s.delete(id));
}
export async function reorderImages(folderId, orderedIds) {
  const s = await tx('images', 'readwrite');
  await Promise.all(orderedIds.map(async (id, i) => {
    const im = await done(s.get(id));
    if (im) { im.order = i; await done(s.put(im)); }
  }));
}

// --- Portfolios -----------------------------------------------------------
export async function getPortfolios() {
  const s = await tx('portfolios');
  const all = await done(s.getAll());
  return all.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}
export async function getPortfolio(id) {
  const s = await tx('portfolios');
  return done(s.get(id));
}
export async function savePortfolio(p) {
  const rec = { id: p.id || uid(), createdAt: p.createdAt || Date.now(), ...p, updatedAt: Date.now() };
  const s = await tx('portfolios', 'readwrite');
  await done(s.put(rec));
  return rec;
}
export async function deletePortfolio(id) {
  const s = await tx('portfolios', 'readwrite');
  await done(s.delete(id));
}

// --- Raw helpers (used by sync restore — preserve ids) --------------------
export async function putRaw(store, rec) {
  const s = await tx(store, 'readwrite');
  return done(s.put(rec));
}
export async function clearAll() {
  await Promise.all(['folders', 'images', 'portfolios'].map(async (name) => {
    const s = await tx(name, 'readwrite');
    await done(s.clear());
  }));
}

// --- Object-URL cache (revocable) ----------------------------------------
const urlCache = new Map();
export function blobURL(key, blob) {
  if (!blob) return '';
  if (urlCache.has(key)) return urlCache.get(key);
  const url = URL.createObjectURL(blob);
  urlCache.set(key, url);
  return url;
}
export function revokeURL(key) {
  const u = urlCache.get(key);
  if (u) { URL.revokeObjectURL(u); urlCache.delete(key); }
}
