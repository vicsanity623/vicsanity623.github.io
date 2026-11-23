/* ═══════════════════════════════════════════════════════════════
   PRISM UI — panels, dialogs, transport, mixer, shortcuts
   ═══════════════════════════════════════════════════════════════ */

import { $, $$, clamp, fmtTime, fmtBytes, toast, download, encodeWav, makeZip, uid } from './utils.js?v=11';
import { saveBlob, encodeMp3 } from './extra.js?v=11';
import { session, DEFAULT_BANDS, defaultFx } from './session.js?v=11';
import {
  engine, ensureCtx, addAudioBuffer, addInt16Buffer, getBufferMeta, getAudioBuffer,
  requestPeaks, workerRequest, workerCancel, startPlayback, stopPlayback, getPosition,
  isPlaying, rebuildGraphs, updateTrackLevels, updateTrackFx, updateTrackBands, applyBandMix,
  renderSession, renderFiltered, midSideSplit, centerCancel, normalizeBuffer, reverseBuffer,
  bufferToWavBlob, generateDemo, setLimiter, setMasterGain, makeBufferFromChannels
} from './audio-engine.js?v=11';
import {
  initViews, redraw, setView, setTool, fitZoom, zoomBy, zoomFromSlider, view,
  requestSpectro, spectroSource, readMeters, ensureVisible
} from './views.js?v=11';
import { aiProbe, aiLoad, aiSeparate } from './audio-engine.js?v=11';
import { AI_MODELS } from './demucs/constants.js?v=11';
import { bandEnergies, integratedLoudness, peakOf, rmsOf, correlation, BAND_RANGES, fmtDb } from './dsp.js?v=11';

import { probeLocalServer, probeAllLocalServers, separateWithLocalServer, audioBufferToWav16, pcmWavToFloat } from './ai-local.js?v=11';

function isMobileBrowser() {
  const n = navigator;
  const ua = n.userAgent || '';
  return n.userAgentData?.mobile === true ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ||
    (n.platform === 'MacIntel' && n.maxTouchPoints > 1);
}
const MOBILE_AI_BLOCKED = isMobileBrowser();

const ui = {
  sourceId: null,
  sepMode: 'fast',
  sepParams: null,
  pendingRelink: new Map(),
  meters: null,
  lastMeterPaint: 0,
  aiBusy: false,
  aiDownloading: false,
  localServer: null
};

/* ═══════ init ═══════ */
export function initUI() {
  wireImport();
  wireTransport();
  wireToolbar();
  wireLeftPanel();
  wireInspector();
  wireMixer();
  wireDialogs();
  wireKeyboard();
  wireMobile();

  session.on('change', onSessionChange);
  session.on('undoState', updateUndoButtons);

  // Packaged app: the bundled model servers take a few seconds to boot.
  // Re-probe periodically so the local-engine options unlock themselves.
  if (ui.localProbeTimer) clearInterval(ui.localProbeTimer);
  ui.localProbeTimer = setInterval(() => { refreshLocalServer().catch(() => {}); }, 4000);

  initViews({
    seek: (t, keepPlaying = false) => {
      session.playhead = Math.max(0, t);
      if (isPlaying()) { stopPlayback(); if (keepPlaying !== false) startPlayback(session, session.playhead); }
      updateTimeDisplay();
      redraw();
    },
    stopAtEnd: () => { stopPlayback(); session.playhead = 0; updateTimeDisplay(); redraw(); },
    selectTrack: id => { session.selectedTrackId = id; updateInspector(); paintMixerSelection(); },
    selectClip: (tid, cid) => { session.selectedTrackId = tid; session.selectedClipId = cid; updateInspector(); },
    selectionChanged: () => { updateInspector(); updateStatusSel(); },
    clipChanged: clip => { updateClipInspector(clip); },
    levelsChanged: () => { updateTrackLevels(session.tracks); },
    rebuildIfNeeded: () => { if (isPlaying()) restartPlayback(); },
    meterFor: id => (ui.meters && ui.meters.tracks[id]) ? ui.meters.tracks[id].peak : 0,
    tick: onTick
  });

  setView('lanes');
  restorePrefs();
  toggleAiPanel();
  refreshAiStatus();
  updateSeparateLabel();
  updateInspector();
  rebuildMixer();
  updateUndoButtons();
  updateTotalTime();
}

function onSessionChange(reason) {
  if (['addTrack', 'removeTrack'].includes(reason)) rebuildMixer();
  updateTrackLevels(session.tracks);
  if (isPlaying() && ['addTrack', 'removeTrack', 'delete', 'splitClip', 'silence', 'trim', 'moveClip'].includes(reason)) restartPlayback();
  updateInspector();
  updateTotalTime();
  redraw();
}
function restartPlayback() {
  const p = getPosition();
  stopPlayback();
  startPlayback(session, p);
}

/* ═══════ import ═══════ */
function wireImport() {
  const dz = $('#dropZone'), fi = $('#fileInput');
  dz.addEventListener('click', () => fi.click());
  dz.addEventListener('keydown', e => { if (e.key === 'Enter') fi.click(); });
  fi.addEventListener('change', () => { importFiles([...fi.files]); fi.value = ''; });
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', e => importFiles([...e.dataTransfer.files]));
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => {
    e.preventDefault();
    const files = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith('audio') || /\.(wav|mp3|m4a|flac|ogg|aac|opus|aiff)$/i.test(f.name));
    if (files.length) importFiles(files);
  });

  $('#btnDemo').addEventListener('click', loadDemo);
}

async function importFiles(files) {
  const audio = files.filter(f => f.type.startsWith('audio') || /\.(wav|mp3|m4a|flac|ogg|aac|opus|aiff)$/i.test(f.name));
  if (!audio.length) { toast('No playable audio files found', 'err'); return; }
  ensureCtx();
  for (const f of audio) {
    try {
      showProgress('Decoding ' + f.name, 0.3, 'reading file…');
      const ab = await ensureCtx().decodeAudioData(await f.arrayBuffer());
      hideProgress();
      const base = f.name.replace(/\.[^.]+$/, '');
      let id = addAudioBuffer(base, 'import', ab);
      // relink pending session clips by name?
      let trackName = base;
      if (ui.pendingRelink.has(base)) {
        const oldId = ui.pendingRelink.get(base);
        engine.buffers.get(id).relinkOf = oldId;
        ui.pendingRelink.delete(base);
        remapBuffer(oldId, id);
        trackName = null;
      }
      addBufferToTimeline(id, trackName || base);
      if (!ui.sourceId) setSource(id);
      requestPeaks(id);
      toast(`Imported ${f.name} · ${ab.duration.toFixed(1)}s`, 'ok');
    } catch (err) {
      hideProgress();
      console.error(err);
      toast('Could not decode ' + f.name, 'err');
    }
  }
  fitZoom();
}

function remapBuffer(oldId, newId) {
  for (const t of session.tracks) for (const c of t.clips) if (c.bufferId === oldId) c.bufferId = newId;
  session.emit('change', 'relink');
}

function setSource(id) {
  ui.sourceId = id;
  view.spectroSourceId = id;
  const meta = getBufferMeta(id);
  $('#stemStatus').textContent = meta ? `${meta.duration.toFixed(0)}s · ${(meta.sr / 1000).toFixed(1)}k` : '';
  $('#btnSeparate').disabled = MOBILE_AI_BLOCKED && ui.sepMode === 'ai';
  $('#btnMidSide').disabled = false;
  for (const b of ['#utilMid', '#utilSide', '#utilCenterCancel', '#utilNormalize', '#btnExtractBand']) $(b).disabled = false;
  renderStemList();
  updateSeparateLabel();
}

function addBufferToTimeline(bufferId, name) {
  const meta = getBufferMeta(bufferId);
  const t = session.addTrack({ name, kind: meta.kind, bufferId });
  session.addClip(t.id, { bufferId, start: 0, dur: meta.duration, name });
  return t;
}

function loadDemo() {
  ensureCtx();
  session.snapshot();
  const ab = generateDemo();
  const id = addAudioBuffer('PRISM demo groove', 'mix', ab);
  addBufferToTimeline(id, 'Demo groove');
  setSource(id);
  requestPeaks(id);
  fitZoom();
  toast('Demo loaded — hit “Separate into stems”', 'ok');
}

/* ═══════ transport ═══════ */
function wireTransport() {
  $('#btnPlay').addEventListener('click', togglePlay);
  $('#btnStop').addEventListener('click', () => {
    stopPlayback();
    session.playhead = 0;
    $('#btnPlay').classList.remove('on');
    updateTimeDisplay(); redraw();
  });
  $('#btnToStart').addEventListener('click', () => {
    session.playhead = 0;
    if (isPlaying()) { stopPlayback(); startPlayback(session, 0); }
    updateTimeDisplay(); redraw();
  });
  $('#btnLoop').addEventListener('click', () => {
    if (!session.selection) { toast('Make a time selection first (drag on the timeline)'); return; }
    session.loop = !session.loop;
    $('#btnLoop').classList.toggle('active', session.loop);
  });
  $('#projectName').addEventListener('input', e => { session.name = e.target.value; });
  $('#zoomRange').addEventListener('input', e => zoomFromSlider(+e.target.value));
  $('#zoomIn').addEventListener('click', () => zoomBy(1.35));
  $('#zoomOut').addEventListener('click', () => zoomBy(1 / 1.35));
  $('#btnUndo').addEventListener('click', doUndo);
  $('#btnRedo').addEventListener('click', doRedo);
  engine.on('transport', playing => $('#btnPlay').classList.toggle('on', playing));
}

function togglePlay() {
  ensureCtx();
  if (isPlaying()) {
    const p = getPosition();
    stopPlayback();
    session.playhead = p;
    $('#btnPlay').classList.remove('on');
  } else {
    if (session.playhead >= session.duration() - 0.01) session.playhead = 0;
    if (!engine.trackGraphs.size || engine.trackGraphs.size !== session.tracks.length) rebuildGraphs(session.tracks);
    startPlayback(session, session.playhead);
    $('#btnPlay').classList.add('on');
  }
  updateTimeDisplay();
  redraw();
}

function updateTimeDisplay() {
  $('#timeDisplay').textContent = fmtTime(session.playhead);
}
/* marker visibility toggle state — keeps button pressed/tooltip in sync with session */
function updateMarkerButtons() {
  const toggle = $('#btnToggleMarkers');
  const clear = $('#btnClearMarkers');
  if (toggle) {
    toggle.classList.toggle('markers-hidden', !!session.markersHidden);
    toggle.title = session.markersHidden
      ? `Show markers (${session.markers.length} hidden)`
      : `Hide markers (${session.markers.length} on timeline)`;
  }
  if (clear) {
    clear.disabled = !session.markers.length;
    clear.title = session.markers.length
      ? `Delete all ${session.markers.length} marker${session.markers.length === 1 ? '' : 's'}`
      : 'No markers on timeline';
  }
}

