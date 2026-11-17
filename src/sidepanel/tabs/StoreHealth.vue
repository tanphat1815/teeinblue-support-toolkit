<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { HealthReport, TabContext } from '@/shared/types';
import { call, errMsg } from '../api';
import { copyText } from '../clipboard';
import { useToast } from '../composables/useToast';
import StatusBadge from '../components/StatusBadge.vue';
import UntitledIcon from '../components/UntitledIcon.vue';
import HealthDocsModal from '../components/HealthDocsModal.vue';

const props = defineProps<{ ctx: TabContext }>();
const toast = useToast();
const loading = ref(false);
const report = ref<HealthReport | null>(null);
const activeFilter = ref<'all' | 'warning_error' | 'ok'>('all');
const expandedCards = ref<Record<string, boolean>>({});
const expandedConflicts = ref<Record<string, boolean>>({});
const showHistoryModal = ref(false);
const showDocsModal = ref(false);
const historyList = ref<HealthReport[]>([]);

const STORAGE_KEY = 'tibk_health_history_v1';
const canRun = computed(() => props.ctx.kind === 'storefront');
const icon = { ok: '🟢', warning: '🟡', error: '🔴' } as const;

// Helper counts
const okCount = computed(() => (Array.isArray(report.value?.checks) ? report.value.checks.filter((c) => c.status === 'ok').length : 0));
const warnCount = computed(() => (Array.isArray(report.value?.checks) ? report.value.checks.filter((c) => c.status === 'warning').length : 0));
const errCount = computed(() => (Array.isArray(report.value?.checks) ? report.value.checks.filter((c) => c.status === 'error').length : 0));
const issueCount = computed(() => warnCount.value + errCount.value);

const filteredChecks = computed(() => {
  if (!report.value || !Array.isArray(report.value.checks)) return [];
  if (activeFilter.value === 'warning_error') {
    return report.value.checks.filter((c) => c.status === 'warning' || c.status === 'error');
  }
  if (activeFilter.value === 'ok') {
    return report.value.checks.filter((c) => c.status === 'ok');
  }
  return report.value.checks;
});

function toggleExpand(id: string) {
  expandedCards.value[id] = !expandedCards.value[id];
}

function toggleConflictExpand(id: string) {
  expandedConflicts.value[id] = !expandedConflicts.value[id];
}

// So sánh 2 lần quét có gì khác nhau không
function isDifferentReport(r1: HealthReport, r2: HealthReport): boolean {
  if (r1.url !== r2.url) return true;
  if (r1.overall !== r2.overall) return true;
  const c1List = Array.isArray(r1.checks) ? r1.checks : [];
  const c2List = Array.isArray(r2.checks) ? r2.checks : [];
  if (c1List.length !== c2List.length) return true;

  const cf1List = Array.isArray(r1.conflicts) ? r1.conflicts : [];
  const cf2List = Array.isArray(r2.conflicts) ? r2.conflicts : [];
  if (cf1List.length !== cf2List.length) return true;

  for (let i = 0; i < c1List.length; i++) {
    const c1 = c1List[i];
    const c2 = c2List[i];
    if (!c2 || c1.id !== c2.id || c1.status !== c2.status || c1.detail !== c2.detail) {
      return true;
    }
  }

  for (let i = 0; i < cf1List.length; i++) {
    const cf1 = cf1List[i];
    const cf2 = cf2List[i];
    if (!cf2 || cf1.id !== cf2.id || cf1.evidence !== cf2.evidence) {
      return true;
    }
  }

  return false;
}

function normalizeReport(raw: any): HealthReport {
  return {
    ...raw,
    checks: Array.isArray(raw?.checks) ? raw.checks : [],
    conflicts: Array.isArray(raw?.conflicts) ? raw.conflicts : []
  };
}

async function loadHistory() {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const rawList = (data[STORAGE_KEY] as any[]) || [];
    historyList.value = rawList.map(normalizeReport);
  } catch {
    historyList.value = [];
  }
}

