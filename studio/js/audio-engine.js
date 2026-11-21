/* ═══════════════════════════════════════════════════════════════
   PRISM audio engine — context, buffer registry, multitrack playback,
   effect graphs (shared live/offline), offline rendering & export.
   ═══════════════════════════════════════════════════════════════ */

import { Emitter, encodeWav, encodeWavFromInt16, clamp, uid, toast } from './utils.js?v=11';
import { designBiquad, Biquad } from './dsp.js?v=11';

export const engine = new Emitter();
engine.ctx = null;
engine.buffers = new Map();          // id → buffer meta
engine.trackGraphs = new Map();       // trackId → graph nodes (live ctx)
engine.master = null;
engine.playback = { playing: false, startCtx: 0, startPos: 0, sources: [] };
engine.limiterOn = true;
engine._floatCache = new Map();       // id → {left,right} Float32 (LRU for i16 stems)
let _worker = null;

/* ── AI (HTDemucs) worker ────────────────────────── */
let _aiWorker = null;
engine._aiPending = new Map();
let _aSeq = 1;
export function getAiWorker() {
  if (!_aiWorker) {
    _aiWorker = new Worker(new URL('./ai-worker.js?v=11', import.meta.url), { type: 'module' });
    _aiWorker.addEventListener('message', e => {
      const msg = e.data;
      const h = engine._aiPending.get(msg.id);
      if (!h) return;
      h(msg);
      if (['ai-probe', 'ai-load-done', 'ai-done', 'ai-unload-done', 'ai-error'].includes(msg.type)) {
        engine._aiPending.delete(msg.id);
      }
    });
    _aiWorker.addEventListener('error', e => {
      console.error('[ai-worker]', e.message);
      toast('AI worker failed: ' + e.message, 'err');
    });
  }
  return _aiWorker;
}
export function aiRequest(payload, onMsg, transfer) {
  const id = _aSeq++;
  engine._aiPending.set(id, onMsg);
  getAiWorker().postMessage({ ...payload, id }, transfer || []);
  return id;
}
export function aiProbe() {
  return new Promise(resolve => {
    aiRequest({ type: 'ai-probe' }, msg => {
      if (msg.type === 'ai-probe') resolve(msg); else resolve({ webgpu: false, wasm: true, error: msg.message });
    });
  });
}
export function aiLoad(modelId, buffer) {
  return new Promise((resolve, reject) => {
    aiRequest({ type: 'ai-load', modelId, buffer }, msg => {
      if (msg.type === 'ai-load-done') resolve(msg);
      else if (msg.type === 'ai-error') reject(new Error(msg.message || 'model load failed'));
    }, [buffer]);
  });
}
export function aiSeparate(left, right, sampleRate, onProgress) {
  return new Promise((resolve, reject) => {
    aiRequest({ type: 'ai-separate', left, right, sampleRate }, msg => {
      if (msg.type === 'ai-progress') onProgress && onProgress(msg.progress, msg.stage);
      else if (msg.type === 'ai-log') onProgress && onProgress(null, msg.message);
      else if (msg.type === 'ai-done') resolve(msg.result);
      else if (msg.type === 'ai-error') reject(new Error(msg.message || 'inference failed'));
    }, [left.buffer, right.buffer]);
  });
}
export function aiUnload() {
  return new Promise(resolve => aiRequest({ type: 'ai-unload' }, () => resolve()));
}

export function getWorker() {
  if (!_worker) {
    _worker = new Worker(new URL('./worker.js?v=11', import.meta.url), { type: 'module' });
    _worker.addEventListener('message', e => {
      const h = engine._pending.get(e.data.id);
      if (h) { h(e.data); if (!String(e.data.type).includes('progress')) engine._pending.delete(e.data.id); }
    });
  }
  return _worker;
}
engine._pending = new Map();
let _wseq = 1;
export function workerRequest(payload, onMsg, transfer) {
  const id = _wseq++;
  engine._pending.set(id, onMsg);
  getWorker().postMessage({ ...payload, id }, transfer || []);
  return id;
}
export function workerCancel(id) {
  getWorker().postMessage({ type: 'cancel', id });
  engine._pending.delete(id);
}

