/* PRISM — background worker: separation, spectrogram & peak pyramids */

import { separate } from './separation.js?v=11';
import { FFT, hann } from './fft.js?v=11';

let cancelFlag = false;

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case 'cancel': cancelFlag = true; return;
      case 'separate': return await runSeparate(msg);
      case 'spectro': return runSpectro(msg);
      case 'peaks': return runPeaks(msg);
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: err && err.message ? err.message : String(err) });
  }
};

async function runSeparate(msg) {
  cancelFlag = false;
  const out = await separate({
    left: msg.left, right: msg.right, sampleRate: msg.sampleRate, params: msg.params,
    onProgress: (p, s) => self.postMessage({ type: 'progress', id: msg.id, progress: p, stage: s }),
    shouldCancel: () => cancelFlag
  });
  const transfer = [];
  for (const k of Object.keys(out.stems)) { transfer.push(out.stems[k].left.buffer, out.stems[k].right.buffer); }
  self.postMessage({ type: 'separate-done', id: msg.id, result: out }, transfer);
}

/* ── spectrogram ────────────────────────────────── */
function runSpectro(msg) {
  const { left, right, sampleRate: sr, t0, t1, cols, rows, fftSize, logFreq, fMin, fMax, dbRange } = msg;
  const N = fftSize || 2048, H = N >> 1, bins = N >> 1;
  const fft = new FFT(N);
  const w = hann(N);
  const s0 = Math.max(0, Math.floor(t0 * sr));
  const s1 = Math.min(left.length, Math.ceil(t1 * sr));
  const frames = Math.max(1, s1 - s0);
  const data = new Float32Array(cols * rows).fill(-140);
  const re = new Float32Array(N), im = new Float32Array(N), mag = new Float32Array(bins + 1);

  const fLo = Math.max(20, fMin || 20), fHi = Math.min(sr / 2, fMax || sr / 2);

  for (let x = 0; x < cols; x++) {
    const a = s0 + Math.floor((x / cols) * frames);
    const b = s0 + Math.floor(((x + 1) / cols) * frames);
    const start = Math.max(s0, Math.min(b - 1, a - (N >> 1)));
    for (let i = 0; i < N; i++) {
      const idx = start + i;
      const v = idx >= 0 && idx < left.length ? left[idx] : 0;
      const v2 = right && idx >= 0 && idx < right.length ? right[idx] : v;
      re[i] = (v + v2) * 0.5 * w[i]; im[i] = 0;
    }
    fft.forward(re, im);
    for (let i = 0; i <= bins; i++) mag[i] = Math.hypot(re[i], im[i]) / (N * 0.25) + 1e-9;

    /* peak-pick columns into rows (y=0 at top = high frequency) */
    for (let y = 0; y < rows; y++) {
      let f1, f2;
      if (logFreq) {
        const r1 = y / rows, r2 = (y + 1) / rows;
        f1 = fLo * Math.pow(fHi / fLo, 1 - r2);
        f2 = fLo * Math.pow(fHi / fLo, 1 - r1);
      } else {
        f1 = fHi - ((y + 1) / rows) * (fHi - fLo);
        f2 = fHi - (y / rows) * (fHi - fLo);
      }
      const i0 = Math.max(1, Math.ceil((f1 * N) / sr));
      const i1 = Math.min(bins, Math.max(i0, Math.floor((f2 * N) / sr)));
      let peak = 0;
      for (let i = i0; i <= i1; i++) if (mag[i] > peak) peak = mag[i];
      const db = 20 * Math.log10(peak + 1e-9);
      data[y * cols + x] = db;
    }
    if ((x & 63) === 0 && msg.id != null) { /* cheap */ }
  }

  /* normalise into 0..1 by dbRange */
  const top = 0, bottom = -(dbRange || 78);
  const out8 = new Uint8Array(cols * rows);
  for (let i = 0; i < data.length; i++) {
    let v = (data[i] - bottom) / (top - bottom);
    v = v < 0 ? 0 : v > 1 ? 1 : v;
    out8[i] = (v * 255) | 0;
  }
  self.postMessage({ type: 'spectro-done', id: msg.id, data: out8, cols, rows }, [out8.buffer]);
}

/* ── waveform peak pyramid (mixed + per channel) ── */
function runPeaks(msg) {
  const { left, right, id } = msg;
  const n = left.length;

  const buildPyramid = (L, R) => {
    const levels = [];
    let cols = Math.max(2048, Math.ceil(n / 48));
    let lv = buildLevel(L, R, cols);
    levels.push({ cols: lv.cols, min: lv.min, max: lv.max });
    while (lv.cols > 2048) {
      lv = downLevel(lv);
      levels.push({ cols: lv.cols, min: lv.min, max: lv.max });
    }
    return levels;
  };

  const levels = buildPyramid(left, right);             // mixed envelope (mono peaks downmix)
  const levelsL = buildPyramid(left, null);              // left only
  const levelsR = right ? buildPyramid(right, null) : levelsL; // right only (=L for mono)

  const transfer = [];
  for (const l of levels) { transfer.push(l.min.buffer, l.max.buffer); }
  for (const l of levelsL) { transfer.push(l.min.buffer, l.max.buffer); }
  if (levelsR !== levelsL) for (const l of levelsR) { transfer.push(l.min.buffer, l.max.buffer); }
  self.postMessage({ type: 'peaks-done', id, levels, levelsL, levelsR }, transfer);
}

function buildLevel(L, R, cols) {
  const n = L.length;
  const min = new Float32Array(cols), max = new Float32Array(cols);
  const per = n / cols;
  for (let c = 0; c < cols; c++) {
    const s = Math.floor(c * per), e = Math.min(n, Math.max(s + 1, Math.floor((c + 1) * per)));
    let mn = 1e9, mx = -1e9;
    const step = Math.max(1, Math.floor((e - s) / 256));
    for (let i = s; i < e; i += step) {
      const v = (L[i] + (R ? R[i] : L[i])) * 0.5;
      if (v < mn) mn = v; if (v > mx) mx = v;
    }
    if (mn > mx) { mn = 0; mx = 0; }
    min[c] = mn; max[c] = mx;
  }
  return { cols, min, max };
}
function downLevel(lv) {
  const cols = Math.max(1, Math.floor(lv.cols / 4));
  const min = new Float32Array(cols), max = new Float32Array(cols);
  for (let c = 0; c < cols; c++) {
    let mn = 1e9, mx = -1e9;
    for (let j = c * 4; j < Math.min(lv.cols, c * 4 + 4); j++) {
      if (lv.min[j] < mn) mn = lv.min[j];
      if (lv.max[j] > mx) mx = lv.max[j];
    }
    min[c] = mn === 1e9 ? 0 : mn; max[c] = mx === -1e9 ? 0 : mx;
  }
  return { cols, min, max };
}