async function saveToHistory(newReport: HealthReport) {
  try {
    const safeReport = normalizeReport(newReport);
    const latest = historyList.value[0];
    // Chỉ lưu nếu chưa có bản ghi nào hoặc kết quả quét có thay đổi khác biệt
    if (!latest || isDifferentReport(safeReport, latest)) {
      const updated = [safeReport, ...historyList.value].slice(0, 20);
      historyList.value = updated;
      await chrome.storage.local.set({ [STORAGE_KEY]: updated });
    }
  } catch (e) {
    console.error('Failed to save health history:', e);
  }
}

async function clearHistory() {
  if (!confirm('Bạn có chắc chắn muốn xoá toàn bộ lịch sử quét Store Health?')) return;
  historyList.value = [];
  await chrome.storage.local.remove(STORAGE_KEY);
  toast.success('Đã xoá lịch sử quét.');
}

function restoreFromHistory(item: HealthReport) {
  report.value = normalizeReport(item);
  expandedCards.value = {};
  expandedConflicts.value = {};
  showHistoryModal.value = false;
  toast.info(`Đã mở kết quả quét lúc ${new Date(item.scannedAt).toLocaleTimeString()}`);
}

onMounted(() => {
  loadHistory();
});

async function scan() {
  loading.value = true;
  try {
    const res = await call<HealthReport>({ type: 'RUN_HEALTH' });
    report.value = res;
    // Mặc định ban đầu đóng các thẻ check bình thường để gọn gàng, mở thẻ có lỗi/warning
    const initExpanded: Record<string, boolean> = {};
    res.checks.forEach((c) => {
      if (c.status !== 'ok') {
        initExpanded[c.id] = true;
      }
    });
    expandedCards.value = initExpanded;

    await saveToHistory(res);
    // Mặc định mở các conflict card để dễ quan sát
    const initConflictExp: Record<string, boolean> = {};
    res.conflicts?.forEach(cf => { initConflictExp[cf.id] = true; });
    expandedConflicts.value = initConflictExp;

    toast.success('Đã quét xong Store Health!');
  } catch (e) {
    toast.error(errMsg(e));
  } finally {
    loading.value = false;
  }
}

async function copyReport(rToCopy?: HealthReport) {
  const r = rToCopy || report.value;
  if (!r) return;
  const lines = [
    `### 🔍 Store Health — ${r.overall.toUpperCase()}`,
    `- URL: ${r.url}`,
    `- Page type: ${r.pageType}`,
    `- Quét lúc: ${new Date(r.scannedAt).toLocaleString()}`,
    ''
  ];
  r.checks.forEach((c) => lines.push(`- ${icon[c.status]} **${c.label}**: ${c.detail.replace(/\n/g, ' | ')}`));
  if (r.conflicts.length) {
    lines.push('', '**Conflicts:**');
    r.conflicts.forEach((c) => lines.push(`- ${c.name} (${c.category}) — ${c.evidence}`));
  }
  try {
    await copyText(lines.join('\n'));
    toast.success('Đã copy báo cáo Store Health!');
  } catch (e) {
    toast.error(errMsg(e));
  }
}

async function copyCheckDetail(detail: string, label: string) {
  try {
    await copyText(detail);
    toast.success(`Đã copy: ${label}`);
  } catch (e) {
    toast.error(errMsg(e));
  }
}

async function reloadAndScan() {
  try {
    if (props.ctx.tabId) {
      await chrome.tabs.reload(props.ctx.tabId);
      toast.info('Đang tải lại trang... Hãy quét lại sau vài giây.');
    }
  } catch (e) {
    toast.error(errMsg(e));
  }
}

function getCheckIcon(id: string) {
  switch (id) {
    case 'script':
      return 'code-02';
    case 'dup':
      return 'copy';
    case 'global':
      return 'settings-01';
    case 'app_embed':
      return 'layers-three';
    case 'campaign_link':
      return 'link';
    case 'widget':
      return 'layout-alt';
    case 'theme_form':
      return 'file';
    case 'native_atc':
      return 'shopping-bag';
    case 'dynamic_checkout':
      return 'zap';
    case 'cart_items_check':
      return 'shopping-bag';
    case 'errors':
      return 'terminal-browser';
    case 'conflicts':
      return 'alert-triangle';
    default:
      return 'check-circle';
  }
}
</script>

