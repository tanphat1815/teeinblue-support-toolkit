<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type {
  AdminStatus, DetectedTheme, InjectResult, Mode, Snippet, SnippetTarget, SnippetsResult, TabContext, UndoResult, UndoSummary
} from '@/shared/types';
import { DEFAULT_SNIPPETS_URL, MODES, STORAGE } from '@/shared/constants';
import { buildReferenceTarget, isAllowedFilename } from '@/services/theme-writer';
import { call, errMsg } from '../api';
import { copyText } from '../clipboard';
import { useToast } from '../composables/useToast';

const props = defineProps<{ ctx: TabContext }>();
const toast = useToast();

// ---- settings
const sourceUrl = ref(DEFAULT_SNIPPETS_URL);
const showSettings = ref(false);
async function loadSettings() {
  const s = await chrome.storage.local.get(STORAGE.settings);
  const v = s[STORAGE.settings] as { sourceUrl?: string } | undefined;
  if (v?.sourceUrl !== undefined) sourceUrl.value = v.sourceUrl;
}
async function saveSettings() {
  await chrome.storage.local.set({ [STORAGE.settings]: { sourceUrl: sourceUrl.value.trim() } });
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

// ---- filters
const category = ref('');
const query = ref('');
const showAllThemes = ref(false);
const categories = computed(() => [...new Set(snippets.value.map((s) => s.category))].sort());
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  const slug = detected.value?.slug || '';
  return snippets.value.filter((s) => {
    if (category.value && s.category !== category.value) return false;
    if (!showAllThemes.value && slug && !s.themes.includes('*') && !s.themes.includes(slug)) return false;
    if (!q) return true;
    return `${s.title} ${s.description || ''} ${s.tags.join(' ')}`.toLowerCase().includes(q);
  });
});

// ---- selection / custom
const selectedId = ref('');
const selected = computed(() => snippets.value.find((s) => s.id === selectedId.value) || null);
const useCustom = ref(false);
const customFilename = ref('assets/teeinblue-custom.css');
const customMode = ref<Mode>('create');
const customCode = ref('');
const addReference = ref(true);

const targets = computed<SnippetTarget[]>(() => {
  if (useCustom.value) {
    const filename = customFilename.value.trim();
    if (!filename || !customCode.value.trim()) return [];
    const main: SnippetTarget = { filename, mode: customMode.value, code: customCode.value };
    const ref2 = addReference.value && customMode.value === 'create' ? buildReferenceTarget(filename) : null;
    return ref2 ? [main, ref2] : [main];
  }
  return selected.value?.targets ?? [];
});
const invalidTarget = computed(() => targets.value.find((t) => !isAllowedFilename(t.filename)) || null);
const modeLabel: Record<Mode, string> = {
  create: 'Create new file', append: 'Append', 'before-head': 'Insert before </head>', 'before-body': 'Insert before </body>', replace: 'Replace'
};

// ---- inject
const confirmOpen = ref(false);
const injecting = ref(false);
const isLive = computed(() => selectedTheme.value?.role === 'main');
const canInject = computed(() =>
  !!admin.value?.adminTabId && !!admin.value.hasSession && !!selectedTheme.value && targets.value.length > 0 && !invalidTarget.value);

async function doInject() {
  if (!admin.value?.adminTabId || !selectedTheme.value) return;
  injecting.value = true;
  try {
    const r = await call<InjectResult>({
      type: 'INJECT',
      adminTabId: admin.value.adminTabId,
      storeHandle: admin.value.storeHandle,
      themeId: selectedTheme.value.id,
      themeName: selectedTheme.value.name,
      snippetId: useCustom.value ? `custom-${Date.now().toString(36)}` : selectedId.value,
      targets: targets.value
    });
    if (r.status === 'WRITTEN') {
      toast.success(`Inject code thành công vào Theme [${selectedTheme.value.name}]!\n${r.written.map((w) => `• ${w.filename} (${w.mode})`).join('\n')}`);
    } else {
      toast.info(`Không có thay đổi:\n${r.skipped.map((s) => `• ${s.filename}: ${s.reason}`).join('\n')}`);
    }
    if (r.status === 'WRITTEN' && r.skipped.length) toast.info(`Bỏ qua:\n${r.skipped.map((s) => `• ${s.filename}: ${s.reason}`).join('\n')}`);
    await loadUndo();
  } catch (e) { toast.error(errMsg(e)); }
  finally { injecting.value = false; confirmOpen.value = false; }
}