/* ── context / master ───────────────────────────── */
export function ensureCtx() {
  if (!engine.ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC({ latencyHint: 'interactive' });
    engine.ctx = ctx;
    const gain = ctx.createGain(); gain.gain.value = 1;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1; limiter.knee.value = 0; limiter.ratio.value = 20;
    limiter.attack.value = 0.002; limiter.release.value = 0.08;
    const analyser = ctx.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.5;
    gain.connect(limiter); limiter.connect(analyser); analyser.connect(ctx.destination);
    engine.master = { input: gain, limiter, analyser };
    setLimiter(engine.limiterOn);
  }
  if (engine.ctx.state === 'suspended') engine.ctx.resume();
  return engine.ctx;
}
export function setLimiter(on) {
  engine.limiterOn = on;
  if (!engine.master) return;
  const l = engine.master.limiter;
  l.threshold.value = on ? -1 : 0;
  l.ratio.value = on ? 20 : 1;
}
export function setMasterGain(db) { if (engine.master) engine.master.input.gain.value = Math.pow(10, db / 20); }

/* ── buffer registry ────────────────────────────── */
export function addAudioBuffer(name, kind, ab) {
  const id = uid();
  engine.buffers.set(id, { id, name, kind, buffer: ab, i16: null, sr: ab.sampleRate, length: ab.length, duration: ab.duration, channels: ab.numberOfChannels, peaks: null, peaksFor: null });
  return id;
}
export function addInt16Buffer(name, kind, { left, right, sampleRate }) {
  const id = uid();
  engine.buffers.set(id, { id, name, kind, buffer: null, i16: { left, right }, sr: sampleRate, length: left.length, duration: left.length / sampleRate, channels: 2, peaks: null, peaksFor: null });
  return id;
}
export function getBufferMeta(id) { return engine.buffers.get(id); }

export function getAudioBuffer(id) {
  const m = engine.buffers.get(id);
  if (!m) return null;
  if (m.buffer) return m.buffer;
  if (m.i16) {
    const cached = engine._floatCache.get(id);
    if (cached) return cached;
    const ctx = ensureCtx();
    const ab = ctx.createBuffer(2, m.length, m.sr);
    const L = ab.getChannelData(0), R = ab.getChannelData(1);
    const a = m.i16.left, b = m.i16.right;
    for (let i = 0; i < m.length; i++) { L[i] = a[i] / 32768; R[i] = b[i] / 32768; }
    /* promote to the canonical store so in-place sample edits persist */
    m.buffer = ab;
    engine._floatCache.set(id, ab);
    if (engine._floatCache.size > 3) {
      const first = engine._floatCache.keys().next().value;
      if (first !== id) engine._floatCache.delete(first);
    }
    return ab;
  }
  return null;
}
export function releaseFloatCache(id) { engine._floatCache.delete(id); }

export function makeBufferFromChannels(chans, sr) {
  const ctx = ensureCtx();
  const ab = ctx.createBuffer(chans.length, chans[0].length, sr);
  for (let c = 0; c < chans.length; c++) ab.getChannelData(c).set(chans[c]);
  return ab;
}

/* ── waveform peaks (worker) ────────────────────── */
export function requestPeaks(bufferId, cb) {
  const m = engine.buffers.get(bufferId);
  if (!m) return;
  if (m.peaks) { cb && cb(m.peaks); return; }
  const ab = getAudioBuffer(bufferId);
  if (!ab) return;
  if (m.peaksPending) return;
  m.peaksPending = true;
  const L = Float32Array.from(ab.getChannelData(0));
  const R = ab.numberOfChannels > 1 ? Float32Array.from(ab.getChannelData(1)) : null;
  workerRequest({ type: 'peaks', left: L, right: R }, msg => {
    if (msg.type === 'peaks-done') {
      m.peaks = msg.levels;
      m.peaksL = msg.levelsL || null;
      m.peaksR = msg.levelsR || null;
      m.peaksPending = false;
      engine.emit('peaks', bufferId);
      cb && cb(msg.levels);
    }
  }, [L.buffer, R ? R.buffer : L.buffer.slice(0, 0)]);
}

