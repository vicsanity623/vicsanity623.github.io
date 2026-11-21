/* ═══════════════════════════════════════════════════════════════
   PRISM views — ruler, multitrack lanes, overlay, spectrogram,
   spectrum analyser, meters.  All canvas, DPR-aware.
   ═══════════════════════════════════════════════════════════════ */

import { $, clamp, fmtTime, toast } from './utils.js?v=11';
import { session } from './session.js?v=11';
import {
  engine, ensureCtx, getAudioBuffer, getBufferMeta, requestPeaks,
  workerRequest, getPosition, isPlaying, startPlayback, stopPlayback
} from './audio-engine.js?v=11';
import { colormap, samplePeaks } from './dsp.js?v=11';

export const view = {
  dpr: 1, w: 0, h: 0, headerW: 134, laneH: 84, trackScroll: 0,
  hover: null, drag: null, spectroSel: null, spectroData: null, spectroKey: '',
  spectroBusy: false, spectroSourceId: null, mouse: { x: -1, y: -1, inLanes: false },
  analyserData: null, lastSpectroReq: 0,
  autoLaneH: 84
};
const RESIZE_H = 6;          // px — hit zone at the very bottom of each lane

let hooks = {};
const els = {};
let raf = 0;

export function initViews(h) {
  hooks = h;
  els.ruler = $('#rulerCanvas');
  els.lanes = $('#lanesCanvas');
  els.overlay = $('#overlayCanvas');
  els.playhead = $('#playhead');
  els.lanesWrap = $('#lanesWrap');
  els.spectro = $('#spectroCanvas');
  els.spectroOverlay = $('#spectroOverlay');
  els.spectroWrap = $('#spectroWrap');
  els.spectroBusy = $('#spectroBusy');
  els.spectrum = $('#spectrumCanvas');
  els.spectrumWrap = $('#spectrumWrap');

  resize();
  window.addEventListener('resize', () => { resize(); redraw(); });

  bindPointer(els.lanes, 'lanes');
  bindPointer(els.ruler, 'ruler');
  bindPointer(els.spectro, 'spectro');
  els.lanesWrap.addEventListener('wheel', onWheel, { passive: false });
  els.spectroWrap.addEventListener('wheel', onWheel, { passive: false });

  engine.on('peaks', () => redraw());
  session.on('change', () => { redraw(); });
  loop();
}

export function resize() {
  const dpr = view.dpr = Math.min(2, window.devicePixelRatio || 1);
  for (const c of [els.ruler, els.lanes, els.overlay, els.spectro, els.spectroOverlay, els.spectrum]) {
    if (!c) continue;
    const r = c.parentElement.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;   // parent hidden — keep last known size
    c.width = Math.max(1, Math.floor(r.width * dpr));
    c.height = Math.max(1, Math.floor(r.height * dpr));
    c.style.width = r.width + 'px'; c.style.height = r.height + 'px';
  }
  if (els.lanes.width) { view.w = els.lanes.width / dpr; view.h = els.lanes.height / dpr; }
}

/* ── coordinates ── */
export const timeToX = t => (t - session.scroll) * session.zoom + view.headerW;
export const xToTime = x => (x - view.headerW) / session.zoom + session.scroll;

function laneHeight(track) {
  return track.height || view.autoLaneH || 84;
}
function trackHeightsTotal() {
  let sum = 0;
  for (const t of session.tracks) sum += laneHeight(t);
  return sum;
}
function layoutLanes() {
  const n = Math.max(1, session.tracks.length);
  view.autoLaneH = clamp((view.h - 4) / n, 46, 132);
  const total = trackHeightsTotal();
  if (total <= view.h) view.trackScroll = 0;
  else view.trackScroll = clamp(view.trackScroll, 0, total - view.h);
}
function trackAtY(y) {
  let laneTop = -view.trackScroll;
  for (let i = 0; i < session.tracks.length; i++) {
    const track = session.tracks[i];
    const h = laneHeight(track);
    if (y >= laneTop && y < laneTop + h) return { track, idx: i, y0: laneTop, laneH: h };
    laneTop += h;
  }
  return null;
}
/* absolute top (scroll-relative) of a track's lane — used while drawing */
function laneTopOf(trackId) {
  let y = 0;
  for (const t of session.tracks) {
    if (t.id === trackId) return y;
    y += laneHeight(t);
  }
  return 0;
}

/* ── public controls ── */
export function setView(name) {
  session.view = name;
  els.lanesWrap.hidden = name !== 'lanes';
  els.spectroWrap.hidden = name !== 'spectro';
  els.spectrumWrap.hidden = name !== 'spectrum';
  resize();
  if (name === 'spectro') requestSpectro(true);
  redraw();
}
export function setTool(t) { session.tool = t; }
export function fitZoom() {
  const d = Math.max(1, session.duration());
  session.zoom = clamp((view.w - view.headerW - 20) / d, 2, 4000);
  session.scroll = 0;
  syncZoomSlider();
  redraw();
}
export function zoomBy(f, anchorX = view.w / 2) {
  const t = xToTime(anchorX);
  session.zoom = clamp(session.zoom * f, 1, 6000);
  session.scroll = Math.max(0, t - (anchorX - view.headerW) / session.zoom);
  syncZoomSlider(); redraw(); requestSpectro();
}
function syncZoomSlider() {
  const sl = $('#zoomRange');
  if (!sl) return;
  const v = Math.log(session.zoom / 1) / Math.log(6000);
  sl.value = String(clamp(Math.round(v * 100), 0, 100));
}
export function zoomFromSlider(v) { session.zoom = Math.exp((v / 100) * Math.log(6000)); redraw(); requestSpectro(); }
export function ensureVisible(t) {
  const x = timeToX(t);
  if (x < view.headerW + 10) session.scroll = Math.max(0, t - 1);
  else if (x > view.w - 10) session.scroll = t - (view.w - view.headerW - 10) / session.zoom;
  redraw();
}

/* ── redraw ─────────────────────────────────────── */
export function redraw() {
  if (!els.ruler || !els.lanes) return;   // views not initialised yet
  layoutLanes();
  const empty = $('#lanesEmpty');
  if (empty) empty.hidden = session.tracks.length > 0;
  if (session.view === 'lanes') { drawRuler(); drawLanes(); drawOverlay(); }
  else if (session.view === 'spectro') { drawRuler(); drawSpectro(); drawSpectroOverlay(); }
  else { drawRuler(); }
  updateStatus();
}

