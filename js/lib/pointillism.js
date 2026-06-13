// Pointillist image field — samples a source image into fine dots that emerge
// softly in the centre, fade to pure black at the edges, and twinkle at random.
//
// Performance: the bulk of the dots are painted ONCE into an offscreen "base"
// canvas; only a scattered subset is re-drawn each frame to flicker on top.
// So a frame is one image blit + a few hundred rects, not thousands.
//
// A static frame is painted immediately on start (so the painting is visible
// even while the tab reports hidden, e.g. during capture); the animation loop
// runs only while visible, and never freezes mid-frame.
import { rand } from './dom.js';

export class Pointillism {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.src = opts.src;
    this.step = opts.step || 6;            // sampling grid in css px
    this.dim = opts.dim ?? 0.72;           // overall brightness
    this.sat = opts.sat ?? 0.5;            // 0 = grey, 1 = full colour
    this.sparkRatio = opts.sparkRatio ?? 0.16;  // share of dots that flicker
    this.base = null; this.animDots = [];
    this.t = 0; this.raf = 0; this.active = false; this.last = 0;
    this._img = null; this._rt = 0;
    this._tick = this._tick.bind(this);
    this._onResize = () => { clearTimeout(this._rt); this._rt = setTimeout(() => { this._applySize(); this._build(); this._draw(); }, 160); };
    this._onVis = () => { if (document.hidden) this._stopLoop(); else this._ensureLoop(); };
  }

  load() {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => { this._img = img; res(img); };
      img.onerror = rej;
      img.src = this.src;
    });
  }

  start() {
    this._applySize();
    this._build();
    this._draw();                          // paint one static frame right away
    this.active = true;
    window.addEventListener('resize', this._onResize);
    document.addEventListener('visibilitychange', this._onVis);
    this._ensureLoop();
  }

  _ensureLoop() {
    if (this.active && !document.hidden && !this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this._tick);
    }
  }
  _stopLoop() { cancelAnimationFrame(this.raf); this.raf = 0; }

  destroy() {
    this.active = false;
    this._stopLoop();
    clearTimeout(this._rt);
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('visibilitychange', this._onVis);
  }

  _applySize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  _build() {
    this.base = null; this.animDots = [];
    if (!this._img) return;
    const { w, h, dpr } = this, img = this._img;
    const ar = img.width / img.height;

    // centred render box (keep aspect, fit within viewport)
    let bh = Math.min(h * 0.96, 780);
    let bw = bh * ar;
    if (bw > w * 0.96) { bw = w * 0.96; bh = bw / ar; }
    const bx = (w - bw) / 2, by = (h - bh) / 2;
    const cx = w / 2, cy = h / 2;

    // sample the image at on-screen resolution
    const sc = document.createElement('canvas');
    const sw = Math.max(40, Math.round(bw)), sh = Math.max(40, Math.round(bh));
    sc.width = sw; sc.height = sh;
    const sctx = sc.getContext('2d', { willReadFrequently: true });
    sctx.drawImage(img, 0, 0, sw, sh);
    const data = sctx.getImageData(0, 0, sw, sh).data;

    const step = this.step;
    const ds = Math.max(1.4, step * 0.46);
    this.dotSize = ds;
    const maxR = Math.min(bw, bh) * 0.74;

    // static dots are baked into this offscreen base
    const base = document.createElement('canvas');
    base.width = this.canvas.width; base.height = this.canvas.height;
    const bctx = base.getContext('2d');
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const anim = [];
    for (let y = 0; y < sh; y += step) {
      for (let x = 0; x < sw; x += step) {
        const i = (y * sw + x) * 4;
        let r = data[i], g = data[i + 1], b = data[i + 2];
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        const lum = gray / 255;
        if (lum < 0.085) continue;                 // drop near-black → flower emerges from dark

        r = gray + (r - gray) * this.sat;          // desaturate toward grey
        g = gray + (g - gray) * this.sat;
        b = gray + (b - gray) * this.sat;

        const px = bx + x, py = by + y;
        const dist = Math.hypot(px - cx, py - cy);
        const fall = Math.max(0, 1 - dist / maxR);
        const falloff = fall * fall;
        if (falloff <= 0.02) continue;

        const baseA = Math.min(0.9, Math.pow(lum, 0.72)) * falloff * this.dim;  // lift midtones
        if (baseA < 0.012) continue;
        const col = `${r | 0},${g | 0},${b | 0}`;

        if (Math.random() < this.sparkRatio) {
          anim.push({ x: px, y: py, col, a: baseA, ph: rand(0, Math.PI * 2), sp: rand(0.7, 2.3) });
        } else {
          bctx.fillStyle = `rgba(${col},${baseA})`;
          bctx.fillRect(px, py, ds, ds);
        }
      }
    }
    this.base = base;
    this.animDots = anim;
  }

  _draw() {
    const { ctx, t } = this, ds = this.dotSize;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.base) ctx.drawImage(this.base, 0, 0);
    ctx.restore();                                 // back to the dpr transform
    for (const d of this.animDots) {
      const tw = 0.5 + 0.5 * Math.sin(t * d.sp + d.ph);
      const a = d.a * (0.1 + 0.9 * tw * tw * tw);  // sharpen → subtle random blink
      if (a <= 0.004) continue;
      ctx.fillStyle = `rgba(${d.col},${a})`;
      ctx.fillRect(d.x, d.y, ds, ds);
    }
  }

  _tick(now) {
    if (!this.active || document.hidden) { this.raf = 0; return; }
    const dt = Math.min(60, now - this.last); this.last = now;
    this.t += dt * 0.001;
    this._draw();
    this.raf = requestAnimationFrame(this._tick);
  }
}
