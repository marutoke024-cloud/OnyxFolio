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
// A modern tablet photo is ~12 Mpx, and two canvases that size is enough to make
// iOS refuse the encode, so the cap sits comfortably below one.
const EXPORT_MAX = 4096;      // px on the long edge
const EXPORT_AREA = 8e6;      // px² in total, so panoramas shrink too

/** The pale ground a dimmed photo fades into. Also drives .lb-plate at runtime. */
export const DIM_PLATE = '#eceae3';

function renderFlat(bmp, W, H, strokes, dim) {
  const base = document.createElement('canvas');
  base.width = W; base.height = H;
  const bctx = base.getContext('2d');
  bctx.imageSmoothingQuality = 'high';
  if (dim > 0) {
    // the fade is part of the markup: lay the plate down, then the photo at the
    // stored strength, exactly as the lightbox stacks them
    bctx.fillStyle = DIM_PLATE;
    bctx.fillRect(0, 0, W, H);
    bctx.globalAlpha = dim;
  }
  bctx.drawImage(bmp, 0, 0, W, H);
  bctx.globalAlpha = 1;

  const list = strokes || [];
  if (list.length) {
    // An eraser stroke is `destination-out`, so with one in the list the ink has
    // to be composed on its own transparent layer or it punches a hole through
    // the photo. Without one — the common case — it can go straight on, which
    // saves a second full-size canvas.
    if (list.some((st) => st.tool === 'eraser')) {
      const ink = document.createElement('canvas');
      ink.width = W; ink.height = H;
      paintStrokes(ink.getContext('2d'), list, W, H);
      bctx.drawImage(ink, 0, 0);
      ink.width = ink.height = 0;          // release it before the encode runs
    } else {
      list.forEach((st) => drawStroke(bctx, st, W, H));
    }
  }
  return base;
}

/** Bake an image record's ink (and its saved fade) into the picture. */
export async function flattenMarkup(im, strokes = im.markup) {
  const src = im.blob || im.thumb;
  if (!src) throw new Error('この画像には元データがありません。');
  const bmp = await decodeImage(src);
  const sw = bmp.width, sh = bmp.height;
  let k = Math.min(1, EXPORT_MAX / Math.max(sw, sh));
  if (sw * sh * k * k > EXPORT_AREA) k = Math.sqrt(EXPORT_AREA / (sw * sh));
  const dim = +im.dim || 0;

  // toBlob returns null rather than throwing when the canvas is too big for the
  // device to encode, so step down and try again before giving up.
  let blob = null, W = 0, H = 0;
  for (const shrink of [1, 0.7, 0.45]) {
    W = Math.max(1, Math.round(sw * k * shrink));
    H = Math.max(1, Math.round(sh * k * shrink));
    const cv = renderFlat(bmp, W, H, strokes, dim);
    blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.92));
    cv.width = cv.height = 0;
    if (blob) break;
  }
  if (bmp.close) bmp.close();
  if (!blob) throw new Error('この端末では画像を書き出せませんでした（サイズが大きすぎます）。');
  return { blob, w: W, h: H };
}