// ---- undo
const undoList = ref<UndoSummary[]>([]);
async function loadUndo() {
  const h = admin.value?.storeHandle || props.ctx.storeHandle;
  if (!h) return;
  try { undoList.value = await call<UndoSummary[]>({ type: 'LIST_UNDO', storeHandle: h }); } catch { /* ignore */ }
}
async function doUndo(u: UndoSummary) {
  if (!admin.value?.adminTabId) return;
  if (!window.confirm(`Hoàn tác "${u.snippetId}" trên theme "${u.themeName}"?\nCác file sẽ được khôi phục về nội dung trước khi inject.`)) return;
  try {
    const r = await call<UndoResult>({ type: 'UNDO', adminTabId: admin.value.adminTabId, undoId: u.id });
    let msg = `Đã khôi phục: ${r.restored.join(', ') || '—'}`;
    if (r.deleted.length) msg += `\nĐã xoá: ${r.deleted.join(', ')}`;
    if (r.manual.length) msg += `\nCẦN XOÁ THỦ CÔNG trong Theme Code Editor: ${r.manual.join(', ')}`;
    toast.success(msg);
    await loadUndo();
  } catch (e) { toast.error(errMsg(e)); }
}

watch(() => props.ctx.url, () => { if (props.ctx.kind === 'admin' || props.ctx.kind === 'storefront') refreshAdmin(); });
onMounted(async () => { await loadSettings(); await Promise.all([loadSnippets(), refreshAdmin()]); });
</script>

