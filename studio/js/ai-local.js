/* ═══════════════════════════════════════════════════════════════
   PRISM — local HTDemucs-FT server client
   Talks to tools/htdemucs_ft_server.py on 127.0.0.1:8392 (nothing
   leaves the machine). Binary bundle "PRISMF1" carries 4 stem WAVs.
   ═══════════════════════════════════════════════════════════════ */

const LOCAL_URL = 'http://127.0.0.1:8392';   // htdemucs-based server
const MDXNET_URL = 'http://127.0.0.1:8400';  // MDX-Net server

export async function probeLocalServer(timeoutMs = 1600, url = LOCAL_URL) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(url + '/api/health', { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const j = await r.json();
    return j && (j.status === 'ok' || j.status === 'loading') ? j : null;
  } catch (e) {
    return null;
  }
}

export async function probeAllLocalServers(timeoutMs = 1600) {
  const [htdem, mdxnet] = await Promise.all([
    probeLocalServer(timeoutMs, LOCAL_URL),
    probeLocalServer(timeoutMs, MDXNET_URL),
  ]);
  return { htdem, mdxnet };
}

/** Parse a 16-bit PCM RIFF/WAVE buffer directly — avoids AudioContext's implicit resample. */
export function pcmWavToFloat(u8) {
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (u8.length < 44 || String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== 'RIFF') {
    throw new Error('not a RIFF file');
  }
  let off = 12;                                  // skip "RIFF<size>WAVE"
  let fmt = null, data = null;
  while (off + 8 <= u8.length) {
    const id = String.fromCharCode(u8[off], u8[off+1], u8[off+2], u8[off+3]);
    const size = v.getUint32(off + 4, true);
    const body = off + 8;
    if (id === 'fmt ') fmt = { offset: body, size };
    else if (id === 'data') data = { offset: body, size };
    off = body + size + (size & 1);               // chunks aligned to even bytes
  }
  if (!fmt || !data) throw new Error('missing fmt or data chunk');
  const channels = v.getUint16(fmt.offset + 2, true);
  const sampleRate = v.getUint32(fmt.offset + 4, true);
  const bitsPerSample = v.getUint16(fmt.offset + 14, true);
  if (bitsPerSample !== 16) throw new Error(`unsupported bit depth: ${bitsPerSample}`);
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const frames = Math.floor(data.size / blockAlign);
  const left = new Float32Array(frames);
  const right = channels > 1 ? new Float32Array(frames) : null;
  const src = new Int16Array(u8.buffer, u8.byteOffset + data.offset, frames * channels);
  for (let i = 0; i < frames; i++) {
    const base = i * channels;
    left[i] = src[base] / 32768;
    if (right) right[i] = src[base + 1] / 32768;
  }
  return { left, right: right ? right : left.slice(), sampleRate, channels };
}

/** Encode an AudioBuffer into a 16-bit PCM WAV Uint8Array. */
export function audioBufferToWav16(ab) {
  const numCh = ab.numberOfChannels;
  const len = ab.length;
  const blockAlign = numCh * 2;
  const dataSize = len * blockAlign;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const wstr = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  wstr(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); wstr(8, 'WAVE');
  wstr(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, numCh, true); v.setUint32(24, ab.sampleRate, true);
  v.setUint32(28, ab.sampleRate * blockAlign, true); v.setUint16(32, blockAlign, true);
  v.setUint16(34, 16, true); wstr(36, 'data'); v.setUint32(40, dataSize, true);
  const chans = [];
  for (let c = 0; c < numCh; c++) chans.push(ab.getChannelData(c));
  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = Math.max(-1, Math.min(1, chans[c][i]));
      v.setInt16(off, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true); off += 2;
    }
  }
  return new Uint8Array(buf);
}

function parseBundle(u8) {
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const magic = String.fromCharCode(...u8.slice(0, 8));
  if (!magic.startsWith('PRISMF1')) throw new Error('malformed bundle from local server');
  let off = 8;
  const metaLen = view.getUint32(off, true); off += 4;
  const meta = JSON.parse(new TextDecoder().decode(u8.subarray(off, off + metaLen))); off += metaLen;
  const stems = {};
  for (let i = 0; i < meta.stems.length; i++) {
    const nameLen = view.getUint32(off, true); off += 4;
    const name = new TextDecoder().decode(u8.subarray(off, off + nameLen)); off += nameLen;
    const byteLen = Number(view.getBigUint64(off, true)); off += 8;
    stems[name] = u8.slice(off, off + byteLen); off += byteLen;
  }
  return { meta, stems };
}

/** POST the WAV to the right local server for the requested model. */
export async function separateWithLocalServer(wavBytes, model = 'htdemucs_ft', refine = 'hpss') {
  let url;
  if (model === 'mdxnet_voc_ft' || model === 'mdxnet_main') {
    url = `${MDXNET_URL}/api/separate?model=${encodeURIComponent(model)}`;
  } else {
    url = `${LOCAL_URL}/api/separate?model=${encodeURIComponent(model)}&refine=${encodeURIComponent(refine)}`;
  }
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'audio/wav' },
    body: wavBytes
  });
  if (!r.ok) {
    let detail = '';
    try { detail = (await r.json()).error || ''; } catch (e) { /* ignore */ }
    throw new Error(`local server HTTP ${r.status}${detail ? ' — ' + detail : ''}`);
  }
  const buf = new Uint8Array(await r.arrayBuffer());
  return parseBundle(buf);
}