function updateTotalTime() {
  $('#timeTotal').textContent = '/ ' + fmtTime(session.duration());
  updateTimeDisplay();
}
function updateStatusSel() { redraw && redraw(); }

function doUndo() { if (session.undo()) { rebuildGraphsIfNeeded(); toast('Undo'); } }
function doRedo() { if (session.redo()) { rebuildGraphsIfNeeded(); toast('Redo'); } }
function rebuildGraphsIfNeeded() {
  rebuildGraphs(session.tracks);
  rebuildMixer();
  if (isPlaying()) restartPlayback();
}
function updateUndoButtons() {
  $('#btnUndo').disabled = !session._undo.length;
  $('#btnRedo').disabled = !session._redo.length;
}

/* ═══════ toolbar / views ═══════ */
function wireToolbar() {
  $$('.vtab').forEach(b => b.addEventListener('click', () => {
    $$('.vtab').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    setView(b.dataset.view);
  }));
  $$('#editTools .tool').forEach(b => b.addEventListener('click', () => {
    $$('#editTools .tool').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    setTool(b.dataset.tool);
  }));
  $('#btnToggleMarkers').addEventListener('click', e => {
    session.snapshot(); // keep hidden/shown state undoable
    const hidden = session.toggleMarkers();
    updateMarkerButtons();
    $('#btnToggleMarkers').classList.toggle('markers-hidden', hidden);
  });
  $('#btnClearMarkers').addEventListener('click', () => {
    if (!session.markers.length) return toast('No markers to clear');
    session.snapshot();
    session.clearMarkers();
    updateMarkerButtons();
    toast('Markers cleared');
  });
  session.on('markersChanged', updateMarkerButtons);

  // reflect count on the marker button's tooltip
  updateMarkerButtons();
  $('#snapSelect').addEventListener('change', e => {
    session.snap = e.target.value === '-1' ? -1 : +e.target.value;
  });
  $('#bpmInput').addEventListener('change', e => { session.bpm = clamp(+e.target.value || 120, 40, 300); e.target.value = session.bpm; });

  $('#btnSplit').addEventListener('click', () => {
    const t = session.selectedTrack(), c = session.selectedClip();
    if (!t || !c) { toast('Select a clip first'); return; }
    session.snapshot();
    session.splitClip(t.id, c.id, session.playhead);
    redraw(); toast('Split at ' + fmtTime(session.playhead));
  });
  $('#btnTrim').addEventListener('click', () => {
    if (session.trimToSelection()) { redraw(); toast('Trimmed to selection'); }
    else toast('Select a range inside the selected clip', 'err');
  });
  $('#btnDelete').addEventListener('click', deleteSelection);
  $('#btnDuplicate').addEventListener('click', () => { if (session.duplicateSelection()) redraw(); });
  $('#btnSilence').addEventListener('click', () => { if (session.silenceSelection()) { redraw(); toast('Silenced selection'); } else toast('Make a time selection first'); });

  $('#btnIsolateSel').addEventListener('click', isolateSpectroSelection);
  $('#spectLog').addEventListener('change', () => requestSpectro(true));
  $('#spectMap').addEventListener('change', () => requestSpectro(true));
}

function deleteSelection() {
  if (session.deleteSelection()) { redraw(); toast('Deleted'); }
  else toast('Nothing to delete — select clips or a range', 'err');
}

/* ═══════ left panel: separation / stems / bands ═══════ */
function wireLeftPanel() {
  $$('#sepModes .mode').forEach(b => b.addEventListener('click', () => {
    $$('#sepModes .mode').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    ui.sepMode = b.dataset.mode;
    toggleAiPanel();
    updateSeparateLabel();
    savePrefs();
  }));
  $('#aiModelSel').addEventListener('change', () => {
    savePrefs();
    applyAiEngineVisibility();
    updateSeparateLabel();
  });
  $('#btnAiModel').addEventListener('click', () => downloadAiModel(true));

  const outs = [['pFft', 'oFft', v => [1024, 2048, 4096][+v]], ['pCenter', 'oCenter', v => (+v).toFixed(2)],
  ['pHarm', 'oHarm', v => (+v).toFixed(2)], ['pTrans', 'oTrans', v => (+v).toFixed(2)],
  ['pSharp', 'oSharp', v => (+v).toFixed(2)], ['pBleed', 'oBleed', v => (+v).toFixed(2)]];
  for (const [pid, oid, fmt] of outs) {
    const el = $('#' + pid), out = $('#' + oid);
    if (!el) continue;
    const upd = () => { out.textContent = fmt(el.value); savePrefs(); };
    el.addEventListener('input', upd); upd();
  }
  $('#pRes').addEventListener('change', savePrefs);

  $('#btnSeparate').addEventListener('click', runSeparation);
  $('#btnResetBands').addEventListener('click', () => {
    const t = session.selectedTrack();
    if (!t) return toast('Select a track first');
    session.snapshot();
    t.bands.list = DEFAULT_BANDS.map(b => ({ ...b }));
    t.bandSolo = -1;
    if (t.bands.enabled) applyBandMix(t);
    renderBands(); redraw();
  });
  $('#btnExtractBand').addEventListener('click', extractSoloedBand);

  $('#utilMid').addEventListener('click', () => makeUtility('mid'));
  $('#utilSide').addEventListener('click', () => makeUtility('side'));
  $('#utilCenterCancel').addEventListener('click', () => makeUtility('cancel'));
  $('#utilNormalize').addEventListener('click', () => makeUtility('normalize'));
  $('#btnMidSide').addEventListener('click', () => { makeUtility('mid'); makeUtility('side'); });

  renderBands();
  renderStemList();
}

function collectSepParams() {
  return {
    mode: ui.sepMode,
    fft: [1024, 2048, 4096][+$('#pFft').value],
    centerFocus: +$('#pCenter').value,
    harmonicWeight: +$('#pHarm').value,
    transientWeight: +$('#pTrans').value,
    sharpness: +$('#pSharp').value,
    deBleed: +$('#pBleed').value,
    res: +$('#pRes').value
  };
}

async function runSeparation() {
  if (ui.sepMode === 'ai') return isLocalModelSelected() ? runLocalAISeparation() : runAISeparation();
  const srcId = separationSourceId();
  if (!srcId) { toast('Import audio first', 'err'); return; }
  const meta = getBufferMeta(srcId);
  const ab = getAudioBuffer(srcId);
  if (!ab) return;
  ensureCtx();

  const params = collectSepParams();
  const L = Float32Array.from(ab.getChannelData(0));
  const R = ab.numberOfChannels > 1 ? Float32Array.from(ab.getChannelData(1)) : Float32Array.from(ab.getChannelData(0));

  showProgress('Spectral decomposition', 0, 'preparing analysis buffers…');
  const t0 = performance.now();
  const reqId = workerRequest({ type: 'separate', left: L, right: R, sampleRate: ab.sampleRate, params }, msg => {
    if (msg.type === 'progress') setProgress(msg.progress / 100, msg.stage);
    else if (msg.type === 'error') {
      hideProgress();
      if (msg.message === 'CANCELLED') toast('Separation cancelled');
      else { console.error(msg.message); toast('Separation failed: ' + msg.message, 'err'); }
    } else if (msg.type === 'separate-done') {
      hideProgress();
      ingestStems(msg.result, srcId);
      const secs = ((performance.now() - t0) / 1000).toFixed(1);
      toast(`Separated in ${secs}s (${params.mode} mode)`, 'ok');
      if (msg.result.note) toast(msg.result.note);
    }
  }, [L.buffer, R.buffer]);
  $('#progCancel').onclick = () => workerCancel(reqId);
}

/* ══════════════════════════════════════════════
   AI engine — HTDemucs (ONNX) on-device
   ══════════════════════════════════════════════ */
const MODEL_CACHE = 'prism-ai-models-v1';

function aiModelDef() {
  const sel = $('#aiModelSel');
  const id = sel ? sel.value : 'htdemucs_ft';
  return AI_MODELS.find(m => m.id === id) || AI_MODELS[0];
}
const isLocalModelSelected = () => ($('#aiModelSel')?.value || '').startsWith('local-');
const localModelId = () => ($('#aiModelSel')?.value || 'local-htdemucs_ft').replace(/^local-/, '');

function toggleAiPanel() {
  const isAi = ui.sepMode === 'ai';
  $('#aiPanel').hidden = !isAi;
  $('#sepAdvanced').style.display = isAi ? 'none' : '';
  refreshLocalServer();           // always probe — cheap & idempotent
  if (isAi) { refreshAiStatus(); applyAiEngineVisibility(); }
  updateSeparateLabel();
}

function applyAiEngineVisibility() {
  const local = isLocalModelSelected();
  $('#btnAiModel').hidden = local;
  $('#aiStatus').hidden = local;
  $('#aiMetaBrowser').hidden = local;
  $('#aiLocalRow').hidden = true;
  const mobileWarning = $('#aiMobileWarning');
  if (mobileWarning) mobileWarning.hidden = !(MOBILE_AI_BLOCKED && ui.sepMode === 'ai');
  if (MOBILE_AI_BLOCKED) $('#btnAiModel').disabled = true;
}

async function refreshLocalServer() {
  const row = $('#aiLocalRow');
  if (row) row.hidden = true;
  for (const id of ['aiLocalOption', 'aiLocal6sOption', 'aiLocalMdxOption']) {
    const option = $('#' + id);
    if (option) option.disabled = true;
  }
  if ($('#aiModelSel')?.value.startsWith('local-')) $('#aiModelSel').value = 'htdemucs_ft';
  ui.localServer = null;
  ui.localMdxServer = null;
  updateSeparateLabel();
}

async function updateSeparateLabel() {
  const btn = $('#btnSeparateLabel');
  const separateButton = $('#btnSeparate');
  if (ui.sepMode !== 'ai') {
    btn.textContent = 'Separate into stems';
    separateButton.disabled = !separationSourceId();
    return;
  }
  if (MOBILE_AI_BLOCKED) {
    btn.textContent = 'AI separation needs a desktop';
    separateButton.disabled = true;
    return;
  }
  if (isLocalModelSelected()) {
    if ($('#aiModelSel').value === 'local-mdxnet_voc_ft') {
      btn.textContent = ui.localMdxServer ? 'Separate with MDX-Net Voc-FT' : 'MDX-Net server not running';
    } else {
      btn.textContent = ui.localServer ? 'Separate on local server (full quality)' : 'Local server not running — see ★ LOCAL hint';
    }
    return;
  }
  const def = aiModelDef();
  const cached = await cacheModelAvailable(def.url);
  btn.textContent = cached ? 'Separate with HTDemucs AI' : `Download model & separate (${(def.size / 1048576).toFixed(0)} MB)`;
}

