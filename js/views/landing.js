// Landing view — a dim pointillist painting behind a quiet title.
// Enter (pill or ↵) → folders.
import { h, qsa } from '../lib/dom.js';
import { Pointillism } from '../lib/pointillism.js';

export async function mount(root, params, ctx) {
  const canvas = h('canvas.pointfield');
  const grain = h('div.landing-grain');
  const vignette = h('div.landing-vignette');

  const enterBtn = h('button.enter-pill.reveal', { type: 'button', style: { transitionDelay: '.5s' }, text: 'Enter', 'aria-label': 'Enter Onyx Folio' });

  const lbLink = h('button.landing-lblink.reveal', { type: 'button', style: { transitionDelay: '.9s' }, text: 'Look Books', 'aria-label': 'Open lookbooks', onclick: () => ctx.nav('/portfolio') });
  const core = h('div.landing-core', {}, [
    h('h1.landing-title.reveal', { style: { transitionDelay: '.15s' }, text: 'Onyx Folio' }),
    h('p.landing-sub.reveal', { style: { transitionDelay: '.32s' }, text: 'A gallery you can compose.' }),
    enterBtn,
    lbLink,
  ]);
  root.append(canvas, grain, vignette, core);

  const field = new Pointillism(canvas, { src: 'assets/flower-source.jpg', step: 4, dim: 1.15, sat: 0.62 });
  window.__pf = field; // debug handle (harmless)
  field.load().then(() => field.start()).catch((e) => console.error('pointillism', e));

  requestAnimationFrame(() => requestAnimationFrame(() => {
    qsa('.reveal', root).forEach((el) => el.classList.add('in'));
  }));

  const go = () => ctx.nav('/folders');
  enterBtn.addEventListener('click', go);
  const onKey = (e) => { if (e.key === 'Enter' && !e.target.closest('input,textarea')) go(); };
  document.addEventListener('keydown', onKey);

  return {
    destroy() {
      field.destroy();
      document.removeEventListener('keydown', onKey);
    },
  };
}
