// Shared top bar for inner views (folders / album / portfolio).
import { h } from './dom.js';
import { ico } from './icons.js';
import { nav } from '../main.js';
import { openSettings } from './settings.js';

/** actions: [{ icon, title, onClick, label?, accent? }] — label renders a text btn, else an icon-btn. */
export function buildTopbar({ crumbs = [], actions = [], includeSettings = true } = {}) {
  const crumbEls = [];
  crumbs.forEach((c, i) => {
    if (i) crumbEls.push(h('span.sep', { text: '/' }));
    const isLast = i === crumbs.length - 1;
    crumbEls.push(h('span' + (isLast ? '.cur' : '') + (c.jp ? '.jp' : ''), {
      text: c.label,
      style: c.onClick ? { cursor: 'pointer' } : null,
      onclick: c.onClick || null,
    }));
  });

  const actionEls = actions.map((a) => {
    if (a.label) {
      const b = h('button.btn' + (a.accent ? '.btn-accent' : ''), { title: a.title || '', onclick: a.onClick }, [a.label]);
      if (a.icon) b.prepend(ico(a.icon));
      b.classList.add('btn-with-ico');
      return b;
    }
    return h('button.icon-btn', { title: a.title || '', onclick: a.onClick }, [ico(a.icon)]);
  });

  if (includeSettings) {
    actionEls.push(h('button.icon-btn', { title: 'Sync & settings', onclick: () => openSettings() }, [ico('settings')]));
  }

  return h('div.topbar', {}, [
    h('div.tb-left', {}, [
      h('div.brand', { onclick: () => nav('/') }, [ h('span.mark'), 'Onyx Folio' ]),
      crumbs.length ? h('div.crumbs', {}, crumbEls) : null,
    ]),
    h('div.actions', {}, actionEls),
  ]);
}