async function cacheModelAvailable(url) {
  try {
    const cache = await caches.open(MODEL_CACHE);
    const res = await cache.match(url);
    return !!res;
  } catch (e) { return false; }
}

async function readCachedModel(url) {
  const cache = await caches.open(MODEL_CACHE);
  const res = await cache.match(url);
  return res ? await res.arrayBuffer() : null;
}

async function downloadModel(def, onProgress) {
  const res = await fetch(def.url);
  if (!res.ok) throw new Error('download failed: HTTP ' + res.status);
  const total = +(res.headers.get('Content-Length') || def.size);
  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(loaded / total, loaded, total);
  }
  const combined = new Uint8Array(loaded);
  let off = 0;
  for (const c of chunks) { combined.set(c, off); off += c.length; }

  if (def.sha256) {
    setProgress(0.5, 'verifying checksum…');
    const digest = await crypto.subtle.digest('SHA-256', combined);
    const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
    if (hex !== def.sha256) throw new Error('model checksum mismatch — please retry');
  }
  try {
    const cache = await caches.open(MODEL_CACHE);
    await cache.put(def.url, new Response(combined, { headers: { 'Content-Length': String(combined.length) } }));
  } catch (e) { console.warn('model cache write failed — will re-download next time', e); }
  return combined.buffer;
}

async function refreshAiStatus() {
  const def = aiModelDef();
  $('#aiModelDesc').textContent = def.desc;
  $('#aiModelSize').textContent = (def.size / 1048576).toFixed(0) + ' MB';
  const available = await cacheModelAvailable(def.url);
  if (MOBILE_AI_BLOCKED) {
    $('#aiBackend').textContent = 'Desktop only';
    $('#aiStatus .ai-dot').className = 'ai-dot idle';
    $('#aiStatusText').textContent = 'AI disabled on phones to prevent memory reloads';
    $('#btnAiModel').disabled = true;
    $('#btnAiModel').textContent = 'Use a desktop browser for AI';
    return;
  }
  let backend = 'WASM (CPU)';
  try {
    const cap = await aiProbe();
    if (cap && cap.webgpu) backend = 'WebGPU';
  } catch (e) { /* probe optional */ }
  $('#aiBackend').textContent = backend;
  const dot = $('#aiStatus .ai-dot');
  const txt = $('#aiStatusText');
  const btn = $('#btnAiModel');
  dot.className = 'ai-dot ' + (available ? 'ready' : 'idle');
  txt.textContent = available ? 'model cached on this device' : 'not downloaded yet';
  btn.textContent = available ? 'Re-download model' : `Download AI model (${(def.size / 1048576).toFixed(0)} MB, one-time)`;
}

async function downloadAiModel(only) {
  if (MOBILE_AI_BLOCKED) {
    toast('AI separation is disabled on phones to prevent browser memory crashes. Use Fast, Studio or Deep instead.', 'err');
    return;
  }
  const def = aiModelDef();
  if (ui.aiDownloading) return;
  ui.aiDownloading = true;
  const dot = $('#aiStatus .ai-dot');
  dot.className = 'ai-dot downloading';
  $('#aiStatusText').textContent = 'downloading…';
  showProgress(def.name + ' download', 0, 'connecting…');
  try {
    await downloadModel(def, (p, loaded, total, sub) => {
      setProgress(p, `fetching HTDemucs model… ${(loaded / 1048576).toFixed(0)} / ${(total / 1048576).toFixed(0)} MB`);
    });
    hideProgress();
    await refreshAiStatus();
    updateSeparateLabel();
    toast(def.name + ' downloaded — ready to use', 'ok');
  } catch (e) {
    hideProgress();
    console.error(e);
    $('#aiStatus .ai-dot').className = 'ai-dot error';
    $('#aiStatusText').textContent = 'download failed — check connection & retry';
    toast('Download failed: ' + e.message, 'err');
  } finally {
    ui.aiDownloading = false;
  }
}

async function resampleStereoForAI(ab) {
  const SR = 44100;
  if (ab.sampleRate === SR) {
    return [
      Float32Array.from(ab.getChannelData(0)),
      ab.numberOfChannels > 1 ? Float32Array.from(ab.getChannelData(1)) : Float32Array.from(ab.getChannelData(0))
    ];
  }
  const len = Math.ceil(ab.duration * SR);
  const off = new OfflineAudioContext(2, len, SR);
  const src = off.createBufferSource();
  src.buffer = ab;
  src.connect(off.destination);
  src.start(0);
  const out = await off.startRendering();
  return [Float32Array.from(out.getChannelData(0)), Float32Array.from(out.getChannelData(1))];
}

async function runAISeparation() {
  if (MOBILE_AI_BLOCKED) {
    toast('AI separation is disabled on phones to prevent browser memory crashes. Use Fast, Studio or Deep instead.', 'err');
    return;
  }
  const srcId = separationSourceId();
  if (!srcId) { toast('Import audio first', 'err'); return; }
  const ab = getAudioBuffer(srcId);
  if (!ab) return;
  if (ui.aiBusy) return;
  ui.aiBusy = true;
  ensureCtx();

  const def = aiModelDef();
  const durationMin = ab.duration / 60;
  if (durationMin > 6) {
    toast('Long track — AI uses a lot of memory; Studio/Deep (DSP) is lighter', '');
  }
  $('#progCancel').onclick = () => toast('HTDemucs cannot be interrupted mid-inference — it will finish the current segment', '');

  showProgress(def.name, 0.02, 'resampling to 44.1 kHz…');
  try {
    /* ── resample to the model's 44.1 kHz ── */
    const [L, R] = await resampleStereoForAI(ab);

    /* ── get the model: cache → download ── */
    let modelBuffer = await readCachedModel(def.url);
    if (!modelBuffer) {
      setProgress(0.05, 'downloading ' + def.name + ' (one-time)…');
      modelBuffer = await downloadModel(def, (p, loaded, total) => {
        setProgress(0.05 + 0.42 * p, `downloading… ${(loaded / 1048576).toFixed(0)} / ${(total / 1048576).toFixed(0)} MB`);
      });
    }

    /* ── load session (reuse if same model already resident) ── */
    setProgress(0.5, 'creating inference session…');
    const t0 = performance.now();
    const loadInfo = await aiLoad(def.id, modelBuffer);
    const backend = loadInfo.backend === 'webgpu' ? 'WebGPU' : 'WASM';
    if (loadInfo.fallback) toast('WebGPU unavailable — using WASM fallback', '');
    $('#aiStatus .ai-dot').className = 'ai-dot busy';
    $('#aiStatusText').textContent = 'running on ' + backend;

    /* ── separate ── */
    const result = await aiSeparate(L, R, 44100, (p, stage) => {
      if (p !== null && p !== undefined) setProgress(0.55 + 0.44 * p, stage);
      else setProgress(null, stage);
    });

    hideProgress();
    ingestStems(result, srcId);
    toast(`Separated in ${((performance.now() - t0) / 1000).toFixed(1)}s on ${backend}`, 'ok');
    await refreshAiStatus();
    updateSeparateLabel();
  } catch (e) {
    hideProgress();
    console.error(e);
    const msg = e && e.message ? e.message : String(e);
    toast('AI separation failed: ' + msg, 'err');
    try { await refreshAiStatus(); } catch (_) { }
  } finally {
    ui.aiBusy = false;
  }
}

async function runLocalAISeparation() {
  const srcId = separationSourceId();
  if (!srcId) { toast('Import audio first', 'err'); return; }
  const ab = getAudioBuffer(srcId);
  if (!ab) return;
  if (ui.aiBusy) return;
  ui.aiBusy = true;
  ensureCtx();

  if (!ui.localServer) {
    ui.aiBusy = false;
    toast('Local server not running — start it: tools/venv/bin/python tools/htdemucs_ft_server.py', 'err');
    return;
  }

  const model = localModelId();
  $('#progCancel').onclick = () => toast('The server is busy — let this run finish', '');
  showProgress('Local HTDemucs-FT', 0.08, 'encoding WAV…');
  try {
    const wav = audioBufferToWav16(ab);
    setProgress(0.15, `running ${model} on your machine — may take several minutes…`);
    const t0 = performance.now();
    const result = await separateWithLocalServer(wav.buffer, model);
    setProgress(0.92, 'decoding stem WAVs…');
    await ingestLocalStems(result, srcId);
    hideProgress();
    toast(`Separated with ${model} on this machine (${((performance.now() - t0) / 1000 / 60).toFixed(1)} min)`, 'ok');
    await refreshAiStatus();
    await refreshLocalServer();
    updateSeparateLabel();
  } catch (e) {
    hideProgress();
    console.error(e);
    const msg = e && e.message ? e.message : String(e);
    toast('Local separation failed: ' + msg, 'err');
    try { await refreshLocalServer(); } catch (_) { }
  } finally {
    ui.aiBusy = false;
  }
}

async function ingestLocalStems({ meta, stems }, srcId) {
  session.snapshot();
  const outStems = {};
  for (const [name, wavBytes] of Object.entries(stems)) {
    const { left, right, sampleRate } = pcmWavToFloat(wavBytes);
    const n = left.length;
    const l16 = new Int16Array(n), r16 = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      let a = left[i], b = right[i];
      a = a < -1 ? -1 : a > 1 ? 1 : a; b = b < -1 ? -1 : b > 1 ? 1 : b;
      l16[i] = a < 0 ? a * 0x8000 : a * 0x7fff;
      r16[i] = b < 0 ? b * 0x8000 : b * 0x7fff;
    }
    outStems[name] = { left: l16, right: r16, sampleRate };
  }
  ingestStems({ sampleRate: meta.sample_rate, stems: outStems, note: '', time: meta.time }, srcId);
}

function separationSourceId() {
  const t = session.selectedTrack();
  if (t && t.clips.length && engine.buffers.has(t.clips[0].bufferId)) return t.clips[0].bufferId;
  if (ui.sourceId) return ui.sourceId;
  for (const [id, m] of engine.buffers) if (m.kind === 'mix' || m.kind === 'import') return id;
  return null;
}

