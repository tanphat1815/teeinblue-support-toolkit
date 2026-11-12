import { MSG } from '@/shared/constants';
import type { Req } from '@/shared/messages';
import { loadSnippets } from '@/services/snippets';
import { adminStatus, clearTabState, detectTheme, inject, listUndo, onSessionCaptured, onThemesCaptured, openThemes, previewInject, undo } from './admin';
import { captureBug, getTabContext, runHealth } from './storefront';

const setPanel = () => chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});
chrome.runtime.onInstalled.addListener(setPanel);
chrome.runtime.onStartup.addListener(setPanel);

chrome.tabs.onRemoved.addListener((id) => clearTabState(id));
chrome.tabs.onUpdated.addListener((id, info, tab) => {
  if (info.status === 'loading' && /^https:\/\/admin\.shopify\.com\//.test(tab.url || '')) clearTabState(id);
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
  }
}

chrome.runtime.onMessage.addListener((msg: any, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') return false;

  // từ content script (admin-relay.js)
  if (msg.type === MSG.CONTENT_THEMES && sender.tab?.id != null) {
    onThemesCaptured(sender.tab.id, msg.themes || []);
    return false;
  }
  if (msg.type === MSG.CONTENT_SESSION && sender.tab?.id != null) {
    onSessionCaptured(sender.tab.id, sender.frameId ?? 0, msg.handle || '');
    return false;
  }

  // từ side panel
  handle(msg as Req)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((e) => sendResponse({ ok: false, error: (e as Error)?.message || String(e) }));
  return true;
});
