/* ═══════════════════════════════════════════════════════════════
   PRISM session — data model, edit operations, undo/redo
   ═══════════════════════════════════════════════════════════════ */

import { Emitter, uid, TRACK_COLORS, clamp } from './utils.js?v=11';
import { getAudioBuffer } from './audio-engine.js?v=11';

export const DEFAULT_BANDS = [
  { name: 'Sub', f1: 20, f2: 60, gain: 0, mute: false },
  { name: 'Bass', f1: 60, f2: 160, gain: 0, mute: false },
  { name: 'Low-mid', f1: 160, f2: 400, gain: 0, mute: false },
  { name: 'Mid', f1: 400, f2: 1000, gain: 0, mute: false },
  { name: 'High-mid', f1: 1000, f2: 2500, gain: 0, mute: false },
  { name: 'Presence', f1: 2500, f2: 6000, gain: 0, mute: false },
  { name: 'Brilliance', f1: 6000, f2: 12000, gain: 0, mute: false },
  { name: 'Air', f1: 12000, f2: 20000, gain: 0, mute: false }
];

export function defaultFx() {
  return {
    eq: { on: false, lowG: 0, lmF: 300, lmG: 0, hmF: 4000, hmG: 0, highG: 0 },
    comp: { on: false, thr: -18, ratio: 3, atk: 10, rel: 180, knee: 18 },
    sat: { on: false, drive: 30, mix: 100, tone: 8000 },
    delay: { on: false, time: 280, fb: 35, mix: 25 },
    reverb: { on: false, size: 55, decay: 1.8, mix: 20 },
    limiter: { on: false, ceil: -1, rel: 60 },
    invert: { on: false },
    width: 1
  };
}

class Session extends Emitter {
  constructor() {
    super();
    this.name = 'Untitled Session';
    this.bpm = 120;
    this.tracks = [];
    this.buffers = new Map();   // id → {id,name,kind,sr,duration}
    this.selection = null;      // {start,end}
    this.markers = [];          // [{id: uid(), time: seconds, name: 'Marker N'}]
    this.markersHidden = false;
    this.playhead = 0;
    this.loop = false;
    this.zoom = 80;             // px per second
    this.scroll = 0;            // seconds at left edge
    this.tool = 'select';
    this.view = 'lanes';
    this.snap = 0.1;
    this.selectedTrackId = null;
    this.selectedClipId = null;
    this.bandSolo = -1;
    this._undo = [];
    this._redo = [];
    this._lastSnap = 0;
  }

  /* ── meta ── */
  duration() {
    let d = 0;
    for (const t of this.tracks) for (const c of t.clips) d = Math.max(d, c.start + c.dur);
    return d;
  }
  track(id) { return this.tracks.find(t => t.id === id) || null; }
  selectedTrack() { return this.track(this.selectedTrackId); }
  selectedClip() {
    const t = this.selectedTrack();
    return t ? t.clips.find(c => c.id === this.selectedClipId) || null : null;
  }
  anySolo() { return this.tracks.some(t => t.solo); }

  /* single source of truth for persisted state (undo + save) */
  stateObject() {
    return {
      tracks: this.tracks,
      name: this.name,
      bpm: this.bpm,
      markers: this.markers,
      markersHidden: this.markersHidden
    };
  }

  /* ── undo ── */
  snapshot(label = 'edit') {
    const now = Date.now();
    if (now - this._lastSnap < 250 && this._undo.length) { this._lastSnap = now; return; }
    this._lastSnap = now;
    this._undo.push(JSON.stringify(this.stateObject()));
    if (this._undo.length > 60) this._undo.shift();
    this._redo.length = 0;
    this.emit('undoState');
  }
  /* snapshot an entire buffer's contents — used before a draw/sample edit stroke */
  snapshotBufferEdit(bufferId) {
    const buf = getAudioBuffer(bufferId);
    if (!buf) return null;
    const copy = ch => { const d = new Float32Array(ch.length); d.set(ch); return d; };
    return {
      kind: 'buffer', bufferId,
      before: { left: copy(buf.getChannelData(0)), right: buf.numberOfChannels > 1 ? copy(buf.getChannelData(1)) : null }
    };
  }
  commitBufferEdit(snap, after /* optional overrides, else auto-capture */) {
    const buf = getAudioBuffer(snap.bufferId);
    if (!buf) return;
    const copy = ch => { const d = new Float32Array(ch.length); d.set(ch); return d; };
    const afterNow = { left: copy(buf.getChannelData(0)), right: buf.numberOfChannels > 1 ? copy(buf.getChannelData(1)) : null };
    this._undo.push({ kind: 'buffer', bufferId: snap.bufferId, before: snap.before, after: afterNow });
    if (this._undo.length > 60) this._undo.shift();
    this._redo.length = 0;
    this._bufferRev = (this._bufferRev || 0) + 1;
    this.emit('bufferRev', snap.bufferId);
    this.emit('change', 'bufferEdit');
    this.emit('undoState');
  }
  _restoreBuffer(snapshot) {
    const buf = getAudioBuffer(snapshot.bufferId);
    if (!buf) return;
    buf.getChannelData(0).set(snapshot.left);
    if (snapshot.right && buf.numberOfChannels > 1) buf.getChannelData(1).set(snapshot.right);
    this._bufferRev = (this._bufferRev || 0) + 1;
    this.emit('bufferRev', snapshot.bufferId);
    this.emit('change', 'bufferEditUndo');
    this.emit('undoState');
  }
  undo() {
    if (!this._undo.length) return false;
    const top = this._undo[this._undo.length - 1];
    if (top && top.kind === 'buffer') {
      this._undo.pop();
      this._redo.push(top);
      this._restoreBuffer(top.before);
      return true;
    }
    this._redo.push(JSON.stringify(this.stateObject()));
    const s = JSON.parse(this._undo.pop());
    this.tracks = s.tracks; this.name = s.name; this.bpm = s.bpm;
    this.markers = s.markers || [];
    this.markersHidden = !!s.markersHidden;
    if (!this.track(this.selectedTrackId)) this.selectedTrackId = null;
    this.emit('change', 'undo'); this.emit('undoState');
    return true;
  }
  redo() {
    if (!this._redo.length) return false;
    const top = this._redo[this._redo.length - 1];
    if (top && top.kind === 'buffer') {
      this._redo.pop();
      this._undo.push(top);
      this._restoreBuffer(top.after);
      return true;
    }
    this._undo.push(JSON.stringify(this.stateObject()));
    const s = JSON.parse(this._redo.pop());
    this.tracks = s.tracks; this.name = s.name; this.bpm = s.bpm;
    this.markers = s.markers || [];
    this.markersHidden = !!s.markersHidden;
    if (!this.track(this.selectedTrackId)) this.selectedTrackId = null;
    this.emit('change', 'redo'); this.emit('undoState');
    return true;
  }

