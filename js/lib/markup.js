// Pen markup shared by the album lightbox and the lookbook pages.
// A stroke is { tool, color, width, points } with the points normalized to 0–1 of
// whatever surface it was drawn on, so the same data repaints at any size.
import { decodeImage } from './image.js';

/** Paint one stroke onto a 2-D context sized W×H. */
export function drawStroke(ctx, st, W, H) {
  const pts = st.points || []; if (!pts.length) return;
  ctx.save();
  ctx.globalCompositeOperation = st.tool === 'eraser' ? 'destination-out' : 'source-over';
  ctx.globalAlpha = st.tool === 'marker' ? 0.38 : 1;
  ctx.strokeStyle = st.color || '#ff3b30';
  ctx.lineWidth = Math.max(1, (st.width || 0.012) * W);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach((p, i) => { const x = p[0] * W, y = p[1] * H; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  if (pts.length === 1) ctx.lineTo(pts[0][0] * W + 0.1, pts[0][1] * H);   // a tap → a dot
  ctx.stroke();
  ctx.restore();
}

/** Clear a context and repaint a whole stroke list into it. */
export function paintStrokes(ctx, strokes, W, H) {
  ctx.clearRect(0, 0, W, H);
  (strokes || []).forEach((st) => drawStroke(ctx, st, W, H));
}

// Flattened copies keep plenty of detail while staying well inside the per-canvas
// limits mobile Safari enforces — past them it quietly hands back a blank canvas.
const EXPORT_MAX = 4096;      // px on the long edge
const EXPORT_AREA = 12e6;     // px² in total, so panoramas shrink too

/** Bake an image record's ink into its picture. Returns a fresh JPEG blob + size. */
export async function flattenMarkup(im, strokes = im.markup) {
  const src = im.blob || im.thumb;
  if (!src) throw new Error('This image has no picture data to flatten.');
  const bmp = await decodeImage(src);
  const sw = bmp.width, sh = bmp.height;
  let k = Math.min(1, EXPORT_MAX / Math.max(sw, sh));
  if (sw * sh * k * k > EXPORT_AREA) k = Math.sqrt(EXPORT_AREA / (sw * sh));
  const W = Math.max(1, Math.round(sw * k)), H = Math.max(1, Math.round(sh * k));

  const base = document.createElement('canvas');
  base.width = W; base.height = H;
  const bctx = base.getContext('2d');
  bctx.imageSmoothingQuality = 'high';
  bctx.drawImage(bmp, 0, 0, W, H);
  if (bmp.close) bmp.close();

  // The ink is composed on its own transparent layer first. An eraser stroke is
  // `destination-out`, so painting the list straight onto the photo would punch a
  // hole through the picture instead of only lifting the ink above it.
  const list = strokes || [];
  if (list.length) {
    const ink = document.createElement('canvas');
    ink.width = W; ink.height = H;
    paintStrokes(ink.getContext('2d'), list, W, H);
    bctx.drawImage(ink, 0, 0);
  }

  const blob = await new Promise((res) => base.toBlob(res, 'image/jpeg', 0.92));
  if (!blob) throw new Error('The browser could not encode the flattened image.');
  return { blob, w: W, h: H };
}
