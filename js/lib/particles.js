// Drifting, twinkling particle field for the landing view.
// Plain canvas 2D. Pauses on tab-hide so it never burns cycles in the
// background or freezes mid-frame (a known foot-gun on this stack).
import { rand } from './dom.js';

export class ParticleField {
  constructor(canvas, { density = 0.00012, parallax = 14 } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.density = density;
    this.parallax = parallax;
    this.particles = [];
    this.t = 0;
    this.raf = 0;
    this.running = false;
    this.pointer = { x: 0, y: 0, tx: 0, ty: 0 };

    this._resize = this._resize.bind(this);
    this._tick = this._tick.bind(this);
    this._onVis = () => (document.hidden ? this.pause() : this.resume());
    this._onMove = (e) => {
      const p = e.touches ? e.touches[0] : e;
      this.pointer.tx = (p.clientX / window.innerWidth - 0.5) * 2;
      this.pointer.ty = (p.clientY / window.innerHeight - 0.5) * 2;
    };
  }

  start() {
    this._resize();
    window.addEventListener('resize', this._resize);
    document.addEventListener('visibilitychange', this._onVis);
    window.addEventListener('pointermove', this._onMove, { passive: true });
    this.running = true;
    if (!document.hidden) this.raf = requestAnimationFrame(this._tick);
  }

  pause() { this.running = false; cancelAnimationFrame(this.raf); }
  resume() { if (!this.running) { this.running = true; this.last = performance.now(); this.raf = requestAnimationFrame(this._tick); } }

  destroy() {
    this.pause();
    window.removeEventListener('resize', this._resize);
    document.removeEventListener('visibilitychange', this._onVis);
    window.removeEventListener('pointermove', this._onMove);
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const count = Math.round(w * h * this.density);
    this.particles = Array.from({ length: count }, () => this._spawn(w, h));
  }

  _spawn(w, h) {
    const bright = Math.random() < 0.08;     // a few brighter "stars"
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      z: rand(0.3, 1),                        // depth → parallax + size
      r: bright ? rand(1.1, 1.9) : rand(0.4, 1.1),
      baseA: bright ? rand(0.35, 0.6) : rand(0.05, 0.3),
      vx: rand(-0.04, 0.04),
      vy: rand(-0.05, 0.02),
      tw: rand(0.4, 1.6),                     // twinkle speed
      ph: rand(0, Math.PI * 2),               // twinkle phase
      bright,
    };
  }

  _tick(now) {
    if (!this.running) return;
    this.last = this.last || now;
    const dt = Math.min(48, now - this.last); this.last = now;
    this.t += dt * 0.001;

    // ease pointer for parallax
    this.pointer.x += (this.pointer.tx - this.pointer.x) * 0.05;
    this.pointer.y += (this.pointer.ty - this.pointer.y) * 0.05;

    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);

    for (const p of this.particles) {
      p.x += p.vx * dt * 0.06;
      p.y += p.vy * dt * 0.06;
      // wrap
      if (p.x < -4) p.x = w + 4; else if (p.x > w + 4) p.x = -4;
      if (p.y < -4) p.y = h + 4; else if (p.y > h + 4) p.y = -4;

      const twinkle = 0.45 + 0.55 * Math.sin(this.t * p.tw + p.ph);
      const a = p.baseA * twinkle;
      const px = p.x + this.pointer.x * this.parallax * p.z;
      const py = p.y + this.pointer.y * this.parallax * p.z;

      if (p.bright) {
        const g = ctx.createRadialGradient(px, py, 0, px, py, p.r * 4);
        g.addColorStop(0, `rgba(244,242,236,${a})`);
        g.addColorStop(1, 'rgba(244,242,236,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(px, py, p.r * 4, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = `rgba(232,230,224,${a})`;
        ctx.beginPath(); ctx.arc(px, py, p.r, 0, Math.PI * 2); ctx.fill();
      }
    }
    this.raf = requestAnimationFrame(this._tick);
  }
}