/* ── effects & band chains (live + offline) ────── */
function shaperCurve(drive) {
  const n = 2048, c = new Float32Array(n);
  const k = 1 + drive / 12;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return c;
}

export function buildFx(ctx, fx) {
  const input = ctx.createGain(), output = ctx.createGain();
  let node = input;
  const chain = [];

  /* ── phase invert (polarity flip) — first in the chain so everything downstream flips ── */
  if (fx.invert && fx.invert.on) {
    const inv = ctx.createGain();
    inv.gain.value = -1;
    node.connect(inv);
    node = inv;
    chain.push(inv);
  }

  if (fx.eq && fx.eq.on) {
    const f = fx.eq;
    const s1 = ctx.createBiquadFilter(); s1.type = 'lowshelf'; s1.frequency.value = 120; s1.gain.value = f.lowG;
    const p1 = ctx.createBiquadFilter(); p1.type = 'peaking'; p1.frequency.value = f.lmF; p1.gain.value = f.lmG; p1.Q.value = 1.0;
    const p2 = ctx.createBiquadFilter(); p2.type = 'peaking'; p2.frequency.value = f.hmF; p2.gain.value = f.hmG; p2.Q.value = 1.0;
    const s2 = ctx.createBiquadFilter(); s2.type = 'highshelf'; s2.frequency.value = 7000; s2.gain.value = f.highG;
    node.connect(s1); s1.connect(p1); p1.connect(p2); p2.connect(s2); node = s2; chain.push(s1, p1, p2, s2);
  }
  if (fx.sat && fx.sat.on) {
    const f = fx.sat;
    const pre = ctx.createGain(); pre.gain.value = 1 + f.drive / 55;
    const ws = ctx.createWaveShaper(); ws.curve = shaperCurve(f.drive); ws.oversample = '4x';
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = f.tone;
    const mix = ctx.createGain(); const dry = ctx.createGain();
    dry.gain.value = 1 - f.mix / 100; mix.gain.value = f.mix / 100;
    node.connect(pre); pre.connect(ws); ws.connect(tone); tone.connect(mix);
    node.connect(dry);
    const sum = ctx.createGain(); mix.connect(sum); dry.connect(sum);
    node = sum; chain.push(pre, ws, tone);
  }
  if (fx.comp && fx.comp.on) {
    const f = fx.comp;
    const c = ctx.createDynamicsCompressor();
    c.threshold.value = f.thr; c.ratio.value = f.ratio; c.knee.value = f.knee;
    c.attack.value = f.atk / 1000; c.release.value = f.rel / 1000;
    node.connect(c); node = c; chain.push(c);
  }
  /* stereo width (M/S) */
  const widthAmt = fx.width === undefined ? 1 : fx.width;
  if (Math.abs(widthAmt - 1) > 0.01) {
    const split = ctx.createChannelSplitter(2), merge = ctx.createChannelMerger(2);
    const gM = ctx.createGain(); gM.gain.value = 0.5;
    const gSp = ctx.createGain(); gSp.gain.value = 0.5 * widthAmt;
    const gSn = ctx.createGain(); gSn.gain.value = -0.5 * widthAmt;
    node.connect(split);
    split.connect(gM, 0); split.connect(gM, 1);
    split.connect(gSp, 0); split.connect(gSn, 1);
    gM.connect(merge, 0, 0); gSp.connect(merge, 0, 0);
    gM.connect(merge, 0, 1); gSn.connect(merge, 0, 1);
    node = merge; chain.push(gM, gSp, gSn);
  }
  if (fx.delay && fx.delay.on) {
    const f = fx.delay;
    const dry = ctx.createGain(), wet = ctx.createGain();
    dry.gain.value = 1 - f.mix / 100; wet.gain.value = f.mix / 100;
    const dl = ctx.createDelay(4); dl.delayTime.value = f.time / 1000;
    const fb = ctx.createGain(); fb.gain.value = f.fb / 100;
    const dsum = ctx.createGain();
    node.connect(dry); node.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(dsum); dsum.connect(wet);
    const sum = ctx.createGain(); dry.connect(sum); wet.connect(sum);
    node = sum; chain.push(dl, fb);
  }
  if (fx.reverb && fx.reverb.on) {
    const f = fx.reverb;
    const dry = ctx.createGain(), wet = ctx.createGain();
    dry.gain.value = 1 - f.mix / 100; wet.gain.value = f.mix / 100;
    const conv = ctx.createConvolver();
    conv.buffer = makeImpulse(ctx, f.decay, f.size);
    node.connect(dry); node.connect(conv); conv.connect(wet);
    const sum = ctx.createGain(); dry.connect(sum); wet.connect(sum);
    node = sum; chain.push(conv);
  }
  if (fx.limiter && fx.limiter.on) {
    const f = fx.limiter;
    const c = ctx.createDynamicsCompressor();
    c.threshold.value = f.ceil; c.knee.value = 0; c.ratio.value = 20;
    c.attack.value = 0.001; c.release.value = f.rel / 1000;
    const mk = ctx.createGain(); mk.gain.value = Math.pow(10, -f.ceil / 20) * 0.97;
    node.connect(c); c.connect(mk); node = mk; chain.push(c);
  }
  node.connect(output);
  return { input, output, nodes: chain };
}