function ingestStems(result, srcId) {
  session.snapshot();
  const srcMeta = getBufferMeta(srcId);
  const label = srcMeta ? srcMeta.name : 'mix';
  const colors = { vocals: '#a78bfa', drums: '#fb923c', bass: '#34d399', other: '#38bdf8', guitar: '#f472b6', piano: '#facc15' };
  for (const [name, data] of Object.entries(result.stems)) {
    const id = addInt16Buffer(`${label} · ${name}`, 'stem', { left: data.left, right: data.right, sampleRate: result.sampleRate });
    requestPeaks(id);
    // replace an existing track with same stem name for this source, else add
    let track = session.tracks.find(t => t.kind === 'stem' && t.name.endsWith('· ' + name) && t.sourceOf === srcId);
    if (!track) {
      track = session.addTrack({ name: `${name}`, kind: 'stem', color: colors[name], bufferId: id });
      track.sourceOf = srcId;
      session.addClip(track.id, { bufferId: id, start: 0, dur: data.left.length / result.sampleRate, name });
    } else {
      track.bufferId = id;
      track.clips = [];
      session.addClip(track.id, { bufferId: id, start: 0, dur: data.left.length / result.sampleRate, name });
    }
    view.spectroSourceId = id;
  }
  session.emit('change', 'stems');
  renderStemList();
  setSource(ui.sourceId || srcId);
  fitZoom();
}

function renderStemList() {
  const host = $('#stemList');
  host.innerHTML = '';
  const items = [];
  for (const [id, m] of engine.buffers) items.push({ id, m });
  if (!items.length) {
    host.innerHTML = '<div class="empty-note">Import a track, then run <b>Separate</b> to decompose it into stems.</div>';
    return;
  }
  for (const { id, m } of items) {
    const track = session.tracks.find(t => t.bufferId === id || t.clips.some(c => c.bufferId === id));
    const el = document.createElement('div');
    el.className = 'stem-item' + (view.spectroSourceId === id ? ' sel' : '');
    el.innerHTML = `
      <span class="dot" style="background:${colorFor(m, track)};color:${colorFor(m, track)}"></span>
      <div style="flex:1;min-width:0">
        <div class="sname">${escapeHtml(m.name)}</div>
        <div class="sinfo">${m.duration.toFixed(1)}s · ${(m.sr / 1000).toFixed(1)}k · ${m.kind}</div>
      </div>
      <canvas class="swave" width="128" height="48"></canvas>
      ${track ? '<button class="tog" data-act="mute" title="Mute">M</button>' : ''}
      <button class="tog del" data-act="del" title="Delete from project">✕</button>`;
    el.addEventListener('click', e => {
      if (e.target.dataset.act === 'mute' && track) {
        session.snapshot(); track.mute = !track.mute; session.emit('change', 'toggle'); updateTrackLevels(session.tracks); return;
      }
      if (e.target.dataset.act === 'del') {
        deleteBufferItem(id, m);
        return;
      }
      view.spectroSourceId = id;
      if (track) { session.selectedTrackId = track.id; session.selectedClipId = track.clips[0]?.id || null; }
      renderStemList(); updateInspector(); redraw();
      if (session.view === 'spectro') requestSpectro(true);
    });
    host.appendChild(el);
    const cv = el.querySelector('canvas');
    paintMiniWave(cv, id, colorFor(m, track));
    if (track) el.querySelector('[data-act=mute]').classList.toggle('on', track.mute);
  }
}

