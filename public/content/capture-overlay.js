(() => {
  'use strict';
  if (window.__tibkOverlayInstalled) return;
  window.__tibkOverlayInstalled = true;
  let cleanup = null;

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'TIBK_OVERLAY_START') start(msg.captureId, msg.dataUrl);
  });

  function start(captureId, dataUrl) {
    if (cleanup) cleanup();
    const host = document.createElement('div');
    host.style.cssText = 'all:initial;position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `
      <style>
        .stage{position:fixed;inset:0;cursor:crosshair;user-select:none;-webkit-user-select:none;background:#000;font:13px system-ui,sans-serif;overflow:hidden}
        img{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;-webkit-user-drag:none}
        .dim{position:absolute;inset:0;background:rgba(0,0,0,.4);pointer-events:none}
        .sel{position:absolute;border:1px dashed #ffffff;outline:1px dashed #2563eb;box-shadow:0 0 0 100vmax rgba(0,0,0,.4);display:none;pointer-events:none}
        /* 4 L-shaped crop corners */
        .sel .corner{position:absolute;width:12px;height:12px;border:3px solid #ffffff;pointer-events:none;filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))}
        .sel .c-tl{top:-2px;left:-2px;border-right:none;border-bottom:none}
        .sel .c-tr{top:-2px;right:-2px;border-left:none;border-bottom:none}
        .sel .c-bl{bottom:-2px;left:-2px;border-right:none;border-top:none}
        .sel .c-br{bottom:-2px;right:-2px;border-left:none;border-top:none}
        /* Mid handles */
        .sel .handle{position:absolute;background:#ffffff;border:1px solid #2563eb;border-radius:2px;pointer-events:none}
        .sel .h-t{top:-3px;left:50%;transform:translateX(-50%);width:16px;height:4px}
        .sel .h-b{bottom:-3px;left:50%;transform:translateX(-50%);width:16px;height:4px}
        .sel .h-l{left:-3px;top:50%;transform:translateY(-50%);width:4px;height:16px}
        .sel .h-r{right:-3px;top:50%;transform:translateY(-50%);width:4px;height:16px}
        .hint{position:absolute;top:10px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,.92);color:#fff;padding:6px 10px;border-radius:6px;display:flex;gap:10px;align-items:center;cursor:default}
        .bar{position:absolute;display:none;gap:6px;background:#fff;border-radius:6px;padding:4px;box-shadow:0 2px 8px rgba(0,0,0,.4);cursor:default}
        button{all:unset;cursor:pointer;padding:4px 10px;border-radius:4px;background:#2563eb;color:#fff;font:600 12px system-ui,sans-serif}
        button.sec{background:#e2e8f0;color:#0f172a} button.x{background:#ef4444}
      </style>
      <div class="stage">
        <img alt=""><div class="dim"></div>
        <div class="sel">
          <div class="corner c-tl"></div>
          <div class="corner c-tr"></div>
          <div class="corner c-bl"></div>
          <div class="corner c-br"></div>
          <div class="handle h-t"></div>
          <div class="handle h-b"></div>
          <div class="handle h-l"></div>
          <div class="handle h-r"></div>
        </div>
        <div class="hint"><span>Kéo để chọn vùng · Enter: chỉnh sửa · Ctrl+C: copy · Esc: huỷ</span><button class="sec" data-a="edit">Cả màn hình</button><button class="x" data-a="cancel">Huỷ</button></div>
        <div class="bar"><button data-a="edit">✎ Chỉnh sửa</button><button class="sec" data-a="copy">⧉ Copy</button><button class="x" data-a="cancel">✕</button></div>
      </div>`;
    const $ = (s) => root.querySelector(s);
    const stage = $('.stage'), img = $('img'), dim = $('.dim'), sel = $('.sel'), bar = $('.bar');
    img.src = dataUrl;

    let startPt = null, rect = null, drawing = false;
    const setSel = (r) => {
      rect = r; sel.style.display = 'block'; dim.style.display = 'none';
      sel.style.left = r.x + 'px'; sel.style.top = r.y + 'px'; sel.style.width = r.w + 'px'; sel.style.height = r.h + 'px';
    };
    const clearSel = () => { rect = null; sel.style.display = 'none'; dim.style.display = 'block'; bar.style.display = 'none'; };

    stage.addEventListener('mousedown', (e) => {
      if (e.target.closest('button') || e.target.closest('.bar') || e.target.closest('.hint')) return;
      drawing = true; startPt = { x: e.clientX, y: e.clientY }; clearSel(); e.preventDefault();
    });
    stage.addEventListener('mousemove', (e) => {
      if (!drawing) return;
      setSel({ x: Math.min(startPt.x, e.clientX), y: Math.min(startPt.y, e.clientY), w: Math.abs(e.clientX - startPt.x), h: Math.abs(e.clientY - startPt.y) });
    });
    const onUp = () => {
      if (!drawing) return;
      drawing = false;
      if (!rect || rect.w < 6 || rect.h < 6) return clearSel();
      const vw = window.innerWidth, vh = window.innerHeight;
      bar.style.display = 'flex';
      let top = rect.y + rect.h + 8; if (top > vh - 40) top = Math.max(8, rect.y + rect.h - 40);
      bar.style.top = top + 'px';
      bar.style.left = Math.max(8, Math.min(rect.x + rect.w - 190, vw - 200)) + 'px';
    };
    window.addEventListener('mouseup', onUp, true);
    stage.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });

    function finish(action) {
      if (action === 'cancel') {
        try { chrome.runtime.sendMessage({ type: 'TIBK_OVERLAY_CANCEL', captureId }); } catch (_) {}
        return cleanup();
      }
      const rx = img.naturalWidth / window.innerWidth, ry = img.naturalHeight / window.innerHeight;
      let crop = null;
      if (rect) {
        const x = Math.max(0, Math.round(rect.x * rx)), y = Math.max(0, Math.round(rect.y * ry));
        crop = { x, y, w: Math.min(img.naturalWidth - x, Math.round(rect.w * rx)), h: Math.min(img.naturalHeight - y, Math.round(rect.h * ry)) };
      }
      try { chrome.runtime.sendMessage({ type: 'TIBK_OVERLAY_DONE', captureId, rect: crop, action }); } catch (_) {}
      cleanup();
    }
    root.addEventListener('click', (e) => {
      const a = e.target && e.target.getAttribute && e.target.getAttribute('data-a');
      if (a) finish(a);
    });
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); finish('cancel'); }
      else if (e.key === 'Enter') { e.stopPropagation(); finish('edit'); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { e.stopPropagation(); e.preventDefault(); finish('copy'); }
    };
    window.addEventListener('keydown', onKey, true);

    cleanup = () => {
      window.removeEventListener('mouseup', onUp, true);
      window.removeEventListener('keydown', onKey, true);
      host.remove(); cleanup = null;
    };
    document.documentElement.appendChild(host);
    window.focus();
  }
})();

