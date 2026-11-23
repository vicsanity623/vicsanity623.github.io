/* PRISM — bootstrap */

import { $, toast } from './utils.js?v=11';
import { session } from './session.js?v=11';
import { initUI, loadSessionJson } from './ui.js?v=12';
import { redraw, resize, view } from './views.js?v=11';
import { engine, renderSession } from './audio-engine.js?v=11';

function boot() {
  $('#projectName').value = session.name;
  try {
    initUI();
  } catch (err) {
    console.error('[PRISM] boot failed:', err);
    const host = $('#toasts');
    if (host) {
      const el = document.createElement('div');
      el.className = 'toast err';
      el.textContent = 'UI failed to initialise: ' + (err && err.message ? err.message : err);
      host.appendChild(el);
    }
    return;
  }

  // accept .prism.json session drops too
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', async e => {
    const f = [...(e.dataTransfer?.files || [])].find(x => /\.json$/i.test(x.name));
    if (!f) return;
    e.preventDefault();
    try {
      await loadSessionJson(await f.text());
      $('#projectName').value = session.name;
    } catch (err) {
      console.error(err);
      toast('Could not load session: ' + err.message, 'err');
    }
  });

  // keep name field in sync
  session.on('change', reason => {
    if (reason === 'load') $('#projectName').value = session.name;
  });

  // first paint
  requestAnimationFrame(() => { resize(); redraw(); });
  setTimeout(() => { resize(); redraw(); }, 250);

  // expose a tiny debug handle
  window.PRISM = { session, view, engine, renderSession, redraw };
  console.log('%cPRISM%c Spectral Stem Studio — everything runs on-device.',
    'background:#7c5cff;color:#fff;padding:2px 8px;border-radius:4px;font-weight:bold', 'color:#22d3ee');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
