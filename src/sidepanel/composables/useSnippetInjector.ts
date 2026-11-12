import { computed, onMounted, ref, watch } from 'vue';
import type {
  AdminStatus, DetectedTheme, InjectResult, Mode, PreviewRow, Snippet, SnippetTarget,
  SnippetsResult, UndoResult, UndoSummary
} from '@/shared/types';
import { DEFAULT_SNIPPETS_URL, MODES, STORAGE } from '@/shared/constants';
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
  const markerNote = ref('');
  const sourceKind = ref<'github' | 'sheet' | 'custom'>('github');
  async function loadSettings() {
    const s = await chrome.storage.local.get(STORAGE.settings);
    const v = s[STORAGE.settings] as { sourceUrl?: string; markerNote?: string } | undefined;
    if (v?.sourceUrl !== undefined) sourceUrl.value = v.sourceUrl;
    if (v?.markerNote !== undefined) markerNote.value = v.markerNote;
    detectSourceKind();
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
    await chrome.storage.local.set({ [STORAGE.settings]: { sourceUrl: sourceUrl.value.trim(), markerNote: markerNote.value.trim() } });
    await loadSnippets(true);
    toast.success('Đã lưu nguồn snippets.');
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
      admin.value = await call<AdminStatus>({ type: 'ADMIN_STATUS', storeHandle: props.ctx.storeHandle || undefined });
      const list = admin.value.themes;
      if (!list.some((t) => t.id === themeId.value)) {
        themeId.value = list.find((t) => t.id === props.ctx.themeId)?.id || list.find((t) => t.role === 'main')?.id || list[0]?.id || '';
      }
      await loadUndo();
    } catch (e) { toast.error(errMsg(e)); }
  }
  watch(themeId, async (id) => {
    detected.value = null;
    if (!id || !admin.value?.adminTabId || !admin.value.hasSession) return;
    try { detected.value = await call<DetectedTheme>({ type: 'DETECT_THEME', adminTabId: admin.value.adminTabId, themeId: id }); } catch { /* không bắt buộc */ }
  });
  async function openThemes() { await call({ type: 'OPEN_THEMES', storeHandle: admin.value?.storeHandle || props.ctx.storeHandle }); }

  // ---- library filters
  const query = ref('');
  const category = ref('');
  const themeGroup = ref('All');
  const typeFilter = ref('All');
  const showAllThemes = ref(false);
  const categories = computed(() => [...new Set(snippets.value.map((s) => s.category))].sort());
  const themeGroups = computed(() => {
    const groups = new Set<string>();
    for (const s of snippets.value) for (const t of s.themes) groups.add(themeGroupOf(t === '*' ? '' : t));
    return ['All', ...[...groups].sort()];
  });
  const filtered = computed(() => {
    const q = query.value.trim().toLowerCase();
    const slug = detected.value?.slug || '';
    return snippets.value.filter((s) => {
      if (category.value && s.category !== category.value) return false;
      if (typeFilter.value !== 'All' && s.type !== typeFilter.value && s.type !== 'mixed') return false;
      if (themeGroup.value !== 'All' && !s.themes.includes('*') && !s.themes.some((t) => themeGroupOf(t) === themeGroup.value)) return false;
      if (!showAllThemes.value && slug && !s.themes.includes('*') && !s.themes.includes(slug)) return false;
      if (!q) return true;
      return `${s.title} ${s.description || ''} ${s.tags.join(' ')}`.toLowerCase().includes(q);
    });
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
    clearSelection(); query.value = ''; category.value = ''; themeGroup.value = 'All'; typeFilter.value = 'All';
    customCode.value = ''; useCustom.value = false;
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

  watch(() => props.ctx.url, () => { if (props.ctx.kind === 'admin' || props.ctx.kind === 'storefront') refreshAdmin(); });
  onMounted(async () => { await loadSettings(); await Promise.all([loadSnippets(), refreshAdmin()]); });

  return {
    toast, sourceUrl, markerNote, sourceKind, pickSource, saveSettings,
    snippets, source, snippetsError, loadingSnippets, loadSnippets,
    admin, themeId, detected, selectedTheme, refreshAdmin, openThemes,
    query, category, themeGroup, typeFilter, showAllThemes, categories, themeGroups, filtered,
    selectedIds, selectedSnippets, toggleSnippet, clearSelection, expandedId, toggleExpand,
    useCustom, customKind, customFolder, customName, customMode, customCode, addReference,
    customFilename, CUSTOM_FOLDERS, MODES,
    targets, invalidTarget, modeLabel,
    confirmOpen, confirmLoading, confirmRows, confirmError, confirmAt, openConfirm,
    injecting, isLive, canInject, doInject, resetAll,
    undoList, doUndo, copySnippetCode
  };
}
