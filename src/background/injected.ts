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
    w.ShopifyAnalytics?.meta?.page?.pageType || (/\/products\//.test(path) ? 'product' : /^\/cart/.test(path) ? 'cart' : path === '/' ? 'home' : 'other');
  const base = { pageType, url: location.href, scannedAt: new Date().toISOString() };
  if (!w.Shopify) return { ...base, isShopify: false, overall: 'warning', checks: [], conflicts: [] };

  const checks: HealthCheck[] = [];
  const add = (id: string, label: string, status: Status, detail: string, category: HealthCheck['category'] = 'general', suggestion?: string) => {
    checks.push({ id, label, status, detail, category, suggestion });
  };
  const isProduct = pageType === 'product';
  const isCart = pageType === 'cart' || /^\/cart/.test(path);

  const scripts = Array.from(document.scripts);
  const srcs = scripts.map((s) => s.src).filter(Boolean);
  const tibRe = new RegExp(rules.teeinblue.srcPattern, 'i');
  const tibSrcs = srcs.filter((s) => tibRe.test(s));
  const inline = scripts.some((s) => !s.src && /teeinblue/i.test(s.textContent || ''));

  // ==========================================
  // NHÓM 1: Cấu hình chung & Script SDK
  // ==========================================
  // 1. Script trong DOM
  if (tibSrcs.length || inline) {
    add(
      'script',
      'Teeinblue script trong DOM',
      'ok',
      tibSrcs.length ? tibSrcs.slice(0, 3).join('\n') : 'Chỉ thấy inline config.',
      'config'
    );
  } else if (isProduct) {
    add(
      'script',
      'Teeinblue script trong DOM',
      'error',
      'Không tìm thấy script Teeinblue trên trang sản phẩm.',
      'config',
      'Kiểm tra xem theme đã bật App Embed "Teeinblue Personalizer" trong Theme Customize > App Embeds chưa.'
    );
  } else {
    add(
      'script',
      'Teeinblue script trong DOM',
      'warning',
      `Không thấy trên trang "${pageType}" (có thể app chỉ cấu hình load ở trang sản phẩm hoặc trang cart).`,
      'config'
    );
  }

  // 2. Script load trùng
  const counts = new Map<string, number>();
  tibSrcs.forEach((s) => counts.set(s, (counts.get(s) || 0) + 1));
  const dup = [...counts.entries()].filter(([, n]) => n > 1);
  add(
    'dup',
    'Script bị load trùng',
    dup.length ? 'warning' : 'ok',
    dup.length ? dup.map(([s, n]) => `${n}x ${s}`).join('\n') : 'Không trùng lặp.',
    'config',
    dup.length ? 'Có script bị load nhiều lần. Kiểm tra xem có vừa bật App Embed vừa dán script thủ công trong theme.liquid không.' : undefined
  );

  // 3. Biến toàn cục Teeinblue & App Subscription
  const hasGlobal = rules.teeinblue.globals.some((g) => w[g] !== undefined);
  const campaignObj = w.teeinblueCampaign;
  const shopObj = w.teeinblueShop;
  const shopConfig = w.teeinblueShopConfig;

  let globalDetail = 'Không thấy các biến toàn cục teeinblue.';
  let globalStatus: Status = 'warning';
  let globalSuggestion: string | undefined = undefined;

  if (hasGlobal) {
    const globalsFound = rules.teeinblue.globals.filter((g) => w[g] !== undefined);
    globalDetail = `Đã tìm thấy các biến cấu hình:\n• ${globalsFound.map(g => `window.${g}`).join('\n• ')}`;
    globalStatus = 'ok';
  } else if (isProduct) {
    globalDetail = 'Không tìm thấy window.teeinblue hoặc window.teeinblueCampaign.';
    globalStatus = 'error';
    globalSuggestion = 'Theme chưa render block personalizer.liquid hoặc shop đã hết hạn subscription app.';
  }
  add('global', 'Biến cấu hình toàn cục (Global Objects)', globalStatus, globalDetail, 'config', globalSuggestion);

  // 4. Phát hiện App Embed Block
  const hasAppEmbed = srcs.some(s => /extensions\/.*teeinblue/i.test(s)) || document.querySelector('script[id*="personalizer-config"], script[id*="teeinblue"]');
  add(
    'app_embed',
    'Theme App Embed Extension',
    hasAppEmbed ? 'ok' : (isProduct ? 'warning' : 'ok'),
    hasAppEmbed ? 'Đã kích hoạt App Embed Teeinblue Personalizer.' : 'Không phát hiện App Embed extension block của Teeinblue trong DOM.',
    'config',
    !hasAppEmbed && isProduct ? 'Khuyên dùng: Vào Shopify Admin > Online Store > Themes > Customize > App Embeds và bật "Teeinblue Personalizer".' : undefined
  );

  // ==========================================
  // NHÓM 2: Trang sản phẩm & Campaign
  // ==========================================
  if (isProduct) {
    // 5. Kiểm tra liên kết Campaign
    if (campaignObj) {
      const isTibProduct = !!campaignObj.isTeeInBlueProduct;
      const isPlatformProduct = !!campaignObj.isPlatformProduct;
      const version = campaignObj.version;

      if (isTibProduct || isPlatformProduct) {
        add(
          'campaign_link',
          'Liên kết Campaign với Sản phẩm',
          'ok',
          `• Phân loại: ${isPlatformProduct ? 'Platform Product' : 'Teeinblue Product'}\n• Version: ${version || 'Chưa có'}\n• Product ID: ${campaignObj.productId || 'N/A'}`,
          'product'
        );
      } else {
        add(
          'campaign_link',
          'Liên kết Campaign với Sản phẩm',
          'warning',
          'Sản phẩm này chưa được liên kết với Campaign Teeinblue (isTeeInBlueProduct = false).',
          'product',
          'Nếu đây là sản phẩm cá nhân hóa, vui lòng vào Teeinblue Portal > Campaigns > Launch/Publish chiến dịch cho sản phẩm này.'
        );
      }
    } else {
      add(
        'campaign_link',
        'Liên kết Campaign với Sản phẩm',
        'warning',
        'Không tìm thấy dữ liệu window.teeinblueCampaign trên trang sản phẩm.',
        'product'
      );
    }

    // 6. Widget Teeinblue render ra DOM
    let widget = false;
    let foundSelector = '';
    for (const sel of rules.teeinblue.domSelectors) {
      try {
        if (document.querySelector(sel)) {
          widget = true;
          foundSelector = sel;
          break;
        }
      } catch { /* ignore */ }
    }
    add(
      'widget',
      'Widget Personalizer render ra DOM',
      widget ? 'ok' : (tibSrcs.length ? 'warning' : 'error'),
      widget ? `Đã render thành công (tìm thấy: ${foundSelector}).` : 'Chưa thấy phần tử giao diện của Teeinblue (#teeinblue-wrapper) trong DOM.',
      'product',
      !widget ? 'Widget chưa kịp mount hoặc bị lỗi Javascript. Kiểm tra mục Lỗi console.' : undefined
    );

    // ==========================================
    // NHÓM 3: Kiểm tra Form Theme & Nút ATC / Buy Now
    // ==========================================
    // 7. Form Add to Cart của Theme
    let themeForm: HTMLElement | null = null;
    for (const sel of rules.themeFormSelectors) {
      try {
        const el = document.querySelector(sel) as HTMLElement;
        if (el) { themeForm = el; break; }
      } catch { /* ignore */ }
    }
    add(
      'theme_form',
      'Form Add to Cart gốc của Theme',
      themeForm ? 'ok' : 'warning',
      themeForm ? 'Đã nhận diện được form submit của theme.' : 'Không nhận diện được form Add To Cart mặc định (form[action*="/cart/add"]).',
      'form',
      !themeForm ? 'Theme có thể đang dùng class/cấu trúc form tùy biến, cần snippet can thiệp hook nếu Teeinblue không tự bắt được.' : undefined
    );

    // 8. Trạng thái ẩn/hiện của nút ATC gốc
    let nativeAtcButtons: HTMLElement[] = [];
    for (const sel of rules.nativeAtcSelectors) {
      try {
        const btns = Array.from(document.querySelectorAll(sel)) as HTMLElement[];
        if (btns.length) nativeAtcButtons.push(...btns);
      } catch { /* ignore */ }
    }
    // Lọc các nút trùng lặp
    nativeAtcButtons = Array.from(new Set(nativeAtcButtons));
    // Kiểm tra nút có visible không (không bị display:none hoặc visibility:hidden)
    const visibleNativeAtc = nativeAtcButtons.filter(btn => {
      const style = window.getComputedStyle(btn);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && btn.offsetWidth > 0;
    });

    const teeAtcBtn = document.querySelector('#teeAtcButton, [id*="teeAtcButton"]');

    if (visibleNativeAtc.length > 0 && teeAtcBtn) {
      add(
        'native_atc',
        'Xung đột Nút Add to Cart (2 nút ATC)',
        'error',
        `CẢNH BÁO: Phát hiện ${visibleNativeAtc.length} nút Add to Cart gốc của theme vẫn đang hiển thị song song với nút của Teeinblue!`,
        'form',
        'Khách bấm nhầm nút gốc của theme sẽ thêm sản phẩm thường (thiếu ảnh in và customization). Cần dùng Snippet ẩn nút Add to Cart mặc định của theme.'
      );
    } else if (visibleNativeAtc.length > 0 && !teeAtcBtn) {
      add(
        'native_atc',
        'Nút Add to Cart của Theme',
        'ok',
        'Nút Add to Cart của theme hiển thị bình thường (Teeinblue chưa render hoặc sản phẩm thường).',
        'form'
      );
    } else {
      add(
        'native_atc',
        'Trạng thái nút Add to Cart gốc',
        'ok',
        'Nút Add to Cart mặc định của theme đã được ẩn hoặc thay thế thành công bởi Teeinblue.',
        'form'
      );
    }

    // 9. Nút Mua ngay / Dynamic Checkout (Buy It Now / Shop Pay / PayPal)
    let dynamicButtons: HTMLElement[] = [];
    for (const sel of rules.dynamicCheckoutSelectors) {
      try {
        const dbtns = Array.from(document.querySelectorAll(sel)) as HTMLElement[];
        if (dbtns.length) dynamicButtons.push(...dbtns);
      } catch { /* ignore */ }
    }
    const visibleDynamic = dynamicButtons.filter(btn => {
      const style = window.getComputedStyle(btn);
      return style.display !== 'none' && style.visibility !== 'hidden' && btn.offsetWidth > 0;
    });

    if (visibleDynamic.length > 0 && campaignObj?.isTeeInBlueProduct) {
      add(
        'dynamic_checkout',
        'Nút Mua Nhanh (Dynamic Checkout / Buy It Now)',
        'warning',
        'Phát hiện nút Buy It Now / Shop Pay / PayPal mặc định của Shopify đang bật trên sản phẩm Teeinblue.',
        'form',
        'Nút này bypass giỏ hàng khiến đơn hàng không gắn được _customization_id. Khuyên dùng: Tắt "Show dynamic checkout buttons" trong Theme Customize hoặc dùng tính năng Buy Now của Teeinblue.'
      );
    } else {
      add(
        'dynamic_checkout',
        'Nút Mua Nhanh (Dynamic Checkout)',
        'ok',
        'Không phát hiện nút Dynamic Checkout gây xung đột.',
        'form'
      );
    }
  }

  // ==========================================
  // NHÓM 4: Kiểm tra Trang Cart & Thuộc tính sản phẩm
  // ==========================================
  if (isCart) {
    const shopifyCart = w.Shopify?.cart;
    if (shopifyCart && Array.isArray(shopifyCart.items)) {
      const items = shopifyCart.items;
      const tibItems = items.filter((it: any) => {
        const props = it.properties || {};
        return props._customization_id || props.customization_id || (it.vendor && it.vendor.toLowerCase() === 'teeinblue');
      });

      if (tibItems.length > 0) {
        const missingCustomizationId = tibItems.some((it: any) => !it.properties?._customization_id && !it.properties?.customization_id);
        const missingImagePreview = tibItems.some((it: any) => !it.properties?._customization_image);

        if (missingCustomizationId) {
          add(
            'cart_items_check',
            'Toàn vẹn thuộc tính giỏ hàng (Line Item Properties)',
            'error',
            'Phát hiện sản phẩm Teeinblue trong giỏ hàng bị mất mã Customization ID (_customization_id)! Đơn này khi thanh toán sẽ bị thiếu file in.',
            'cart',
            'App Cart Drawer hoặc theme có thể đã lọc bỏ thuộc tính có dấu gạch dưới (_). Hãy kiểm tra lại app giỏ hàng đang dùng.'
          );
        } else if (missingImagePreview) {
          add(
            'cart_items_check',
            'Toàn vẹn thuộc tính giỏ hàng (Line Item Properties)',
            'warning',
            'Sản phẩm trong giỏ có _customization_id nhưng thiếu _customization_image (ảnh thumbnail cá nhân hóa).',
            'cart'
          );
        } else {
          add(
            'cart_items_check',
            'Toàn vẹn thuộc tính giỏ hàng (Line Item Properties)',
            'ok',
            `Có ${tibItems.length} sản phẩm Teeinblue trong giỏ: Tất cả đều có đầy đủ _customization_id và ảnh preview.`,
            'cart'
          );
        }
      } else {
        add(
          'cart_items_check',
          'Sản phẩm Teeinblue trong giỏ hàng',
          'ok',
          `Giỏ hàng hiện có ${items.length} sản phẩm (không có sản phẩm Teeinblue hoặc giỏ trống).`,
          'cart'
        );
      }
    } else {
      add(
        'cart_items_check',
        'Kiểm tra giỏ hàng',
        'ok',
        'Trang cart không lưu trữ sẵn biến window.Shopify.cart.',
        'cart'
      );
    }
  }

  // ==========================================
  // NHÓM 5: Lỗi Console
  // ==========================================
  const errs: any[] = w.__tibConsoleHook ? w.__tibConsoleHook.get() : [];
  if (!w.__tibConsoleHook) {
    add('errors', 'Lỗi console', 'warning', 'Hook chưa chạy — reload trang để bắt lỗi console thời gian thực.', 'general');
  } else {
    const tibErrs = errs.filter((e) => /teeinblue|tib-|\btee-/i.test(`${e.message} ${e.stack || ''}`));
    if (tibErrs.length) {
      add(
        'errors',
        'Lỗi liên quan Teeinblue',
        'error',
        tibErrs.slice(-3).map((e) => `${e.type}: ${String(e.message).slice(0, 200)}`).join('\n'),
        'general',
        'Phát hiện lỗi Javascript xuất phát từ script Teeinblue hoặc xung đột thư viện. Xem chi tiết tab Bug Reporter.'
      );
    } else if (errs.length) {
      add(
        'errors',
        'Lỗi console khác',
        'warning',
        `${errs.length} lỗi Javascript khác trên trang (không liên quan trực tiếp đến Teeinblue).`,
        'general'
      );
    } else {
      add('errors', 'Lỗi console', 'ok', 'Không có lỗi Javascript nào trong console.', 'general');
    }
  }

  // ==========================================
  // NHÓM 6: Kiểm tra Xung đột App bên thứ 3
  // ==========================================
  const conflicts: HealthConflict[] = [];
  for (const rule of rules.conflicts) {
    let evidence = '';
    if (rule.srcPattern) {
      const r = new RegExp(rule.srcPattern, 'i');
      const hit = srcs.find((s) => r.test(s));
      if (hit) evidence = `script: ${hit.split('/').pop()?.split('?')[0] || hit}`;
    }
    if (!evidence && rule.globals) {
      const g = rule.globals.find((x) => w[x] !== undefined);
      if (g) evidence = `window.${g}`;
    }
    if (!evidence && rule.domSelectors) {
      for (const sel of rule.domSelectors) {
        try {
          if (document.querySelector(sel)) { evidence = `DOM: ${sel}`; break; }
        } catch { /* ignore */ }
      }
    }
    if (evidence) {
      conflicts.push({
        id: rule.id,
        name: rule.name,
        category: rule.category,
        evidence,
        warning: rule.warning
      });
    }
  }
  add(
    'conflicts',
    'Ứng dụng bên thứ 3 có thể xung đột',
    conflicts.length ? 'warning' : 'ok',
    conflicts.length ? `Phát hiện ${conflicts.length} app tiềm ẩn nguy cơ xung đột (xem chi tiết mục Conflicts).` : 'Không phát hiện ứng dụng nào trong danh sách đen xung đột.',
    'conflicts',
    conflicts.length ? 'Nếu gặp lỗi khi Add to cart hoặc mất thuộc tính đơn hàng, hãy kiểm tra danh sách app xung đột bên dưới.' : undefined
  );

  const overall = checks.reduce<Status>((a, c) => (rank[c.status] > rank[a] ? c.status : a), 'ok');
  return { ...base, isShopify: true, overall, checks, conflicts };
}
