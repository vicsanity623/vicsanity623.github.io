/* PRISM — shared DSP: statistics, biquads, resampling, analysis, colormaps */

/* ── selection (median) ─────────────────────────── */
export function qselect(a, k) {
  let l = 0, r = a.length - 1;
  for (;;) {
    if (l >= r) return a[l];
    const pivot = a[(l + r) >> 1];
    let i = l, j = r;
    while (i <= j) {
      while (a[i] < pivot) i++;
      while (a[j] > pivot) j--;
      if (i <= j) { const t = a[i]; a[i] = a[j]; a[j] = t; i++; j--; }
    }
    if (k <= j) r = j;
    else if (k >= i) l = i;
    else return pivot;
  }
}
export function medianInPlace(scratch, k) { return qselect(scratch, k); }

/* ── biquad design (RBJ cookbook) ───────────────── */
export function designBiquad(type, f0, sr, Q = Math.SQRT1_2, gainDb = 0) {
  f0 = Math.min(Math.max(f0, 10), sr / 2 - 100);
  const w0 = (2 * Math.PI * f0) / sr, cw = Math.cos(w0), sw = Math.sin(w0);
  const alpha = sw / (2 * Q);
  const A = Math.pow(10, gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case 'lowpass': b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'highpass': b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'bandpass': b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'notch': b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'peaking': b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A; break;
    case 'lowshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) - (A - 1) * cw + s); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - s);
      a0 = (A + 1) + (A - 1) * cw + s; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - s; break;
    }
    case 'highshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) + (A - 1) * cw + s); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - s);
      a0 = (A + 1) - (A - 1) * cw + s; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - s; break;
    }
    default: b0 = 1; b1 = 0; b2 = 0; a0 = 1; a1 = 0; a2 = 0;
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

export class Biquad {
  constructor(co) { this.set(co); this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0; }
  set(co) { this.b0 = co.b0; this.b1 = co.b1; this.b2 = co.b2; this.a1 = co.a1; this.a2 = co.a2; }
  reset() { this.x1 = this.x2 = this.y1 = this.y2 = 0; }
  p(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
  process(buf, stride = 1) { for (let i = 0; i < buf.length; i += stride) buf[i] = this.p(buf[i]); }
}

/* Linkwitz–Riley 4th order band: 2× Butterworth lowpass + 2× Butterworth highpass */
export function lr4Band(sr, f1, f2) {
  const hp1 = new Biquad(designBiquad('highpass', f1, sr, Math.SQRT1_2));
  const hp2 = new Biquad(designBiquad('highpass', f1, sr, Math.SQRT1_2));
  const lp1 = new Biquad(designBiquad('lowpass', f2, sr, Math.SQRT1_2));
  const lp2 = new Biquad(designBiquad('lowpass', f2, sr, Math.SQRT1_2));
  return {
    process(buf) { hp1.process(buf); hp2.process(buf); lp1.process(buf); lp2.process(buf); return buf; },
    reset() { hp1.reset(); hp2.reset(); lp1.reset(); lp2.reset(); }
  };
}

/* ── resampling ─────────────────────────────────── */
export function resampleLinear(input, ratio /* outRate/inRate */) {
  const outLen = Math.max(1, Math.floor(input.length * ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i / ratio, i0 = Math.floor(pos), f = pos - i0;
    const a = input[Math.min(i0, input.length - 1)], b = input[Math.min(i0 + 1, input.length - 1)];
    out[i] = a + (b - a) * f;
  }
  return out;
}

/* windowed-sinc anti-aliased decimation (k = inRate/outRate) */
export function decimate(input, k) {
  if (k <= 1.001) return input.slice();
  const taps = Math.min(127, Math.round(16 * k) | 1);
  const half = Math.floor(taps / 2);
  const cutoff = 0.45 / k;
  const h = new Float32Array(taps);
  let sum = 0;
  for (let i = 0; i < taps; i++) {
    const m = i - half;
    const sinc = m === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * m) / (Math.PI * m);
    const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (taps - 1));
    h[i] = sinc * win; sum += h[i];
  }
  for (let i = 0; i < taps; i++) h[i] /= sum;
  const outLen = Math.floor(input.length / k);
  const out = new Float32Array(outLen);
  for (let o = 0; o < outLen; o++) {
    const c = Math.round(o * k);
    let acc = 0;
    for (let t = 0; t < taps; t++) {
      const idx = c + t - half;
      acc += h[t] * (idx >= 0 && idx < input.length ? input[idx] : 0);
    }
    out[o] = acc;
  }
  return out;
}

