/* ═══════════════════════════════════════════════════════════════
   PRISM Spectral Decomposition Engine
   -----------------------------------------------------------------
   A single-pass / dual-pass time–frequency source separation system:

     • short-time FFT analysis (sqrt-Hann, 75 % overlap, OLA exact)
     • stereo mid/side field  → centre-activity detection
     • online harmonic–percussive decomposition (running medians)
     • band-limited + sustain envelopes for low-end isolation
     • evidence-based soft masks with sharpening, temporal smoothing,
       spectral smoothing, joint bleed-flooring  (Σ masks ≡ 1 ⇒ the
       four stems sum back to the original mix, phase-perfect)
     • optional second EM-style pass with per-frame source activity
       ("Deep" mode)

   Runs inside a worker, fully async-chunked (progress + cancel).
   ═══════════════════════════════════════════════════════════════ */

import { FFT, sqrtHann } from './fft.js?v=11';
import { qselect, decimate } from './dsp.js?v=11';

export const STEM_NAMES = ['vocals', 'drums', 'bass', 'other'];

export const SEPARATION_MODES = {
  fast:   { medianTaps: 7,  freqTaps: 9,  ema: 0.72, freqSmooth: 0, passes: 1, label: 'Fast' },
  studio: { medianTaps: 15, freqTaps: 13, ema: 0.55, freqSmooth: 1, passes: 1, label: 'Studio' },
  deep:   { medianTaps: 15, freqTaps: 17, ema: 0.45, freqSmooth: 1, passes: 2, label: 'Deep' }
};

export const DEFAULT_PARAMS = {
  mode: 'studio',
  fft: 2048,            // 1024 | 2048 | 4096
  centerFocus: 0.65,    // 0..1
  harmonicWeight: 0.8,  // 0..2
  transientWeight: 0.8, // 0..2
  sharpness: 1.8,       // 1..4
  deBleed: 0.35,        // 0..1
  res: 1                // 0 full · 1 = 32 kHz · 2 = 22.05 kHz
};

export function estimateMemory(seconds, params) {
  const sr = params.res === 2 ? 22050 : params.res === 1 ? 32000 : 48000;
  const len = seconds * sr;
  const bytes = len * 4 /*f32*/ * (2 /*mix in*/ + 4 /*stems*/ + 2 /*OLA*/);
  return bytes;
}