/* permanently delete a buffer (stem / source / extract) and every track using it */
function deleteBufferItem(id, meta) {
  session.snapshot();
  const name = meta.name;
  for (const t of [...session.tracks]) {
    if (t.bufferId === id || t.clips.some(c => c.bufferId === id)) {
      session.removeTrack(t.id);
    }
  }
  engine.buffers.delete(id);
  engine._floatCache.delete(id);
  if (ui.sourceId === id) ui.sourceId = null;
  if (view.spectroSourceId === id) view.spectroSourceId = null;
  if (session.selectedClipId) {
    // clip may have vanished with its track
    const still = session.tracks.some(t => t.clips.some(c => c.id === session.selectedClipId));
    if (!still) session.selectedClipId = null;
  }
  if (!engine.buffers.size) $('#btnSeparate').disabled = true;
  if (isPlaying()) { stopPlayback(); startPlayback(session, getPosition()); }
  renderStemList();
  rebuildMixer();
  updateInspector();
  redraw();
  toast('Deleted “' + name + '”');
}
function colorFor(m, track) {
  if (track) return track.color;
  if (m.kind === 'stem') return { vocals: '#a78bfa', drums: '#fb923c', bass: '#34d399', other: '#38bdf8', guitar: '#f472b6', piano: '#facc15' }[m.name.split('·').pop().trim()] || '#38bdf8';
  return '#8b93b8';
}
function paintMiniWave(cv, bufferId, color) {
  const meta = getBufferMeta(bufferId);
  const g = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  if (!meta || !meta.peaks) { requestPeaks(bufferId, () => paintMiniWave(cv, bufferId, color)); return; }
  const lv = meta.peaks[meta.peaks.length - 1];
  g.strokeStyle = color; g.lineWidth = 1.4; g.globalAlpha = .95;
  g.beginPath();
  const mid = H / 2;
  for (let x = 0; x < W; x++) {
    const c = Math.floor((x / W) * lv.cols);
    g.moveTo(x, mid - lv.max[c] * (H / 2 - 2));
    g.lineTo(x, mid - lv.min[c] * (H / 2 - 2));
  }
  g.stroke();
}
function escapeHtml(s) { return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/* ── frequency lab ── */
function renderBands() {
  const t = session.selectedTrack();
  const host = $('#bandList');
  const host2 = $('#bandMini');
  const build = (compact) => {
    const wrap = document.createElement('div');
    wrap.className = 'band-list';
    if (!t) { wrap.innerHTML = '<div class="empty-note">Select a track to edit its frequency bands.</div>'; return wrap; }
    t.bands.list.forEach((b, i) => {
      const row = document.createElement('div');
      row.className = 'band-row' + (t.bandSolo === i ? ' soloed' : '') + (b.mute ? ' muted' : '');
      row.dataset.i = i;
      row.innerHTML = `
        <span class="bname" title="Solo this band">${b.name}</span>
        ${compact ? '' : `<span class="bhz">${b.f1 >= 1000 ? (b.f1 / 1000) + 'k' : b.f1}–${b.f2 >= 1000 ? (b.f2 / 1000) + 'k' : b.f2}</span>`}
        <input type="range" min="-30" max="12" step="0.5" value="${b.gain}">
        <span class="bgain">${b.gain > 0 ? '+' : ''}${b.gain.toFixed(1)}</span>
        <button class="tog bsolo" data-a="mute" title="Mute">M</button>
        <button class="tog bsolo" data-a="solo" title="Solo">S</button>`;
      wrap.appendChild(row);
    });
    return wrap;
  };
  host.innerHTML = '';
  host.appendChild(build(false));
  if (host2) { host2.innerHTML = ''; host2.appendChild(build(true)); }

  const handler = (container) => {
    container.oninput = e => {
      const row = e.target.closest('.band-row'); if (!row || !t) return;
      const i = +row.dataset.i;
      t.bands.list[i].gain = +e.target.value;
      row.querySelector('.bgain').textContent = (t.bands.list[i].gain > 0 ? '+' : '') + t.bands.list[i].gain.toFixed(1);
      applyBandMix(t);
    };
    container.onclick = e => {
      const row = e.target.closest('.band-row'); if (!row || !t) return;
      const i = +row.dataset.i;
      const act = e.target.closest('[data-a]')?.dataset.a;
      session.snapshot();
      if (act === 'mute') t.bands.list[i].mute = !t.bands.list[i].mute;
      else if (act === 'solo') t.bandSolo = t.bandSolo === i ? -1 : i;
      else if (e.target.classList.contains('bname')) t.bandSolo = t.bandSolo === i ? -1 : i;
      else return;
      applyBandMix(t);
      renderBands();
    };
  };
  handler(host); if (host2) handler(host2);
}

async function extractSoloedBand() {
  const t = session.selectedTrack();
  if (!t || !t.clips.length) return toast('Select a track with audio', 'err');
  const i = t.bandSolo >= 0 ? t.bandSolo : 0;
  const band = t.bands.list[i];
  const srcId = t.clips[0].bufferId;
  try {
    showProgress('Extracting band', 0.4, `${band.name} ${band.f1}–${band.f2} Hz`);
    const out = await renderFiltered(srcId, { f0: band.f1, f1: band.f2, fade: true });
    hideProgress();
    const id = addAudioBuffer(`${getBufferMeta(srcId).name} · ${band.name}`, 'extract', out);
    requestPeaks(id);
    session.snapshot();
    const nt = addBufferToTimeline(id, `${band.name} band`);
    nt.color = t.color;
    session.emit('change', 'extract');
    fitZoom();
    toast(`Extracted ${band.name} band`, 'ok');
  } catch (e) { hideProgress(); console.error(e); toast('Extract failed', 'err'); }
}

async function makeUtility(kind) {
  const srcId = separationSourceId();
  if (!srcId) return;
  try {
    const meta = getBufferMeta(srcId);
    let out = null, name = '';
    if (kind === 'normalize') {
      session.snapshot();
      out = normalizeBuffer(srcId, -1);
      if (!out) return toast('Silent buffer', 'err');
      name = meta.name + ' · normalized';
    } else if (kind === 'cancel') {
      out = centerCancel(srcId); name = meta.name + ' · centre-cancel';
    } else if (kind === 'mid' || kind === 'side') {
      const ms = midSideSplit(srcId);
      if (!ms) return;
      out = kind === 'mid' ? ms.mid : ms.side;
      name = meta.name + (kind === 'mid' ? ' · MID' : ' · SIDE');
    }
    const id = addAudioBuffer(name, 'utility', out);
    requestPeaks(id);
    session.snapshot();
    addBufferToTimeline(id, name.split('·').pop().trim());
    session.emit('change', 'utility');
    fitZoom();
    toast('Created ' + name.split('·').pop().trim(), 'ok');
  } catch (e) { console.error(e); toast('Utility failed', 'err'); }
}

/* ═══════ spectrogram isolation ═══════ */
async function isolateSpectroSelection() {
  const s = view.spectroSel;
  if (!s || (s.t1 - s.t0) < 0.02) return toast('Drag a region on the spectrogram first', 'err');
  const srcId = spectroSource();
  if (!srcId) return toast('No audio to isolate', 'err');
  const f0 = Math.max(20, Math.min(s.f0, s.f1)), f1 = Math.min(20000, Math.max(s.f0, s.f1));
  try {
    showProgress('Isolating selection', 0.5, `${f0.toFixed(0)}–${f1.toFixed(0)} Hz · ${(s.t1 - s.t0).toFixed(2)}s`);
    const out = await renderFiltered(srcId, { t0: s.t0, t1: s.t1, f0, f1, fade: true });
    hideProgress();
    const id = addAudioBuffer(`iso ${f0.toFixed(0)}-${f1.toFixed(0)}Hz`, 'extract', out);
    requestPeaks(id);
    session.snapshot();
    const t = addBufferToTimeline(id, `ISO ${f0 < 1000 ? f0.toFixed(0) : (f0 / 1000).toFixed(1) + 'k'}–${f1 < 1000 ? f1.toFixed(0) : (f1 / 1000).toFixed(1) + 'k'}Hz`);
    t.color = '#22d3ee';
    session.emit('change', 'isolate');
    fitZoom();
    toast('Isolated region added as a new track', 'ok');
  } catch (e) { hideProgress(); console.error(e); toast('Isolation failed', 'err'); }
}

/* ═══════ inspector ═══════ */
function wireInspector() {
  $$('.itab').forEach(b => b.addEventListener('click', () => {
    $$('.itab').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    $('#tabTrack').hidden = b.dataset.itab !== 'track';
    $('#tabFx').hidden = b.dataset.itab !== 'fx';
    $('#tabAnalysis').hidden = b.dataset.itab !== 'analysis';
    if (b.dataset.itab === 'analysis') runAnalysis();
  }));

  $('#tName').addEventListener('change', e => {
    const t = session.selectedTrack(); if (!t) return;
    session.snapshot(); t.name = e.target.value; session.emit('change', 'rename'); renderStemList();
  });
  bindSlider('#tGain', v => {
    const t = session.selectedTrack(); if (!t) return;
    t.gain = v; $('#tGainV').textContent = (v > 0 ? '+' : '') + v.toFixed(1) + ' dB';
    updateTrackLevels(session.tracks);
  }, () => session.snapshot());
  bindSlider('#tPan', v => {
    const t = session.selectedTrack(); if (!t) return;
    t.pan = v; $('#tPanV').textContent = Math.abs(v) < 0.02 ? 'C' : (v < 0 ? 'L' : 'R') + Math.round(Math.abs(v) * 100);
    updateTrackLevels(session.tracks);
  }, () => session.snapshot());
  bindSlider('#tWidth', v => {
    const t = session.selectedTrack(); if (!t) return;
    t.fx.width = v; $('#tWidthV').textContent = Math.round(v * 100) + '%';
    debouncedFxUpdate(t);
  }, () => session.snapshot());

  $('#tMute').addEventListener('click', () => {
    const t = session.selectedTrack(); if (!t) return;
    session.snapshot(); t.mute = !t.mute; session.emit('change', 'toggle');
  });
  $('#tSolo').addEventListener('click', () => {
    const t = session.selectedTrack(); if (!t) return;
    session.snapshot(); t.solo = !t.solo; session.emit('change', 'toggle');
  });
  $('#tArm').addEventListener('click', () => {
    switchItab('fx');
  });
  $('#tColor').addEventListener('click', () => {
    const t = session.selectedTrack(); if (!t) return;
    const colors = ['#a78bfa', '#fb923c', '#34d399', '#38bdf8', '#f472b6', '#facc15', '#4ade80', '#60a5fa'];
    session.snapshot();
    t.color = colors[(colors.indexOf(t.color) + 1) % colors.length];
    session.emit('change', 'color');
    renderStemList();
  });

  bindSlider('#cFi', v => { const c = session.selectedClip(); if (c) { c.fadeIn = v; $('#cFiV').textContent = (v * 1000).toFixed(0) + ' ms'; redraw(); } }, () => session.snapshot());
  bindSlider('#cFo', v => { const c = session.selectedClip(); if (c) { c.fadeOut = v; $('#cFoV').textContent = (v * 1000).toFixed(0) + ' ms'; redraw(); } }, () => session.snapshot());
  $('#cNormalize').addEventListener('click', () => {
    const c = session.selectedClip(); if (!c) return;
    session.snapshot();
    const out = normalizeBuffer(c.bufferId, -1);
    if (!out) return toast('Silent clip', 'err');
    const id = addAudioBuffer(getBufferMeta(c.bufferId).name + ' · norm', 'utility', out);
    requestPeaks(id); c.bufferId = id;
    session.emit('change', 'clipNorm'); renderStemList();
  });
  $('#cReverse').addEventListener('click', () => {
    const c = session.selectedClip(); if (!c) return;
    session.snapshot();
    const out = reverseBuffer(c.bufferId);
    if (!out) return;
    const id = addAudioBuffer(getBufferMeta(c.bufferId).name + ' · rev', 'utility', out);
    requestPeaks(id); c.bufferId = id;
    session.emit('change', 'clipRev'); renderStemList();
  });

  $('#bandEnable').addEventListener('change', e => {
    const t = session.selectedTrack(); if (!t) return;
    session.snapshot();
    t.bands.enabled = e.target.checked;
    updateTrackBands(t); renderBands(); redraw();
  });

  wireFx();
  $('#btnAnalyze').addEventListener('click', runAnalysis);
  $('#btnStats').addEventListener('click', runStemStats);
}

function switchItab(name) {
  $$('.itab').forEach(x => x.classList.toggle('active', x.dataset.itab === name));
  $('#tabTrack').hidden = name !== 'track';
  $('#tabFx').hidden = name !== 'fx';
  $('#tabAnalysis').hidden = name !== 'analysis';
  if (name === 'analysis') runAnalysis();
}

function bindSlider(sel, onInput, onGrab) {
  const el = $(sel);
  if (!el) return;
  el.addEventListener('pointerdown', () => onGrab && onGrab());
  el.addEventListener('input', e => onInput(+e.target.value));
}

const fxDebounce = new Map();
function debouncedFxUpdate(track) {
  clearTimeout(fxDebounce.get(track.id));
  fxDebounce.set(track.id, setTimeout(() => updateTrackFx(track), 70));
}

function wireFx() {
  $$('.fxmod').forEach(mod => {
    const key = mod.dataset.fx;
    const toggle = mod.querySelector('[data-on]');
    toggle.addEventListener('change', () => {
      const t = session.selectedTrack(); if (!t) return;
      session.snapshot();
      if (!t.fx[key]) t.fx[key] = {};     // sessions saved before this module existed
      t.fx[key].on = toggle.checked;
      mod.classList.toggle('on', toggle.checked);
      updateTrackFx(t);
      updateFxSummary(mod, t);
    });
    mod.querySelector('header').addEventListener('click', e => {
      if (e.target.closest('.switch')) return;
      toggle.checked = !toggle.checked;
      toggle.dispatchEvent(new Event('change'));
    });
    mod.querySelectorAll('input[type=range]').forEach(inp => {
      const p = inp.dataset.p;
      const out = inp.closest('label').querySelector('output');
      const fmt = v => {
        if (['thr', 'lowG', 'lmG', 'hmG', 'highG', 'ceil'].includes(p)) return (+v).toFixed(1) + ' dB';
        if (['atk', 'rel', 'time'].includes(p)) return (+v) >= 1000 ? (v / 1000).toFixed(1) + ' s' : (+v).toFixed(0) + ' ms';
        if (['ratio'].includes(p)) return (+v).toFixed(1) + ':1';
        if (['mix', 'fb', 'drive', 'size'].includes(p)) return (+v).toFixed(0) + '%';
        if (['decay'].includes(p)) return (+v).toFixed(1) + ' s';
        if (['lmF', 'hmF', 'tone'].includes(p)) return (+v) >= 1000 ? ((+v) / 1000).toFixed(1) + ' kHz' : (+v).toFixed(0) + ' Hz';
        return (+v).toFixed(1);
      };
      inp.addEventListener('pointerdown', () => session.snapshot());
      inp.addEventListener('input', () => {
        const t = session.selectedTrack(); if (!t) return;
        t.fx[key][p] = +inp.value;
        if (out) out.textContent = fmt(inp.value);
        debouncedFxUpdate(t);
        updateFxSummary(mod, t);
      });
      if (out) out.textContent = fmt(inp.value);
    });
  });

  $('#fxPreset').addEventListener('change', e => {
    const preset = e.target.value;
    const t = session.selectedTrack(); if (!t || !preset) return;
    session.snapshot();
    const fx = t.fx;
    for (const k of Object.keys(fx)) if (typeof fx[k] === 'object') fx[k].on = false;
    fx.width = 1;
    if (preset === 'vocal') Object.assign(fx.eq, { on: true, lowG: -4, lmF: 350, lmG: 3, hmF: 4500, hmG: 3.5, highG: 2 }), Object.assign(fx.comp, { on: true, thr: -20, ratio: 3.5, atk: 6, rel: 140, knee: 16 }), Object.assign(fx.reverb, { on: true, mix: 14, decay: 1.3, size: 45 });
    if (preset === 'drums') Object.assign(fx.eq, { on: true, lowG: 3, lmF: 400, lmG: -3, hmF: 5000, hmG: 3, highG: 2 }), Object.assign(fx.comp, { on: true, thr: -16, ratio: 4, atk: 3, rel: 90, knee: 10 }), Object.assign(fx.sat, { on: true, drive: 35, mix: 60, tone: 9000 });
    if (preset === 'bass') Object.assign(fx.eq, { on: true, lowG: 4, lmF: 250, lmG: -4, hmF: 3000, hmG: -2, highG: 0 }), Object.assign(fx.comp, { on: true, thr: -22, ratio: 5, atk: 12, rel: 220, knee: 20 });
    if (preset === 'air') Object.assign(fx.eq, { on: true, lowG: 0, lmF: 800, lmG: -1.5, hmF: 8000, hmG: 4, highG: 5 });
    updateTrackFx(t);
    syncFxUI(t);
    toast('Preset applied: ' + e.target.selectedOptions[0].textContent, 'ok');
    e.target.value = '';
  });
}

function updateFxSummary(mod, t) {
  const em = mod.querySelector('em');
  const key = mod.dataset.fx;
  em.textContent = (t.fx[key] && t.fx[key].on) ? 'on' : 'off';
}
function syncFxUI(t) {
  $$('.fxmod').forEach(mod => {
    const key = mod.dataset.fx;
    const on = !!(t.fx[key] && t.fx[key].on);
    mod.classList.toggle('on', on);
    mod.querySelector('[data-on]').checked = on;
    mod.querySelectorAll('input[type=range]').forEach(inp => {
      const p = inp.dataset.p;
      if (t.fx[key] && t.fx[key][p] !== undefined) {
        inp.value = t.fx[key][p];
        inp.dispatchEvent(new Event('input'));
      }
    });
    updateFxSummary(mod, t);
  });
  $('#tWidth').value = t.fx.width ?? 1;
  $('#tWidthV').textContent = Math.round((t.fx.width ?? 1) * 100) + '%';
}

function updateInspector() {
  const t = session.selectedTrack();
  $('#trackEmpty').hidden = !!t;
  $('#trackBody').hidden = !t;
  $('#fxEmpty').hidden = !!t;
  $('#fxBody').hidden = !t;
  if (!t) { renderBands(); return; }

  if (document.activeElement !== $('#tName')) $('#tName').value = t.name;
  $('#tKind').textContent = t.kind;
  $('#tGain').value = t.gain;
  $('#tGainV').textContent = (t.gain > 0 ? '+' : '') + t.gain.toFixed(1) + ' dB';
  $('#tPan').value = t.pan;
  $('#tPanV').textContent = Math.abs(t.pan) < 0.02 ? 'C' : (t.pan < 0 ? 'L' : 'R') + Math.round(Math.abs(t.pan) * 100);
  $('#tMute').classList.toggle('on', t.mute);
  $('#tSolo').classList.toggle('on', t.solo);
  $('#tColor').style.background = t.color;
  $('#bandEnable').checked = !!t.bands.enabled;
  syncFxUI(t);
  updateClipInspector(session.selectedClip());
  renderBands();
  paintMixerSelection();
}

function updateClipInspector(c) {
  const box = $('#clipInspect');
  box.hidden = !c;
  if (!c) return;
  $('#cStart').textContent = fmtTime(c.start);
  $('#cLen').textContent = c.dur.toFixed(2) + ' s';
  $('#cGainV').textContent = (c.gain > 0 ? '+' : '') + (c.gain || 0).toFixed(1) + ' dB';
  $('#cFi').value = c.fadeIn || 0;
  $('#cFiV').textContent = ((c.fadeIn || 0) * 1000).toFixed(0) + ' ms';
  $('#cFo').value = c.fadeOut || 0;
  $('#cFoV').textContent = ((c.fadeOut || 0) * 1000).toFixed(0) + ' ms';
}

/* ═══════ analysis ═══════ */
async function runAnalysis() {
  const srcId = ui.sourceId || separationSourceId();
  if (!srcId) return;
  const meta = getBufferMeta(srcId);
  const ab = getAudioBuffer(srcId);
  if (!ab) return;
  setProgress(0.3, 'analysing mix…'); showProgress('Analysing', 0.3, 'loudness + spectrum…');
  await new Promise(r => setTimeout(r, 30));
  const L = ab.getChannelData(0), R = ab.numberOfChannels > 1 ? ab.getChannelData(1) : null;
  try {
    const lufs = integratedLoudness(L, R, ab.sampleRate);
    const peak = peakOf(L, R), rms = rmsOf(L, R), corr = correlation(L, R);
    $('#aPeak').textContent = fmtDb(20 * Math.log10(peak + 1e-9));
    $('#aRms').textContent = fmtDb(20 * Math.log10(rms + 1e-9));
    $('#aLufs').textContent = isFinite(lufs) ? lufs.toFixed(1) + ' LUFS' : '—';
    $('#aCorr').textContent = corr.toFixed(2);
    $('#aPeakBar').style.width = clamp((20 * Math.log10(peak + 1e-9) + 60) / 60 * 100, 0, 100) + '%';
    $('#aRmsBar').style.width = clamp((20 * Math.log10(rms + 1e-9) + 60) / 60 * 100, 0, 100) + '%';
    $('#aLufsBar').style.width = clamp((lufs + 40) / 40 * 100, 0, 100) + '%';
    $('#aCorrBar').style.width = clamp((corr + 1) / 2 * 100, 0, 100) + '%';

    const bands = bandEnergies(L, R, ab.sampleRate);
    const maxDb = Math.max(...bands.map(b => b.db), -40);
    $('#bandEnergy').innerHTML = bands.map(b => `
      <div class="be-row"><span class="bn">${b.name}</span>
      <span class="bt"><i style="width:${clamp(((b.db - (maxDb - 40)) / 40) * 100, 2, 100)}%"></i></span>
      <span class="bv">${b.db.toFixed(1)}</span></div>`).join('');
    drawAnalyzerSnapshot(ab);
    toast('Analysis complete', 'ok');
  } catch (e) { console.error(e); toast('Analysis failed', 'err'); }
  hideProgress();
}

function drawAnalyzerSnapshot(ab) {
  const cv = $('#analyzerCanvas');
  if (!cv) return;
  const dpr = Math.min(2, devicePixelRatio || 1);
  const r = cv.parentElement.getBoundingClientRect();
  cv.width = r.width * dpr; cv.height = r.height * dpr;
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = r.width, H = r.height;
  g.fillStyle = '#05070f'; g.fillRect(0, 0, W, H);
  const L = ab.getChannelData(0);
  const N = 4096, bins = N / 2;
  const step = Math.max(N, Math.floor(L.length / 200));
  const acc = new Float64Array(bins);
  let frames = 0;
  const re = new Float32Array(N), im = new Float32Array(N);
  const w = new Float32Array(N);
  for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  for (let s = 0; s + N <= L.length && frames < 160; s += step) {
    for (let i = 0; i < N; i++) { re[i] = L[s + i] * w[i]; im[i] = 0; }
    fftSimple(re, im);
    for (let i = 0; i < bins; i++) acc[i] += Math.hypot(re[i], im[i]);
    frames++;
  }
  const sr = ab.sampleRate;
  const fMin = 20, fMax = sr / 2;
  const lx = f => (Math.log(f / fMin) / Math.log(fMax / fMin)) * (W - 10) + 5;
  g.beginPath();
  let started = false;
  for (let i = 1; i < bins; i++) {
    const f = (i * sr) / N;
    if (f < fMin) continue;
    const db = 20 * Math.log10(acc[i] / Math.max(1, frames) + 1e-9);
    const y = H - 6 - clamp((db + 90) / 90, 0, 1) * (H - 14);
    const x = lx(f);
    if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y);
  }
  g.strokeStyle = '#22d3ee'; g.lineWidth = 1.4;
  g.shadowColor = '#22d3ee'; g.shadowBlur = 6;
  g.stroke(); g.shadowBlur = 0;
  g.fillStyle = '#6d769c'; g.font = '9px "JetBrains Mono"';
  g.fillText('avg spectrum · 20 Hz–' + (fMax >= 1000 ? (fMax / 1000).toFixed(1) + ' kHz' : fMax + ' Hz'), 8, 12);
}
function fftSimple(re, im) {
  const n = re.length;
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
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

async function runStemStats() {
  const stems = [...engine.buffers.entries()].filter(([, m]) => m.kind === 'stem');
  if (!stems.length) return toast('Run separation first');
  showProgress('Stem statistics', 0.5, 'measuring…');
  const rows = [];
  for (const [id, m] of stems) {
    const ab = getAudioBuffer(id);
    if (!ab) continue;
    const L = ab.getChannelData(0), R = ab.numberOfChannels > 1 ? ab.getChannelData(1) : null;
    const peak = 20 * Math.log10(peakOf(L, R) + 1e-9);
    const rms = 20 * Math.log10(rmsOf(L, R) + 1e-9);
    const corr = correlation(L, R);
    rows.push({ name: m.name.split('·').pop().trim(), peak, rms, corr });
    setProgress(0.5 + 0.5 * (rows.length / stems.length), m.name);
    await new Promise(r => setTimeout(r, 10));
  }
  $('#stemStats').innerHTML = rows.map(r => `
    <div class="ss-row"><span>${escapeHtml(r.name)}</span>
    <b>pk ${fmtDb(r.peak)} · rms ${fmtDb(r.rms)} · corr ${r.corr.toFixed(2)}</b></div>`).join('');
  hideProgress();
}

/* ═══════ mixer ═══════ */
function wireMixer() {
  $('#masterGain').addEventListener('input', e => {
    const v = +e.target.value;
    $('#masterGainV').textContent = (v > 0 ? '+' : '') + v.toFixed(1);
    setMasterGain(v);
    savePrefs();
  });
  $('#btnMasterLimiter').addEventListener('click', e => {
    setLimiter(!engine.limiterOn);
    e.currentTarget.classList.toggle('active', engine.limiterOn);
    savePrefs();
  });
}

function rebuildMixer() {
  const host = $('#mixerStrips');
  host.innerHTML = '';
  for (const t of session.tracks) {
    const el = document.createElement('div');
    el.className = 'strip' + (t.id === session.selectedTrackId ? ' sel' : '');
    el.dataset.id = t.id;
    el.innerHTML = `
      <div class="sname" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</div>
      <div class="sbody">
        <div class="meterbox"><i></i></div>
        <div class="fader"><input type="range" min="-60" max="12" step="0.1" value="${t.gain}" orient="vertical"></div>
      </div>
      <div class="pan mono">${t.pan === 0 ? 'C' : (t.pan < 0 ? 'L' : 'R') + Math.round(Math.abs(t.pan) * 100)}</div>
      <div class="toggles">
        <button class="tog ${t.mute ? 'on' : ''}" data-a="mute">M</button>
        <button class="tog solo ${t.solo ? 'on' : ''}" data-a="solo">S</button>
      </div>`;
    el.addEventListener('click', e => {
      const act = e.target.closest('[data-a]')?.dataset.a;
      if (act) {
        session.snapshot();
        if (act === 'mute') t.mute = !t.mute; else t.solo = !t.solo;
        session.emit('change', 'toggle');
        return;
      }
      session.selectedTrackId = t.id;
      updateInspector(); paintMixerSelection(); redraw();
    });
    el.querySelector('input[type=range]').addEventListener('input', ev => {
      t.gain = +ev.target.value;
      updateTrackLevels(session.tracks);
      if (session.selectedTrackId === t.id) { $('#tGain').value = t.gain; $('#tGainV').textContent = (t.gain > 0 ? '+' : '') + t.gain.toFixed(1) + ' dB'; }
    });
    el.querySelector('input[type=range]').addEventListener('pointerdown', () => session.snapshot());
    host.appendChild(el);
  }
  paintMixerSelection();
}
function paintMixerSelection() {
  $$('#mixerStrips .strip').forEach(s => s.classList.toggle('sel', s.dataset.id === session.selectedTrackId));
}

/* ═══════ per-frame tick ═══════ */
function onTick(pos) {
  $('#timeDisplay').textContent = fmtTime(pos);
  const now = performance.now();
  if (now - ui.lastMeterPaint < 60) return;
  ui.lastMeterPaint = now;
  ui.meters = readMeters();

  // mixer meters
  $$('#mixerStrips .strip').forEach(s => {
    const m = ui.meters.tracks[s.dataset.id];
    const bar = s.querySelector('.meterbox i');
    if (bar) bar.style.height = (m ? clamp(m.peak, 0, 1) * 100 : 0) + '%';
  });
  // master meter
  const mc = $('#masterMeter');
  if (mc) {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const r = mc.getBoundingClientRect();
    if (mc.width !== Math.floor(r.width * dpr)) { mc.width = Math.floor(r.width * dpr); mc.height = Math.floor(r.height * dpr); }
    const g = mc.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, r.width, r.height);
    const p = clamp(ui.meters.master, 0, 1);
    const grad = g.createLinearGradient(0, r.height, 0, 0);
    grad.addColorStop(0, '#3ddc97'); grad.addColorStop(.7, '#ffb84d'); grad.addColorStop(1, '#ff5c72');
    g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(0, 0, r.width, r.height);
    g.fillStyle = grad;
    const hh = r.height * p;
    g.fillRect(0, r.height - hh, r.width, hh);
    // peak hold
    ui.peakHold = Math.max(ui.peakHold || 0, p) * 0.985;
    g.fillStyle = '#fff';
    g.fillRect(0, r.height - r.height * ui.peakHold - 1, r.width, 1.5);
  }
  // analysis cards
  if (!$('#tabAnalysis').hidden) {
    $('#aPeak').textContent = fmtDb(ui.meters.peak);
    $('#aRms').textContent = fmtDb(ui.meters.rms);
    $('#aPeakBar').style.width = clamp((ui.meters.peak + 60) / 60 * 100, 0, 100) + '%';
    $('#aRmsBar').style.width = clamp((ui.meters.rms + 60) / 60 * 100, 0, 100) + '%';
    const an = $('#analyzerCanvas');
    if (an && engine.master) drawLiveMini(an, engine.master.analyser);
  }
}

