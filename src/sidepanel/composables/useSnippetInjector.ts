import { computed, onMounted, ref, watch } from 'vue';
import type {
  AdminStatus, DetectedTheme, InjectResult, Mode, PreviewRow, Snippet, SnippetTarget,
  SnippetsResult, UndoResult, UndoSummary
} from '@/shared/types';
import { DEFAULT_SNIPPETS_URL, MODES, MSG, PARTNER_DASHBOARDS, type PartnerDashboardId, STORAGE } from '@/shared/constants';
import { buildReferenceTarget, isAllowedFilename } from '@/services/theme-writer';
import { call, errMsg } from '../api';
import { copyText } from '../clipboard';
import { useToast } from './useToast';

export type CustomKind = 'css' | 'js' | 'liquid' | 'json';

export const CUSTOM_FOLDERS: Record<CustomKind, string[]> = {
  css: ['assets'],
  js: ['assets'],
  liquid: ['snippets', 'sections'],
  json: ['templates', 'locales']
};
const CUSTOM_EXT: Record<CustomKind, string> = { css: '.css', js: '.js', liquid: '.liquid', json: '.json' };

export function themeGroupOf(slug: string): string {
  if (!slug || slug === '*') return 'Others';
  if (slug.includes('dawn')) return 'Dawn';
  if (slug.includes('debut')) return 'Debut';
  if (slug.includes('turbo') || slug.includes('booster') || slug.includes('pipeline')) return 'Turbo';
  return 'Others';
}