<template>
  <div class="w-full max-w-full overflow-hidden space-y-3.5 font-sans select-none pb-4">
    <!-- 1. Hero Modern Banner đồng bộ với Capture Tab -->
    <div
      class="relative overflow-hidden rounded-2xl p-4 text-white shadow-lg"
      style="background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 45%, #0369a1 100%);"
    >
      <!-- Background Ambient Glow -->
      <div class="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-cyan-500/20 blur-2xl pointer-events-none"></div>
      <div class="absolute -left-8 -bottom-8 h-28 w-28 rounded-full bg-indigo-500/25 blur-2xl pointer-events-none"></div>

      <!-- Top Row: Status badge -->
      <div class="relative z-10 flex items-center justify-between gap-1">
        <div class="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur-xs px-2 py-0.5 text-[9px] font-bold tracking-wider text-white shadow-xs border border-white/15 truncate max-w-[170px]">
          <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="canRun ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'"></span>
          <span class="truncate">{{ canRun ? 'STOREFRONT ACTIVE' : 'NON-STOREFRONT' }}</span>
        </div>

        <div class="text-[10px] text-cyan-200/90 font-mono">
          {{ report ? new Date(report.scannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '' }}
        </div>
      </div>

      <!-- Center Title & 3D Graphic Icon -->
      <div class="relative z-10 mt-2.5 flex items-center justify-between gap-2">
        <div class="space-y-0.5 min-w-0">
          <h2 class="text-sm font-black tracking-tight text-white leading-tight truncate">
            Store Health
          </h2>
          <p class="text-[10px] font-medium text-cyan-200/80 truncate">
            {{ report ? `Page: ${report.pageType.toUpperCase()} • ${report.checks.length} checks` : 'Script • DOM • Errors • Conflicts' }}
          </p>
        </div>

        <!-- 3D Heartbeat/Diagnostic Graphic Icon -->
        <div class="relative shrink-0 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 p-1.5 shadow-xl ring-2 ring-white/10">
          <div class="h-6 w-6 rounded-full bg-slate-950 flex items-center justify-center border-2 border-cyan-300 shadow-inner">
            <svg class="h-3.5 w-3.5 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <span class="absolute top-1 right-1.5 h-1 w-1 rounded-full bg-white/70"></span>
        </div>
      </div>
    </div>

    <!-- Cảnh báo nếu không ở Storefront -->
    <div
      v-if="!canRun"
      class="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50/90 p-2.5 shadow-2xs text-amber-900"
    >
      <div class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-200/70 text-amber-800">
        <UntitledIcon name="alert-triangle" :size="13" />
      </div>
      <div class="text-[11px] space-y-0.5 min-w-0">
        <div class="font-bold">Chưa ở Storefront</div>
        <p class="text-slate-600 leading-relaxed text-[10px]">
          Hãy mở trang sản phẩm Teeinblue để quét chính xác.
        </p>
      </div>
    </div>

    <!-- 2. Primary Action Card (Scan & Diagnostics) -->
    <div>
      <button
        class="group flex w-full items-center justify-between rounded-2xl border border-slate-200/90 bg-white p-3 shadow-xs hover:border-blue-400 hover:shadow-sm active:scale-[0.99] transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        :disabled="!canRun || loading"
        @click="scan"
      >
        <div class="flex items-center gap-2.5 min-w-0">
          <div
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-cyan-600 text-white shadow-md transition-transform group-hover:scale-105"
          >
            <UntitledIcon :name="loading ? 'refresh-cw' : 'search-lg'" :size="18" :class="loading ? 'animate-spin' : ''" />
          </div>
          <div class="text-left min-w-0">
            <div class="text-[12px] font-bold text-slate-900 leading-tight truncate">
              {{ loading ? 'Đang phân tích...' : 'Quét Store Health' }}
            </div>
            <div class="text-[10px] text-slate-500 mt-0.5 truncate">
              {{ loading ? 'Kiểm tra DOM & scripts' : 'Kiểm tra xung đột, script, render DOM & console' }}
            </div>
          </div>
        </div>
        <div
          class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-blue-600 bg-blue-50 group-hover:bg-blue-100 transition-all font-semibold"
        >
          <UntitledIcon :name="loading ? 'refresh-cw' : 'zap'" :size="13" :class="loading ? 'animate-spin' : ''" />
        </div>
      </button>
    </div>

    <!-- 3. Quick Overview / Quick Stats (Grid 4 items co giãn linh hoạt không vỡ layout) -->
    <div v-if="report" class="space-y-1.5">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-bold uppercase tracking-wider text-slate-600">Health Overview</span>
        <span class="text-[9px] text-slate-400 font-mono">
          {{ new Date(report.scannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
        </span>
      </div>

      <div class="grid grid-cols-4 gap-1.5 w-full">
        <!-- Card Overall Status: iconOnly gọn gàng không bị overflow -->
        <div class="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xs text-center min-w-0">
          <StatusBadge :status="report.overall" icon-only :size="14" />
          <span class="mt-1 text-[9px] font-bold text-slate-700 truncate w-full">Overall</span>
        </div>

        <!-- Filter: All -->
        <button
          class="flex flex-col items-center justify-center rounded-xl border p-1.5 transition-all cursor-pointer shadow-2xs min-w-0"
          :class="activeFilter === 'all' ? 'border-blue-500 bg-blue-50 text-blue-700 font-bold' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'"
          @click="activeFilter = 'all'"
        >
          <span class="text-[11px] font-black leading-none">{{ report.checks.length }}</span>
          <span class="mt-1 text-[9px] font-semibold truncate w-full">All</span>
        </button>

        <!-- Filter: Warnings/Errors -->
        <button
          class="flex flex-col items-center justify-center rounded-xl border p-1.5 transition-all cursor-pointer shadow-2xs min-w-0"
          :class="activeFilter === 'warning_error' ? 'border-amber-500 bg-amber-50 text-amber-700 font-bold' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'"
          @click="activeFilter = 'warning_error'"
        >
          <span class="text-[11px] font-black leading-none" :class="issueCount > 0 ? 'text-amber-600' : 'text-slate-500'">{{ issueCount }}</span>
          <span class="mt-1 text-[9px] font-semibold truncate w-full">Warning</span>
        </button>

        <!-- Filter: OK -->
        <button
          class="flex flex-col items-center justify-center rounded-xl border p-1.5 transition-all cursor-pointer shadow-2xs min-w-0"
          :class="activeFilter === 'ok' ? 'border-emerald-500 bg-emerald-50 text-emerald-700 font-bold' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'"
          @click="activeFilter = 'ok'"
        >
          <span class="text-[11px] font-black leading-none text-emerald-600">{{ okCount }}</span>
          <span class="mt-1 text-[9px] font-semibold truncate w-full">OK</span>
        </button>
      </div>
    </div>

    <!-- 4. Detailed Diagnostic Cards -->
    <template v-if="report">
      <div v-if="!report.isShopify" class="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900 shadow-2xs">
        <div class="flex items-center gap-1.5 font-bold mb-0.5">
          <UntitledIcon name="alert-triangle" :size="13" class="text-amber-600" />
          <span>Không nhận diện được Shopify</span>
        </div>
        <p class="text-slate-600 text-[10px]">Trang không có window.Shopify, kiểm tra có thể không chuẩn.</p>
      </div>

      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-bold uppercase tracking-wider text-slate-600 truncate">
            Checks ({{ filteredChecks.length }})
          </span>
          <button
            class="text-[10px] font-semibold text-blue-600 hover:underline cursor-pointer shrink-0"
            @click="reloadAndScan"
          >
            Reload & Quét lại
          </button>
        </div>

        <!-- Danh sách Checks (Collapsible hoàn toàn: khi đóng chỉ hiện heading) -->
        <div class="space-y-1.5">
          <div
            v-for="c in filteredChecks"
            :key="c.id"
            class="group rounded-xl border border-slate-200/90 bg-white p-2.5 shadow-2xs hover:border-blue-300 transition-all"
          >
            <!-- Card Header: Luôn hiển thị -->
            <div
              class="flex items-center justify-between gap-2 cursor-pointer select-none"
              @click="toggleExpand(c.id)"
            >
              <div class="flex items-center gap-2 min-w-0">
                <div
                  class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-slate-700 bg-slate-50"
                  :class="c.status === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : c.status === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-red-200 bg-red-50 text-red-700'"
                >
                  <UntitledIcon :name="getCheckIcon(c.id)" :size="13" />
                </div>
                <div class="min-w-0 truncate">
                  <div class="text-[11px] font-bold text-slate-900 truncate" :title="c.label">{{ c.label }}</div>
                  <div class="text-[9px] text-slate-400 font-mono truncate">{{ c.id }}</div>
                </div>
              </div>

              <!-- Status Badge (Icon Only) + Expand Arrow Icon -->
              <div class="flex items-center gap-1 shrink-0">
                <StatusBadge :status="c.status" icon-only :size="12" />
                <span class="flex h-5 w-5 items-center justify-center text-slate-400 group-hover:text-slate-600">
                  <UntitledIcon :name="expandedCards[c.id] ? 'chevron-up' : 'chevron-down'" :size="12" />
                </span>
              </div>
            </div>

            <!-- Content Detail: Chỉ hiển thị KHI ĐƯỢC EXPAND (Khi collapse sẽ ẩn hoàn toàn cả content & nút copy) -->
            <div v-if="expandedCards[c.id]" class="mt-2 pt-2 border-t border-slate-100 animate-in fade-in duration-100 space-y-1.5">
              <div
                class="rounded-lg bg-slate-50 p-2 font-mono text-[10px] leading-relaxed break-words select-text border border-slate-200/60 max-h-48 overflow-y-auto"
              >
                <div class="whitespace-pre-line text-slate-700">{{ c.detail }}</div>
              </div>

              <!-- Suggestion nếu có lỗi hoặc warning -->
              <div
                v-if="c.suggestion"
                class="flex items-start gap-1.5 rounded-lg bg-sky-50 p-2 text-[10px] text-sky-800 border border-sky-200/70"
              >
                <UntitledIcon name="info-circle" :size="13" class="shrink-0 text-sky-600 mt-0.5" />
                <div class="leading-relaxed">
                  <span class="font-semibold text-sky-900">Gợi ý xử lý:</span> {{ c.suggestion }}
                </div>
              </div>

              <!-- Action Copy (Icon Only với tooltip) -->
              <div class="mt-1 flex items-center justify-end">
                <button
                  class="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Copy chi tiết"
                  @click="copyCheckDetail(c.detail, c.label)"
                >
                  <UntitledIcon name="copy" :size="12" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Conflict section nếu có -->
        <div v-if="report.conflicts.length" class="mt-3 rounded-xl border border-amber-300 bg-amber-50/80 p-2.5 shadow-2xs">
          <div class="flex items-center gap-2 pb-1.5 mb-1.5 border-b border-amber-200/80">
            <div class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-200 text-amber-900">
              <UntitledIcon name="alert-triangle" :size="13" />
            </div>
            <div class="min-w-0">
              <div class="text-[11px] font-bold text-amber-900 truncate">App có khả năng xung đột</div>
              <div class="text-[9px] text-amber-700">Phát hiện {{ report.conflicts.length }} app bên thứ 3</div>
            </div>
          </div>

          <div class="space-y-1.5">
            <div
              v-for="cf in report.conflicts"
              :key="cf.id"
              class="rounded-lg border border-amber-200/90 bg-white/95 p-2 shadow-2xs transition-all"
            >
              <!-- Conflict Header (click to expand/collapse) -->
              <div
                class="flex items-center justify-between gap-1 cursor-pointer select-none"
                @click="toggleConflictExpand(cf.id)"
              >
                <div class="flex items-center gap-1.5 min-w-0">
                  <span class="font-bold text-slate-900 text-[11px] truncate">{{ cf.name }}</span>
                  <span class="shrink-0 rounded-md bg-amber-100 px-1.5 py-0.2 text-[9px] font-semibold text-amber-800">{{ cf.category }}</span>
                </div>
                <span class="flex h-5 w-5 items-center justify-center text-slate-400 hover:text-slate-600">
                  <UntitledIcon :name="expandedConflicts[cf.id] ? 'chevron-up' : 'chevron-down'" :size="12" />
                </span>
              </div>

              <!-- Conflict Details (Expandable) -->
              <div v-if="expandedConflicts[cf.id]" class="mt-2 pt-1.5 border-t border-amber-100 space-y-1.5 animate-in fade-in duration-100">
                <!-- Mô tả nguyên nhân xung đột -->
                <div v-if="cf.warning" class="flex items-start gap-1.5 rounded bg-amber-50/80 p-1.5 text-[10px] text-amber-900 border border-amber-200/60 leading-relaxed">
                  <UntitledIcon name="alert-triangle" :size="12" class="shrink-0 text-amber-600 mt-0.5" />
                  <div>
                    <span class="font-semibold text-amber-950">Lý do xung đột:</span> {{ cf.warning }}
                  </div>
                </div>

                <!-- Bằng chứng script / DOM -->
                <div class="font-mono text-[9px] text-slate-500 break-words select-text bg-slate-50 p-1.5 rounded border border-slate-200/60">
                  <span class="font-semibold text-slate-700">Bằng chứng phát hiện:</span> {{ cf.evidence }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Bottom Navigation 4 nút tiện ích giống Snippet Tab (History, Copy Report, Docs, Support) -->
    <div class="grid grid-cols-4 gap-1.5 pt-2">
      <!-- Nút 1: History -->
      <button
        type="button"
        class="flex flex-col items-center justify-center gap-1 rounded-xl border border-slate-200/80 bg-white p-2 text-center shadow-2xs hover:border-blue-300 hover:bg-blue-50/50 active:scale-95 transition-all cursor-pointer"
        @click="showHistoryModal = true"
      >
        <div class="relative flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-blue-600">
          <UntitledIcon name="clock" :size="15" />
          <span
            v-if="historyList.length"
            class="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[8.5px] font-bold text-white shadow-xs"
          >
            {{ historyList.length }}
          </span>
        </div>
        <div class="text-[11px] font-bold text-slate-800">History</div>
        <div class="text-[9.5px] text-slate-500 leading-tight">View past scans</div>
      </button>

      <!-- Nút 2: Copy Report -->
      <button
        type="button"
        class="flex flex-col items-center justify-center gap-1 rounded-xl border border-slate-200/80 bg-white p-2 text-center shadow-2xs hover:border-blue-300 hover:bg-blue-50/50 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="!report"
        @click="copyReport()"
      >
        <div class="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <UntitledIcon name="copy" :size="14" />
        </div>
        <div class="text-[11px] font-bold text-slate-800">Copy</div>
        <div class="text-[9.5px] text-slate-500 leading-tight">Export report</div>
      </button>

      <!-- Nút 3: Docs (4 Chốt chặn & Luồng E2E) -->
      <button
        type="button"
        class="flex flex-col items-center justify-center gap-1 rounded-xl border border-slate-200/80 bg-white p-2 text-center shadow-2xs hover:border-blue-300 hover:bg-blue-50/50 active:scale-95 transition-all cursor-pointer"
        @click="showDocsModal = true"
      >
        <div class="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
          <UntitledIcon name="book-open" :size="15" />
        </div>
        <div class="text-[11px] font-bold text-slate-800">Docs</div>
        <div class="text-[9.5px] text-slate-500 leading-tight">4 Chốt chặn</div>
      </button>

      <!-- Nút 4: Reload / Quét lại -->
      <button
        type="button"
        class="flex flex-col items-center justify-center gap-1 rounded-xl border border-slate-200/80 bg-white p-2 text-center shadow-2xs hover:border-blue-300 hover:bg-blue-50/50 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
        :disabled="!canRun || loading"
        @click="scan"
      >
        <div class="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-50 text-cyan-600">
          <UntitledIcon name="refresh-cw" :size="14" :class="loading ? 'animate-spin' : ''" />
        </div>
        <div class="text-[11px] font-bold text-slate-800">{{ loading ? 'Scanning' : 'Rescan' }}</div>
        <div class="text-[9.5px] text-slate-500 leading-tight">Scan storefront</div>
      </button>
    </div>

    <!-- Modal Tài Liệu Health & 4 Chốt Chặn -->
    <HealthDocsModal :open="showDocsModal" @close="showDocsModal = false" />

    <!-- Modal Lịch Sử Quét (History Modal) -->
    <div
      v-if="showHistoryModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-2xs p-3 animate-in fade-in duration-150"
      @click.self="showHistoryModal = false"
    >
      <div class="flex max-h-[85vh] w-full max-w-sm flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200">
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-slate-100 p-3 bg-slate-50">
          <div class="flex items-center gap-2">
            <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
              <UntitledIcon name="clock" :size="14" />
            </div>
            <div>
              <div class="text-[12px] font-bold text-slate-900">Lịch sử quét Store Health</div>
              <div class="text-[9px] text-slate-500">Chỉ lưu khi kết quả quét có thay đổi</div>
            </div>
          </div>
          <button
            class="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
            @click="showHistoryModal = false"
          >
            <UntitledIcon name="x-close" :size="14" />
          </button>
        </div>

        <!-- Body List -->
        <div class="flex-1 overflow-y-auto p-3 space-y-2">
          <div v-if="!historyList.length" class="py-8 text-center text-xs text-slate-400">
            Chưa có lịch sử quét nào được ghi nhận.
          </div>

          <div
            v-for="(item, idx) in historyList"
            :key="item.scannedAt + idx"
            class="group rounded-xl border border-slate-200 p-2.5 hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer"
            @click="restoreFromHistory(item)"
          >
            <div class="flex items-center justify-between gap-1">
              <div class="flex items-center gap-1.5 min-w-0">
                <StatusBadge :status="item.overall" icon-only :size="12" />
                <span class="text-[11px] font-bold text-slate-800 truncate">{{ item.pageType?.toUpperCase() || 'PAGE' }}</span>
                <span class="text-[9px] text-slate-400 font-mono">({{ item.checks?.length || 0 }} checks)</span>
              </div>
              <span class="text-[9px] text-slate-400 font-mono shrink-0">
                {{ new Date(item.scannedAt).toLocaleDateString([], { month: 'numeric', day: 'numeric' }) }}
                {{ new Date(item.scannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
              </span>
            </div>

            <div class="mt-1 text-[10px] text-slate-500 truncate font-mono">
              {{ item.url }}
            </div>

            <div class="mt-2 flex items-center justify-between text-[10px] pt-1.5 border-t border-slate-100">
              <span class="text-blue-600 font-semibold group-hover:underline">Bấm để xem lại</span>
              <button
                class="text-slate-400 hover:text-slate-700 p-1"
                title="Copy báo cáo này"
                @click.stop="copyReport(item)"
              >
                <UntitledIcon name="copy" :size="12" />
              </button>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-between border-t border-slate-100 p-2.5 bg-slate-50 text-[11px]">
          <button
            v-if="historyList.length"
            class="text-red-500 hover:text-red-700 font-medium cursor-pointer"
            @click="clearHistory"
          >
            Xoá toàn bộ
          </button>
          <span v-else></span>

          <button
            class="rounded-lg bg-slate-200 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-300 transition-colors"
            @click="showHistoryModal = false"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