let _irCache = new Map();
function makeImpulse(ctx, decay, size) {
  const key = decay.toFixed(1) + '_' + size.toFixed(0);
  if (_irCache.has(key)) return _irCache.get(key);
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(sr * decay));
  const buf = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.2) * (0.4 + 0.6 * (size / 100));
    }
  }
  _irCache.set(key, buf);
  return buf;
}

/* band split (Linkwitz–Riley 4th order per band, parallel) */
export function buildBandSplit(ctx, bands, soloIdx = -1) {
  const input = ctx.createGain(), output = ctx.createGain();
  const bandNodes = [];
  bands.forEach((b, i) => {
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = Math.max(10, b.f1); hp.Q.value = Math.SQRT1_2;
    const hp2 = ctx.createBiquadFilter(); hp2.type = 'highpass'; hp2.frequency.value = Math.max(10, b.f1); hp2.Q.value = Math.SQRT1_2;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(ctx.sampleRate / 2 - 100, b.f2); lp.Q.value = Math.SQRT1_2;
    const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = Math.min(ctx.sampleRate / 2 - 100, b.f2); lp2.Q.value = Math.SQRT1_2;
    const g = ctx.createGain();
    let on = !b.mute && (soloIdx < 0 || soloIdx === i);
    g.gain.value = on ? Math.pow(10, (b.gain || 0) / 20) : 0;
    input.connect(hp); hp.connect(hp2); hp2.connect(lp); lp.connect(lp2); lp2.connect(g); g.connect(output);
    bandNodes.push({ gain: g, hp, lp, nodes: [hp, hp2, lp, lp2] });
  });
  return { input, output, bandNodes };
}

/* ── track graphs ───────────────────────────────── */
export function buildTrackGraph(ctx, track, masterInput, soloActive = false) {
  const input = ctx.createGain();
  let node = input;
  let bandGraph = null;
  if (track.bands && track.bands.enabled) {
    bandGraph = buildBandSplit(ctx, track.bands.list, track.bandSolo ?? -1);
    node.connect(bandGraph.input);
    node = bandGraph.output;
  }
  const fx = buildFx(ctx, track.fx || {});
  node.connect(fx.input);
  const gain = ctx.createGain();
  const pan = ctx.createStereoPanner();
  const analyser = ctx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0;
  fx.output.connect(gain); gain.connect(pan); pan.connect(analyser);
  if (masterInput) pan.connect(masterInput);
  applyTrackLevels(track, gain, pan, soloActive);
  return { input, gain, pan, analyser, fx, bandGraph, trackId: track.id };
}

