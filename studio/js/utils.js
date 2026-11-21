/* PRISM — shared utilities */

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const TRACK_COLORS = ['#a78bfa', '#fb923c', '#34d399', '#38bdf8', '#f472b6', '#facc15', '#4ade80', '#e879f9', '#60a5fa', '#ff7a5c'];
export const STEM_COLORS = { vocals: '#a78bfa', drums: '#fb923c', bass: '#34d399', other: '#38bdf8', mid: '#f472b6', side: '#facc15', mix: '#8b93b8' };

export function fmtTime(t, ms = true) {
  if (!isFinite(t) || t < 0) t = 0;
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60);
  const f = Math.floor((t - Math.floor(t)) * 1000);
  const base = (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0');
  return ms ? base + '.' + String(f).padStart(3, '0') : base;
}

export function fmtBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
  return (b / 1073741824).toFixed(2) + ' GB';
}

export const dbToGain = db => Math.pow(10, db / 20);
export const gainToDb = g => (g <= 1e-7 ? -Infinity : 20 * Math.log10(g));

export function toast(msg, kind = '') {
  const host = $('#toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .3s, transform .3s'; el.style.opacity = '0'; el.style.transform = 'translateX(20px)'; }, 3200);
  setTimeout(() => el.remove(), 3600);
}

export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ── WAV encoder ─────────────────────────────────── */
export function encodeWav(channels, sampleRate, bitDepth = 16) {
  const numCh = channels.length;
  const len = channels[0].length;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = len * blockAlign;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const wstr = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  wstr(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); wstr(8, 'WAVE');
  wstr(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, numCh, true); v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * blockAlign, true); v.setUint16(32, blockAlign, true);
  v.setUint16(34, bitDepth, true); wstr(36, 'data'); v.setUint32(40, dataSize, true);
  let off = 44;
  if (bitDepth === 16) {
    for (let i = 0; i < len; i++)
      for (let c = 0; c < numCh; c++) {
        let s = clamp(channels[c][i], -1, 1);
        v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true); off += 2;
      }
  } else if (bitDepth === 24) {
    for (let i = 0; i < len; i++)
      for (let c = 0; c < numCh; c++) {
        let s = clamp(channels[c][i], -1, 1);
        let n = Math.round(s * 0x7fffff); if (n < 0) n += 0x1000000;
        v.setUint8(off, n & 255); v.setUint8(off + 1, (n >> 8) & 255); v.setUint8(off + 2, (n >> 16) & 255); off += 3;
      }
  } else { // 32-bit float
    v.setUint16(20, 3, true); // IEEE float
    for (let i = 0; i < len; i++)
      for (let c = 0; c < numCh; c++) { v.setFloat32(off, channels[c][i], true); off += 4; }
  }
  return new Blob([buf], { type: 'audio/wav' });
}

export function encodeWavFromInt16(left, right, sampleRate) {
  const numCh = right ? 2 : 1, len = left.length;
  const blockAlign = numCh * 2, dataSize = len * blockAlign;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const wstr = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  wstr(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); wstr(8, 'WAVE');
  wstr(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, numCh, true); v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * blockAlign, true); v.setUint16(32, blockAlign, true);
  v.setUint16(34, 16, true); wstr(36, 'data'); v.setUint32(40, dataSize, true);
  let off = 44;
  for (let i = 0; i < len; i++) {
    v.setInt16(off, left[i], true); off += 2;
    if (right) { v.setInt16(off, right[i], true); off += 2; }
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/* ── minimal ZIP writer (store, no compression) ──── */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function makeZip(files /* [{name, data:Uint8Array}] */) {
  const chunks = [], central = [];
  let offset = 0;
  const enc = new TextEncoder();
  for (const f of files) {
    const nameBytes = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    const lh = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(lh.buffer);
    dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0x0800, true);
    dv.setUint16(8, 0, true); dv.setUint16(10, 0, true); dv.setUint16(12, 0x21, true);
    dv.setUint32(14, crc, true); dv.setUint32(18, size, true); dv.setUint32(22, size, true);
    dv.setUint16(26, nameBytes.length, true); dv.setUint16(28, 0, true);
    lh.set(nameBytes, 30);
    chunks.push(lh, f.data);
    const ch = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true); cv.setUint16(12, 0, true); cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, size, true); cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true); cv.setUint32(42, offset, true);
    ch.set(nameBytes, 46);
    central.push(ch);
    offset += lh.length + size;
  }
  const centralSize = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, end], { type: 'application/zip' });
}

/* ── small event emitter ─────────────────────────── */
export class Emitter {
  constructor() { this._h = {}; }
  on(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); return () => this.off(ev, fn); }
  off(ev, fn) { const a = this._h[ev]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } }
  emit(ev, ...args) { (this._h[ev] || []).slice().forEach(fn => { try { fn(...args); } catch (e) { console.error(e); } }); }
}