export function useSnippetInjector(props: { ctx: { storeHandle: string; themeId: string; kind: string; url: string } }) {
  const toast = useToast();

  // ---- settings (source URL + marker note, persisted)
  const sourceUrl = ref(DEFAULT_SNIPPETS_URL);
  const activeSourceUrl = ref(''); // URL thực tế đã bấm Lưu & Tải thành công
  const markerNote = ref('');
  const sourceKind = ref<'github' | 'sheet' | 'custom'>('github');
  const partnerId = ref<PartnerDashboardId>('collab');
  const favorites = ref<string[]>([]);
  const usageCounts = ref<Record<string, number>>({});

  async function loadSettings() {
    const s = await chrome.storage.local.get([
      STORAGE.settings,
      STORAGE.partnerDashboard,
      STORAGE.favoriteSnippets,
      STORAGE.snippetUsageCounts
    ]);
    const v = s[STORAGE.settings] as { sourceUrl?: string; markerNote?: string } | undefined;
    if (v?.sourceUrl !== undefined) {
      sourceUrl.value = v.sourceUrl;
      activeSourceUrl.value = v.sourceUrl;
    }
    if (v?.markerNote !== undefined) markerNote.value = v.markerNote;
    const p = s[STORAGE.partnerDashboard] as PartnerDashboardId | undefined;
    if (p && PARTNER_DASHBOARDS.some((d) => d.id === p)) partnerId.value = p;
    const favs = s[STORAGE.favoriteSnippets] as string[] | undefined;
    if (Array.isArray(favs)) favorites.value = favs;
    const counts = s[STORAGE.snippetUsageCounts] as Record<string, number> | undefined;
    if (counts && typeof counts === 'object') usageCounts.value = counts;
    detectSourceKind();
  }

  function incrementUsageCounts(ids: string[]) {
    if (!ids.length) return;
    const updated = { ...usageCounts.value };
    for (const id of ids) {
      if (!id || id === 'custom') continue;
      updated[id] = (updated[id] || 0) + 1;
    }
    usageCounts.value = updated;
    chrome.storage.local.set({ [STORAGE.snippetUsageCounts]: updated });
  }

  function toggleFavorite(id: string) {
    if (favorites.value.includes(id)) {
      favorites.value = favorites.value.filter((x) => x !== id);
    } else {
      favorites.value = [...favorites.value, id];
    }
    chrome.storage.local.set({ [STORAGE.favoriteSnippets]: favorites.value });
  }
  function setPartnerId(id: PartnerDashboardId) {
    partnerId.value = id;
    chrome.storage.local.set({ [STORAGE.partnerDashboard]: id });
  }
  function detectSourceKind() {
    const u = sourceUrl.value;
    sourceKind.value = /\/spreadsheets\/d\//.test(u) ? 'sheet' : 'github';
  }
  function pickSource(kind: 'github' | 'sheet' | 'custom') {
    sourceKind.value = kind;
    if (kind === 'github' && !sourceUrl.value) sourceUrl.value = 'https://raw.githubusercontent.com/teeinblue/snippets/main/snippets.json';
    if (kind === 'sheet' && !/\/spreadsheets\/d\//.test(sourceUrl.value)) sourceUrl.value = '';
    if (kind === 'custom' && /\/spreadsheets\/d\//.test(sourceUrl.value)) sourceUrl.value = '';
  }
  async function saveSettings() {
    const url = sourceUrl.value.trim();
    if (!url) {
      toast.error('Vui lòng nhập URL nguồn snippets (GitHub hoặc Google Sheet).');
      return;
    }
    await chrome.storage.local.set({ [STORAGE.settings]: { sourceUrl: url, markerNote: markerNote.value.trim() } });
    await loadSnippets(true);
    if (!snippetsError.value) {
      activeSourceUrl.value = url;
      toast.success('Đã lưu & tải nguồn snippets.');
    } else {
      toast.error(`Lỗi tải snippets: ${snippetsError.value}`);
    }
  }

  // ---- snippets
  const snippets = ref<Snippet[]>([]);
  const source = ref('');
  const snippetsError = ref('');
  const loadingSnippets = ref(false);
  async function loadSnippets(force = false) {
    loadingSnippets.value = true;
    try {
      const r = await call<SnippetsResult>({ type: 'FETCH_SNIPPETS', sourceUrl: sourceUrl.value, force });
      snippets.value = r.snippets; source.value = r.source; snippetsError.value = r.error || '';
    } catch (e) { snippetsError.value = errMsg(e); }
    finally { loadingSnippets.value = false; }
  }

  // ---- admin / theme
  const admin = ref<AdminStatus | null>(null);
  const themeId = ref('');
  const detected = ref<DetectedTheme | null>(null);
  const selectedTheme = computed(() => admin.value?.themes.find((t) => t.id === themeId.value) || null);
  async function refreshAdmin() {
    try {
      console.log('[TIB-Toolkit] refreshAdmin requested for handle:', props.ctx.storeHandle);
      admin.value = await call<AdminStatus>({ type: 'ADMIN_STATUS', storeHandle: props.ctx.storeHandle || undefined });
      console.log('[TIB-Toolkit] ADMIN_STATUS result:', JSON.parse(JSON.stringify(admin.value)));
      const list = admin.value.themes;
      if (!list.some((t) => t.id === themeId.value)) {
        themeId.value = list.find((t) => t.id === props.ctx.themeId)?.id || list.find((t) => t.role === 'main')?.id || list[0]?.id || '';
      }
      await loadUndo();
    } catch (e) {
      console.error('[TIB-Toolkit] refreshAdmin error:', e);
      toast.error(errMsg(e));
    }
  }
  watch(themeId, async (id) => {
    detected.value = null;
    if (!id || !admin.value?.adminTabId || !admin.value.hasSession) return;
    try { detected.value = await call<DetectedTheme>({ type: 'DETECT_THEME', adminTabId: admin.value.adminTabId, themeId: id }); } catch { /* không bắt buộc */ }
  });
  const isCurrentTabShopify = computed(() => props.ctx.kind === 'admin' || props.ctx.kind === 'storefront');
  const targetStoreHandle = computed(() => props.ctx.storeHandle || admin.value?.storeHandle || '');
  const isLinkedFromOtherTab = computed(() => !isCurrentTabShopify.value && !!admin.value?.adminTabId && !!targetStoreHandle.value);

  const storeDomain = computed(() => {
    const raw = targetStoreHandle.value;
    if (!raw) return '';
    return raw.includes('.') ? raw : `${raw}.myshopify.com`;
  });

  const partnerUrl = computed(() => {
    const d = PARTNER_DASHBOARDS.find((x) => x.id === partnerId.value) || PARTNER_DASHBOARDS[0];
    const domain = storeDomain.value;
    const query = [d.param, domain ? `search_term=${encodeURIComponent(domain)}` : ''].filter(Boolean).join('&');
    return `https://dev.shopify.com/dashboard/${d.orgId}/stores?${query}`;
  });

  async function openPartnerStores() {
    window.open(partnerUrl.value, '_blank');
  }

  async function openThemes() {
    const handle = admin.value?.storeHandle || props.ctx.storeHandle;
    await call({ type: 'OPEN_THEMES', storeHandle: handle });
  }

  const reloadingAdminTab = ref(false);
  async function reloadAdminTab() {
    const tabId = admin.value?.adminTabId;
    if (!tabId) return;
    reloadingAdminTab.value = true;
    try {
      await call({ type: 'RELOAD_ADMIN_TAB', tabId });
      toast.success('Đã gửi lệnh reload tab Admin.');
      // Chờ một chút rồi refresh admin status
      setTimeout(() => {
        refreshAdmin();
        reloadingAdminTab.value = false;
      }, 1500);
    } catch (e) {
      toast.error(errMsg(e));
      reloadingAdminTab.value = false;
    }
  }

  function openThemeEditor(tid?: string) {
    const id = tid || themeId.value;
    const handle = targetStoreHandle.value;
    if (!id || !handle) return;
    const cleanId = id.replace(/\D/g, '');
    window.open(`https://admin.shopify.com/store/${handle}/themes/${cleanId}/editor`, '_blank');
  }

  function openThemeCode(tid?: string) {
    const id = tid || themeId.value;
    const handle = targetStoreHandle.value;
    if (!id || !handle) return;
    const cleanId = id.replace(/\D/g, '');
    window.open(`https://admin.shopify.com/store/${handle}/themes/${cleanId}`, '_blank');
  }

  // ---- library filters & sorting
  const query = ref('');
  const category = ref('');
  const themeFilter = ref('All');
  const pageFilter = ref('All');
  const appFilter = ref('All');
  const typeFilter = ref('All');
  const sortBy = ref<'default' | 'alpha-asc' | 'alpha-desc' | 'usage-desc' | 'usage-asc'>('default');
  const showAllThemes = ref(false);
  const activeTabFilter = ref<string>('all'); // 'all', 'favorites'

  const categories = computed(() => [...new Set(snippets.value.map((s) => s.category))].sort());

  // Lấy danh sách đầy đủ tất cả các theme có trong snippets (viết hoa chữ cái đầu cho đẹp)
  const availableThemes = computed(() => {
    const set = new Set<string>();
    for (const s of snippets.value) {
      for (const t of s.themes) {
        if (t && t !== '*') {
          set.add(t.toLowerCase());
        }
      }
    }
    return [...set].sort().map((t) => ({
      value: t,
      label: t.charAt(0).toUpperCase() + t.slice(1)
    }));
  });

  // Danh sách các Page thường gặp trong Shopify
  const PAGE_OPTIONS = [
    { value: 'All', label: 'All Pages' },
    { value: 'product', label: 'Product Page' },
    { value: 'cart', label: 'Cart / Drawer' },
    { value: 'home', label: 'Home Page' },
    { value: 'collection', label: 'Collection' },
    { value: 'global', label: 'Global / Layout' }
  ];

  // Danh sách 3rd-party Apps & Integrations
  const APP_OPTIONS = [
    { value: 'All', label: 'All Apps' },
    { value: 'upcart', label: 'UpCart' },
    { value: 'slidecart', label: 'SlideCart' },
    { value: 'revy', label: 'Revy Upsell' },
    { value: 'shineon', label: 'ShineOn' },
    { value: 'the4', label: 'The4 Extensions' },
    { value: 'other', label: 'Other Apps' }
  ];

  // Đếm số lượng cho các tab filters
  const filterCounts = computed(() => {
    const all = snippets.value.length;
    const fav = snippets.value.filter((s) => favorites.value.includes(s.id)).length;
    return { all, fav };
  });

  const filtered = computed(() => {
    const q = query.value.trim().toLowerCase();
    const slug = detected.value?.slug || '';
    const list = snippets.value.filter((s) => {
      // Tab filter (All, Favorites)
      if (activeTabFilter.value === 'favorites') {
        if (!favorites.value.includes(s.id)) return false;
      }

      // Filter theo Theme (hỗ trợ All Themes '*' và theme cụ thể)
      if (themeFilter.value !== 'All') {
        const targetTheme = themeFilter.value.toLowerCase();
        const matchesTheme = s.themes.includes('*') || s.themes.some((t) => t.toLowerCase() === targetTheme);
        if (!matchesTheme) return false;
      }

      // Filter theo Page (Product, Cart, Home, Collection, Global)
      if (pageFilter.value !== 'All') {
        const fullText = `${s.title} ${s.description || ''} ${s.tags.join(' ')} ${s.targets.map((t) => t.filename).join(' ')}`.toLowerCase();
        if (pageFilter.value === 'cart') {
          if (!fullText.includes('cart') && !fullText.includes('drawer')) return false;
        } else if (pageFilter.value === 'product') {
          if (!fullText.includes('product') && !fullText.includes('price') && !fullText.includes('variant')) return false;
        } else if (pageFilter.value === 'home') {
          if (!fullText.includes('home') && !fullText.includes('index')) return false;
        } else if (pageFilter.value === 'collection') {
          if (!fullText.includes('collection')) return false;
        } else if (pageFilter.value === 'global') {
          if (!fullText.includes('layout/theme') && !fullText.includes('custom.css') && !fullText.includes('global')) return false;
        }
      }

      // Filter theo 3rd-party App
      if (appFilter.value !== 'All') {
        const fullText = `${s.title} ${s.description || ''} ${s.tags.join(' ')}`.toLowerCase();
        if (appFilter.value === 'upcart') {
          if (!fullText.includes('upcart')) return false;
        } else if (appFilter.value === 'slidecart') {
          if (!fullText.includes('slidecart') && !fullText.includes('slide cart')) return false;
        } else if (appFilter.value === 'revy') {
          if (!fullText.includes('revy')) return false;
        } else if (appFilter.value === 'shineon') {
          if (!fullText.includes('shineon')) return false;
        } else if (appFilter.value === 'the4') {
          if (!fullText.includes('the4')) return false;
        } else if (appFilter.value === 'other') {
          if (!fullText.includes('app') && !fullText.includes('integration') && !fullText.includes('third-party')) return false;
        }
      }

      if (category.value && s.category !== category.value) return false;
      if (typeFilter.value !== 'All' && s.type !== typeFilter.value && s.type !== 'mixed') return false;
      if (!showAllThemes.value && slug && activeTabFilter.value === 'all' && !s.themes.includes('*') && !s.themes.includes(slug)) return false;
      if (!q) return true;
      return `${s.title} ${s.description || ''} ${s.tags.join(' ')}`.toLowerCase().includes(q);
    });

    // Sắp xếp (Alphabet A-Z / Z-A, Usage High-Low / Low-High, hoặc Default)
    if (sortBy.value === 'alpha-asc') {
      return [...list].sort((a, b) => a.title.localeCompare(b.title));
    }
    if (sortBy.value === 'alpha-desc') {
      return [...list].sort((a, b) => b.title.localeCompare(a.title));
    }
    if (sortBy.value === 'usage-desc') {
      return [...list].sort((a, b) => {
        const countA = usageCounts.value[a.id] || 0;
        const countB = usageCounts.value[b.id] || 0;
        if (countB !== countA) return countB - countA;
        return a.title.localeCompare(b.title);
      });
    }
    if (sortBy.value === 'usage-asc') {
      return [...list].sort((a, b) => {
        const countA = usageCounts.value[a.id] || 0;
        const countB = usageCounts.value[b.id] || 0;
        if (countA !== countB) return countA - countB;
        return a.title.localeCompare(b.title);
      });
    }

    return list;
  });

  // ---- multi-select (mặc định không tick)
  const selectedIds = ref<string[]>([]);
  const selectedSnippets = computed(() => selectedIds.value.map((id) => snippets.value.find((s) => s.id === id)).filter((s): s is Snippet => !!s));
  function toggleSnippet(id: string) {
    selectedIds.value = selectedIds.value.includes(id) ? selectedIds.value.filter((x) => x !== id) : [...selectedIds.value, id];
  }
  function clearSelection() { selectedIds.value = []; }
  const expandedId = ref('');
  function toggleExpand(id: string) { expandedId.value = expandedId.value === id ? '' : id; }

  // ---- custom builder (type → force folder)
  const useCustom = ref(false);
  const customKind = ref<CustomKind>('css');
  const customFolder = ref('assets');
  const customName = ref('teeinblue-custom');
  const customMode = ref<Mode>('create');
  const customCode = ref('');
  const addReference = ref(true);
  watch(customKind, (k) => {
    if (!CUSTOM_FOLDERS[k].includes(customFolder.value)) customFolder.value = CUSTOM_FOLDERS[k][0];
    const base = customName.value.replace(/\.(css|js|liquid|json)(\.liquid)?$/, '');
    customName.value = base + CUSTOM_EXT[k];
  });
  const customFilename = computed(() => {
    let name = customName.value.trim().replace(/^\/+/, '');
    if (!name) return '';
    if (!name.includes('.')) name += CUSTOM_EXT[customKind.value];
    return `${customFolder.value}/${name}`;
  });
  const customTarget = computed<SnippetTarget | null>(() => {
    if (!useCustom.value || !customFilename.value || !customCode.value.trim()) return null;
    return { filename: customFilename.value, mode: customMode.value, code: customCode.value, snippetId: `custom-${customKind.value}` };
  });

  // ---- merged targets (library multi + custom), tag snippetId từng target
  const targets = computed<SnippetTarget[]>(() => {
    const list: SnippetTarget[] = [];
    for (const s of selectedSnippets.value) {
      for (const t of s.targets) list.push({ ...t, snippetId: s.id });
    }
    if (customTarget.value) {
      list.push(customTarget.value);
      if (addReference.value && customMode.value === 'create') {
        const ref2 = buildReferenceTarget(customTarget.value.filename);
        if (ref2) list.push({ ...ref2, snippetId: customTarget.value.snippetId });
      }
    }
    return list;
  });
  const invalidTarget = computed(() => targets.value.find((t) => !isAllowedFilename(t.filename)) || null);
  const modeLabel: Record<Mode, string> = {
    create: 'Create new file', append: 'Append', 'before-head': 'Insert before </head>', 'before-body': 'Insert before </body>', replace: 'Replace'
  };

  // ---- confirm preview (đọc content hiện tại qua background, KHÔNG ghi)
  const confirmOpen = ref(false);
  const confirmLoading = ref(false);
  const confirmRows = ref<PreviewRow[]>([]);
  const confirmError = ref('');
  const confirmAt = ref('');
  async function openConfirm() {
    if (!admin.value?.adminTabId || !selectedTheme.value) return;
    confirmOpen.value = true;
    confirmLoading.value = true;
    confirmRows.value = [];
    confirmError.value = '';
    confirmAt.value = new Date().toISOString();
    try {
      confirmRows.value = await call<PreviewRow[]>({
        type: 'PREVIEW_INJECT',
        adminTabId: admin.value.adminTabId,
        themeId: selectedTheme.value.id,
        targets: targets.value
      });
    } catch (e) { confirmError.value = errMsg(e); }
    finally { confirmLoading.value = false; }
  }

  // ---- inject
  const injecting = ref(false);
  const isLive = computed(() => selectedTheme.value?.role === 'main');
  const canInject = computed(() =>
    !!admin.value?.adminTabId && !!admin.value.hasSession && !!selectedTheme.value && targets.value.length > 0 && !invalidTarget.value);
  async function doInject() {
    if (!admin.value?.adminTabId || !selectedTheme.value) return;
    injecting.value = true;
    try {
      const ids = [...new Set(targets.value.map((t) => t.snippetId || '').filter(Boolean))];
      const r = await call<InjectResult>({
        type: 'INJECT',
        adminTabId: admin.value.adminTabId,
        storeHandle: admin.value.storeHandle,
        themeId: selectedTheme.value.id,
        themeName: selectedTheme.value.name,
        themeRole: selectedTheme.value.role,
        snippetId: ids[0] || 'custom',
        snippetIds: ids.length ? ids : ['custom'],
        markerNote: markerNote.value.trim(),
        targets: targets.value
      });
      if (r.status === 'WRITTEN') {
        incrementUsageCounts(ids);
        toast.success(`Inject thành công vào "${selectedTheme.value.name}"!\n${r.written.map((w) => `• ${w.filename} (${w.mode})`).join('\n')}`);
      } else {
        toast.info(`Không có thay đổi:\n${r.skipped.map((s) => `• ${s.filename}: ${s.reason}`).join('\n')}`);
      }
      if (r.status === 'WRITTEN' && r.skipped.length) toast.info(`Bỏ qua:\n${r.skipped.map((s) => `• ${s.filename}: ${s.reason}`).join('\n')}`);
      await loadUndo();
    } catch (e) { toast.error(errMsg(e)); }
    finally { injecting.value = false; confirmOpen.value = false; }
  }
  function resetAll() {
    clearSelection();
    query.value = '';
    category.value = '';
    themeFilter.value = 'All';
    pageFilter.value = 'All';
    appFilter.value = 'All';
    typeFilter.value = 'All';
    sortBy.value = 'default';
    activeTabFilter.value = 'all';
    customCode.value = '';
    useCustom.value = false;
  }

  // ---- undo history
  const undoList = ref<UndoSummary[]>([]);
  async function loadUndo() {
    const h = admin.value?.storeHandle || props.ctx.storeHandle;
    if (!h) return;
    try { undoList.value = await call<UndoSummary[]>({ type: 'LIST_UNDO', storeHandle: h }); } catch { /* ignore */ }
  }
  async function doUndo(u: UndoSummary) {
    if (!admin.value?.adminTabId) return;
    const names = u.snippetIds.length ? u.snippetIds.join(', ') : u.snippetId;
    if (!window.confirm(`Hoàn tác "${names}" trên theme "${u.themeName}"?\nCác file sẽ được khôi phục về nội dung trước khi inject (${u.createdAt}).`)) return;
    try {
      const r = await call<UndoResult>({ type: 'UNDO', adminTabId: admin.value.adminTabId, undoId: u.id });
      let msg = `Đã khôi phục: ${r.restored.join(', ') || '—'}`;
      if (r.deleted.length) msg += `\nĐã xoá: ${r.deleted.join(', ')}`;
      if (r.manual.length) msg += `\nCẦN XỬ LÝ THỦ CÔNG:\n${r.manual.map((m) => `• ${m.filename}: ${m.reason}`).join('\n')}`;
      toast.success(msg);
      await loadUndo();
    } catch (e) { toast.error(errMsg(e)); }
  }

  async function copySnippetCode(s: Snippet) {
    try {
      await copyText(s.targets.map((t) => `// ${t.filename} [${t.mode}]\n${t.code}`).join('\n\n'));
      toast.success('Đã copy code snippet.');
    } catch (e) { toast.error(errMsg(e)); }
  }

  watch(() => props.ctx.url, () => {
    refreshAdmin();
  });
  onMounted(async () => {
    await loadSettings();
    await Promise.all([loadSnippets(), refreshAdmin()]);

    // Lắng nghe khi background bắt được themes/session từ tab Admin
    const onRuntimeMessage = (m: any) => {
      if (m?.type === MSG.ADMIN_STATE_UPDATED) {
        refreshAdmin();
      }
    };
    chrome.runtime.onMessage.addListener(onRuntimeMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(onRuntimeMessage);
    };
  });

  return {
    toast, sourceUrl, activeSourceUrl, markerNote, sourceKind, pickSource, saveSettings,
    snippets, source, snippetsError, loadingSnippets, loadSnippets,
    admin, themeId, detected, selectedTheme, refreshAdmin, openThemes, openThemeEditor, openThemeCode,
    reloadAdminTab, reloadingAdminTab,
    favorites, toggleFavorite, activeTabFilter, filterCounts,
    query, category, themeFilter, pageFilter, appFilter, typeFilter, sortBy, usageCounts, showAllThemes, categories, availableThemes, PAGE_OPTIONS, APP_OPTIONS, filtered,
    selectedIds, selectedSnippets, toggleSnippet, clearSelection, expandedId, toggleExpand,
    useCustom, customKind, customFolder, customName, customMode, customCode, addReference,
    customFilename, CUSTOM_FOLDERS, MODES,
    targets, invalidTarget, modeLabel,
    confirmOpen, confirmLoading, confirmRows, confirmError, confirmAt, openConfirm,
    injecting, isLive, canInject, doInject, resetAll,
    undoList, doUndo, copySnippetCode,
    partnerId, setPartnerId, PARTNER_DASHBOARDS, partnerUrl, storeDomain, openPartnerStores,
    isCurrentTabShopify, targetStoreHandle, isLinkedFromOtherTab
  };
}
