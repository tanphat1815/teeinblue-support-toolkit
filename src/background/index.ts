import { MSG } from '@/shared/constants';
import type { Req } from '@/shared/messages';
import { loadSnippets } from '@/services/snippets';
import { adminStatus, clearTabState, detectTheme, inject, listUndo, onSessionCaptured, onThemesCaptured, openThemes, previewInject, touchTabActive, undo } from './admin';
import { captureBug, getTabContext, runHealth } from './storefront';
import {
  onOverlayCancel,
  onOverlayDone,
  openRecorder,
  startAreaCapture,
  startAreaRecord,
  startViewportCapture
} from './capture';

const setPanel = () => chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});
chrome.runtime.onInstalled.addListener(setPanel);
chrome.runtime.onStartup.addListener(setPanel);

chrome.tabs.onRemoved.addListener((id) => clearTabState(id));
chrome.tabs.onActivated.addListener((info) => touchTabActive(info.tabId));
chrome.tabs.onUpdated.addListener((id, info, tab) => {
  // Không xóa tab state khi status === 'loading' vì Shopify SPA chuyển route liên tục sẽ làm mất session
  if (tab.url && /^https:\/\/admin\.shopify\.com\/store\//.test(tab.url)) touchTabActive(id);
});

async function handle(req: Req): Promise<unknown> {
  switch (req.type) {
    case 'GET_TAB_CONTEXT': return getTabContext();
    case 'CAPTURE_BUG': return captureBug();
    case 'RUN_HEALTH': return runHealth();
    case 'ADMIN_STATUS': return adminStatus(req.storeHandle);
    case 'DETECT_THEME': return detectTheme(req.adminTabId, req.themeId);
    case 'INJECT': return inject(req);
    case 'LIST_UNDO': return listUndo(req.storeHandle);
    case 'UNDO': return undo(req.adminTabId, req.undoId);
    case 'PREVIEW_INJECT': return previewInject(req.adminTabId, req.themeId, req.targets);
    case 'FETCH_SNIPPETS': return loadSnippets(req.sourceUrl, req.force);
    case 'OPEN_THEMES': return openThemes(req.storeHandle);
    case 'START_AREA_CAPTURE': return startAreaCapture(req.delay);
    case 'START_VIEWPORT_CAPTURE': return startViewportCapture(req.delay);
    case 'START_AREA_RECORD': return startAreaRecord();
    case 'OPEN_RECORDER': return openRecorder(req.crop);
    case 'SHOPIFY_FETCH': {
      try {
        const res = await fetch(req.url, {
          method: req.options.method || 'GET',
          headers: req.options.headers,
          body: req.options.body
        });
        const status = res.status;
        const text = await res.text();
        return { ok: res.ok, status, text };
      } catch (err: any) {
        return { ok: false, status: 0, error: err.message };
      }
    }
    case 'RELOAD_ADMIN_TAB': {
      if (req.tabId) {
        await chrome.tabs.reload(req.tabId);
        return { ok: true };
      }
      return { ok: false };
    }
  }
}

chrome.runtime.onMessage.addListener((msg: any, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') return false;

  // từ content script (admin-relay.js)
  if (msg.type === MSG.CONTENT_THEMES && sender.tab?.id != null) {
    onThemesCaptured(sender.tab.id, msg.themes || []);
    chrome.runtime.sendMessage({ type: MSG.ADMIN_STATE_UPDATED, tabId: sender.tab.id }).catch(() => {});
    return false;
  }
  if (msg.type === MSG.CONTENT_SESSION && sender.tab?.id != null) {
    onSessionCaptured(sender.tab.id, sender.frameId ?? 0, msg.handle || '');
    chrome.runtime.sendMessage({ type: MSG.ADMIN_STATE_UPDATED, tabId: sender.tab.id }).catch(() => {});
    return false;
  }

  // từ overlay capture
  if (msg.type === 'TIBK_OVERLAY_DONE') {
    onOverlayDone(sender, msg)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }
  if (msg.type === 'TIBK_OVERLAY_CANCEL') {
    onOverlayCancel(msg.captureId);
    return false;
  }

  // Sự kiện từ record box overlay
  if (msg.type === 'START_AREA_RECORDING_WITH_CROP') {
    openRecorder(msg.crop);
    return false;
  }
  if (msg.type === 'REC_TOGGLE_PAUSE' || msg.type === 'REC_STOP') {
    // Chuyển tiếp tới popup recorder
    chrome.runtime.sendMessage(msg).catch(() => {});
    return false;
  }

  // từ side panel
  handle(msg as Req)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((e) => sendResponse({ ok: false, error: (e as Error)?.message || String(e) }));
  return true;
});

// phím tắt
chrome.commands.onCommand.addListener((cmd) => {
  if (cmd === 'start-area-capture') startAreaCapture().catch((e) => console.warn('[capture]', e));
  else if (cmd === 'toggle-record') {
    // Phát lệnh toggle ghi hình tới recorder hoặc mở popup
    chrome.runtime.sendMessage({ type: 'CMD_TOGGLE_RECORD' }).catch(() => {
      openRecorder().catch(() => {});
    });
  } else if (cmd === 'pause-record') {
    chrome.runtime.sendMessage({ type: 'CMD_PAUSE_RECORD' }).catch(() => {});
  }
});
