import { clamp, download } from './utils.js?v=11';

/* PRISM extra helpers — split out of utils.js (fresh module URL dodges stale caches) */

/* ── save blob: File System Access API (choose path/name) with download fallback ── */
export async function saveBlob(blob, suggestedName, ext = '.bin', description = 'File') {
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [{ description, accept: { [blob.type]: [ext] } }]
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (e) {
      if (e && e.name === 'AbortError') return false;   // user cancelled
      console.warn('[PRISM] save picker unavailable, falling back to download', e);
    }
  }
  download(blob, suggestedName);
  return true;
}

/* ── MP3 encoder via vendored lamejs (window.lamejs) ── */
export function encodeMp3(channels, sampleRate, kbps = 192) {
  if (typeof window === 'undefined' || !window.lamejs || !window.lamejs.Mp3Encoder) {
    throw new Error('MP3 encoder not available — export as WAV instead');
  }
  const lame = window.lamejs;
  const nCh = channels.length === 1 ? 1 : 2;
  const encoder = new lame.Mp3Encoder(nCh, sampleRate, kbps);
  const block = 1152;
  const L = channels[0];
  const R = channels[1] || channels[0];
  const out = [];
  const l16 = new Int16Array(block), r16 = new Int16Array(block);
  const toInt = v => { v = Math.max(-1, Math.min(1, v)); return v < 0 ? v * 0x8000 : v * 0x7fff; };
  for (let i = 0; i < L.length; i += block) {
    const n = Math.min(block, L.length - i);
    for (let j = 0; j < n; j++) { l16[j] = toInt(L[i + j]); r16[j] = toInt(R[i + j]); }
    const buf = nCh === 1
      ? encoder.encodeBuffer(l16.subarray(0, n))
      : encoder.encodeBuffer(l16.subarray(0, n), r16.subarray(0, n));
    if (buf.length) out.push(new Uint8Array(buf));
  }
  const end = encoder.flush();
  if (end.length) out.push(new Uint8Array(end));
  return new Blob(out, { type: 'audio/mpeg' });
}
