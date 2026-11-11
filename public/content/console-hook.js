(() => {
  'use strict';
  if (window.__tibConsoleHook) return;
  const MAX = 50;
  const buf = [];
  const push = (type, message, extra) => {
    buf.push({ type, message: String(message).slice(0, 2000), ts: Date.now(), url: location.href, ...(extra || {}) });
    if (buf.length > MAX) buf.shift();
  };
  const fmt = (a) => {
    try {
      if (a instanceof Error) return a.stack || a.message;
      if (a && typeof a === 'object') return JSON.stringify(a);
      return String(a);
    } catch (_) {
      return Object.prototype.toString.call(a);
    }
  };
  Object.defineProperty(window, '__tibConsoleHook', {
    value: { get: () => buf.slice(), clear: () => { buf.length = 0; } },
    enumerable: false
  });

  const origError = console.error;
  console.error = function (...args) {
    try { push('console.error', args.map(fmt).join(' ')); } catch (_) {}
    return origError.apply(this, args);
  };

  window.addEventListener('error', (e) => {
    const t = e.target;
    if (t && t !== window && t.tagName) {
      push('resource-error', `Failed to load <${t.tagName.toLowerCase()}> ${t.src || t.href || ''}`);
    } else {
      push('window.onerror', `${e.message} @ ${e.filename}:${e.lineno}:${e.colno}`, { stack: e.error && e.error.stack });
    }
  }, true);

  window.addEventListener('unhandledrejection', (e) => push('unhandledrejection', fmt(e.reason)));
})();
