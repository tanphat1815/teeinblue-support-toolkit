(() => {
  'use strict';
  const FLAG = '__tibToolkit';
  const T = { THEMES: 'TIBK_CONTENT_THEMES', SESSION: 'TIBK_CONTENT_SESSION', TO_PAGE: 'TIBK_TO_PAGE' };
  const pending = new Map();

  const uid = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  const send = (m) => { try { chrome.runtime.sendMessage(m, () => void chrome.runtime.lastError); } catch (_) {} };

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d[FLAG] !== true) return;
    if (d.kind === 'themes') return send({ type: T.THEMES, themes: d.themes || [] });
    if (d.kind === 'session') return send({ type: T.SESSION, handle: d.handle || '' });
    if (d.kind === 'result' && d.requestId && pending.has(d.requestId)) {
      const entry = pending.get(d.requestId);
      pending.delete(d.requestId);
      clearTimeout(entry.timer);
      entry.sendResponse(d.result || { ok: false, error: 'Empty page result.' });
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== T.TO_PAGE) return false;
    const requestId = uid();
    const timer = setTimeout(() => {
      if (!pending.has(requestId)) return;
      pending.delete(requestId);
      sendResponse({ ok: false, error: 'Timed out waiting for Shopify page bridge.' });
    }, 60000);
    pending.set(requestId, { sendResponse, timer });
    window.postMessage({ [FLAG]: true, kind: 'request', requestId, action: message.action, payload: message.payload || {} }, '*');
    return true;
  });
})();
