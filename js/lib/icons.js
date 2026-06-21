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
  sliders: w('<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>'),
  palette: w('<path d="M12 2a10 10 0 1 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-1 .8-1.8 1.8-1.8H17a5 5 0 0 0 5-5c0-4.4-4.5-8-10-8z"/><circle cx="7.5" cy="10.5" r="1.2"/><circle cx="12" cy="7.5" r="1.2"/><circle cx="16.5" cy="10.5" r="1.2"/>'),
  clipboard: w('<rect x="8" y="3" width="8" height="4" rx="1"/><path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>'),
  eye:     w('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff:  w('<path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 4.6A9.8 9.8 0 0 1 12 5c6.5 0 10 7 10 7a16 16 0 0 1-3 3.6M6.6 6.6A16 16 0 0 0 2 12s3.5 7 10 7a9.8 9.8 0 0 0 3-.5"/>'),
  zoomIn:  w('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M11 8v6M8 11h6"/>'),
  zoomOut: w('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8 11h6"/>'),
  pages:   w('<rect x="3" y="4" width="8" height="16" rx="1"/><rect x="13" y="4" width="8" height="16" rx="1"/>'),
  lock:    w('<rect x="4.5" y="11" width="15" height="9.5" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>'),
  play:    w('<path d="M7 4.5l12 7.5-12 7.5z"/>'),
  pause:   w('<rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/>'),
  timer:   w('<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4.5l3 1.5M9.5 2.5h5M12 6V2.5"/>'),
  pen:     w('<path d="M4 20l4.5-1L19 8.5a2.1 2.1 0 0 0-3-3L5.5 16z"/><path d="M14.5 7l3 3"/>'),
  marker:  w('<path d="M9 20H4v-3l9.5-9.5 3 3L7 20z"/><path d="M13 6.5l3 3"/><path d="M3 22h18"/>'),
  eraser:  w('<path d="M16 5l5 5-8.5 8.5H8L3.5 14 12 5.5a2 2 0 0 1 4-.5z"/><path d="M8.5 9.5l5 5M9 21h12"/>'),
  undo:    w('<path d="M9 7L4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 0 12h-3"/>'),
  redo:    w('<path d="M15 7l5 5-5 5"/><path d="M20 12H10a6 6 0 0 0 0 12h3"/>'),
  dots:    w('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>'),
  lockOpen:w('<rect x="4.5" y="11" width="15" height="9.5" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 7.7-1.4"/>'),
};

export const ico = (name, cls = '') => {
  const span = document.createElement('span');
  span.className = 'ico ' + cls;
  span.innerHTML = icons[name] || '';
  return span;
};