export function effectiveTrackGain(track, soloActive) {
  if (track.mute) return 0;
  if (soloActive && !track.solo) return 0;
  return Math.pow(10, (track.gain ?? 0) / 20);
}
function applyTrackLevels(track, gainNode, panNode, soloActive) {
  gainNode.gain.value = effectiveTrackGain(track, !!soloActive);
  panNode.pan.value = clamp(track.pan ?? 0, -1, 1);
}

export function rebuildGraphs(tracks) {
  const ctx = ensureCtx();
  engine.tracksRef = tracks;
  for (const g of engine.trackGraphs.values()) { try { g.input.disconnect(); g.pan.disconnect(); } catch (e) { } }
  engine.trackGraphs.clear();
  const soloActive = tracks.some(t => t.solo);
  for (const t of tracks) {
    const g = buildTrackGraph(ctx, t, engine.master.input, soloActive);
    engine.trackGraphs.set(t.id, g);
  }
}
export function updateTrackLevels(tracks) {
  engine.tracksRef = tracks;
  const soloActive = tracks.some(t => t.solo);
  for (const t of tracks) {
    const g = engine.trackGraphs.get(t.id);
    if (g) applyTrackLevels(t, g.gain, g.pan, soloActive);
  }
}
export function updateTrackFx(track) {
  const g = engine.trackGraphs.get(track.id);
  if (!g || !engine.ctx) return;
  const ctx = engine.ctx;
  try { g.fx.input.disconnect(); g.fx.output.disconnect(); g.input.disconnect(); g.bandGraph && g.bandGraph.output.disconnect(); } catch (e) { }
  const fx = buildFx(ctx, track.fx || {});
  if (g.bandGraph) { g.input.connect(g.bandGraph.input); g.bandGraph.output.connect(fx.input); }
  else g.input.connect(fx.input);
  fx.output.connect(g.gain);
  g.fx = fx;
}
/* structural band change (enable/disable the crossover chain) — keep the
   track's persistent input/gain/pan nodes so scheduled clips keep flowing */
export function updateTrackBands(track) {
  const g = engine.trackGraphs.get(track.id);
  if (!g || !engine.ctx) return;
  const ctx = engine.ctx;
  try { g.input.disconnect(); } catch (e) { }
  if (g.bandGraph) { try { g.bandGraph.output.disconnect(); } catch (e) { } }   // stop double-feeding the FX chain
  if (track.bands && track.bands.enabled) {
    const bg = buildBandSplit(ctx, track.bands.list, track.bandSolo ?? -1);
    g.input.connect(bg.input);
    bg.output.connect(g.fx.input);
    g.bandGraph = bg;
  } else {
    g.input.connect(g.fx.input);
    g.bandGraph = null;
  }
}

/* live band mix change: per-band gain / mute / solo via ramped params — no rebuild, no click */
export function applyBandMix(track) {
  const g = engine.trackGraphs.get(track.id);
  if (!g || !g.bandGraph || !engine.ctx) return;
  const t = engine.ctx.currentTime;
  const solo = track.bandSolo ?? -1;
  track.bands.list.forEach((b, i) => {
    const node = g.bandGraph.bandNodes[i];
    if (!node) return;
    const on = !b.mute && (solo < 0 || solo === i);
    const target = on ? Math.pow(10, (b.gain ?? 0) / 20) : 0;
    try { node.gain.gain.setTargetAtTime(target, t, 0.03); } catch (e) { node.gain.gain.value = target; }
  });
}

/* ── clip scheduling / transport ────────────────── */
function stopSources() {
  for (const s of engine.playback.sources) { try { s.stop(); } catch (e) { } try { s.disconnect(); } catch (e) { } }
  engine.playback.sources = [];
}