  /* ── tracks ── */
  addTrack(opts = {}) {
    const t = {
      id: uid(),
      name: opts.name || 'Track ' + (this.tracks.length + 1),
      color: opts.color || TRACK_COLORS[this.tracks.length % TRACK_COLORS.length],
      gain: 0, pan: 0, mute: false, solo: false,
      fx: defaultFx(),
      bands: { enabled: false, list: DEFAULT_BANDS.map(b => ({ ...b })) },
      bandSolo: -1,
      clips: [],
      kind: opts.kind || 'audio',
      bufferId: opts.bufferId || null,
      height: opts.height || null,
      stereoSplit: opts.stereoSplit ?? true
    };
    this.tracks.push(t);
    this.selectedTrackId = t.id;
    this.emit('change', 'addTrack');
    return t;
  }
  removeTrack(id) {
    const i = this.tracks.findIndex(t => t.id === id);
    if (i < 0) return;
    this.tracks.splice(i, 1);
    if (this.selectedTrackId === id) this.selectedTrackId = this.tracks[0]?.id || null;
    this.emit('change', 'removeTrack');
  }

  /* ── clips ── */
  addClip(trackId, clip) {
    const t = this.track(trackId);
    if (!t) return null;
    const c = { id: uid(), bufferId: clip.bufferId, start: clip.start ?? 0, dur: clip.dur, offset: clip.offset ?? 0, gain: clip.gain ?? 0, fadeIn: 0, fadeOut: 0, name: clip.name || '' };
    t.clips.push(c);
    t.clips.sort((a, b) => a.start - b.start);
    this.emit('change', 'addClip');
    return c;
  }
  removeClip(trackId, clipId) {
    const t = this.track(trackId);
    if (!t) return;
    const i = t.clips.findIndex(c => c.id === clipId);
    if (i >= 0) t.clips.splice(i, 1);
    if (this.selectedClipId === clipId) this.selectedClipId = null;
    this.emit('change', 'removeClip');
  }
  splitClip(trackId, clipId, atTime) {
    const t = this.track(trackId);
    if (!t) return;
    const c = t.clips.find(x => x.id === clipId);
    if (!c) return;
    const rel = atTime - c.start;
    if (rel <= 0.005 || rel >= c.dur - 0.005) return;
    const right = {
      id: uid(), bufferId: c.bufferId, start: c.start + rel, dur: c.dur - rel,
      offset: c.offset + rel, gain: c.gain, fadeIn: 0, fadeOut: c.fadeOut, name: c.name
    };
    c.dur = rel; c.fadeOut = 0;
    t.clips.push(right);
    t.clips.sort((a, b) => a.start - b.start);
    this.emit('change', 'splitClip');
  }
  splitAtPlayhead(trackId, clipId) {
    this.snapshot();
    this.splitClip(trackId, clipId, this.playhead);
  }

