// Private mode — a per-device flag. When on, a white ♥ shows in the header and
// folders marked private become visible (they're hidden otherwise).
const KEY = 'onyx-private';

export function isPrivate() { return localStorage.getItem(KEY) === '1'; }

export function applyPrivate() {
  document.body.classList.toggle('is-private', isPrivate());
  // (the top-centre ♥ badge was removed by request)
  const badge = document.getElementById('heart-badge');
  if (badge) badge.remove();
}

export function setPrivate(v) {
  localStorage.setItem(KEY, v ? '1' : '0');
  applyPrivate();
  window.dispatchEvent(new Event('onyx-private-change'));
}