export function startPlayback(session, fromPos) {
  const ctx = ensureCtx();
  stopSources();
  if (!engine.trackGraphs.size) rebuildGraphs(session.tracks);
  const soloActive = session.tracks.some(t => t.solo);
  const t0 = ctx.currentTime + 0.08;
  engine.playback = { playing: true, startCtx: t0, startPos: fromPos, sources: [] };

  for (const track of session.tracks) {
    if (track.mute || (soloActive && !track.solo)) continue;
    const g = engine.trackGraphs.get(track.id);
    if (!g) continue;
    for (const clip of track.clips) {
      const clipEnd = clip.start + clip.dur;
      if (clipEnd <= fromPos) continue;
      const offsetIn = Math.max(0, fromPos - clip.start);
      const when = t0 + Math.max(0, clip.start - fromPos);
      const playDur = clip.dur - offsetIn;
      if (playDur <= 0.001) continue;
      const buf = getAudioBuffer(clip.bufferId);
      if (!buf) continue;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const cg = ctx.createGain();
      const gv = Math.pow(10, (clip.gain ?? 0) / 20);
      const fi = Math.min(clip.fadeIn || 0, clip.dur * 0.49);
      const fo = Math.min(clip.fadeOut || 0, clip.dur * 0.49);
      cg.gain.setValueAtTime(fi > 0 ? 0.0001 : gv, when);
      if (fi > 0) cg.gain.linearRampToValueAtTime(gv, when + fi);
      const endT = when + playDur;
      if (fo > 0) {
        cg.gain.setValueAtTime(gv, Math.max(when, endT - fo));
        cg.gain.linearRampToValueAtTime(0.0001, endT);
      }
      src.connect(cg); cg.connect(g.input);
      try { src.start(when, clip.offset + offsetIn, playDur); } catch (e) { console.warn(e); }
      engine.playback.sources.push(src);
    }
  }
  engine.emit('transport', true);
}

export function stopPlayback(finalPos) {
  stopSources();
  engine.playback.playing = false;
  engine.emit('transport', false);
}
export function isPlaying() { return engine.playback.playing; }
export function getPosition() {
  const p = engine.playback;
  if (!p.playing || !engine.ctx) return p.startPos;
  return p.startPos + (engine.ctx.currentTime - p.startCtx);
}

/* ── offline rendering ──────────────────────────── */
export function scheduleClipsOffline(ctx, session, fromPos, startTime, trackFilter) {
  const soloActive = session.tracks.some(t => t.solo);
  for (const track of session.tracks) {
    if (trackFilter && !trackFilter.includes(track.id)) continue;
    if (track.mute || (soloActive && !track.solo)) continue;
    const input = track._offInput;
    if (!input) continue;
    for (const clip of track.clips) {
      const clipEnd = clip.start + clip.dur;
      if (clipEnd <= fromPos) continue;
      const offsetIn = Math.max(0, fromPos - clip.start);
      const when = startTime + Math.max(0, clip.start - fromPos);
      const playDur = clip.dur - offsetIn;
      if (playDur <= 0.001) continue;
      const buf = getAudioBuffer(clip.bufferId);
      if (!buf) continue;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const cg = ctx.createGain();
      const gv = Math.pow(10, (clip.gain ?? 0) / 20);
      const fi = Math.min(clip.fadeIn || 0, clip.dur * 0.49);
      const fo = Math.min(clip.fadeOut || 0, clip.dur * 0.49);
      cg.gain.setValueAtTime(fi > 0 ? 0.0001 : gv, when);
      if (fi > 0) cg.gain.linearRampToValueAtTime(gv, when + fi);
      const endT = when + playDur;
      if (fo > 0) {
        cg.gain.setValueAtTime(gv, Math.max(when, endT - fo));
        cg.gain.linearRampToValueAtTime(0.0001, endT);
      }
      src.connect(cg); cg.connect(input);
      try { src.start(when, clip.offset + offsetIn, playDur); } catch (e) { }
    }
  }
}

export async function renderSession(session, opts = {}) {
  const ctx = ensureCtx();
  const sr = ctx.sampleRate;
  const from = opts.from ?? 0;
  const to = opts.to ?? Math.max(0.05, session.duration());
  const len = Math.max(1, Math.ceil((to - from) * sr));
  const off = new OfflineAudioContext(2, len, sr);

  const gain = off.createGain(); gain.gain.value = Math.pow(10, (opts.masterDb ?? 0) / 20);
  const lim = off.createDynamicsCompressor();
  if (engine.limiterOn) { lim.threshold.value = -1; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.08; }
  else { lim.threshold.value = 0; lim.ratio.value = 1; }
  gain.connect(lim); lim.connect(off.destination);

  const soloActive = session.tracks.some(t => t.solo);
  for (const t of session.tracks) {
    const g = buildTrackGraph(off, t, gain, soloActive);
    t._offInput = g.input;
  }
  scheduleClipsOffline(off, session, from, 0, opts.trackIds || null);
  const rendered = await off.startRendering();
  for (const t of session.tracks) delete t._offInput;
  return rendered;
}

