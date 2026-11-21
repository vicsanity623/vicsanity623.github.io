/* PRISM — iterative radix-2 complex FFT (no dependencies, works in workers & node) */

export class FFT {
  constructor(n) {
    if (n & (n - 1)) throw new Error('FFT size must be a power of two, got ' + n);
    this.n = n;
    this.levels = Math.log2(n) | 0;
    this.cos = new Float32Array(n / 2);
    this.sin = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / n);
      this.sin[i] = Math.sin((2 * Math.PI * i) / n);
    }
    this.rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let r = 0, x = i;
      for (let j = 0; j < this.levels; j++) { r = (r << 1) | (x & 1); x >>= 1; }
      this.rev[i] = r;
    }
    this._re = null; this._im = null;
  }

  /* in-place forward transform */
  forward(re, im) {
    const n = this.n, rev = this.rev;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let start = 0; start < n; start += size) {
        for (let k = 0, j = start; k < half; k++, j++) {
          const tRe = this.cos[k * step] * re[j + half] + this.sin[k * step] * im[j + half];
          const tIm = this.cos[k * step] * im[j + half] - this.sin[k * step] * re[j + half];
          re[j + half] = re[j] - tRe; im[j + half] = im[j] - tIm;
          re[j] += tRe; im[j] += tIm;
        }
      }
    }
  }

  /* in-place inverse transform (includes 1/n scaling) */
  inverse(re, im) {
    const n = this.n;
    for (let i = 0; i < n; i++) im[i] = -im[i];
    this.forward(re, im);
    const s = 1 / n;
    for (let i = 0; i < n; i++) { re[i] *= s; im[i] = -im[i] * s; }
  }

  /* magnitude spectrum helper: bins = n/2+1 */
  static mag(re, im, out) {
    const half = (re.length >> 1);
    for (let i = 0; i <= half; i++) out[i] = Math.hypot(re[i], im[i]);
    return out;
  }
}

export function hann(N) {
  const w = new Float32Array(N);
  for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  return w;
}
export function sqrtHann(N) {
  const w = hann(N);
  for (let i = 0; i < N; i++) w[i] = Math.sqrt(w[i]);
  return w;
}
