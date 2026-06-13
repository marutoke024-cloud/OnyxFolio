// Inline stroke icons (1.5 weight) used across the app.
const w = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

export const icons = {
  plus:    w('<path d="M12 5v14M5 12h14"/>'),
  close:   w('<path d="M6 6l12 12M18 6L6 18"/>'),
  edit:    w('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>'),
  trash:   w('<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>'),
  settings:w('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>'),
  cloudUp: w('<path d="M16 16l-4-4-4 4"/><path d="M12 12v9"/><path d="M20.4 18.6A5 5 0 0 0 18 9h-1.3A8 8 0 1 0 4 16.9"/>'),
  cloudDown:w('<path d="M8 17l4 4 4-4"/><path d="M12 12v9"/><path d="M20.4 18.6A5 5 0 0 0 18 9h-1.3A8 8 0 1 0 4 16.9"/>'),
  grid:    w('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>'),
  book:    w('<path d="M4 4h7a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H4z"/><path d="M20 4h-4a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2.5H20z"/>'),
  tag:     w('<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.2"/>'),
  image:   w('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>'),
  back:    w('<path d="M19 12H5M12 19l-7-7 7-7"/>'),
  check:   w('<path d="M20 6 9 17l-5-5"/>'),
  upload:  w('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>'),
  folder:  w('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  download:w('<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/>'),
  text:    w('<path d="M4 7V5h16v2M9 19h6M12 5v14"/>'),
  layout:  w('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>'),
  move:    w('<path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>'),
};

export const ico = (name, cls = '') => {
  const span = document.createElement('span');
  span.className = 'ico ' + cls;
  span.innerHTML = icons[name] || '';
  return span;
};
