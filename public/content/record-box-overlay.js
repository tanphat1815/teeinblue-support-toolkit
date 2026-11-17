(() => {
  'use strict';
  if (window.__tibkRecordBoxInstalled) {
    if (window.__tibkRecordBoxShow) window.__tibkRecordBoxShow();
    return;
  }
  window.__tibkRecordBoxInstalled = true;

  const host = document.createElement('div');
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483646;pointer-events:none;';
  const root = host.attachShadow({ mode: 'closed' });

  root.innerHTML = `
    <style>
      .overlay-wrap {
        position: fixed;
        inset: 0;
        pointer-events: none;
        user-select: none;
        -webkit-user-select: none;
        font-family: system-ui, -apple-system, sans-serif;
      }
      .box {
        position: absolute;
        border: 2px solid #ef4444;
        box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.45);
        pointer-events: auto;
        cursor: move;
        min-width: 160px;
        min-height: 120px;
        box-sizing: border-box;
      }
      /* 8 resize handles */
      .hdl {
        position: absolute;
        width: 10px;
        height: 10px;
        background: #ffffff;
        border: 2px solid #ef4444;
        box-sizing: border-box;
        border-radius: 2px;
      }
      .hdl-nw { top: -5px; left: -5px; cursor: nwse-resize; }
      .hdl-n  { top: -5px; left: 50%; transform: translateX(-50%); cursor: ns-resize; }
      .hdl-ne { top: -5px; right: -5px; cursor: nesw-resize; }
      .hdl-e  { top: 50%; right: -5px; transform: translateY(-50%); cursor: ew-resize; }
      .hdl-se { bottom: -5px; right: -5px; cursor: nwse-resize; }
      .hdl-s  { bottom: -5px; left: 50%; transform: translateX(-50%); cursor: ns-resize; }
      .hdl-sw { bottom: -5px; left: -5px; cursor: nesw-resize; }
      .hdl-w  { top: 50%; left: -5px; transform: translateY(-50%); cursor: ew-resize; }

      /* Center Toolbar Dialog (giống ảnh mẫu) */
      .card {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #1e293b;
        color: #ffffff;
        border-radius: 12px;
        padding: 10px 16px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
        cursor: default;
        pointer-events: auto;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        min-width: 200px;
      }
      .card-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        font-size: 11px;
        color: #94a3b8;
      }
      .card-close {
        cursor: pointer;
        padding: 2px 4px;
        border-radius: 4px;
      }
      .card-close:hover { background: rgba(255,255,255,0.1); color: #fff; }
      .size-label {
        font-size: 13px;
        font-weight: 700;
        font-family: monospace;
        color: #f8fafc;
      }
      .btn-record {
        all: unset;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        background: #ef4444;
        color: #ffffff;
        font-weight: 600;
        font-size: 12px;
        padding: 6px 16px;
        border-radius: 8px;
        cursor: pointer;
        width: 100%;
        box-sizing: border-box;
        text-align: center;
        transition: transform 0.1s, background 0.1s;
      }
      .btn-record:hover { background: #dc2626; }
      .btn-record:active { transform: scale(0.98); }
      .dot { width: 8px; height: 8px; border-radius: 50%; background: #ffffff; }

      /* Floating active recording panel */
      .rec-panel {
        position: fixed;
        right: 16px;
        top: 50%;
        transform: translateY(-50%);
        background: #0f172a;
        color: #fff;
        border-radius: 12px;
        padding: 10px;
        box-shadow: 0 8px 30px rgba(0,0,0,0.6);
        pointer-events: auto;
        display: none;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        z-index: 2147483647;
      }
      .rec-panel .timer { font-size: 12px; font-family: monospace; color: #ef4444; font-weight: 700; }
      .btn-icon {
        all: unset;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        cursor: pointer;
        background: rgba(255,255,255,0.1);
        font-size: 13px;
      }
      .btn-icon:hover { background: rgba(255,255,255,0.2); }
      .btn-stop { background: #ef4444; }
      .btn-stop:hover { background: #dc2626; }
    </style>

    <div class="overlay-wrap">
      <div class="box">
        <div class="hdl hdl-nw" data-h="nw"></div>
        <div class="hdl hdl-n"  data-h="n"></div>
        <div class="hdl hdl-ne" data-h="ne"></div>
        <div class="hdl hdl-e"  data-h="e"></div>
        <div class="hdl hdl-se" data-h="se"></div>
        <div class="hdl hdl-s"  data-h="s"></div>
        <div class="hdl hdl-sw" data-h="sw"></div>
        <div class="hdl hdl-w"  data-h="w"></div>

        <div class="card">
          <div class="card-head">
            <span>Record Video Area</span>
            <span class="card-close" id="btn-close">✕</span>
          </div>
          <div class="size-label" id="box-size">600 × 400</div>
          <button class="btn-record" id="btn-start">
            <span class="dot"></span>
            <span>Record</span>
          </button>
        </div>
      </div>

      <div class="rec-panel" id="rec-panel">
        <div class="timer" id="rec-timer">00:00</div>
        <button class="btn-icon" id="btn-pause-overlay" title="Tạm dừng / Tiếp tục">⏸</button>
        <button class="btn-icon btn-stop" id="btn-stop-overlay" title="Dừng quay">■</button>
      </div>
    </div>
  `;

  document.documentElement.appendChild(host);

  const box = root.querySelector('.box');
  const sizeLabel = root.querySelector('#box-size');
  const btnStart = root.querySelector('#btn-start');
  const btnClose = root.querySelector('#btn-close');
  const recPanel = root.querySelector('#rec-panel');
  const recTimer = root.querySelector('#rec-timer');
  const btnPause = root.querySelector('#btn-pause-overlay');
  const btnStop = root.querySelector('#btn-stop-overlay');

  // Khởi tạo toạ độ mặc định ở giữa màn hình
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let bw = Math.min(680, Math.round(vw * 0.7));
  let bh = Math.min(420, Math.round(vh * 0.6));
  let bx = Math.round((vw - bw) / 2);
  let by = Math.round((vh - bh) / 2);

  function updateBox() {
    box.style.left = bx + 'px';
    box.style.top = by + 'px';
    box.style.width = bw + 'px';
    box.style.height = bh + 'px';
    sizeLabel.textContent = `${Math.round(bw)} × ${Math.round(bh)}`;
  }
  updateBox();

  window.__tibkRecordBoxShow = () => {
    host.style.display = 'block';
    box.style.display = 'block';
    recPanel.style.display = 'none';
  };

  // Drag & Move
  let isDragging = false, dragStartX = 0, dragStartY = 0, origX = 0, origY = 0;
  // Resize
  let isResizing = false, resizeType = '', rStartX = 0, rStartY = 0, rOrigX = 0, rOrigY = 0, rOrigW = 0, rOrigH = 0;

  box.addEventListener('mousedown', (e) => {
    if (e.target.closest('.card')) return;
    const h = e.target.getAttribute('data-h');
    if (h) {
      isResizing = true;
      resizeType = h;
      rStartX = e.clientX;
      rStartY = e.clientY;
      rOrigX = bx;
      rOrigY = by;
      rOrigW = bw;
      rOrigH = bh;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    origX = bx;
    origY = by;
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (isDragging) {
      bx = Math.max(0, Math.min(window.innerWidth - bw, origX + (e.clientX - dragStartX)));
      by = Math.max(0, Math.min(window.innerHeight - bh, origY + (e.clientY - dragStartY)));
      updateBox();
    } else if (isResizing) {
      const dx = e.clientX - rStartX;
      const dy = e.clientY - rStartY;

      if (resizeType.includes('e')) bw = Math.max(160, rOrigW + dx);
      if (resizeType.includes('s')) bh = Math.max(120, rOrigH + dy);
      if (resizeType.includes('w')) {
        const newW = Math.max(160, rOrigW - dx);
        bx = rOrigX + (rOrigW - newW);
        bw = newW;
      }
      if (resizeType.includes('n')) {
        const newH = Math.max(120, rOrigH - dy);
        by = rOrigY + (rOrigH - newH);
        bh = newH;
      }
      updateBox();
    }
  }, true);

  window.addEventListener('mouseup', () => {
    isDragging = false;
    isResizing = false;
  }, true);

  btnClose.addEventListener('click', () => {
    host.style.display = 'none';
  });

  btnStart.addEventListener('click', () => {
    // Ẩn khung viền trong lúc chuẩn bị quay
    box.style.display = 'none';
    recPanel.style.display = 'flex';

    // Gửi toạ độ cho background/recorder
    chrome.runtime.sendMessage({
      type: 'START_AREA_RECORDING_WITH_CROP',
      crop: {
        x: Math.round(bx),
        y: Math.round(by),
        w: Math.round(bw),
        h: Math.round(bh),
        vw: window.innerWidth,
        vh: window.innerHeight
      }
    });
  });

  // Listener từ Background (Timer, Stop, Pause)
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg) return;
    if (msg.type === 'REC_TICK') {
      recTimer.textContent = msg.clock || '00:00';
    } else if (msg.type === 'REC_PAUSED_STATE') {
      btnPause.textContent = msg.paused ? '▶' : '⏸';
    } else if (msg.type === 'REC_STOPPED') {
      host.style.display = 'none';
    }
  });

  btnPause.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'REC_TOGGLE_PAUSE' });
  });

  btnStop.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'REC_STOP' });
    host.style.display = 'none';
  });
})();