function drawLiveMini(cv, analyser) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const r = cv.parentElement.getBoundingClientRect();
  if (cv.width !== Math.floor(r.width * dpr)) { cv.width = Math.floor(r.width * dpr); cv.height = Math.floor(r.height * dpr); }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = 'rgba(5,7,15,.55)';
  g.fillRect(0, 0, r.width, r.height);
  const d = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatFrequencyData(d);
  const sr = engine.ctx.sampleRate;
  const lx = f => (Math.log(f / 20) / Math.log((sr / 2) / 20)) * (r.width - 6) + 3;
  g.beginPath();
  let started = false;
  for (let i = 1; i < d.length; i++) {
    const f = (i * sr) / (analyser.fftSize * 2);
    if (f < 20 || f > sr / 2) continue;
    const y = r.height - 4 - clamp((d[i] + 100) / 100, 0, 1) * (r.height - 10);
    const x = lx(f);
    if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y);
  }
  g.strokeStyle = '#7c5cff'; g.lineWidth = 1.3;
  g.shadowColor = '#7c5cff'; g.shadowBlur = 5;
  g.stroke(); g.shadowBlur = 0;
}

/* ═══════ dialogs ═══════ */
function wireDialogs() {
  $('#btnExport').addEventListener('click', openExport);
  $('#btnSave').addEventListener('click', () => saveSession(false));
  $('#btnSettings').addEventListener('click', openSettings);
  $('#modalClose').addEventListener('click', closeModal);
  $('.modal-backdrop').addEventListener('click', closeModal);
}

