/* ═══════════════════════════════════════════════════════════════
   PRISM AI worker — hosts the ONNX Runtime session (HTDemucs).
   Kept separate from the DSP worker so the model stays resident
   across separations. All tensors stay on this thread.
   ═══════════════════════════════════════════════════════════════ */

import { DemucsProcessor } from './demucs/processor.js?v=11';
import { CONSTANTS } from './demucs/constants.js?v=11';

let processor = null;
let ortModule = null;
let loadedModel = null;
let loadedBackend = null;

function ORT_BASE() { return new URL('../vendor/ort/', import.meta.url).href; }

async function getOrt() {
  if (ortModule) return ortModule;
  /* loaded from vendored files — no CDN dependency */
  ortModule = await import('../vendor/ort/ort.webgpu.min.mjs');
  const env = ortModule.env;
  env.wasm.numThreads = self.crossOriginIsolated ? Math.max(2, Math.min(8, (self.navigator?.hardwareConcurrency || 4))) : 1;
  env.wasm.wasmPaths = ORT_BASE();
  if (self.navigator && self.navigator.gpu) {
    try { env.webgpu = { powerPreference: 'high-performance' }; } catch (e) { /* not supported */ }
  }
  return ortModule;
}

async function probeCapability() {
  let webgpu = false;
  try {
    if (self.navigator && self.navigator.gpu) {
      const adapter = await self.navigator.gpu.requestAdapter();
      webgpu = !!adapter;
    }
  } catch (e) { webgpu = false; }
  return {
    webgpu,
    crossOriginIsolated: !!self.crossOriginIsolated,
    threads: self.crossOriginIsolated ? Math.min(8, (self.navigator?.hardwareConcurrency || 4)) : 1,
    wasm: true // always available as fallback
  };
}

function log(onLog, phase, msg) { try { onLog && onLog(phase, msg); } catch (e) { } }

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case 'ai-probe': return await handleProbe(msg);
      case 'ai-load': return await handleLoad(msg);
      case 'ai-separate': return await handleSeparate(msg);
      case 'ai-unload': return await handleUnload(msg);
    }
  } catch (err) {
    log(null, 'error', String(err && err.stack || err));
    self.postMessage({ type: 'ai-error', id: msg.id, op: msg.type, message: String(err && err.message || err) });
  }
};

async function handleProbe(msg) {
  const cap = await probeCapability();
  self.postMessage({ type: 'ai-probe', id: msg.id, ...cap, modelLoaded: !!processor });
}

async function handleLoad(msg) {
  const { modelId, buffer } = msg;
  const ort = await getOrt();

  /* sniff which EP the browser will give us */
  const cap = await probeCapability();

  if (processor && loadedModel === modelId) {
    self.postMessage({ type: 'ai-load-done', id: msg.id, cached: true, backend: loadedBackend, ...cap });
    return;
  }
  if (processor) { await processor.release(); processor = null; loadedModel = null; }

  self.postMessage({ type: 'ai-log', id: msg.id, phase: 'session', message: cap.webgpu ? 'creating WebGPU session…' : 'creating WASM session…' });

  const p = new DemucsProcessor({
    ort,
    sessionOptions: cap.webgpu ? {} : { executionProviders: ['wasm'] },
    onLog: (phase, message) => self.postMessage({ type: 'ai-log', id: msg.id, phase, message }),
    onProgress: () => {}
  });

  try {
    await p.loadModel(buffer);
  } catch (err) {
    /* if WebGPU fails, retry as pure WASM */
    log(null, 'session', 'webgpu session failed, falling back to wasm: ' + err);
    const p2 = new DemucsProcessor({
      ort,
      sessionOptions: { executionProviders: ['wasm'] },
      onLog: (phase, message) => self.postMessage({ type: 'ai-log', id: msg.id, phase, message }),
      onProgress: () => {}
    });
    await p2.loadModel(buffer);
    processor = p2;
    loadedModel = modelId;
    loadedBackend = 'wasm';
    self.postMessage({ type: 'ai-load-done', id: msg.id, backend: 'wasm', fallback: true, ...cap });
    return;
  }

  processor = p;
  loadedModel = modelId;
  loadedBackend = cap.webgpu ? 'webgpu' : 'wasm';
  self.postMessage({ type: 'ai-load-done', id: msg.id, backend: loadedBackend, ...cap });
}

async function handleUnload(msg) {
  if (processor) { await processor.release(); processor = null; }
  loadedModel = null;
  loadedBackend = null;
  self.postMessage({ type: 'ai-unload-done', id: msg.id });
}

async function handleSeparate(msg) {
  if (!processor) throw new Error('Model not loaded');
  const { left, right, sampleRate } = msg;
  const started = Date.now();

  /* resample to model rate if needed (main thread already resampled) */
  const sr = sampleRate;
  const prog = (p, s) => self.postMessage({ type: 'ai-progress', id: msg.id, progress: p, stage: s });
  processor.onProgress = ({ progress, currentSegment, totalSegments }) => {
    prog(progress, `segment ${currentSegment}/${totalSegments} · HTDemucs inference`);
  };

  const out = await processor.separate(left, right);
  const encode = (f32) => {
    const o = new Int16Array(f32.length);
    for (let i = 0; i < f32.length; i++) {
      let v = f32[i];
      v = v < -1 ? -1 : v > 1 ? 1 : v;
      o[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
    return o;
  };

  const stems = {};
  const transfer = [];
  for (const t of ['drums', 'bass', 'other', 'vocals']) {
    const l16 = encode(out[t].left), r16 = encode(out[t].right);
    stems[t] = { left: l16, right: r16 };
    transfer.push(l16.buffer, r16.buffer);
  }
  prog(1, 'done');
  self.postMessage({
    type: 'ai-done', id: msg.id,
    result: { stems, sampleRate: sr, time: (Date.now() - started) / 1000, model: loadedModel }
  }, transfer);
}