/* ── waveform peak pyramid ──────────────────────── */
export function peaksPyramid(left, right, targetMin = 4096) {
  const n = left.length;
  let cols = Math.max(targetMin, Math.ceil(n / 64));
  const levels = [];
  let cur = buildLevel(left, right, cols);
  levels.push(cur);
  while (cur.cols > targetMin) {
    cols = Math.max(targetMin, Math.floor(cur.cols / 4));
    cur = downLevel(cur);
    levels.push(cur);
  }
  return levels;
}
function buildLevel(L, R, cols) {
  const n = L.length;
  const min = new Float32Array(cols), max = new Float32Array(cols);
  const per = n / cols;
  for (let c = 0; c < cols; c++) {
    const s = Math.floor(c * per), e = Math.min(n, Math.max(s + 1, Math.floor((c + 1) * per)));
    let mn = 1e9, mx = -1e9;
    const step = Math.max(1, Math.floor((e - s) / 512));
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
export function samplePeaks(levels, t0Px, t1Px, outW) {
  // choose a level with cols >= outW and map pixels → peaks
  let lv = levels[levels.length - 1];
  for (const l of levels) if (l.cols >= outW) { lv = l; break; }
  const min = new Float32Array(outW), max = new Float32Array(outW);
  const span = t1Px - t0Px;
  for (let x = 0; x < outW; x++) {
    const a = Math.floor(((x) / outW) * span), b = Math.floor(((x + 1) / outW) * span);
    const ia = Math.max(0, Math.min(lv.cols - 1, a)), ib = Math.max(ia + 1, Math.min(lv.cols, Math.max(b, ia + 1)));
    let mn = 1e9, mx = -1e9;
    for (let i = ia; i < ib; i++) { if (lv.min[i] < mn) mn = lv.min[i]; if (lv.max[i] > mx) mx = lv.max[i]; }
    min[x] = mn === 1e9 ? 0 : mn; max[x] = mx === -1e9 ? 0 : mx;
  }
  return { min, max };
}

/* ── loudness / analysis ────────────────────────── */
function kWeighting(sr) {
  // BS.1770 pre-filter + RLB high pass, designed per sample rate
  const f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  const K = Math.tan(Math.PI * f0 / sr), Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
  const a0 = 1 + K / Q + K * K;
  const pre = {
    b0: (Vh + Vb * K / Q + K * K) / a0, b1: (2 * (K * K - Vh)) / a0, b2: (Vh - Vb * K / Q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0
  };
  const f2 = 38.13547087602444, Q2 = 0.5003270373238773;
  const K2 = Math.tan(Math.PI * f2 / sr), a02 = 1 + K2 / Q2 + K2 * K2;
  const rlb = { b0: 1, b1: -2, b2: 1, a1: (2 * (K2 * K2 - 1)) / a02, a2: (1 - K2 / Q2 + K2 * K2) / a02 };
  return { pre, rlb };
}
export function integratedLoudness(L, R, sr) {
  const { pre, rlb } = kWeighting(sr);
  const f1 = new Biquad(pre), f2 = new Biquad(rlb);
  let sum = 0, n = 0;
  const blk = Math.round(sr * 0.4), hop = Math.round(sr * 0.1);
  const blocks = [];
  for (let s = 0; s + blk <= L.length; s += hop) {
    let acc = 0;
    for (let i = s; i < s + blk; i++) {
      const a = f1.p(L[i]); const b = f1.p(R[i]);
      acc += f2.p(a) * f2.p(a) + f2.p(b) * f2.p(b);
    }
    const ms = acc / blk;
    if (ms > 0) blocks.push(-0.691 + 10 * Math.log10(ms));
    n++;
  }
  if (!blocks.length) return -Infinity;
  // absolute gate -70, then relative gate -10
  const abs = blocks.filter(b => b > -70);
  if (!abs.length) return -Infinity;
  const mean = abs.reduce((a, b) => a + b, 0) / abs.length;
  const rel = abs.filter(b => b > mean - 10);
  const m2 = rel.length ? rel : abs;
  const mean2 = m2.reduce((a, b) => a + b, 0) / m2.length;
  return mean2;
}
export function peakOf(L, R) {
  let p = 0;
  const n = L.length;
  for (let i = 0; i < n; i++) { const a = Math.abs(L[i]), b = R ? Math.abs(R[i]) : 0; const m = a > b ? a : b; if (m > p) p = m; }
  return p;
}
export function rmsOf(L, R) {
  let s = 0; const n = L.length;
  for (let i = 0; i < n; i++) { const a = L[i], b = R ? R[i] : 0; s += a * a + b * b; }
  return Math.sqrt(s / (n * (R ? 2 : 1)));
}
export function correlation(L, R) {
  if (!R) return 1;
  let sxy = 0, sxx = 0, syy = 0;
  const n = L.length, step = Math.max(1, Math.floor(n / 400000));
  let cnt = 0;
  for (let i = 0; i < n; i += step) {
    const a = L[i], b = R[i];
    sxy += a * b; sxx += a * a; syy += b * b; cnt++;
  }
  const d = Math.sqrt(sxx * syy);
  return d > 1e-12 ? sxy / d : 0;
}
/* octave-ish band energies (Hz ranges) */
export const BAND_RANGES = [
  ['Sub', 20, 60], ['Bass', 60, 160], ['Low-mid', 160, 400], ['Mid', 400, 1000],
  ['High-mid', 1000, 2500], ['Presence', 2500, 6000], ['Brilliance', 6000, 12000], ['Air', 12000, 20000]
];
export function bandEnergies(L, R, sr, ranges = BAND_RANGES) {
  const N = 4096, H = 2048;
  const bins = N / 2 + 1;
  const freqs = new Float32Array(bins);
  for (let i = 0; i < bins; i++) freqs[i] = (i * sr) / N;
  const acc = new Float64Array(ranges.length);
  const re = new Float32Array(N), im = new Float32Array(N), mag = new Float32Array(bins);
  const w = new Float32Array(N);
  for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  let frames = 0;
  const maxFrames = 300;
  for (let s = 0; s + N <= L.length && frames < maxFrames; s += H * 4) {
    for (let i = 0; i < N; i++) { re[i] = L[s + i] * w[i]; im[i] = 0; }
    fftInPlace(re, im);
    for (let i = 0; i < bins; i++) mag[i] = re[i] * re[i] + im[i] * im[i];
    if (R) {
      for (let i = 0; i < N; i++) { re[i] = R[s + i] * w[i]; im[i] = 0; }
      fftInPlace(re, im);
      for (let i = 0; i < bins; i++) mag[i] += re[i] * re[i] + im[i] * im[i];
    }
    for (let b = 0; b < ranges.length; b++) {
      const [ , f1, f2] = ranges[b];
      const i0 = Math.max(0, Math.ceil((f1 * N) / sr)), i1 = Math.min(bins - 1, Math.floor((f2 * N) / sr));
      let s2 = 0;
      for (let i = i0; i <= i1; i++) s2 += mag[i];
      acc[b] += s2;
    }
    frames++;
  }
  const tot = acc.reduce((a, b) => a + b, 0) || 1;
  return ranges.map((r, i) => ({ name: r[0], hz: `${r[1]}–${r[2]}`, db: 10 * Math.log10(Math.max(1e-12, acc[i] / tot)) }));
}

/* compact in-file FFT (self-contained copy of radix-2 for analysis paths) */
export function fftInPlace(re, im) {
  const n = re.length;
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cwr = 1, cwi = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cwr - im[i + k + len / 2] * cwi;
        const vi = re[i + k + len / 2] * cwi + im[i + k + len / 2] * cwr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const nwr = cwr * wr - cwi * wi; cwi = cwr * wi + cwi * wr; cwr = nwr;
      }
    }
  }
}

/* ── colormaps ──────────────────────────────────── */
const STOPS = {
  magma: [[0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99], [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 255, 164]],
  viridis: [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]],
  ice: [[3, 6, 20], [12, 40, 90], [24, 96, 160], [56, 160, 210], [140, 220, 245], [235, 250, 255]],
  mono: [[0, 0, 0], [255, 255, 255]]
};
const LUT_CACHE = {};
export function colormap(name) {
  if (LUT_CACHE[name]) return LUT_CACHE[name];
  const stops = STOPS[name] || STOPS.magma;
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * (stops.length - 1);
    const i0 = Math.min(stops.length - 1, Math.floor(t)), i1 = Math.min(stops.length - 1, i0 + 1);
    const f = t - i0;
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = Math.round(stops[i0][c] + (stops[i1][c] - stops[i0][c]) * f);
  }
  LUT_CACHE[name] = lut;
  return lut;
}

export function fmtDb(db) { return (db === -Infinity || db <= -150) ? '−∞' : (db >= 0 ? '+' : '') + db.toFixed(1); }