function ctx2d(c) {
  const g = c.getContext('2d');
  g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  g.clearRect(0, 0, c.width / view.dpr, c.height / view.dpr);
  return g;
}

function niceStep(minPx) {
  const steps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800];
  for (const s of steps) if (s * session.zoom >= minPx) return s;
  return 3600;
}

function drawRuler() {
  const g = ctx2d(els.ruler);
  const w = view.w;
  g.fillStyle = 'rgba(8,11,24,.55)';
  g.fillRect(0, 0, w, 30);
  const step = niceStep(64);
  const t0 = Math.max(0, session.scroll), t1 = session.scroll + w / session.zoom;
  g.strokeStyle = 'rgba(255,255,255,.16)';
  g.lineWidth = 1;
  g.font = '10px "JetBrains Mono", monospace';
  g.fillStyle = '#8f98bd';
  const start = Math.ceil(t0 / step) * step;
  for (let t = start; t <= t1; t += step) {
    const x = Math.round(timeToX(t)) + .5;
    g.beginPath(); g.moveTo(x, 14); g.lineTo(x, 30); g.stroke();
    const label = step < 1 ? t.toFixed(2) : fmtTime(t, false);
    g.fillText(label, x + 4, 12);
    // minor ticks
    const minor = step / 5;
    if (minor * session.zoom > 8) {
      for (let k = 1; k < 5; k++) {
        const tm = t + minor * k, xm = Math.round(timeToX(tm)) + .5;
        if (xm > w) break;
        g.beginPath(); g.moveTo(xm, 23); g.lineTo(xm, 30); g.stroke();
      }
    }
  }
  // header separator
  g.fillStyle = 'rgba(8,11,24,.9)';
  g.fillRect(0, 0, view.headerW, 30);
  g.fillStyle = '#6d769c';
  g.fillText('TIMELINE', 10, 19);
  // selection on ruler
  if (session.selection) {
    const a = timeToX(session.selection.start), b = timeToX(session.selection.end);
    g.fillStyle = 'rgba(124,92,255,.28)';
    g.fillRect(a, 0, b - a, 30);
    g.strokeStyle = 'rgba(167,139,250,.9)';
    g.strokeRect(a + .5, .5, b - a - 1, 29);
  }
  // loop marker
  if (session.loop && session.selection) {
    g.fillStyle = '#22d3ee';
    g.fillRect(timeToX(session.selection.start), 27, Math.max(2, timeToX(session.selection.end) - timeToX(session.selection.start)), 3);
  }
  drawMarkers(g, { isRuler: true, h: 30 });
}

/* ── timeline markers (vertical guide lines) ── */
function drawMarkers(g, opts) {
  if (session.markersHidden || !session.markers.length) return;
  const isRuler = !!opts.isRuler;
  const h = isRuler ? 30 : view.h;
  g.lineWidth = 1.5;
  for (const m of session.markers) {
    const x = Math.round(timeToX(m.time)) + .5;
    if (x < view.headerW - 2 || x > view.w + 2) continue;
    /* line */
    g.strokeStyle = 'rgba(34,211,238,.88)';
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
    if (isRuler) {
      /* flag cap + timestamp */
      g.fillStyle = '#22d3ee';
      g.beginPath();
      g.moveTo(x - 4.5, 0);
      g.lineTo(x + 7, 0);
      g.lineTo(x + 1.25, 9);
      g.closePath(); g.fill();
      g.fillStyle = 'rgba(220,250,255,.92)';
      g.font = '8.5px "JetBrains Mono"';
      g.fillText(fmtTime(m.time, false), x + 5, 20);
    } else {
      /* thin highlight at top of lanes area so it's tappable/visible */
      g.fillStyle = 'rgba(34,211,238,.16)';
      g.fillRect(x - 3, 0, 7, 4);
    }
  }
}
/* return marker id near an x coordinate (lanes canvas), or null */
function markerNear(x, tolPx = 7) {
  for (const m of session.markers) {
    const mx = timeToX(m.time);
    if (Math.abs(x - mx) <= tolPx) return m.id;
  }
  return null;
}

function drawLanes() {
  const g = ctx2d(els.lanes);
  const w = view.w, h = view.h;
  g.fillStyle = 'rgba(6,9,20,.4)';
  g.fillRect(0, 0, w, h);

  const dur = session.duration();
  // vertical grid
  const step = niceStep(64);
  g.strokeStyle = 'rgba(255,255,255,.05)';
  g.lineWidth = 1;
  const t0 = session.scroll, t1 = session.scroll + w / session.zoom;
  for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) {
    const x = Math.round(timeToX(t)) + .5;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
  }

  if (!session.tracks.length) { drawHeaderBackdrop(g, h); return; }

  let cursorY = -view.trackScroll;
  session.tracks.forEach((track, i) => {
    const hh = laneHeight(track);
    const y = cursorY; cursorY += hh;
    if (y > h || y + hh < 0) return;
    const selected = track.id === session.selectedTrackId;

    // lane background
    g.fillStyle = i % 2 ? 'rgba(255,255,255,.028)' : 'rgba(255,255,255,.015)';
    g.fillRect(view.headerW, y + 1, w - view.headerW, hh - 2);
    if (selected) {
      g.fillStyle = 'rgba(124,92,255,.09)';
      g.fillRect(view.headerW, y + 1, w - view.headerW, hh - 2);
    }
    g.strokeStyle = 'rgba(255,255,255,.06)';
    g.strokeRect(view.headerW + .5, y + 1.5, w - view.headerW - 1, hh - 3);

    // header painted by drawHeaderBackdrop() (runs after this)

    // clips
    for (const clip of track.clips) {
      drawClip(g, track, clip, y, hh);
    }
  });

  drawHeaderBackdrop(g, h);
  drawMarkers(g, { isRuler: false });
}

