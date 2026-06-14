// Clipboard image helpers — used by the album and the lookbook editor so a
// copied picture can be pasted with Ctrl/Cmd+V (desktop) or a button (mobile).

// From a native `paste` event's clipboardData (synchronous, works on desktop).
export function imageFileFromPasteEvent(e) {
  const items = (e.clipboardData && e.clipboardData.items) || [];
  for (const it of items) {
    if (it.kind === 'file' && it.type && it.type.startsWith('image/')) {
      const f = it.getAsFile();
      if (f) return f;
    }
  }
  return null;
}

// Via the async Clipboard API — needs a user gesture (a button tap), good for
// touch devices that have no Ctrl+V. Returns null if nothing usable / denied.
export async function readClipboardImageFile() {
  try {
    if (!navigator.clipboard || !navigator.clipboard.read) return null;
    const items = await navigator.clipboard.read();
    for (const it of items) {
      const type = it.types.find((t) => t.startsWith('image/'));
      if (type) {
        const blob = await it.getType(type);
        const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
        return new File([blob], `pasted-${Date.now()}.${ext}`, { type: blob.type });
      }
    }
  } catch (_) { /* permission denied or unsupported */ }
  return null;
}