/* render a filtered region of one buffer (band extract / isolation) */
export async function renderFiltered(bufferId, opts = {}) {
  const ctx = ensureCtx();
  const sr = ctx.sampleRate;
  const buf = getAudioBuffer(bufferId);
  if (!buf) throw new Error('buffer not found');
  const t0 = opts.t0 ?? 0;
  const t1 = opts.t1 ?? buf.duration;
  const len = Math.max(1, Math.ceil((t1 - t0) * buf.sampleRate));
  const off = new OfflineAudioContext(2, len, buf.sampleRate);
  const src = off.createBufferSource();
  src.buffer = buf;
  let node = src;
  if (opts.f0) { for (let i = 0; i < 2; i++) { const f = off.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = opts.f0; f.Q.value = Math.SQRT1_2; node.connect(f); node = f; } }
  if (opts.f1) { for (let i = 0; i < 2; i++) { const f = off.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.f1; f.Q.value = Math.SQRT1_2; node.connect(f); node = f; } }
  if (opts.gainDb) { const g = off.createGain(); g.gain.value = Math.pow(10, opts.gainDb / 20); node.connect(g); node = g; }
  const out = off.createGain();
  node.connect(out); out.connect(off.destination);
  const dur = t1 - t0;
  src.start(0, t0, dur);
  if (opts.fade) {
    out.gain.setValueAtTime(0.0001, 0);
    out.gain.linearRampToValueAtTime(1, Math.min(0.02, dur / 4));
    out.gain.setValueAtTime(1, Math.max(0, dur - 0.02));
    out.gain.linearRampToValueAtTime(0.0001, dur);
  }
  return await off.startRendering();
}

/* ── utilities: mid/side, normalize, reverse ────── */
export function midSideSplit(bufferId) {
  const buf = getAudioBuffer(bufferId);
  if (!buf) return null;
  const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : buf.getChannelData(0);
  const mid = new Float32Array(L.length), side = new Float32Array(L.length);
  for (let i = 0; i < L.length; i++) { mid[i] = (L[i] + R[i]) * 0.5; side[i] = (L[i] - R[i]) * 0.5; }
  return { mid: makeBufferFromChannels([mid, mid], buf.sampleRate), side: makeBufferFromChannels([side, side], buf.sampleRate) };
}
export function centerCancel(bufferId) {
  const buf = getAudioBuffer(bufferId);
  if (!buf) return null;
  const L = Float32Array.from(buf.getChannelData(0));
  const R = Float32Array.from(buf.numberOfChannels > 1 ? buf.getChannelData(1) : buf.getChannelData(0));
  for (let i = 0; i < L.length; i++) { const s = (L[i] - R[i]) * 0.5; L[i] = s; R[i] = s; }
  return makeBufferFromChannels([L, R], buf.sampleRate);
}
export function normalizeBuffer(bufferId, targetDb = -1) {
  const buf = getAudioBuffer(bufferId);
  if (!buf) return null;
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
  }
  if (peak < 1e-8) return null;
  const g = Math.pow(10, targetDb / 20) / peak;
  const out = [];
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = Float32Array.from(buf.getChannelData(c));
    for (let i = 0; i < d.length; i++) d[i] *= g;
    out.push(d);
  }
  return makeBufferFromChannels(out, buf.sampleRate);
}
export function reverseBuffer(bufferId) {
  const buf = getAudioBuffer(bufferId);
  if (!buf) return null;
  const out = [];
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = Float32Array.from(buf.getChannelData(c));
    d.reverse();
    out.push(d);
  }
  return makeBufferFromChannels(out, buf.sampleRate);
}

