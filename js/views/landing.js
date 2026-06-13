// Landing view — atmospheric entry. Enter (button or ↵ key) → folders.
import { h, qsa } from '../lib/dom.js';
import { ParticleField } from '../lib/particles.js';

const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

export async function mount(root, params, ctx) {
  const canvas = h('canvas.landing-canvas');
  const grain = h('div.landing-grain');

  const enterBtn = h('button.enter-btn', { type: 'button', 'aria-label': 'Enter Onyx Folio' }, [
    h('span.ring', { html: ARROW }),
    h('span', {}, [
      h('span.enter-label', { text: 'Enter' }),
    ]),
  ]);

  const titleMask = h('h1.landing-title', {}, [
    h('span.glow'),
    h('span.mask', {}, [ h('span', { html: 'Onyx&nbsp;<em>Folio</em>' }) ]),
  ]);

  const stage = h('div.landing-stage', {}, [
    h('div.mono-label.landing-kicker.reveal', { style: { transitionDelay: '.15s' }, html: 'Gallery <span class="dot">·</span> Portfolio <span class="dot">·</span> Lookbook' }),
    titleMask,
    h('p.landing-sub.reveal', { style: { transitionDelay: '.6s' }, text: 'Curate the images you love into a quiet, considered archive — then compose them into a portfolio or lookbook entirely your own.' }),
    h('div.reveal', { style: { transitionDelay: '.85s' } }, [
      enterBtn,
      h('div.enter-hint', { text: 'Press ↵ to begin' }),
    ]),
  ]);

  const frame = h('div.landing-frame', {}, [
    h('div.landing-row', {}, [
      h('div.mono-label.reveal', { style: { transitionDelay: '1s' }, html: 'Onyx Folio <span class="dot">·</span> Gallery System' }),
      h('div.mono-label.reveal', { style: { transitionDelay: '1.05s' }, text: 'Est. MMXXVI' }),
    ]),
    stage,
    h('div.landing-row.foot', {}, [
      h('div.mono-label.reveal', { style: { transitionDelay: '1.1s' }, text: 'Collect · Arrange · Bind' }),
      h('div.mono-label.reveal', { style: { transitionDelay: '1.15s' }, text: 'Edition 1.0' }),
    ]),
  ]);

  root.append(canvas, grain, frame);

  const field = new ParticleField(canvas);
  field.start();

  // trigger reveal once laid out
  requestAnimationFrame(() => requestAnimationFrame(() => {
    qsa('.reveal', root).forEach((el) => el.classList.add('in'));
    titleMask.querySelector('.mask').classList.add('in');
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