/* ── main entry ─────────────────────────────────── */
export async function separate({ left, right, sampleRate, params = {}, onProgress, shouldCancel }) {
  const P = { ...DEFAULT_PARAMS, ...params };
  const t0 = performance.now();
  const mode = SEPARATION_MODES[P.mode] || SEPARATION_MODES.studio;
  let note = '';

  if (!right) right = left;

  /* resolution budgeting — keep the phone happy */
  const seconds = left.length / sampleRate;
  const BUDGET = 640 * 1024 * 1024;
  let res = P.res;
  if (res === 0 && estimateMemory(seconds, P) > BUDGET) { res = 1; note = 'Full-resolution exceeded device budget → used 32 kHz analysis.'; }
  if (res === 1 && estimateMemory(seconds, { res: 1 }) > BUDGET) { res = 2; note = '32 kHz exceeded device budget → used 22 kHz analysis.'; }

  let sr = sampleRate, L = left, R = right;
  if (res === 1 && sr > 32001) { const k = Math.round(sr / 32000) || 1; if (k > 1) { L = decimate(left, k); R = decimate(right, k); sr = sr / k; } }
  else if (res === 2 && sr > 22051) { const k = Math.round(sr / 22050) || 1; if (k > 1) { L = decimate(left, k); R = decimate(right, k); sr = sr / k; } }
  const len = L.length;

  const N = P.fft | 0, H = N >> 2, bins = (N >> 1) + 1;
  const fft = new FFT(N);
  const win = sqrtHann(N);
  const numFrames = Math.ceil((len + N / 2) / H) + 1;

  /* working buffers */
  const reL = new Float32Array(N), imL = new Float32Array(N);
  const reR = new Float32Array(N), imR = new Float32Array(N);
  const reT = new Float32Array(N), iT = new Float32Array(N);

  const mRow = new Float32Array(bins);                 // current magnitude row
  const W = mode.medianTaps;
  const ring = new Float32Array(W * bins);
  let ringPos = 0, seen = 0;
  const scratch = new Float32Array(Math.max(W, mode.freqTaps));

  const K = mode.freqTaps >> 1;
  const cEm = new Float32Array(bins);                   // smoothed centre ratio
  const sus = new Float32Array(bins);                   // sustained envelope
  const low = new Float32Array(bins);                   // low-band weight
  const voc = new Float32Array(bins);                   // vocal-likelihood band shape
  const str = new Float32Array(bins);                   // spectral structure (tonalness) per frame
  for (let b = 0; b < bins; b++) {
    const f = Math.max(10, (b * sr) / N);
    low[b] = 1 / (1 + Math.pow(f / 170, 2.4));
    const x = Math.log2(f / 700) / (f < 700 ? 1.9 : 2.8);
    voc[b] = 1 / (1 + Math.pow(x, 4));
    cEm[b] = 0; sus[b] = 0.001;
  }

  const g = [new Float32Array(bins), new Float32Array(bins), new Float32Array(bins), new Float32Array(bins)];
  const gP = [new Float32Array(bins), new Float32Array(bins), new Float32Array(bins), new Float32Array(bins)];

  /* output OLA buffers (f32) */
  const stems = {};
  for (const s of STEM_NAMES) stems[s] = { L: new Float32Array(len), R: new Float32Array(len) };
  const denom = new Float32Array(len);

  /* deep mode: per-frame source activity (pass 1 → pass 2) */
  const wantActivity = mode.passes > 1;
  const act = wantActivity ? new Float32Array(numFrames * 4) : null;
  const actSmooth = new Float32Array(numFrames * 4);

  const wC = 0.35 + 0.95 * P.centerFocus;
  const p = Math.max(1, P.sharpness);
  const aE = mode.ema;
  const bleed = P.deBleed;
  const fSm = mode.freqSmooth;

  const yieldFn = () => new Promise(r => setTimeout(r, 0));

  for (let pass = 0; pass < mode.passes; pass++) {
    /* reset per-pass state (masks keep causal smoothing only within a pass) */
    for (let i = 0; i < 4; i++) gP[i].fill(0);
    cEm.fill(0); sus.fill(0.001);
    ring.fill(0); seen = 0; ringPos = 0;
    const denomLocal = pass === 0 ? denom : null;

    for (let f = 0; f < numFrames; f++) {
      if (f % 48 === 0) {
        if (shouldCancel && shouldCancel()) throw new Error('CANCELLED');
        if (onProgress) {
          const base = pass === 0 ? 0 : 55;
          onProgress(base + (pass === 0 ? 55 : 45) * (f / numFrames),
            pass === 0 ? `frame ${f}/${numFrames} · ${mode.label}` : `refining pass 2 · ${f}/${numFrames}`);
        }
        await yieldFn();
      }

      const s0 = f * H - (N >> 1);
      /* ── analysis ── */
      for (let i = 0; i < N; i++) {
        const idx = s0 + i;
        const v = idx >= 0 && idx < len ? L[idx] : 0;
        reL[i] = v * win[i]; imL[i] = 0;
        const v2 = idx >= 0 && idx < len ? R[idx] : 0;
        reR[i] = v2 * win[i]; imR[i] = 0;
      }
      fft.forward(reL, imL);
      fft.forward(reR, imR);

      if (denomLocal) for (let i = 0; i < N; i++) { const idx = s0 + i; if (idx >= 0 && idx < len) denomLocal[idx] += win[i] * win[i]; }

      /* ── mid/side + magnitudes ── */
      const rowBase = ringPos * bins;
      for (let b = 0; b < bins; b++) {
        const mRe = 0.5 * (reL[b] + reR[b]), mIm = 0.5 * (imL[b] + imR[b]);
        const sRe = 0.5 * (reL[b] - reR[b]), sIm = 0.5 * (imL[b] - imR[b]);
        const mL2 = mRe * mRe + mIm * mIm;
        const sL2 = sRe * sRe + sIm * sIm;
        const pow = mL2 + sL2;
        const mag = Math.sqrt(pow);
        ring[rowBase + b] = mag;
        mRow[b] = mag;
        /* centre ratio remapped to 0 (fully panned/decorrelated) … 1 (mono centre) */
        const ctr = Math.min(1, Math.max(0, 2 * (mL2 / (mL2 + sL2 + 1e-12)) - 1));
        cEm[b] += (ctr - cEm[b]) * 0.35;
        const tgt = mag + 1e-6;
        sus[b] += (tgt - sus[b]) * 0.1;
      }
      const avail = Math.min(W, seen + 1);

      /* ── harmonic (median over time) / percussive (median over freq) ── */
      const hpA = hpBuf(bins), ppA = ppBuf(bins);
      for (let b = 0; b < bins; b++) {
        let n = 0;
        for (let r = 0; r < avail; r++) {
          const row = ((ringPos - r + W) % W) * bins;
          scratch[n++] = ring[row + b];
        }
        hpA[b] = qselect(scratch.subarray(0, n), n >> 1);          // temporal median (amplitude)
      }
      for (let b = 0; b < bins; b++) {
        let n = 0, mx = 0, sum = 0;
        const lo = Math.max(0, b - K), hi = Math.min(bins - 1, b + K);
        for (let i = lo; i <= hi; i++) { const v = mRow[i]; scratch[n++] = v; sum += v; if (v > mx) mx = v; }
        ppA[b] = qselect(scratch.subarray(0, n), n >> 1);           // frequency median (amplitude)
        /* tonal structure: how dominant the peak is inside the window (1 = pure tone, ~1/n = flat) */
        const pk = mx / (sum + 1e-12);
        const nominal = 1 / Math.max(2, n);
        str[b] = Math.min(1, Math.max(0, (pk - nominal) / (0.42 - nominal)));
      }
      ringPos = (ringPos + 1) % W; seen++;

      /* ── evidence (all terms scale-free ∈ [0,1] ⇒ comparable across bins) ── */
      const cScale = wC, hW = P.harmonicWeight, tW = P.transientWeight;
      let actSum0 = 0, actSum1 = 0, actSum2 = 0, actSum3 = 0, powSum = 0;

      // pass-2 activity modulation
      let mod = null;
      if (pass === 1) mod = activityMod(actSmooth, f, numFrames);

      for (let b = 0; b < bins; b++) {
        const m2 = mRow[b] * mRow[b];
        const A = mRow[b] + 1e-9;
        const rH = Math.min(1.2, hpA[b] / A);        // sustained in time
        const rP = Math.min(1.2, ppA[b] / A);        // broadband / flat in frequency
        const rS = Math.min(1, sus[b] / A);          // long-term envelope vs instant
        const tR = 1 - rS;                           // transient-ness
        const st = str[b];
        const ctr = cEm[b];                          // centre activity 0..1
        const lo = low[b], vo = voc[b];

        /* vocals — harmonic, centred, sustained, mid-band, tonal */
        let e0 = Math.pow(Math.min(1, rH), hW) * Math.pow(ctr, cScale)
          * Math.pow(rS, 0.6) * (1 - 0.85 * lo) * (0.22 + 0.78 * vo) * (0.35 + 0.65 * st) + 1e-6;
        /* drums — broadband / transient; keeps side-panned percussion (hats) too */
        let e1 = Math.pow(Math.min(1, rP), tW)
          * (0.3 + 0.7 * ctr + 0.9 * (1 - ctr) * Math.min(1, rP))
          * (0.45 + 0.55 * tR) * (1 - 0.45 * st) + 0.01 * rP + 1e-6;
        /* bass — low, sustained, centred, non-percussive */
        let e2 = Math.pow(lo, 1.8) * Math.pow(rS, 0.7) * (0.3 + 0.7 * ctr)
          * (1 - 0.55 * Math.min(1, rP)) * (0.4 + 0.6 * st) + 1e-6;
        /* other — everything panned / decorrelated (guitars, keys, ambience) */
        let e3 = rH * Math.pow(1 - ctr, 1.05)
          + 0.95 * rP * Math.pow(1 - ctr, 1.25)
          + 0.025 * rP + 1e-6;

        if (mod) { e0 *= mod[0]; e1 *= mod[1]; e2 *= mod[2]; e3 *= mod[3]; }

        const mx = Math.max(e0, e1, e2, e3) + 1e-30;
        e0 /= mx; e1 /= mx; e2 /= mx; e3 /= mx;
        const q0 = Math.pow(e0, p), q1 = Math.pow(e1, p), q2 = Math.pow(e2, p), q3 = Math.pow(e3, p);
        const tot = q0 + q1 + q2 + q3 + 1e-30;
        let v0 = q0 / tot, v1 = q1 / tot, v2 = q2 / tot, v3 = q3 / tot;

        /* temporal smoothing (linear ⇒ sum preserved) */
        v0 = aE * v0 + (1 - aE) * gP[0][b];
        v1 = aE * v1 + (1 - aE) * gP[1][b];
        v2 = aE * v2 + (1 - aE) * gP[2][b];
        v3 = aE * v3 + (1 - aE) * gP[3][b];

        g[0][b] = v0; g[1][b] = v1; g[2][b] = v2; g[3][b] = v3;
        gP[0][b] = v0; gP[1][b] = v1; gP[2][b] = v2; gP[3][b] = v3;

        actSum0 += v0 * m2; actSum1 += v1 * m2; actSum2 += v2 * m2; actSum3 += v3 * m2; powSum += m2;
      }

      if (pass === 1 && powSum > 0) {
        act[f * 4] = actSum0 / powSum; act[f * 4 + 1] = actSum1 / powSum;
        act[f * 4 + 2] = actSum2 / powSum; act[f * 4 + 3] = actSum3 / powSum;
      } else if (pass === 0 && wantActivity && powSum > 0) {
        act[f * 4] = actSum0 / powSum; act[f * 4 + 1] = actSum1 / powSum;
        act[f * 4 + 2] = actSum2 / powSum; act[f * 4 + 3] = actSum3 / powSum;
      }

      /* spectral smoothing across frequency (preserves Σ=1) */
      if (fSm) for (let i = 0; i < 4; i++) {
        const gi = g[i];
        let prev = gi[0];
        for (let b = 1; b < bins - 1; b++) {
          const v = 0.25 * prev + 0.5 * gi[b] + 0.25 * gi[b + 1];
          prev = gi[b]; gi[b] = v;
        }
      }

      /* joint bleed floor + renormalise (still Σ=1) */
      if (bleed > 0) {
        const d = bleed * 0.45;
        for (let b = 0; b < bins; b++) {
          let acc = 0;
          for (let i = 0; i < 4; i++) {
            let v = g[i][b] - d * (1 - g[i][b]);
            if (v < 0) v = 0;
            g[i][b] = v; acc += v;
          }
          if (acc > 1e-12) { const inv = 1 / acc; for (let i = 0; i < 4; i++) g[i][b] *= inv; }
          else { for (let i = 0; i < 4; i++) g[i][b] = 0.25; }
        }
      }

      /* only synthesise on the last pass */
      if (pass === mode.passes - 1) {
        const half = N >> 1;
        for (let i = 0; i < 4; i++) {
          const gi = g[i], st = stems[STEM_NAMES[i]];
          for (let b = 0; b < bins; b++) {
            reT[b] = reL[b] * gi[b]; iT[b] = imL[b] * gi[b];
          }
          for (let b = 1; b < half; b++) { reT[N - b] = reT[b]; iT[N - b] = -iT[b]; }
          fft.inverse(reT, iT);
          for (let k = 0; k < N; k++) { const idx = s0 + k; if (idx >= 0 && idx < len) st.L[idx] += reT[k] * win[k]; }

          for (let b = 0; b < bins; b++) {
            reT[b] = reR[b] * gi[b]; iT[b] = imR[b] * gi[b];
          }
          for (let b = 1; b < half; b++) { reT[N - b] = reT[b]; iT[N - b] = -iT[b]; }
          fft.inverse(reT, iT);
          for (let k = 0; k < N; k++) { const idx = s0 + k; if (idx >= 0 && idx < len) st.R[idx] += reT[k] * win[k]; }
        }
      }
    }

    if (pass === 0 && wantActivity) {
      /* build normalised temporal activity for pass 2 */
      const mean = [0, 0, 0, 0];
      for (let f = 0; f < numFrames; f++) for (let i = 0; i < 4; i++) mean[i] += act[f * 4 + i];
      for (let i = 0; i < 4; i++) mean[i] = Math.max(1e-4, mean[i] / numFrames);
      for (let f = 0; f < numFrames; f++) {
        for (let i = 0; i < 4; i++) {
          let acc = 0, n = 0;
          for (let d = -2; d <= 2; d++) {
            const ff = f + d;
            if (ff >= 0 && ff < numFrames) { acc += act[ff * 4 + i]; n++; }
          }
          const avg = acc / Math.max(1, n);
          let r = avg / mean[i];
          r = Math.min(2.2, Math.max(0.12, r));
          actSmooth[f * 4 + i] = 0.28 + 0.72 * r;
        }
      }
    }
  }

  /* ── normalise OLA + convert to Int16 ── */
  onProgress && onProgress(97, 'normalising overlap-add…');
  await yieldFn();
  const out = { sampleRate: sr, stems: {}, time: (performance.now() - t0) / 1000, note };
  for (const name of STEM_NAMES) {
    const st = stems[name];
    const l16 = new Int16Array(len), r16 = new Int16Array(len);
    for (let i = 0; i < len; i++) {
      const d = denom[i] > 1e-6 ? 1 / denom[i] : 0;
      let a = st.L[i] * d, b = st.R[i] * d;
      a = a < -1 ? -1 : a > 1 ? 1 : a;
      b = b < -1 ? -1 : b > 1 ? 1 : b;
      l16[i] = a < 0 ? a * 0x8000 : a * 0x7fff;
      r16[i] = b < 0 ? b * 0x8000 : b * 0x7fff;
      st.L[i] = 0; st.R[i] = 0; // free as we go
    }
    out.stems[name] = { left: l16, right: r16 };
    onProgress && onProgress(97 + 0.7 * (STEM_NAMES.indexOf(name) + 1), `packing ${name}…`);
    await yieldFn();
  }
  onProgress && onProgress(100, 'done');
  return out;
}

/* small per-frame scratch pools (avoid realloc) */
const _hp = new Map(), _pp = new Map();
function hpBuf(n) { let a = _hp.get(n); if (!a) { a = new Float32Array(n); _hp.set(n, a); } return a; }
function ppBuf(n) { let a = _pp.get(n); if (!a) { a = new Float32Array(n); _pp.set(n, a); } return a; }

function activityMod(act, f, numFrames) {
  const m = _modBuf || (_modBuf = new Float32Array(4));
  for (let i = 0; i < 4; i++) m[i] = act[Math.min(numFrames - 1, f) * 4 + i];
  return m;
}
let _modBuf = null;