function openModal(title, bodyHtml, footHtml) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = bodyHtml;
  $('#modalFoot').innerHTML = footHtml;
  $('#modalRoot').hidden = false;
}
function closeModal() { $('#modalRoot').hidden = true; }

function openExport() {
  const bufCount = engine.buffers.size;
  if (!bufCount) return toast('Nothing to export yet', 'err');
  const mutedCount = session.tracks.filter(t => t.mute).length;
  openModal('Export audio & project', `
    <div class="form-row"><label>Scope</label>
      <div class="opts" id="expScope">
        <div class="opt-chip on" data-v="mix"><b>Mixdown</b><small>full session as one file</small></div>
        <div class="opt-chip" data-v="selection"><b>Selection</b><small>time range only</small></div>
        <div class="opt-chip" data-v="track"><b>Selected track</b><small>bounced with FX</small></div>
        <div class="opt-chip" data-v="stems"><b>All stems</b><small>zip of WAVs</small></div>
      </div></div>
    <div class="form-row"><label>Format</label>
      <div class="opts" id="expFormat">
        <div class="opt-chip on" data-v="24"><b>WAV 24-bit</b><small>studio</small></div>
        <div class="opt-chip" data-v="16"><b>WAV 16-bit</b><small>CD</small></div>
        <div class="opt-chip" data-v="32"><b>WAV 32-float</b><small>uncompressed</small></div>
        <div class="opt-chip" data-v="mp3_128"><b>MP3 128</b><small>kbps small</small></div>
        <div class="opt-chip" data-v="mp3_192"><b>MP3 192</b><small>kbps</small></div>
        <div class="opt-chip" data-v="mp3_320"><b>MP3 320</b><small>kbps max</small></div>
      </div></div>
    <div class="form-row"><label>Master</label>
      <div class="opts" id="expNorm">
        <div class="opt-chip on" data-v="lim"><b>Through limiter</b></div>
        <div class="opt-chip" data-v="raw"><b>Raw sum</b></div>
      </div></div>
    <div class="note">Mixdown renders every visible clip through its track FX, band-split and master chain.
    <b>Muted tracks and soloed-out tracks are not mixed in</b>, just like any DAW.${mutedCount ? ` (${mutedCount} track${mutedCount > 1 ? 's' : ''} currently muted)` : ''}
    When supported by your browser (Chrome / Edge / Safari), you pick the exact save location and filename; otherwise the file is downloaded.</div>
    <div class="form-row"><label>Project bundle</label>
      <div class="btn-row" style="margin-top:0">
        <button class="soft-btn small" id="expSaveBundle">Save bundle (audio + project)</button>
        <button class="soft-btn small" id="expSaveJson">Save project JSON</button>
        <button class="soft-btn small" id="expOpenJson">Open project…</button>
        <input type="file" id="expOpenFile" accept=".json,application/json" hidden>
      </div></div>
  `, `
    <button class="soft-btn" id="expCancel">Cancel</button>
    <button class="primary-btn" id="expGo">Export audio</button>`);
  chipGroup('#expScope'); chipGroup('#expFormat'); chipGroup('#expNorm');
  $('#expCancel').onclick = closeModal;
  $('#expGo').onclick = doExport;
  $('#expSaveBundle').onclick = () => { closeModal(); saveSession(true); };
  $('#expSaveJson').onclick = () => { closeModal(); saveSession(false); };
  $('#expOpenJson').onclick = () => $('#expOpenFile').click();
  $('#expOpenFile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { await loadSessionJson(await f.text()); closeModal(); await refreshAfterLoad(); }
    catch (err) { console.error(err); toast('Open failed: ' + err.message, 'err'); }
    e.target.value = '';
  };
}

/* after loading a session from JSON: rebuild engine + mixer + inspector */
async function refreshAfterLoad() {
  rebuildGraphsIfNeeded();
  rebuildMixer();
  renderStemList();
  if (ui.sourceId) setSource(ui.sourceId);
  updateTotalTime(); updateInspector(); redraw(); fitZoom();
}

function chipGroup(sel) {
  const host = $(sel);
  host.onclick = e => {
    const c = e.target.closest('.opt-chip');
    if (!c) return;
    host.querySelectorAll('.opt-chip').forEach(x => x.classList.remove('on'));
    c.classList.add('on');
  };
}
const chipVal = sel => $(sel + ' .opt-chip.on')?.dataset.v;

async function doExport() {
  const scope = chipVal('#expScope'), fmt = chipVal('#expFormat') || '24', norm = chipVal('#expNorm');
  closeModal();
  try {
    const isMp3 = fmt.startsWith('mp3');
    const ext = isMp3 ? 'mp3' : 'wav';
    if (scope === 'stems') {
      showProgress('Exporting stems', 0.2, 'encoding WAVs…');
      const files = [];
      const entries = [...engine.buffers.entries()].filter(([, m]) => m.kind === 'stem');
      const use = entries.length ? entries : [...engine.buffers.entries()];
      let i = 0;
      for (const [id, m] of use) {
        const blob = bufferToWavBlob(id, fmt === '32' ? 32 : 16);
        const buf = new Uint8Array(await blob.arrayBuffer());
        files.push({ name: safeName(m.name) + '.wav', data: buf });
        setProgress(0.2 + 0.7 * (++i / use.length), m.name);
        await new Promise(r => setTimeout(r, 5));
      }
      hideProgress();
      const saved = await saveBlob(makeZip(files), safeName(session.name) + ' — stems.zip', 'zip', 'ZIP archive');
      toast(saved ? `Exported ${files.length} stems` : 'Save cancelled', saved ? 'ok' : '');
      return;
    }

    showProgress('Rendering', 0.25, 'offline bounce…');
    let out, name;
    if (scope === 'track') {
      const t = session.selectedTrack();
      if (!t) throw new Error('Select a track first');
      out = await renderSession(session, { trackIds: [t.id], masterDb: 0 });
      name = session.name + ' — ' + t.name;
    } else if (scope === 'selection' && session.selection) {
      out = await renderSession(session, { from: session.selection.start, to: session.selection.end, masterDb: 0 });
      name = session.name + ' — selection';
    } else {
      out = await renderSession(session, { masterDb: 0 });
      name = session.name + ' — mixdown';
    }
    setProgress(0.8, isMp3 ? 'encoding MP3…' : 'encoding WAV…');
    const chans = [];
    for (let c = 0; c < out.numberOfChannels; c++) chans.push(out.getChannelData(c));
    const blob = isMp3
      ? encodeMp3(chans, out.sampleRate, parseInt(fmt.split('_')[1], 10) || 192)
      : encodeWav(chans, out.sampleRate, fmt === '32' ? 32 : +fmt);
    hideProgress();
    const saved = await saveBlob(blob, safeName(name) + '.' + ext, ext, isMp3 ? 'MP3 audio' : 'WAV audio');
    toast(saved ? 'Saved ' + safeName(name) + '.' + ext : 'Save cancelled', saved ? 'ok' : '');
  } catch (e) {
    hideProgress();
    console.error(e);
    toast('Export failed: ' + e.message, 'err');
  }
}
function safeName(s) { return s.replace(/[^\w\s.\-–·]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'prism'; }

function saveSession(embed) {
  const data = session.serialize();
  data.sourceId = ui.sourceId;
  data.audio = {};
  if (embed) {
    for (const [id, m] of engine.buffers) {
      try {
        const blob = bufferToWavBlob(id, 16);
        // base64
        data.audio[id] = null; // filled async below
      } catch (e) { }
    }
  }
  if (!embed) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    saveBlob(blob, safeName(session.name) + '.prism.json', '.json', 'PRISM session').then(ok => {
      toast(ok ? 'Session saved (metadata only — audio stays in this tab)' : 'Save cancelled', ok ? 'ok' : '');
    });
    return;
  }
  openModal('Save project bundle',
    `<div class="note">Embedding all audio makes the project fully self-contained —
    open it later and everything is restored exactly as you left it.</div>
     <div class="form-row"><label>Embedding format</label><div class="opts" id="embFmt">
       <div class="opt-chip on" data-v="16"><b>16-bit WAV</b><small>small</small></div>
       <div class="opt-chip" data-v="32"><b>32-float WAV</b><small>untouched</small></div></div></div>`,
    `<button class="soft-btn" id="embCancel">Cancel</button><button class="primary-btn" id="embGo">Save bundle</button>`);
  chipGroup('#embFmt');
  $('#embCancel').onclick = closeModal;
  $('#embGo').onclick = async () => {
    closeModal();
    const bit = chipVal('#embFmt') || '16';
    showProgress('Saving project bundle', 0.2, 'encoding buffers…');
    for (const [id, m] of engine.buffers) {
      try {
        const blob = bufferToWavBlob(id, bit === '32' ? 32 : 16);
        const u8 = new Uint8Array(await blob.arrayBuffer());
        data.audio[id] = b64(u8);
      } catch (e) { console.warn(e); }
      await new Promise(r => setTimeout(r, 2));
    }
    hideProgress();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const saved = await saveBlob(blob, safeName(session.name) + '.prism.json', '.json', 'PRISM project bundle');
    toast(saved ? 'Project bundle saved' : 'Save cancelled', saved ? 'ok' : '');
  };
}
function b64(u8) {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) s += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  return btoa(s);
}