function drawHeaderBackdrop(g, h) {
  g.fillStyle = 'rgba(8,11,24,.5)';
  g.fillRect(0, 0, view.headerW, h);
  // redraw headers over backdrop
  let cursorY = -view.trackScroll;
  session.tracks.forEach((track, i) => {
    const hh = laneHeight(track);
    const y = cursorY; cursorY += hh;
    if (y > h || y + hh < 0) return;
    const selected = track.id === session.selectedTrackId;
    g.fillStyle = selected ? 'rgba(30,36,66,.96)' : 'rgba(14,18,36,.92)';
    g.fillRect(0, y + 1, view.headerW - 6, hh - 2);
    g.fillStyle = track.color;
    g.fillRect(0, y + 1, 3, hh - 2);
    g.fillStyle = '#e8ecff';
    g.font = '600 11.5px Inter, sans-serif';
    const nm = track.name.length > 15 ? track.name.slice(0, 14) + '…' : track.name;
    g.fillText(nm, 10, y + 19);
    g.font = '9px "JetBrains Mono", monospace';
    g.fillStyle = '#6d769c';
    const info = track.clips.length + ' clip' + (track.clips.length === 1 ? '' : 's') +
      (track.bands?.enabled ? ' · bands' : '') + (hasFx(track) ? ' · fx' : '');
    g.fillText(info, 10, y + 33);
    const bs = 20, by = y + hh - 26;
    drawBtn(g, 10, by, bs, bs, 'M', track.mute, '#ffb84d');
    drawBtn(g, 34, by, bs, bs, 'S', track.solo, '#3ddc97', true);
    if (track.bands?.enabled) { g.fillStyle = '#22d3ee'; g.font = '8px Inter'; g.fillText('BAND', 60, by + 13); }
    const mx = view.headerW - 20;
    g.fillStyle = 'rgba(0,0,0,.4)';
    g.fillRect(mx - 4, y + 8, 8, hh - 16);
    drawXBtn(g, y);

    /* resize grip — always-visible dots on the lane's bottom edge */
    const gy = y + hh - 2;
    g.fillStyle = 'rgba(255,255,255,.15)';
    g.fillRect(0, gy, view.headerW - 6, 2);
    const gripW = 66, gripX = (view.headerW - 6) / 2 - gripW / 2;
    for (let k = 0; k < 6; k++) {
      g.beginPath();
      g.arc(gripX + k * 11 + 5.5, gy + 1, 1.6, 0, Math.PI * 2);
      g.fillStyle = 'rgba(255,255,255,.38)';
      g.fill();
    }
    /* live meter fill is painted per frame in drawOverlay() */
  });
}

/* small ✕ button used in every lane header — hit-tested in onDown() */
const X_BTN = { x: () => view.headerW - 22, y: y => y + 5, w: 13, h: 13 };
function drawXBtn(g, y) {
  const x = X_BTN.x(), yy = X_BTN.y(y), s = X_BTN.w;
  g.fillStyle = 'rgba(255,92,114,.16)';
  roundRect(g, x, yy, s, s, 4); g.fill();
  g.strokeStyle = 'rgba(255,92,114,.5)'; g.lineWidth = 1;
  roundRect(g, x + .5, yy + .5, s - 1, s - 1, 4); g.stroke();
  g.fillStyle = '#ffb3bd'; g.font = '700 9px Inter';
  g.fillText('✕', x + 2.4, yy + 9.5);
}

function hasFx(track) {
  const f = track.fx || {};
  return ['eq', 'comp', 'sat', 'delay', 'reverb', 'limiter'].some(k => f[k] && f[k].on);
}