<template>
  <section class="space-y-3">
    <!-- trạng thái admin -->
    <div v-if="!admin?.adminTabId" class="rounded bg-yellow-50 p-2 text-yellow-800">
      Chưa thấy tab Shopify Admin của store{{ ctx.storeHandle ? ` "${ctx.storeHandle}"` : '' }}. Đăng nhập Admin rồi bấm bên dưới.
      <div class="mt-2 flex gap-2">
        <button class="rounded bg-brand-500 px-2 py-1 text-white" @click="openThemes">Mở Online Store → Themes</button>
        <button class="rounded border px-2 py-1" @click="refreshAdmin">Kiểm tra lại</button>
      </div>
    </div>
    <div v-else-if="!admin.hasSession" class="rounded bg-yellow-50 p-2 text-yellow-800">
      Chưa bắt được session Shopify. Ở tab Admin hãy vào <b>Online Store → Themes</b>, đợi danh sách theme load xong (reload tab nếu vừa cài/reload extension).
      <div class="mt-2 flex gap-2">
        <button class="rounded bg-brand-500 px-2 py-1 text-white" @click="openThemes">Mở Themes</button>
        <button class="rounded border px-2 py-1" @click="refreshAdmin">Kiểm tra lại</button>
      </div>
    </div>

    <!-- filters -->
    <div class="grid grid-cols-2 gap-2">
      <label class="col-span-2 text-xs font-medium">Theme
        <select v-model="themeId" class="mt-1 w-full rounded border p-1.5">
          <option v-for="t in admin?.themes || []" :key="t.id" :value="t.id">{{ t.name }} — {{ t.role }}{{ t.id === ctx.themeId ? ' (đang xem)' : '' }}</option>
        </select>
      </label>
      <p v-if="detected?.name" class="col-span-2 text-xs text-slate-500">Detected: {{ detected.name }} {{ detected.version }}</p>
      <label class="text-xs font-medium">Category
        <select v-model="category" class="mt-1 w-full rounded border p-1.5">
          <option value="">Tất cả</option>
          <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
        </select>
      </label>
      <label class="text-xs font-medium">Tìm kiếm
        <input v-model="query" class="mt-1 w-full rounded border p-1.5" placeholder="từ khoá…" />
      </label>
      <label class="col-span-2 flex items-center gap-2 text-xs"><input v-model="showAllThemes" type="checkbox" /> Hiện cả snippet không khớp theme</label>
    </div>

    <!-- nguồn -->
    <div class="flex items-center justify-between text-xs text-slate-500">
      <span>Nguồn: {{ source || '—' }} · {{ filtered.length }}/{{ snippets.length }} snippet</span>
      <span class="space-x-2"><button class="underline" @click="loadSnippets(true)">Tải lại</button><button class="underline" @click="showSettings = !showSettings">⚙</button></span>
    </div>
    <div v-if="showSettings" class="space-y-2 rounded border bg-white p-2">
      <label class="text-xs font-medium">GitHub raw JSON hoặc link Google Sheet (public)
        <input v-model="sourceUrl" class="mt-1 w-full rounded border p-1.5" placeholder="https://raw.githubusercontent.com/…/snippets.json" />
      </label>
      <button class="rounded bg-brand-500 px-2 py-1 text-white" @click="saveSettings">Lưu & tải</button>
      <p class="text-[11px] text-slate-500">Khuyến nghị pin vào commit SHA cụ thể. Snippet được ghi thẳng vào theme merchant: chỉ dùng nguồn tin cậy.</p>
    </div>
    <p v-if="snippetsError" class="rounded bg-red-50 p-2 text-xs text-red-700">{{ snippetsError }}</p>
    <p v-if="loadingSnippets" class="text-xs text-slate-500">Đang tải snippets…</p>

    <!-- danh sách -->
    <ul class="max-h-56 space-y-1 overflow-auto">
      <li v-for="s in filtered" :key="s.id">
        <button class="w-full rounded border p-2 text-left hover:bg-slate-100" :class="!useCustom && selectedId === s.id ? 'border-brand-500 bg-blue-50' : 'bg-white'" @click="selectedId = s.id; useCustom = false">
          <div class="font-medium">{{ s.title }}</div>
          <div class="text-xs text-slate-500">{{ s.category }} · {{ s.targets.length }} file</div>
        </button>
      </li>
    </ul>

    <label class="flex items-center gap-2 text-xs"><input v-model="useCustom" type="checkbox" /> Dùng code tuỳ chỉnh</label>
    <div v-if="useCustom" class="space-y-2 rounded border bg-white p-2">
      <input v-model="customFilename" class="w-full rounded border p-1.5 font-mono text-xs" placeholder="assets/teeinblue-custom.css" />
      <select v-model="customMode" class="w-full rounded border p-1.5">
        <option v-for="m in MODES.filter((x) => x !== 'replace')" :key="m" :value="m">{{ modeLabel[m] }}</option>
      </select>
      <textarea v-model="customCode" rows="6" class="w-full rounded border p-1.5 font-mono text-xs" placeholder="CSS / Liquid / JS…"></textarea>
      <label v-if="customMode === 'create'" class="flex items-center gap-2 text-xs"><input v-model="addReference" type="checkbox" /> Tự link file vào layout/theme.liquid</label>
    </div>

    <!-- preview -->
    <div v-if="targets.length" class="space-y-2">
      <div class="text-xs font-medium">Preview ({{ targets.length }} file)</div>
      <div v-for="(t, i) in targets" :key="i" class="rounded border bg-white">
        <div class="flex items-center justify-between border-b px-2 py-1 text-xs">
          <span class="break-all font-mono">{{ t.filename }}</span>
          <span class="ml-2 shrink-0 rounded bg-slate-100 px-1.5">{{ modeLabel[t.mode] }}</span>
        </div>
        <pre class="max-h-40 overflow-auto p-2 text-xs"><code>{{ t.code }}</code></pre>
        <button class="m-1 text-xs underline" @click="copyText(t.code).then(() => toast.success('Đã copy code'))">Copy</button>
      </div>
      <p v-if="invalidTarget" class="text-xs text-red-600">Filename không hợp lệ hoặc bị chặn: {{ invalidTarget.filename }}</p>
    </div>

    <button class="w-full rounded bg-brand-500 px-3 py-2 font-medium text-white hover:bg-brand-600 disabled:opacity-50" :disabled="!canInject || injecting" @click="confirmOpen = true">
      ⚡ Inject vào theme{{ selectedTheme ? ` “${selectedTheme.name}”` : '' }}
    </button>

    <!-- undo -->
    <details v-if="undoList.length" class="rounded border bg-white p-2">
      <summary class="cursor-pointer text-xs font-medium">Lịch sử inject ({{ undoList.length }})</summary>
      <ul class="mt-2 space-y-1">
        <li v-for="u in undoList" :key="u.id" class="flex items-center justify-between gap-2 text-xs">
          <span class="min-w-0 break-all">{{ new Date(u.ts).toLocaleString() }} · {{ u.snippetId }} · {{ u.themeName }}</span>
          <button class="shrink-0 rounded border px-2 py-0.5 hover:bg-slate-100" @click="doUndo(u)">Undo</button>
        </li>
      </ul>
    </details>

    <!-- confirm modal -->
    <div v-if="confirmOpen" class="fixed inset-0 z-40 flex items-end bg-black/40 p-3 sm:items-center">
      <div class="w-full space-y-3 rounded-lg bg-white p-3 shadow-xl">
        <div class="font-semibold">Xác nhận inject</div>
        <p v-if="isLive" class="rounded bg-red-100 p-2 text-xs font-medium text-red-700">⚠ Đây là LIVE theme (role main). Thay đổi có hiệu lực ngay với khách hàng.</p>
        <p class="text-xs">Theme: <b>{{ selectedTheme?.name }}</b></p>
        <ul class="list-disc pl-5 text-xs"><li v-for="(t, i) in targets" :key="i"><span class="font-mono">{{ t.filename }}</span> — {{ modeLabel[t.mode] }}</li></ul>
        <div class="flex justify-end gap-2">
          <button class="rounded border px-3 py-1.5" @click="confirmOpen = false">Huỷ</button>
          <button class="rounded px-3 py-1.5 text-white disabled:opacity-50" :class="isLive ? 'bg-red-600' : 'bg-brand-500'" :disabled="injecting" @click="doInject">
            {{ injecting ? 'Đang ghi…' : isLive ? 'Inject vào LIVE theme' : 'Inject' }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