export async function loadSessionJson(json) {
  const data = JSON.parse(json);
  if (data.app !== 'prism') throw new Error('Not a PRISM session');
  session.snapshot();
  session.name = data.name || 'Session';
  session.bpm = data.bpm || 120;
  $('#projectName').value = session.name;
  session.tracks = data.tracks || [];
  session.markers = data.markers || [];
  session.markersHidden = !!data.markersHidden;
  // restore buffers metadata; decode embedded audio
  engine.buffers.clear();
  const missing = new Map();
  for (const b of data.buffers || []) {
    if (data.audio && data.audio[b.id]) {
      const u8 = atobToU8(data.audio[b.id]);
      try {
        const ab = await ensureCtx().decodeAudioData(u8.buffer);
        engine.buffers.set(b.id, { id: b.id, name: b.name, kind: b.kind, buffer: ab, i16: null, sr: ab.sampleRate, length: ab.length, duration: ab.duration, channels: ab.numberOfChannels, peaks: null });
        requestPeaks(b.id);
      } catch (e) { missing.set(b.name, b.id); }
    } else missing.set(b.name, b.id);
  }
  ui.pendingRelink = missing;
  rebuildGraphs(session.tracks);
  rebuildMixer();
  session.emit('change', 'load');
  fitZoom();
  toast(missing.size ? `Loaded — ${missing.size} buffer(s) need re-import to relink` : 'Session loaded', missing.size ? '' : 'ok');
}
function atobToU8(b64) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

function openSettings() {
  openModal('Engine settings', `
    <div class="form-row"><label>Default separation mode</label>
      <select id="setMode">
        <option value="fast">Fast — live preview</option>
        <option value="studio">Studio — balanced (default)</option>
        <option value="deep">Deep — dual-pass refinement</option>
      </select></div>
    <div class="form-row"><label>Default analysis resolution</label>
      <select id="setRes">
        <option value="0">Full — source sample-rate</option>
        <option value="1">Balanced — 32 kHz (default)</option>
        <option value="2">Draft — 22 kHz</option>
      </select></div>
    <div class="note">PRISM runs 100 % on-device: no uploads, no API keys, no network after load.
    Deep mode doubles CPU (two refinement passes) — ideal on desktop, use Studio on phones.</div>
    <div class="form-row"><label>Session</label>
      <div class="opts">
        <div class="opt-chip" id="setSaveMeta">Save session (JSON)</div>
        <div class="opt-chip" id="setSaveEmbed">Save + embed audio</div>
        <div class="opt-chip" id="setLoad">Load session…</div>
        <input type="file" id="setLoadFile" accept=".json,application/json" hidden>
      </div></div>
  `, `<button class="soft-btn" id="setClose">Close</button><button class="primary-btn" id="setApply">Apply</button>`);
  $('#setMode').value = ui.sepMode;
  $('#setRes').value = $('#pRes').value;
  $('#setClose').onclick = closeModal;
  $('#setApply').onclick = () => {
    ui.sepMode = $('#setMode').value;
    $$('#sepModes .mode').forEach(x => x.classList.toggle('active', x.dataset.mode === ui.sepMode));
    $('#pRes').value = $('#setRes').value;
    savePrefs();
    closeModal();
    toast('Settings applied', 'ok');
  };
  $('#setSaveMeta').onclick = () => { closeModal(); saveSession(false); };
  $('#setSaveEmbed').onclick = () => { closeModal(); saveSession(true); };
  $('#setLoad').onclick = () => $('#setLoadFile').click();
  $('#setLoadFile').onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    try { await loadSessionJson(await f.text()); closeModal(); }
    catch (err) { toast('Load failed: ' + err.message, 'err'); }
  };
}

/* ═══════ progress overlay ═══════ */
let progVisible = false;
export function showProgress(title, p = 0, sub = '') {
  progVisible = true;
  $('#progressOverlay').hidden = false;
  $('#progTitle').textContent = title;
  $('#progBar').style.width = (p * 100) + '%';
  $('#progSub').textContent = sub;
  $('#progDetail').textContent = '';
}
export function setProgress(p, sub) {
  if (!progVisible) return;
  if (p !== null && p !== undefined && !isNaN(p)) $('#progBar').style.width = clamp(p * 100, 0, 100) + '%';
  if (sub) $('#progSub').textContent = sub;
}
export function hideProgress() {
  progVisible = false;
  $('#progressOverlay').hidden = true;
}

/* ═══════ keyboard ═══════ */
function wireKeyboard() {
  window.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
      if (e.key === 'Escape') e.target.blur();
      return;
    }
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); return; }
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveSession(false); return; }
    if (mod && e.key.toLowerCase() === 'e') { e.preventDefault(); openExport(); return; }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); if (session.duplicateSelection()) redraw(); return; }
    if (mod && e.key === '=') { e.preventDefault(); zoomBy(1.3); return; }
    if (mod && e.key === '-') { e.preventDefault(); zoomBy(1 / 1.3); return; }

    switch (e.key) {
      case ' ': e.preventDefault(); togglePlay(); break;
      case '.': $('#btnStop').click(); break;
      case 'l': case 'L': $('#btnLoop').click(); break;
      case 'v': case 'V': selectToolBtn('select'); break;
      case 'r': case 'R': selectToolBtn('razor'); break;
      case 't': case 'T': selectToolBtn('range'); break;
      case 's': case 'S': $('#btnSplit').click(); break;
      case 'Delete': case 'Backspace': e.preventDefault(); deleteSelection(); break;
      case 'ArrowLeft': e.preventDefault(); nudge(e.shiftKey ? -5 : -1); break;
      case 'ArrowRight': e.preventDefault(); nudge(e.shiftKey ? 5 : 1); break;
      case 'Home': session.playhead = 0; if (isPlaying()) { stopPlayback(); startPlayback(session, 0); } redraw(); break;
      case 'End': session.playhead = session.duration(); if (isPlaying()) stopPlayback(); redraw(); break;
      case 'm': case 'M': { const t = session.selectedTrack(); if (t) { session.snapshot(); t.mute = !t.mute; session.emit('change', 'toggle'); } break; }
      case 'f': case 'F': fitZoom(); break;
      case '1': setTabView('lanes'); break;
      case '2': setTabView('spectro'); break;
      case '3': setTabView('spectrum'); break;
      case 'Escape': if (!$('#modalRoot').hidden) closeModal(); else { session.selection = null; view.spectroSel = null; redraw(); } break;
    }
  });
}
function setTabView(v) {
  $$('.vtab').forEach(x => x.classList.toggle('active', x.dataset.view === v));
  setView(v);
}
function selectToolBtn(tool) {
  $$('#editTools .tool').forEach(x => x.classList.toggle('active', x.dataset.tool === tool));
  setTool(tool);
}
function nudge(d) {
  session.playhead = clamp(session.playhead + d, 0, Math.max(session.duration(), 0));
  if (isPlaying()) { stopPlayback(); startPlayback(session, session.playhead); }
  ensureVisible(session.playhead);
  redraw();
}

/* ═══════ mobile ═══════ */
function wireMobile() {
  $$('#mobileTabs button').forEach(b => b.addEventListener('click', () => {
    const m = b.dataset.m;
    $$('#mobileTabs button').forEach(x => x.classList.toggle('active', x === b));
    $('#leftPanel').classList.toggle('open', m === 'left');
    $('#rightPanel').classList.toggle('open', m === 'right');
    $('#mixer').style.display = m === 'mix' ? '' : '';
    document.getElementById('app').dataset.mobile = m;
    setTimeout(() => { resizeRedraw(); }, 300);
  }));
}
function resizeRedraw() {
  import('./views.js').then(v => { v.resize(); v.redraw(); });
}

/* ═══════ prefs ═══════ */
function savePrefs() {
  try {
    localStorage.setItem('prism.prefs', JSON.stringify({
      mode: ui.sepMode, aiModel: $('#aiModelSel') ? $('#aiModelSel').value : 'htdemucs_ft',
      fft: $('#pFft').value, center: $('#pCenter').value, harm: $('#pHarm').value,
      trans: $('#pTrans').value, sharp: $('#pSharp').value, bleed: $('#pBleed').value, res: $('#pRes').value,
      master: $('#masterGain').value, limiter: engine.limiterOn
    }));
  } catch (e) { }
}
function restorePrefs() {
  try {
    const p = JSON.parse(localStorage.getItem('prism.prefs') || '{}');
    if (p.mode) {
      ui.sepMode = p.mode === 'ai' ? 'ai' : p.mode;
      $$('#sepModes .mode').forEach(x => x.classList.toggle('active', x.dataset.mode === ui.sepMode));
    }
    if (MOBILE_AI_BLOCKED && ui.sepMode === 'ai') {
      ui.sepMode = 'fast';
      $$('#sepModes .mode').forEach(x => x.classList.toggle('active', x.dataset.mode === 'fast'));
    }
    if (p.aiModel && $('#aiModelSel')) $('#aiModelSel').value = p.aiModel;
    const map = { fft: 'pFft', center: 'pCenter', harm: 'pHarm', trans: 'pTrans', sharp: 'pSharp', bleed: 'pBleed', res: 'pRes' };
    for (const [k, id] of Object.entries(map)) {
      if (p[k] !== undefined && $('#' + id)) {
        $('#' + id).value = p[k];
        $('#' + id).dispatchEvent(new Event('input'));
        $('#' + id).dispatchEvent(new Event('change'));
      }
    }
    if (p.master !== undefined) { $('#masterGain').value = p.master; $('#masterGainV').textContent = (+p.master).toFixed(1); setMasterGain(+p.master); }
    if (p.limiter !== undefined) { setLimiter(p.limiter); $('#btnMasterLimiter').classList.toggle('active', p.limiter); }
  } catch (e) { }
}