function drawBtn(g, x, y, w, h, label, on, color, solo = false) {
  g.fillStyle = on ? color + '33' : 'rgba(255,255,255,.06)';
  g.strokeStyle = on ? color : 'rgba(255,255,255,.14)';
  g.lineWidth = 1;
  roundRect(g, x, y, w, h, 5); g.fill(); g.stroke();
  g.fillStyle = on ? color : '#8f98bd';
  g.font = '700 10px Inter';
  g.fillText(label, x + w / 2 - 3.4, y + h / 2 + 3.5);
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/* direct-from-buffer min/max renderer — no pyramid-step artefacts. */
function drawRawPeaks(g, ab, clip, x0, x1, top, hh, color) {
  const sr = ab.sampleRate;
  const nCh = ab.numberOfChannels;
  const xaStart = Math.max(0, Math.floor(Math.max(x0, view.headerW)));
  const xaEnd = Math.min(Math.ceil(x1), view.w);

  const drawChannel = (c, subTop, subH) => {
    const ch = ab.getChannelData(c);
    if (!ch) return;
    const mid = subTop + subH / 2;
    const amp = subH / 2 - 2;
    g.strokeStyle = hexA(color, .95);
    g.lineWidth = 1.2;
    g.beginPath();
    for (let px = xaStart; px < xaEnd; px++) {
      const tPx = xToTime(px);
      const tPxNext = xToTime(px + 1);
      const s0 = Math.max(0, Math.floor((clip.offset + (tPx - clip.start)) * sr));
      const s1 = Math.min(ch.length - 1, Math.floor((clip.offset + (tPxNext - clip.start)) * sr));
      const span = s1 - s0;
      let mn = Infinity, mx = -Infinity;
      if (span > 512) {
        const stride = Math.ceil(span / 512);
        for (let i = s0; i <= s1; i += stride) {
          const v = ch[i]; if (v < mn) mn = v; if (v > mx) mx = v;
        }
      } else if (span > 0) {
        for (let i = s0; i <= s1; i++) { const v = ch[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
      } else { mn = ch[Math.max(0, Math.floor((clip.offset + (tPx - clip.start)) * sr))]; mx = mn; }
      if (!isFinite(mn) || !isFinite(mx)) { mn = 0; mx = 0; }
      g.moveTo(px, mid - mx * amp);
      g.lineTo(px, mid - mn * amp + (mx - mn < 0.002 ? 0.5 : 0));
    }
    g.stroke();
    /* channel label */
    if (nCh > 1) {
      g.fillStyle = 'rgba(255,255,255,.62)';
      g.font = '600 8px "JetBrains Mono"';
      g.fillText(c === 0 ? 'L' : 'R', x0 + 5, subTop + 11);
    }
  };

  if (nCh === 2) {
    const subH = hh / 2;
    drawChannel(0, top, subH);
    drawChannel(1, top + subH, subH);
    /* divider */
    g.strokeStyle = 'rgba(255,255,255,.15)';
    g.lineWidth = 1;
    g.setLineDash([4, 3]);
    g.beginPath(); g.moveTo(xaStart, top + hh / 2); g.lineTo(xaEnd, top + hh / 2); g.stroke();
    g.setLineDash([]);
  } else {
    drawChannel(0, top, hh);
  }
}

function drawClip(g, track, clip, laneY, laneH) {
  const x0 = timeToX(clip.start), x1 = timeToX(clip.start + clip.dur);
  if (x1 < view.headerW || x0 > view.w) return;
  const top = laneY + 5, hh = laneH - 10;
  const sel = clip.id === session.selectedClipId && track.id === session.selectedTrackId;
  const hover = view.hover && view.hover.clip && view.hover.clip.id === clip.id;

  g.save();
  g.beginPath();
  roundRect(g, x0, top, Math.max(3, x1 - x0), hh, 6);
  g.clip();

  // body
  const grad = g.createLinearGradient(0, top, 0, top + hh);
  grad.addColorStop(0, hexA(track.color, sel ? .42 : .30));
  grad.addColorStop(1, hexA(track.color, sel ? .22 : .13));
  g.fillStyle = grad;
  g.fillRect(x0, top, x1 - x0, hh);

  // waveform — stereo clips always render L|R; high zoom renders per-sample.
  // We now render directly from the raw buffer when possible (no pyramid-step artefacts).
  const meta = getBufferMeta(clip.bufferId);
  const ab = getAudioBuffer(clip.bufferId);
  if (ab) {
    drawRawPeaks(g, ab, clip, x0, x1, top, hh, track.color);
  } else if (meta && meta.peaks) {
    /* fallback — peaks pyramid path (before buffer is decoded) */
    const mid = top + hh / 2;
    const amp = hh / 2 - 4;
    g.strokeStyle = hexA(track.color, .95);
    g.lineWidth = 1;
    g.beginPath();
    const w = Math.max(1, Math.floor(x1 - x0));
    const lv = pickLevel(meta.peaks, Math.max(8, w * 1.5));
    const sr = meta.sr, len = meta.length;
    for (let px = 0; px < w; px++) {
      const t = clip.offset + (px / session.zoom);
      const col = clamp(Math.floor((t * sr / len) * lv.cols), 0, lv.cols - 1);
      const mn = lv.min[col], mx = lv.max[col];
      const xa = x0 + px;
      g.moveTo(xa, mid - mx * amp);
      g.lineTo(xa, mid - mn * amp + (mx - mn < 0.002 ? 0.6 : 0));
    }
    g.stroke();
  } else {
    // placeholder
    g.strokeStyle = hexA(track.color, .5);
    g.setLineDash([4, 4]);
    g.beginPath(); g.moveTo(x0, top + hh / 2); g.lineTo(x1, top + hh / 2); g.stroke();
    g.setLineDash([]);
    requestPeaks(clip.bufferId);
  }

  // fades
  const fi = Math.min(clip.fadeIn || 0, clip.dur * 0.49) * session.zoom;
  const fo = Math.min(clip.fadeOut || 0, clip.dur * 0.49) * session.zoom;
  if (fi > 1) {
    g.fillStyle = 'rgba(0,0,0,.4)';
    g.beginPath(); g.moveTo(x0, top); g.lineTo(x0 + fi, top); g.lineTo(x0, top + hh); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.moveTo(x0, top); g.lineTo(x0 + fi, top + hh); g.stroke();
  }
  if (fo > 1) {
    g.fillStyle = 'rgba(0,0,0,.4)';
    g.beginPath(); g.moveTo(x1, top); g.lineTo(x1 - fo, top); g.lineTo(x1, top + hh); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.moveTo(x1, top); g.lineTo(x1 - fo, top + hh); g.stroke();
  }
  g.restore();

  // border
  g.lineWidth = sel ? 2 : 1;
  g.strokeStyle = sel ? '#ffffff' : hover ? 'rgba(255,255,255,.5)' : hexA(track.color, .75);
  roundRect(g, x0 + .5, top + .5, Math.max(3, x1 - x0) - 1, hh - 1, 6);
  g.stroke();

  // label
  if (x1 - x0 > 46) {
    g.fillStyle = 'rgba(255,255,255,.92)';
    g.font = '600 9.5px Inter';
    g.fillText(clip.name || '', x0 + 6, top + 12);
    g.fillStyle = 'rgba(255,255,255,.5)';
    g.font = '8.5px "JetBrains Mono"';
    g.fillText(clip.dur.toFixed(2) + 's', x0 + 6, top + 23);
  }
  // trim handles
  if (sel || hover) {
    g.fillStyle = 'rgba(255,255,255,.75)';
    g.fillRect(x0, top, 3, hh);
    g.fillRect(x1 - 3, top, 3, hh);
  }
}

function pickLevel(levels, needed) {
  for (const l of levels) if (l.cols >= needed) return l;
  return levels[levels.length - 1];
}
function hexA(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function drawOverlay() {
  const g = ctx2d(els.overlay);
  // selection
  if (session.selection) {
    const a = timeToX(session.selection.start), b = timeToX(session.selection.end);
    g.fillStyle = 'rgba(124,92,255,.14)';
    g.fillRect(a, 0, b - a, view.h);
    g.strokeStyle = 'rgba(167,139,250,.75)';
    g.setLineDash([5, 4]);
    g.strokeRect(a + .5, 0.5, b - a - 1, view.h - 1);
    g.setLineDash([]);
    // edge labels
    g.fillStyle = 'rgba(167,139,250,.95)';
    g.font = '9px "JetBrains Mono"';
    const wsel = (session.selection.end - session.selection.start);
    g.fillText(wsel.toFixed(2) + 's', (a + b) / 2 - 16, view.h - 6);
  }
  // hover clip outline
  if (view.hover && view.hover.clip) {
    const c = view.hover.clip;
    const x0 = timeToX(c.start), x1 = timeToX(c.start + c.dur);
    g.fillStyle = 'rgba(255,255,255,.06)';
    g.fillRect(x0, view.hover.y, x1 - x0, view.hover.h);
  }
  // drag ghost
  if (view.drag && view.drag.type === 'move' && view.drag.clip) {
    const c = view.drag.clip;
    const x0 = timeToX(c.start), x1 = timeToX(c.start + c.dur);
    g.fillStyle = 'rgba(34,211,238,.14)';
    g.fillRect(x0, view.drag.targetY ?? 0, x1 - x0, laneHeight(view.drag.track) - 10);
  }
  drawLiveMeters(g);
}

/* live per-track peak meters in the header strip — repainted every frame */
function drawLiveMeters(g) {
  if (!hooks.meterFor) return;
  const h = view.h;
  let y = -view.trackScroll;
  for (let i = 0; i < session.tracks.length; i++) {
    const track = session.tracks[i];
    const hh = laneHeight(track);
    if (y > h || y + hh < 0) { y += hh; continue; }
    const mx = view.headerW - 24;
    const x = mx;
    g.fillStyle = 'rgba(0,0,0,.45)';
    g.fillRect(x, y + 8, 9, hh - 16);
    const lvl = clamp(hooks.meterFor(track.id) || 0, 0, 1);
    const bh = (hh - 16) * lvl;
    if (bh > 0.4) {
      const grad = g.createLinearGradient(0, y + 8 + (hh - 16) - bh, 0, y + 8 + (hh - 16));
      grad.addColorStop(0, '#ff5c72');
      grad.addColorStop(0.35, '#ffb84d');
      grad.addColorStop(1, '#3ddc97');
      g.fillStyle = grad;
      g.fillRect(x, y + 8 + (hh - 16) - bh, 9, bh);
    }
    /* clip indicator at peak */
    if (lvl > 0.98) {
      g.fillStyle = '#ff5c72';
      g.fillRect(x - 1, y + 4, 11, 3);
    }
    y += hh;
  }
}

/* ── playhead + transport loop ──────────────────── */
function loop() {
  raf = requestAnimationFrame(loop);
  const pos = getPosition();
  session.playhead = isPlaying() ? pos : session.playhead;

  if (session.view === 'lanes' || session.view === 'spectro') {
    const x = timeToX(session.playhead);
    const show = x >= view.headerW - 2 && x <= view.w;
    if (session.view === 'lanes') {
      els.playhead.hidden = !show;
      if (show) els.playhead.style.left = x + 'px';
      drawOverlay();   // live meters every frame
    } else {
      els.playhead.hidden = true;
      drawSpectroPlayhead(pos);
    }
    // auto-follow
    if (isPlaying() && (x > view.w - 40 || x < view.headerW)) ensureVisible(pos);
    if (isPlaying() && session.loop && session.selection &&
      pos >= session.selection.end) hooks.seek(session.selection.start, true);
    if (isPlaying() && pos >= session.duration() + 0.4 && !session.loop) hooks.stopAtEnd();
  } else els.playhead.hidden = true;

  hooks.tick(pos);
  if (session.view === 'spectrum') drawSpectrum();
  if (session.view === 'spectro' && isPlaying()) { /* playhead redrawn above */ }
}

export function stopLoop() { cancelAnimationFrame(raf); }

function updateStatus() {
  const sel = session.selection;
  $('#statusSel').textContent = sel
    ? `sel ${sel.start.toFixed(2)}–${sel.end.toFixed(2)} (${(sel.end - sel.start).toFixed(2)}s)` : 'sel —';
  $('#statusZoom').textContent = `1 px = ${(1000 / session.zoom).toFixed(1)} ms`;
  const m = [...engine.buffers.values()][0];
  $('#statusSr').textContent = m ? (m.sr / 1000).toFixed(1) + ' kHz' : '— kHz';
}

/* ── pointer interaction ────────────────────────── */
function bindPointer(canvas, kind) {
  canvas.addEventListener('pointerdown', e => onDown(e, kind));
  canvas.addEventListener('pointermove', e => onMove(e, kind));
  canvas.addEventListener('pointerup', e => onUp(e, kind));
  canvas.addEventListener('pointerleave', () => { view.hover = null; if (session.view === 'lanes') drawLanes(), drawOverlay(); });
  canvas.addEventListener('dblclick', e => onDbl(e, kind));
}
function localPos(e, canvas) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
function hitResize(p) {
  let laneTop = -view.trackScroll;
  for (let i = 0; i < session.tracks.length; i++) {
    const track = session.tracks[i];
    const hh = laneHeight(track);
    const bottom = laneTop + hh;
    if (p.y >= bottom - RESIZE_H && p.y <= bottom + 2) return { track, idx: i };
    laneTop = bottom;
  }
  return null;
}

function onDown(e, kind) {
  const p = localPos(e, e.currentTarget);
  ensureCtx();
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* synthetic / touch edge */ }

  if (kind === 'ruler') {
    const t = Math.max(0, xToTime(p.x));
    session.selection = null;
    hooks.seek(t);
    view.drag = { type: 'scrub' };
    redraw();
    return;
  }

  if (kind === 'spectro') {
    const t = xToTime(p.x), f = yToFreq(p.y);
    view.drag = { type: 'spectroSel', t0: t, f0: f };
    view.spectroSel = { t0: t, t1: t, f0: f, f1: f };
    drawSpectroOverlay();
    return;
  }

  /* lanes */
  const time = Math.max(0, xToTime(p.x));

  /* ── lane-resize grab strip (bottom edge of any lane) ── */
  const rz = hitResize(p);
  if (rz) {
    session.snapshot();
    view.drag = { type: 'resize', track: rz.track, startY: p.y, startH: laneHeight(rz.track) };
    els.lanes.style.cursor = 'ns-resize';
    redraw();
    return;
  }

  /* ── marker tool: click to place · click on an existing marker to delete ── */
  if (session.tool === 'marker') {
    const t = Math.max(0, xToTime(p.x));
    const hitId = markerNear(p.x, 7);
    session.snapshot();
    if (hitId) {
      session.removeMarker(hitId);
      toast('Marker removed');
    } else {
      session.addMarker(session.quantizeSnap(t));
    }
    redraw();
    return;
  }

  if (p.x < view.headerW) {
    const hit = trackAtY(p.y);
    if (!hit) return;
    const { track, y0 } = hit;
    /* ✕ delete this track */
    const xb = X_BTN.x(), xy = X_BTN.y(y0);
    if (p.x >= xb && p.x <= xb + X_BTN.w && p.y >= xy && p.y <= xy + X_BTN.h) {
      session.snapshot();
      const nm = track.name;
      session.removeTrack(track.id);
      toast('Deleted track “' + nm + '”');
      redraw();
      return;
    }
    const bs = 20, by = y0 + hit.laneH - 26;
    if (p.y >= by && p.y <= by + bs) {
      session.snapshot();
      if (p.x >= 10 && p.x <= 30) track.mute = !track.mute;
      else if (p.x >= 34 && p.x <= 54) track.solo = !track.solo;
      else { session.selectedTrackId = track.id; hooks.selectTrack(track.id); }
      session.emit('change', 'trackToggle');
      hooks.levelsChanged();
      return;
    }
    session.snapshot();
    session.selectedTrackId = track.id;
    session.selectedClipId = null;
    hooks.selectTrack(track.id);
    redraw();
    return;
  }

  const hit = trackAtY(p.y);
  if (!hit) { view.drag = { type: 'none' }; return; }
  const { track, y0 } = hit;
  session.selectedTrackId = track.id;
  hooks.selectTrack(track.id);

  // find clip
  const clip = track.clips.find(c => time >= c.start && time <= c.start + c.dur);
  const laneTop = y0 + 5, laneH = hit.laneH - 10;

  if (session.tool === 'razor') {
    session.snapshot();
    if (clip) session.splitClip(track.id, clip.id, session.quantizeSnap(time));
    redraw();
    return;
  }
  if (session.tool === 'range' || (!clip && session.tool === 'select')) {
    session.selection = null;
    view.drag = { type: 'select', anchor: time };
    redraw();
    return;
  }

  if (!clip) {
    session.selectedClipId = null;
    session.selection = null;
    view.drag = { type: 'select', anchor: time };
    redraw();
    return;
  }

  session.selectedClipId = clip.id;
  hooks.selectClip(track.id, clip.id);
  session.snapshot();

  const x0 = timeToX(clip.start), x1 = timeToX(clip.start + clip.dur);
  const fadeZone = 14;
  if (p.x - x0 < fadeZone && p.y - laneTop < 16) view.drag = { type: 'fadeIn', clip, track };
  else if (x1 - p.x < fadeZone && p.y - laneTop < 16) view.drag = { type: 'fadeOut', clip, track };
  else if (p.x - x0 < 7) view.drag = { type: 'trimL', clip, track, grabT: time - clip.start };
  else if (x1 - p.x < 7) view.drag = { type: 'trimR', clip, track };
  else view.drag = { type: 'move', clip, track, dt: time - clip.start, moved: false };
  redraw();
}

function onMove(e, kind) {
  const p = localPos(e, e.currentTarget);
  view.mouse = { x: p.x, y: p.y, inLanes: kind === 'lanes' };

  if (!view.drag) {
    if (kind === 'lanes') updateHover(p);
    return;
  }
  const d = view.drag;
  const time = Math.max(0, xToTime(p.x));

  switch (d.type) {
    case 'scrub': hooks.seek(Math.max(0, time)); break;
    case 'select': {
      const a = Math.min(d.anchor, time), b = Math.max(d.anchor, time);
      session.selection = (b - a) > 0.005 ? { start: a, end: b } : null;
      drawOverlay(); drawRuler(); updateStatus();
      break;
    }
    case 'move': {
      const snapT = session.quantizeSnap(time - d.dt);
      const ns = Math.max(0, snapT);
      if (Math.abs(ns - d.clip.start) > 0.001 || d.track) d.moved = true;
      const hit = trackAtY(p.y);
      d.targetTrack = hit && hit.track.id !== d.track.id ? hit.track : null;
      d.targetY = hit ? hit.y0 + 5 : null;
      d.clip.start = ns;
      drawLanes(); drawOverlay();
      break;
    }
    case 'trimL': {
      const snapT = session.quantizeSnap(time);
      let ns = clamp(snapT, d.clip.start - d.clip.offset, d.clip.start + d.clip.dur - 0.02);
      const delta = ns - d.clip.start;
      d.clip.start += delta; d.clip.dur -= delta; d.clip.offset += delta;
      drawLanes(); drawOverlay();
      break;
    }
    case 'trimR': {
      const meta = getBufferMeta(d.clip.bufferId);
      const maxDur = meta ? meta.duration - d.clip.offset : 1e9;
      const snapT = session.quantizeSnap(time);
      d.clip.dur = clamp(snapT - d.clip.start, 0.02, maxDur);
      drawLanes(); drawOverlay();
      break;
    }
    case 'fadeIn': {
      const v = clamp((time - d.clip.start), 0, d.clip.dur * 0.49);
      d.clip.fadeIn = v;
      drawLanes(); drawOverlay();
      hooks.clipChanged(d.clip);
      break;
    }
    case 'fadeOut': {
      const end = d.clip.start + d.clip.dur;
      const v = clamp(end - time, 0, d.clip.dur * 0.49);
      d.clip.fadeOut = v;
      drawLanes(); drawOverlay();
      hooks.clipChanged(d.clip);
      break;
    }
    case 'spectroSel': {
      const f = yToFreq(p.y);
      view.spectroSel = { t0: Math.min(d.t0, time), t1: Math.max(d.t0, time), f0: Math.min(d.f0, f), f1: Math.max(d.f0, f) };
      drawSpectroOverlay();
      break;
    }
    case 'resize': {
      const dy = p.y - d.startY;
      d.track.height = clamp(d.startH + dy, 44, 420);
      if (kind === 'lanes') { trackAtY(p.y); }
      redraw();
      break;
    }
  }
}

function onUp(e, kind) {
  const d = view.drag;
  view.drag = null;
  els.lanes && (els.lanes.style.cursor = '');
  if (!d) return;
  if (d.type === 'move' && d.moved) {
    // move between tracks if pointer over another lane
    const p = localPos(e, e.currentTarget);
    const hit = trackAtY(p.y);
    if (hit && hit.track.id !== d.track.id) {
      session.moveClip(d.track.id, d.clip.id, d.clip.start, hit.track.id);
    } else session.emit('change', 'moveClip');
    hooks.rebuildIfNeeded();
  } else if (['trimL', 'trimR', 'fadeIn', 'fadeOut'].includes(d.type)) {
    session.emit('change', 'trim');
  } else if (d.type === 'resize') {
    session.emit('change', 'resizeTrack');
  } else if (d.type === 'select') {
    hooks.selectionChanged();
  } else if (d.type === 'scrub') {
    hooks.selectionChanged();
  }
  redraw();
}

function onDbl(e, kind) {
  if (kind !== 'lanes') return;
  const p = localPos(e, e.currentTarget);
  if (p.x < view.headerW) return;
  const hit = trackAtY(p.y);
  if (!hit) return;
  const time = xToTime(p.x);
  const clip = hit.track.clips.find(c => time >= c.start && time <= c.start + c.dur);
  if (clip) {
    session.snapshot();
    session.splitClip(hit.track.id, clip.id, session.quantizeSnap(time));
    redraw();
  }
}

function updateHover(p) {
  const prev = view.hover;
  if (p.x < view.headerW) { view.hover = null; }
  else {
    const rz = hitResize(p);
    if (rz) {
      els.lanes.style.cursor = 'ns-resize';
      view.hover = null;
      return;
    }
    const markerTool = session.tool === 'marker';
    els.lanes.style.cursor = markerTool ? (markerNear(p.x, 7) ? 'pointer' : 'crosshair') : '';
    const hit = trackAtY(p.y);
    let hv = null;
    if (hit) {
      const time = xToTime(p.x);
      const clip = hit.track.clips.find(c => time >= c.start && time <= c.start + c.dur);
      if (clip) hv = { clip, track: hit.track, y: hit.y0 + 5, h: hit.laneH - 10 };
    }
    view.hover = hv;
  }
  if (JSON.stringify(prev) !== JSON.stringify(view.hover && { id: view.hover.clip.id })) {
    drawLanes(); drawOverlay();
  }
}

function onWheel(e) {
  e.preventDefault();
  const p = localPos(e, e.currentTarget);
  if (e.ctrlKey || e.metaKey) {
    zoomBy(Math.exp(-e.deltaY * 0.0016), p.x);
    return;
  }
  if (e.shiftKey) {
    session.scroll = Math.max(0, session.scroll + (e.deltaY + e.deltaX) / session.zoom * 0.6);
    redraw(); requestSpectro();
    return;
  }
  // vertical track scroll when needed, else horizontal time
  const total = trackHeightsTotal();
  if (total > view.h && Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
    view.trackScroll = clamp(view.trackScroll + e.deltaY, 0, total - view.h);
    redraw();
  } else {
    session.scroll = Math.max(0, session.scroll + e.deltaX / session.zoom);
    redraw(); requestSpectro();
  }
}

/* ── spectrogram ────────────────────────────────── */
export function spectroSource() {
  if (view.spectroSourceId && engine.buffers.has(view.spectroSourceId)) return view.spectroSourceId;
  const t = session.selectedTrack();
  if (t && t.clips.length) return t.clips[0].bufferId;
  for (const [, m] of engine.buffers) if (m.kind === 'mix') return m.id;
  const first = engine.buffers.keys().next();
  return first.done ? null : first.value;
}

export function requestSpectro(force = false) {
  if (session.view !== 'spectro') return;
  const bufId = spectroSource();
  if (!bufId) return;
  const meta = getBufferMeta(bufId);
  if (!meta) return;
  const c = els.spectro;
  const cols = Math.min(1600, Math.max(64, Math.floor(c.width / view.dpr)));
  const rows = Math.min(900, Math.max(64, Math.floor(c.height / view.dpr)));
  const t0 = Math.max(0, session.scroll);
  const t1 = Math.max(t0 + 0.05, Math.min(meta.duration, session.scroll + (view.w - view.headerW) / session.zoom));
  const log = $('#spectLog') ? $('#spectLog').checked : true;
  const map = $('#spectMap') ? $('#spectMap').value : 'magma';
  const key = `${bufId}|${t0.toFixed(2)}|${t1.toFixed(2)}|${cols}|${rows}|${log}|${map}|${meta.sr}`;
  if (!force && key === view.spectroKey && view.spectroData) return;
  if (view.spectroPendingKey === key) return;
  view.spectroPendingKey = key;
  view.spectroBusy = true;
  els.spectroBusy.hidden = false;

  const ab = getAudioBuffer(bufId);
  if (!ab) { view.spectroBusy = false; els.spectroBusy.hidden = true; return; }
  const L = Float32Array.from(ab.getChannelData(0));
  const R = ab.numberOfChannels > 1 ? Float32Array.from(ab.getChannelData(1)) : null;
  const fftSize = session.zoom > 400 ? 4096 : session.zoom > 60 ? 2048 : 1024;
  workerRequest({
    type: 'spectro', left: L, right: R, sampleRate: meta.sr,
    t0, t1, cols, rows, fftSize,
    logFreq: log, fMin: 20, fMax: Math.min(20000, meta.sr / 2), dbRange: 84, colormap: map
  }, msg => {
    if (msg.type === 'spectro-done') {
      view.spectroData = { data: msg.data, cols, rows, t0, t1, log, map, key };
      view.spectroKey = key;
      view.spectroBusy = false;
      view.spectroPendingKey = null;
      els.spectroBusy.hidden = true;
      drawSpectro(); drawSpectroOverlay();
    }
  }, [L.buffer, R ? R.buffer : L.buffer.slice(0, 0)]);
}

function yToFreq(y) {
  const d = view.spectroData;
  const h = view.h;
  const fMin = 20, fMax = 20000;
  const r = clamp(y / h, 0, 1);
  const log = d ? d.log : true;
  if (log) return fMin * Math.pow(fMax / fMin, 1 - r);
  return fMax - r * (fMax - fMin);
}
function freqToY(f) {
  const h = view.h, fMin = 20, fMax = 20000;
  const log = view.spectroData ? view.spectroData.log : true;
  if (log) return (1 - Math.log(f / fMin) / Math.log(fMax / fMin)) * h;
  return (1 - (f - fMin) / (fMax - fMin)) * h;
}

function drawSpectro() {
  const g = ctx2d(els.spectro);
  const w = view.w, h = view.h;
  g.fillStyle = '#05070f';
  g.fillRect(0, 0, w, h);
  const d = view.spectroData;
  if (!d) {
    g.fillStyle = '#6d769c';
    g.font = '12px Inter';
    g.fillText('loading spectrogram…', 16, 24);
    return;
  }
  // colorize into ImageData
  const lut = colormap(d.map);
  const img = g.createImageData(d.cols, d.rows);
  const px = img.data;
  for (let i = 0, j = 0; i < d.data.length; i++, j += 4) {
    const v = d.data[i] * 3;
    px[j] = lut[v]; px[j + 1] = lut[v + 1]; px[j + 2] = lut[v + 2]; px[j + 3] = 255;
  }
  const off = document.createElement('canvas');
  off.width = d.cols; off.height = d.rows;
  off.getContext('2d').putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(off, view.headerW, 0, w - view.headerW, h);

  // frequency axis
  g.fillStyle = 'rgba(6,9,20,.85)';
  g.fillRect(w - 52, 0, 52, h);
  g.strokeStyle = 'rgba(255,255,255,.1)';
  g.fillStyle = '#9aa3c7';
  g.font = '9px "JetBrains Mono"';
  const marks = [30, 60, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  for (const f of marks) {
    const y = freqToY(f);
    if (y < 8 || y > h - 4) continue;
    g.beginPath(); g.moveTo(view.headerW, y + .5); g.lineTo(w - 52, y + .5); g.stroke();
    g.fillText(f >= 1000 ? (f / 1000) + 'k' : f, w - 46, y + 3);
  }
  g.fillStyle = 'rgba(6,9,20,.9)';
  g.fillRect(0, 0, view.headerW, h);
  g.fillStyle = '#8f98bd';
  g.font = '10px Inter';
  const src = getBufferMeta(spectroSource());
  g.fillText('SPECTRUM', 12, 20);
  g.font = '9px "JetBrains Mono"';
  g.fillStyle = '#6d769c';
  if (src) {
    g.fillText(src.name.slice(0, 16), 12, 36);
    g.fillText((src.sr / 1000).toFixed(1) + ' kHz', 12, 50);
    g.fillText((src.duration).toFixed(1) + ' s', 12, 64);
  }
  g.fillText('drag = select', 12, h - 16);
}

function drawSpectroPlayhead(pos) {
  const g = ctx2d(els.spectroOverlay);
  drawSpectroSel(g);
  const x = timeToX(pos);
  if (x >= view.headerW && x <= view.w) {
    g.strokeStyle = '#ff5ca8';
    g.lineWidth = 1.5;
    g.shadowColor = '#ff5ca8'; g.shadowBlur = 8;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, view.h); g.stroke();
    g.shadowBlur = 0;
  }
}
function drawSpectroOverlay() {
  const g = ctx2d(els.spectroOverlay);
  drawSpectroSel(g);
  const pos = getPosition();
  const x = timeToX(pos);
  if (x >= view.headerW && x <= view.w) {
    g.strokeStyle = '#ff5ca8'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, view.h); g.stroke();
  }
}
function drawSpectroSel(g) {
  const s = view.spectroSel;
  if (!s) return;
  const x0 = timeToX(s.t0), x1 = timeToX(s.t1);
  const y0 = freqToY(s.f1), y1 = freqToY(s.f0);
  g.fillStyle = 'rgba(34,211,238,.16)';
  g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
  g.strokeStyle = 'rgba(34,211,238,.95)';
  g.setLineDash([6, 4]);
  g.strokeRect(Math.min(x0, x1) + .5, Math.min(y0, y1) + .5, Math.abs(x1 - x0), Math.abs(y1 - y0));
  g.setLineDash([]);
  g.fillStyle = '#8ef3ff';
  g.font = '9px "JetBrains Mono"';
  const fLo = Math.min(s.f0, s.f1), fHi = Math.max(s.f0, s.f1);
  g.fillText(`${fLo.toFixed(0)}–${fHi.toFixed(0)} Hz`, Math.min(x0, x1) + 6, Math.min(y0, y1) - 5 > 10 ? Math.min(y0, y1) - 5 : Math.min(y0, y1) + 14);
}

/* ── spectrum analyser view ─────────────────────── */
function drawSpectrum() {
  const g = ctx2d(els.spectrum);
  const w = view.w, h = view.h;
  g.fillStyle = 'rgba(5,7,15,.92)';
  g.fillRect(0, 0, w, h);
  const ctx = engine.ctx;
  if (!ctx) return;
  const an = engine.master.analyser;
  const bins = an.frequencyBinCount;
  const data = new Float32Array(bins);
  an.getFloatFrequencyData(data);

  const fMin = 20, fMax = Math.min(20000, ctx.sampleRate / 2);
  const lx = f => (Math.log(f / fMin) / Math.log(fMax / fMin)) * (w - 60) + 40;

  // grid
  g.strokeStyle = 'rgba(255,255,255,.07)';
  g.fillStyle = '#6d769c';
  g.font = '9px "JetBrains Mono"';
  for (const f of [30, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]) {
    const x = lx(f);
    if (x > w - 55) continue;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h - 18); g.stroke();
    g.fillText(f >= 1000 ? f / 1000 + 'k' : f, x + 3, h - 6);
  }
  for (let db = -100; db <= 0; db += 20) {
    const y = 10 + ((0 - db) / 100) * (h - 34);
    g.beginPath(); g.moveTo(40, y); g.lineTo(w - 55, y); g.stroke();
    g.fillText(db + '', 6, y + 3);
  }

  const drawCurve = (analyser, color, fill) => {
    if (!analyser) return;
    const d = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(d);
    g.beginPath();
    let started = false;
    for (let i = 1; i < d.length; i++) {
      const f = (i * ctx.sampleRate) / (analyser.fftSize);
      if (f < fMin || f > fMax) continue;
      const x = lx(f);
      const y = 10 + clamp((-d[i] + 10) / 110, 0, 1) * (h - 34);
      if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y);
    }
    g.strokeStyle = color;
    g.lineWidth = 1.6;
    g.shadowColor = color; g.shadowBlur = 7;
    g.stroke();
    g.shadowBlur = 0;
    if (fill) {
      g.lineTo(w - 55, h - 18); g.lineTo(40, h - 18);
      g.closePath();
      g.fillStyle = fill; g.fill();
    }
  };
  // per-track curves
  const tracks = session.tracks;
  tracks.forEach((t, i) => {
    const gr = engine.trackGraphs.get(t.id);
    if (gr) drawCurve(gr.analyser, hexA(t.color, .85), null);
  });
  drawCurve(an, '#e8ecff', 'rgba(124,92,255,.12)');

  g.fillStyle = '#8f98bd';
  g.font = '10px Inter';
  g.fillText('REAL-TIME SPECTRUM — master (white) + tracks', 44, 16);
}

/* ── meters helper (called from ui each frame) ──── */
export function readMeters() {
  const out = { tracks: {}, master: 0, peak: -Infinity, rms: -Infinity };
  const tmp = new Float32Array(1024);
  for (const [id, gr] of engine.trackGraphs) {
    if (!gr.analyser) continue;
    gr.analyser.getFloatTimeDomainData(tmp);
    let peak = 0, sum = 0;
    for (let i = 0; i < tmp.length; i++) { const a = Math.abs(tmp[i]); if (a > peak) peak = a; sum += tmp[i] * tmp[i]; }
    out.tracks[id] = { peak, rms: Math.sqrt(sum / tmp.length) };
  }
  if (engine.master) {
    engine.master.analyser.getFloatTimeDomainData(tmp);
    let peak = 0, sum = 0;
    for (let i = 0; i < tmp.length; i++) { const a = Math.abs(tmp[i]); if (a > peak) peak = a; sum += tmp[i] * tmp[i]; }
    out.master = peak;
    out.peak = 20 * Math.log10(peak + 1e-9);
    out.rms = 20 * Math.log10(Math.sqrt(sum / tmp.length) + 1e-9);
  }
  return out;
}
