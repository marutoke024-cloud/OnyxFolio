// Private mode — a per-device flag. When on, a white ♥ shows in the header and
// folders marked private become visible (they're hidden otherwise).
const KEY = 'onyx-private';

export function isPrivate() { return localStorage.getItem(KEY) === '1'; }

export function applyPrivate() {
  const on = isPrivate();
  document.body.classList.toggle('is-private', on);
  let badge = document.getElementById('heart-badge');
  if (on && !badge) {
    badge = document.createElement('div');
    badge.id = 'heart-badge';
    badge.textContent = '♥';
    badge.setAttribute('title', 'Private mode is on');
    badge.setAttribute('aria-label', 'Private mode on');
    document.body.append(badge);
  } else if (!on && badge) {
    badge.remove();
  }
}

export function setPrivate(v) {
  localStorage.setItem(KEY, v ? '1' : '0');
  applyPrivate();
  window.dispatchEvent(new Event('onyx-private-change'));
}
