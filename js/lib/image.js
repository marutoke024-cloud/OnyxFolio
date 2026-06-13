// Image ingestion: decode a File, keep the original blob, derive a thumbnail.

const THUMB_MAX = 720;   // px on the long edge for grid/folder previews

async function decode(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file); } catch { /* fall through */ }
  }
  // Fallback path for browsers without createImageBitmap on blobs
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i); i.onerror = rej; i.src = url;
    });
    return img;
  } finally { /* url revoked by caller via GC; keep simple */ }
}

function drawToBlob(source, w, h, type = 'image/jpeg', quality = 0.86) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);
  return new Promise((res) => canvas.toBlob((b) => res(b), type, quality));
}

/** Turn a user File into an image record ready for db.addImage(). */
export async function fileToImageRecord(file, folderId) {
  const bitmap = await decode(file);
  const w = bitmap.width, h = bitmap.height;
  const scale = Math.min(1, THUMB_MAX / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));
  const thumb = await drawToBlob(bitmap, tw, th);
  if (bitmap.close) bitmap.close();

  // Keep the original bytes for full-resolution portfolio export.
  return {
    folderId,
    blob: file,
    thumb,
    w, h,
    name: file.name.replace(/\.[^.]+$/, ''),
    type: file.type || 'image/jpeg',
  };
}

/** Average luminance helper — used to auto-tint folder accents (optional). */
export async function dominantTone(blob) {
  try {
    const bmp = await decode(blob);
    const c = document.createElement('canvas');
    c.width = 8; c.height = 8;
    const ctx = c.getContext('2d');
    ctx.drawImage(bmp, 0, 0, 8, 8);
    const { data } = ctx.getImageData(0, 0, 8, 8);
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i+1]; b += data[i+2]; }
    const n = data.length / 4;
    if (bmp.close) bmp.close();
    return `rgb(${Math.round(r/n)}, ${Math.round(g/n)}, ${Math.round(b/n)})`;
  } catch { return null; }
}