  /* delete time range from selected clip (or selected clips) */
  deleteSelection() {
    this.snapshot();
    const sel = this.selection;
    const tracks = this.selectedTrackId ? [this.selectedTrack()] : this.tracks;
    let any = false;
    for (const t of tracks) {
      if (!t) continue;
      const out = [];
      for (const c of t.clips) {
        if (sel && this.clipOverlaps(c, sel)) {
          const parts = this.clipMinus(c, sel);
          for (const p of parts) out.push(p);
          any = true;
        } else if (!sel && c.id === this.selectedClipId) {
          any = true;
        } else out.push(c);
      }
      t.clips = out;
    }
    this.selectedClipId = null;
    if (any) this.emit('change', 'delete');
    return any;
  }
  clipOverlaps(c, sel) { return c.start < sel.end && c.start + c.dur > sel.start; }
  clipMinus(c, sel) {
    const parts = [];
    if (sel.start > c.start) parts.push({ ...c, id: uid(), dur: sel.start - c.start });
    if (sel.end < c.start + c.dur) {
      const off = Math.max(0, sel.end - c.start);
      parts.push({ ...c, id: uid(), start: c.start + off, dur: c.dur - off, offset: c.offset + off, fadeIn: 0 });
    }
    return parts;
  }
  silenceSelection() {
    this.snapshot();
    const sel = this.selection;
    if (!sel) return false;
    for (const t of this.tracks) {
      const out = [];
      for (const c of t.clips) {
        if (!this.clipOverlaps(c, sel)) { out.push(c); continue; }
        const parts = this.clipMinus(c, sel);
        out.push(...parts);
      }
      t.clips = out;
    }
    this.emit('change', 'silence');
    return true;
  }
  trimToSelection() {
    this.snapshot();
    const sel = this.selection;
    const t = this.selectedTrack();
    if (!t || !sel) return false;
    const c = t.clips.find(x => x.id === this.selectedClipId);
    if (!c || !this.clipOverlaps(c, sel)) return false;
    const s = Math.max(c.start, sel.start), e = Math.min(c.start + c.dur, sel.end);
    c.offset += s - c.start;
    c.dur = e - s;
    c.start = s;
    this.emit('change', 'trim');
    return true;
  }
  duplicateSelection() {
    this.snapshot();
    const t = this.selectedTrack();
    const c = this.selectedClip();
    if (!t || !c) return false;
    const len = this.selection ? this.selection.end - this.selection.start : c.dur;
    const start = this.selection ? this.selection.start : c.start + c.dur;
    t.clips.push({ ...c, id: uid(), start: start +0.0001, dur: len, offset: c.offset });
    t.clips.sort((a, b) => a.start - b.start);
    this.emit('change', 'duplicate');
    return true;
  }
  moveClip(trackId, clipId, newStart, newTrackId = null) {
    const from = this.track(trackId);
    if (!from) return;
    const i = from.clips.findIndex(c => c.id === clipId);
    if (i < 0) return;
    const c = from.clips[i];
    c.start = Math.max(0, newStart);
    if (newTrackId && newTrackId !== trackId) {
      from.clips.splice(i, 1);
      const to = this.track(newTrackId);
      if (to) { to.clips.push(c); to.clips.sort((a, b) => a.start - b.start); this.selectedTrackId = to.id; }
      else from.clips.push(c);
    }
    this.emit('change', 'moveClip');
  }
  quantizeSnap(t) {
    if (this.snap === -1) { // beat
      const beat = 60 / this.bpm;
      return Math.round(t / beat) * beat;
    }
    if (!this.snap) return t;
    return Math.round(t / this.snap) * this.snap;
  }

  /* ── markers ── */
  addMarker(time, name) {
    const t = Math.max(0, +time);
    const marker = { id: uid(), time: t, name: name || this._nextMarkerName() };
    this.markers.push(marker);
    this.markers.sort((a, b) => a.time - b.time);
    this.emit('change', 'addMarker');
    this.emit('markersChanged', this.markers);
    return marker;
  }
  removeMarker(id) {
    const i = this.markers.findIndex(m => m.id === id);
    if (i < 0) return false;
    this.markers.splice(i, 1);
    this.emit('change', 'removeMarker');
    this.emit('markersChanged', this.markers);
    return true;
  }
  removeMarkersNear(time, tolerance = 0.004) {
    const before = this.markers.length;
    this.markers = this.markers.filter(m => Math.abs(m.time - time) > tolerance);
    if (this.markers.length === before) return false;
    this.emit('change', 'removeMarker');
    this.emit('markersChanged', this.markers);
    return true;
  }
  clearMarkers() {
    if (!this.markers.length) return false;
    this.markers = [];
    this.emit('change', 'clearMarkers');
    this.emit('markersChanged', this.markers);
    return true;
  }
  toggleMarkers() {
    this.markersHidden = !this.markersHidden;
    this.emit('change', 'toggleMarkers');
    this.emit('markersChanged', this.markers);
    return this.markersHidden;
  }
  _nextMarkerName() {
    let n = 1;
    const names = new Set(this.markers.map(m => m.name));
    while (names.has('Marker ' + n)) n++;
    return 'Marker ' + n;
  }

  /* ── serialization (metadata; audio referenced by id) ── */
  serialize() {
    return {
      app: 'prism', version: 2, name: this.name, bpm: this.bpm,
      tracks: this.tracks,
      markers: this.markers,
      markersHidden: this.markersHidden,
      buffers: [...this.buffers.values()].map(b => ({ id: b.id, name: b.name, kind: b.kind, sr: b.sr, duration: b.duration })),
      savedAt: new Date().toISOString()
    };
  }
}

export const session = new Session();
