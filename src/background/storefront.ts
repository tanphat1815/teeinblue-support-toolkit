import { HEALTH_RULES } from '@/data/health-rules';
import type { BugContext, HealthReport, TabContext } from '@/shared/types';
import { collectBugContext, probeShopify, runHealthScan } from './injected';

export const EMPTY_CTX: TabContext = { tabId: null, url: '', kind: 'unsupported', storeHandle: '', themeId: '', schemaName: '' };

export async function activeTab(): Promise<chrome.tabs.Tab | null> {
  const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return t || null;
}

async function runInMain<R>(tabId: number, func: (...a: any[]) => R, args: unknown[] = []): Promise<R> {
  const res = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func, args });
  const r = res?.[0]?.result;
  if (r === undefined) throw new Error('Không nhận được kết quả từ trang (trang đang load hoặc bị chặn).');
  return r as R;
}

export async function getTabContext(): Promise<TabContext> {
  const tab = await activeTab();
  if (!tab?.id || !tab.url) return { ...EMPTY_CTX };
  let u: URL;
  try { u = new URL(tab.url); } catch { return { ...EMPTY_CTX, tabId: tab.id }; }
  const base = { ...EMPTY_CTX, tabId: tab.id, url: tab.url };

  if (u.hostname === 'admin.shopify.com') {
    const m = u.pathname.match(/^\/store\/([^/?#]+)/);
    if (m) return { ...base, kind: 'admin', storeHandle: m[1] };
    return { ...base, kind: 'other' };
  }
  if (!/^https?:$/.test(u.protocol)) return { ...base, kind: 'unsupported' };
  try {
    const p = await runInMain(tab.id, probeShopify);
    return p.isShopify
      ? { ...base, kind: 'storefront', storeHandle: p.storeHandle, themeId: p.themeId, schemaName: p.schemaName }
      : { ...base, kind: 'other' };
  } catch {
    return { ...base, kind: 'unsupported' };
  }
}

async function storefrontTabId(): Promise<number> {
  const ctx = await getTabContext();
  if (ctx.kind !== 'storefront' || ctx.tabId == null) throw new Error('Tab hiện tại không phải storefront Shopify. Mở trang cửa hàng của merchant rồi thử lại.');
  return ctx.tabId;
}

export async function captureBug(): Promise<BugContext> {
  const id = await storefrontTabId();
  return runInMain(id, collectBugContext, [HEALTH_RULES.teeinblue.srcPattern, HEALTH_RULES.teeinblue.globals]);
}

export async function runHealth(): Promise<HealthReport> {
  const id = await storefrontTabId();
  return runInMain(id, runHealthScan, [HEALTH_RULES]);
}