/* ── export ─────────────────────────────────────── */
export function bufferToWavBlob(bufferId, bitDepth = 24) {
  const m = engine.buffers.get(bufferId);
  if (!m) throw new Error('unknown buffer');
  if (m.i16 && bitDepth === 16) return encodeWavFromInt16(m.i16.left, m.i16.right, m.sr);
  const buf = getAudioBuffer(bufferId);
  const chans = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
  return encodeWav(chans, buf.sampleRate, bitDepth);
}

/* ── demo session generator ────────────────────── */
export function generateDemo() {
  const ctx = ensureCtx();
  const sr = ctx.sampleRate;
  const dur = 8, n = Math.floor(sr * dur);
  const L = new Float32Array(n), R = new Float32Array(n);
  const kick = new Float32Array(n), drums = new Float32Array(n), bass = new Float32Array(n),
    keys = new Float32Array(n), voice = new Float32Array(n);
  const beat = 0.5; // 120 bpm
  const roots = [55, 55, 65.4, 49];
  let noiseState = 12345;
  const rnd = () => { noiseState = (noiseState * 1103515245 + 12345) & 0x7fffffff; return noiseState / 0x3fffffff - 1; };

  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const bi = Math.floor(t / beat);
    const tb = t - bi * beat;
    // kick on every beat
    if (tb < 0.28) {
      const f = 48 + 90 * Math.exp(-tb * 26);
      kick[i] = Math.sin(2 * Math.PI * f * t) * Math.exp(-tb * 11) * 0.95;
    }
    // snare on 2 & 4
    if (bi % 2 === 1 && tb < 0.18) {
      drums[i] += rnd() * Math.exp(-tb * 24) * 0.55 + Math.sin(2 * Math.PI * 190 * t) * Math.exp(-tb * 30) * 0.3;
    }
    // hats on 8ths
    const th = t - Math.floor(t / (beat / 2)) * (beat / 2);
    if (th < 0.05) drums[i] += rnd() * Math.exp(-th * 90) * 0.22;
    // bass line
    const root = roots[bi % roots.length];
    bass[i] = (Math.sin(2 * Math.PI * root * t) * 0.7 + Math.sin(2 * Math.PI * root * 2 * t) * 0.25) *
      (0.5 + 0.5 * Math.sin(2 * Math.PI * (1 / beat) * t)) * 0.5;
    // keys: chord stabs panned wide
    const chord = [220, 277.2, 329.6];
    let k = 0;
    for (const f of chord) k += Math.sin(2 * Math.PI * f * t) * 0.14;
    keys[i] = k * Math.max(0, Math.exp(-((t - Math.floor(t / beat) * beat)) * 4)) * (0.4 + 0.6 * Math.sin(2 * Math.PI * 0.25 * t));
    // "vocal": vibrato lead, centred
    const melody = [440, 494, 523, 587, 523, 494, 440, 392];
    const note = melody[Math.floor(t / beat) % melody.length];
    const vib = 6 * Math.sin(2 * Math.PI * 5.5 * t);
    voice[i] = (Math.sin(2 * Math.PI * (note + vib) * t) * 0.6 +
      Math.sin(2 * Math.PI * (note * 2 + vib) * t) * 0.2 +
      Math.sin(2 * Math.PI * (note * 3 + vib) * t) * 0.08) *
      (0.35 + 0.3 * Math.sin(2 * Math.PI * 0.5 * t + 1)) * 0.55;
  }
  for (let i = 0; i < n; i++) {
    const dr = drums[i] * 0.9;
    L[i] = kick[i] + dr + bass[i] + voice[i] + keys[i] * 0.8;
    R[i] = kick[i] + dr * 0.95 + bass[i] + voice[i] + keys[i] * 1.15 + drums[i] * 0.1;
  }
  // soft-clip to keep peaks sane
  for (let i = 0; i < n; i++) { L[i] = Math.tanh(L[i] * 0.8); R[i] = Math.tanh(R[i] * 0.8); }
  return makeBufferFromChannels([L, R], sr);
}
