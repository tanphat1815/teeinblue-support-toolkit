import type { BugContext, HealthReport, HealthCheck, HealthConflict, Status } from '@/shared/types';
import type { HealthRules } from '@/data/health-rules';

export function probeShopify() {
  const w = window as any;
  const shop: string = w.Shopify?.shop || '';
  return {
    isShopify: !!w.Shopify,
    shop,
    storeHandle: shop.replace(/\.myshopify\.com$/i, ''),
    themeId: String(w.Shopify?.theme?.id || ''),
    schemaName: String(w.Shopify?.theme?.schema_name || '')
  };
}

export function collectBugContext(srcPattern: string, globals: string[]): BugContext {
  const w = window as any;
  const S = w.Shopify || {};
  const theme = S.theme || {};
  const meta = w.ShopifyAnalytics?.meta || {};
  const path = location.pathname;
  const guess = () => {
    if (path === '/' || path === '') return 'home';
    if (/\/products\//.test(path)) return 'product';
    if (/\/collections\//.test(path)) return 'collection';
    if (/^\/cart/.test(path)) return 'cart';
    if (/\/checkouts?\//.test(path)) return 'checkout';
    if (/^\/pages\//.test(path)) return 'page';
    if (/^\/blogs\//.test(path)) return 'blog';
    if (/^\/account/.test(path)) return 'account';
    if (/^\/search/.test(path)) return 'search';
    return 'other';
  };
  const re = new RegExp(srcPattern, 'i');
  const srcs = Array.from(document.scripts).map((s) => s.src).filter((s) => s && re.test(s));
  return {
    isShopify: !!w.Shopify,
    capturedAt: new Date().toISOString(),
    url: location.href,
    storeDomain: S.shop || location.hostname,
    pageType: meta.page?.pageType || guess(),
    theme: {
      id: String(theme.id || ''), name: String(theme.name || ''),
      schemaName: String(theme.schema_name || ''), schemaVersion: String(theme.schema_version || ''),
      role: String(theme.role || '')
    },
    locale: String(S.locale || document.documentElement.lang || ''),
    currency: String(S.currency?.active || ''),
    country: String(S.country || ''),
    userAgent: navigator.userAgent,
    viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio || 1 },
    product: meta.product
      ? { id: String(meta.product.id || ''), vendor: String(meta.product.vendor || ''), type: String(meta.product.type || '') }
      : null,
    teeinblue: { scriptSrcs: Array.from(new Set(srcs)), hasGlobal: globals.some((g) => w[g] !== undefined) },
    errors: w.__tibConsoleHook ? w.__tibConsoleHook.get() : null
  };
}

export function runHealthScan(rules: HealthRules): HealthReport {
  const w = window as any;
  const rank: Record<Status, number> = { ok: 0, warning: 1, error: 2 };
  const path = location.pathname;
  const pageType: string =
    w.ShopifyAnalytics?.meta?.page?.pageType || (/\/products\//.test(path) ? 'product' : path === '/' ? 'home' : 'other');
  const base = { pageType, url: location.href, scannedAt: new Date().toISOString() };
  if (!w.Shopify) return { ...base, isShopify: false, overall: 'warning', checks: [], conflicts: [] };

  const checks: HealthCheck[] = [];
  const add = (id: string, label: string, status: Status, detail: string) => checks.push({ id, label, status, detail });
  const isProduct = pageType === 'product';

  const scripts = Array.from(document.scripts);
  const srcs = scripts.map((s) => s.src).filter(Boolean);
  const tibRe = new RegExp(rules.teeinblue.srcPattern, 'i');
  const tibSrcs = srcs.filter((s) => tibRe.test(s));
  const inline = scripts.some((s) => !s.src && /teeinblue/i.test(s.textContent || ''));

  if (tibSrcs.length || inline) {
    add('script', 'Teeinblue script trong DOM', 'ok', tibSrcs.length ? tibSrcs.slice(0, 3).join('\n') : 'Chỉ thấy inline config.');
  } else if (isProduct) {
    add('script', 'Teeinblue script trong DOM', 'error', 'Không tìm thấy script Teeinblue trên trang sản phẩm.');
  } else {
    add('script', 'Teeinblue script trong DOM', 'warning', `Không thấy trên trang "${pageType}" (có thể chỉ load ở product page). Hãy quét lại ở product page.`);
  }

  const counts = new Map<string, number>();
  tibSrcs.forEach((s) => counts.set(s, (counts.get(s) || 0) + 1));
  const dup = [...counts.entries()].filter(([, n]) => n > 1);
  add('dup', 'Script bị load trùng', dup.length ? 'warning' : 'ok', dup.length ? dup.map(([s, n]) => `${n}x ${s}`).join('\n') : 'Không trùng.');

  const hasGlobal = rules.teeinblue.globals.some((g) => w[g] !== undefined);
  add('global', 'Biến cấu hình window.teeinblue', hasGlobal ? 'ok' : 'warning', hasGlobal ? 'Có.' : 'Không thấy global (có thể theme chưa có config).');

  let widget = false;
  for (const sel of rules.teeinblue.domSelectors) {
    try { if (document.querySelector(sel)) { widget = true; break; } } catch { /* selector lỗi */ }
  }
  if (isProduct) add('widget', 'Widget Teeinblue render ra DOM', widget ? 'ok' : (tibSrcs.length ? 'warning' : 'error'), widget ? 'Có element Teeinblue.' : 'Không thấy element Teeinblue (script có thể chưa chạy/bị lỗi).');

  const errs: any[] = w.__tibConsoleHook ? w.__tibConsoleHook.get() : [];
  if (!w.__tibConsoleHook) {
    add('errors', 'Lỗi console', 'warning', 'Hook chưa chạy — reload trang để bắt lỗi.');
  } else {
    const tibErrs = errs.filter((e) => /teeinblue|tib-|\btee-/i.test(`${e.message} ${e.stack || ''}`));
    if (tibErrs.length) add('errors', 'Lỗi liên quan Teeinblue', 'error', tibErrs.slice(-3).map((e) => `${e.type}: ${String(e.message).slice(0, 200)}`).join('\n'));
    else if (errs.length) add('errors', 'Lỗi console khác', 'warning', `${errs.length} lỗi (không thấy liên quan Teeinblue).`);
    else add('errors', 'Lỗi console', 'ok', 'Không có lỗi.');
  }

  const conflicts: HealthConflict[] = [];
  for (const rule of rules.conflicts) {
    let evidence = '';
    if (rule.srcPattern) {
      const r = new RegExp(rule.srcPattern, 'i');
      const hit = srcs.find((s) => r.test(s));
      if (hit) evidence = `script: ${hit}`;
    }
    if (!evidence && rule.globals) {
      const g = rule.globals.find((x) => w[x] !== undefined);
      if (g) evidence = `window.${g}`;
    }
    if (!evidence && rule.domSelectors) {
      for (const sel of rule.domSelectors) {
        try { if (document.querySelector(sel)) { evidence = `DOM: ${sel}`; break; } } catch { /* ignore */ }
      }
    }
    if (evidence) conflicts.push({ id: rule.id, name: rule.name, category: rule.category, evidence });
  }
  add('conflicts', 'App có thể xung đột', conflicts.length ? 'warning' : 'ok', conflicts.length ? `${conflicts.length} app phát hiện (xem bên dưới).` : 'Không phát hiện.');

  const overall = checks.reduce<Status>((a, c) => (rank[c.status] > rank[a] ? c.status : a), 'ok');
  return { ...base, isShopify: true, overall, checks, conflicts };
}
