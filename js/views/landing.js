// Landing view — a dim pointillist painting behind a quiet title.
// Enter (pill or ↵) → folders.
import { h, qsa } from '../lib/dom.js';
import { Pointillism } from '../lib/pointillism.js';

const RETURN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 10 4 15l5 5"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>';

export async function mount(root, params, ctx) {
  const canvas = h('canvas.pointfield');
  const grain = h('div.landing-grain');
  const vignette = h('div.landing-vignette');

  const enterBtn = h('button.enter-pill.reveal', { type: 'button', style: { transitionDelay: '.5s' }, text: 'Enter', 'aria-label': 'Enter Onyx Folio' });

  const core = h('div.landing-core', {}, [
    h('h1.landing-title.reveal', { style: { transitionDelay: '.15s' }, text: 'Onyx Folio' }),
    h('p.landing-sub.reveal', { style: { transitionDelay: '.32s' }, text: 'A gallery you can compose.' }),
    enterBtn,
    h('div.enter-hint.reveal', { style: { transitionDelay: '.64s' } }, [
      h('span', { html: RETURN }),
      h('span', { text: 'Best viewed in the dark' }),
    ]),
  ]);

  root.append(canvas, grain, vignette, core);

  const field = new Pointillism(canvas, { src: 'assets/flower-source.jpg', step: 6, dim: 1.0, sat: 0.55 });
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
