<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TabContext } from '@/shared/types';
import WorkflowSection from '../components/WorkflowSection.vue';
import UntitledIcon, { type IconName } from '../components/UntitledIcon.vue';
import SnippetHelpModal from '../components/SnippetHelpModal.vue';
import SnippetJsonFormatModal from '../components/SnippetJsonFormatModal.vue';
import { useSnippetInjector } from '../composables/useSnippetInjector';
import { copyText } from '../clipboard';
import { errMsg } from '../api';
import githubIconUrl from '@/assets/icons/github.svg';
import googleSheetsIconUrl from '@/assets/icons/google-sheets.svg';
import codeFileIconUrl from '@/assets/icons/code-file.svg';

const props = defineProps<{ ctx: TabContext }>();
const s = useSnippetInjector(props);
const {
  toast, sourceUrl, activeSourceUrl, markerNote, sourceKind, pickSource, saveSettings,
  snippets, source, snippetsError, loadingSnippets, loadSnippets,
  admin, themeId, detected, selectedTheme, refreshAdmin, openThemes, openThemeEditor, openThemeCode,
  reloadAdminTab, reloadingAdminTab,
  favorites, toggleFavorite, activeTabFilter, filterCounts,
  query, category, themeGroup, typeFilter, showAllThemes, categories, themeGroups, filtered,
  selectedIds, toggleSnippet, clearSelection, expandedId, toggleExpand,
  useCustom, customKind, customFolder, customName, customMode, customCode, addReference,
  customFilename, CUSTOM_FOLDERS, MODES,
  targets, invalidTarget, modeLabel,
  confirmOpen, confirmLoading, confirmRows, confirmError, confirmAt, openConfirm,
  injecting, isLive, canInject, doInject, resetAll,
  undoList, doUndo, copySnippetCode,
  partnerId, setPartnerId, PARTNER_DASHBOARDS, partnerUrl, storeDomain, openPartnerStores,
  isCurrentTabShopify, targetStoreHandle, isLinkedFromOtherTab
} = s;

async function copyOne(code: string) {
  try { await copyText(code); toast.success('Đã copy code.'); }
  catch (e) { toast.error(errMsg(e)); }
}

const actionIconMap: Record<string, { icon: IconName; color: string }> = {
  CREATE: { icon: 'check-circle', color: 'text-emerald-500' },
  INSERT: { icon: 'alert-triangle', color: 'text-amber-500' },
  APPEND: { icon: 'alert-triangle', color: 'text-amber-500' },
  REPLACE: { icon: 'alert-circle', color: 'text-orange-500' },
  SKIP: { icon: 'minus-circle', color: 'text-slate-400' }
};

const showHelpTip = ref(false);
const unlockThemeSelect = ref(false);
const helpModalOpen = ref(false);
const jsonFormatModalOpen = ref(false);
const isEditingSource = ref(false);
const historyOpen = ref(false);

const isConfigured = computed(() => !!activeSourceUrl.value && !snippetsError.value && snippets.value.length > 0);

function handleResetAll() {
  resetAll();
  toast.success('Đã xóa tất cả lựa chọn.');
}

function handleViewAllFiltered() {
  query.value = '';
  category.value = '';
  typeFilter.value = 'All';
  themeGroup.value = 'All';
  showAllThemes.value = true;
  activeTabFilter.value = 'all';
  toast.info('Đã mở rộng hiển thị toàn bộ snippets.');
}
</script>

<template>
  <section class="space-y-2.5">
    <!-- Card chủ đạo: Shopify Context & Target Theme -->
    <div class="tib-card overflow-hidden border-slate-200 bg-white">
      <!-- Header trạng thái trang hiện tại -->
      <div class="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-3 py-2 text-xs">
        <div class="flex items-center gap-1.5 font-medium text-slate-700 min-w-0">
          <UntitledIcon
            :name="ctx.kind === 'admin' ? 'shopping-bag' : ctx.kind === 'storefront' ? 'globe' : 'alert-circle'"
            :size="15"
            :class="ctx.kind === 'unsupported' ? 'text-amber-500' : 'text-brand-600'"
            class="shrink-0"
          />
          <span v-if="ctx.kind === 'admin'" class="truncate font-semibold text-slate-800">
            Shopify Admin · <span class="text-brand-600">{{ ctx.storeHandle }}</span>
          </span>
          <span v-else-if="ctx.kind === 'storefront'" class="truncate font-semibold text-slate-800">
            Storefront · <span class="text-brand-600">{{ ctx.storeHandle || 'Shopify' }}</span>
          </span>
          <span v-else-if="isLinkedFromOtherTab" class="truncate text-slate-600" :title="'Tab khác: ' + targetStoreHandle">
            Tab khác · <span class="font-semibold text-brand-600">{{ targetStoreHandle }}</span>
          </span>
          <span v-else class="truncate text-slate-500">Chưa mở trang Shopify</span>
        </div>

        <span
          class="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
          :class="admin?.hasSession ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'"
        >
          <UntitledIcon :name="admin?.hasSession ? 'check-circle' : 'alert-triangle'" :size="11" />
          <span>{{ admin?.hasSession ? 'Đã kết nối Session' : 'Chưa kết nối Admin' }}</span>
        </span>
      </div>

      <!-- Alert chú thích khi đang liên kết với tab Admin cũ từ tab khác -->
      <div v-if="isLinkedFromOtherTab" class="border-b border-blue-100 bg-blue-50/60 px-3 py-1.5 text-[11px] text-blue-900 flex items-center justify-between gap-1.5">
        <div class="flex items-center gap-1.5 truncate">
          <UntitledIcon name="info-circle" :size="13" class="shrink-0 text-blue-600" />
          <span class="truncate">Đang lấy dữ liệu từ tab Admin: <b class="font-mono text-slate-900">{{ storeDomain }}</b></span>
        </div>
      </div>

      <!-- Nội dung chính của Card: Cảnh báo kết nối & Chọn Theme -->
      <div class="p-3 space-y-2.5">
        <!-- Khi chưa kết nối tab Admin hoặc chưa có session (ở cả storefront hay tab khác) -->
        <div v-if="!admin?.hasSession" class="rounded-xl border border-blue-200/80 bg-[#edf3fa] p-3 text-xs text-slate-800 space-y-3">
          <div class="flex items-start gap-2">
            <UntitledIcon name="alert-circle" :size="16" class="mt-0.5 shrink-0 text-amber-500" />
            <div class="space-y-0.5">
              <div class="font-semibold text-slate-900">
                {{ !isCurrentTabShopify ? 'Chưa mở trang Shopify' : (admin?.adminTabId ? 'Chưa bắt được Session Admin' : 'Chưa kết nối Shopify Admin') }}
              </div>
              <p class="text-[11.5px] text-slate-600">
                <template v-if="!isCurrentTabShopify">
                  Tab hiện tại không phải Shopify. Hãy mở trang Storefront hoặc Admin của store để inject snippet, hoặc chọn đăng nhập bên dưới:
                </template>
                <template v-else-if="admin?.adminTabId">
                  Đã tìm thấy tab Admin nhưng chưa lấy được session theme. Bạn có thể mở lại Themes hoặc chọn cách đăng nhập bên dưới:
                </template>
                <template v-else>
                  Chưa thấy tab Admin của store "{{ storeDomain || 'myshopify.com' }}". Vui lòng chọn 1 trong 2 cách đăng nhập bên dưới:
                </template>
              </p>
            </div>
          </div>

          <!-- Cách ưu tiên: Nếu đang ở tab Admin nhưng chưa bắt được session -->
          <div v-if="ctx.kind === 'admin'" class="rounded-lg border border-emerald-300 bg-emerald-50/70 p-2.5 space-y-2 shadow-xs">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-emerald-900 text-[11px] uppercase tracking-wide flex items-center gap-1.5">
                <UntitledIcon name="zap" :size="13" class="text-emerald-600" />
                <span>Cách 1: Tải lại tab Admin hiện tại</span>
              </span>
              <span class="rounded bg-emerald-200/80 px-1.5 py-0.2 text-[9.5px] font-bold text-emerald-800 uppercase">Khuyến dùng</span>
            </div>
            <p class="text-[11px] text-emerald-950 leading-snug">
              Bạn đang mở trang Admin của <b class="font-mono text-emerald-900">{{ storeDomain }}</b>. Bấm vào đây để tải lại tab đó và tự động bắt session/themes mà không cần mở thêm tab mới:
            </p>

            <button
              class="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 active:scale-[0.98] transition-all disabled:opacity-50"
              :disabled="reloadingAdminTab"
              @click="reloadAdminTab"
            >
              <UntitledIcon name="refresh-cw" :size="13" :class="reloadingAdminTab ? 'animate-spin' : ''" />
              <span>{{ reloadingAdminTab ? 'Đang tải lại tab Admin…' : 'Reload tab Admin để lấy Session' }}</span>
            </button>
          </div>

          <!-- Cách: Qua Partner Dashboard (Khuyên dùng khi support khách) -->
          <div class="rounded-lg border border-slate-200/90 bg-white p-2.5 space-y-2 shadow-sm">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-slate-800 text-[11px] uppercase tracking-wide">{{ ctx.kind === 'admin' ? 'Cách 2: Qua Partner Dashboard' : 'Cách 1: Qua Partner Dashboard' }}</span>
              <!-- Partner switcher tone xanh -->
              <div class="inline-flex rounded-md bg-blue-100/70 p-0.5 text-[11px] border border-blue-200/60">
                <button
                  v-for="p in PARTNER_DASHBOARDS"
                  :key="p.id"
                  type="button"
                  class="rounded px-2.5 py-0.5 font-medium transition-all"
                  :class="partnerId === p.id ? 'bg-white text-brand-600 tib-active-elevated font-semibold' : 'text-blue-900/70 hover:text-brand-600'"
                  @click="setPartnerId(p.id)"
                >
                  {{ p.id === 'collab' ? 'Collaborations' : 'Staging' }}
                </button>
              </div>
            </div>

            <p class="text-[11px] text-slate-500">
              Mở cổng <b class="text-slate-700">{{ partnerId === 'collab' ? 'Partner Collaborations' : 'Partner Staging' }}</b> và tự động tìm store để click Login:
            </p>

            <button
              class="tib-btn-primary w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold shadow-sm"
              @click="openPartnerStores"
            >
              <UntitledIcon name="link-external" :size="13" />
              <span>Mở Partner Store Search ({{ partnerId === 'collab' ? 'Collab' : 'Staging' }})</span>
            </button>
          </div>

          <!-- Cách tiếp theo: Mở Online Store Themes -->
          <div class="rounded-lg border border-slate-200/90 bg-white p-2.5 space-y-2 shadow-sm">
            <span class="block font-semibold text-slate-800 text-[11px] uppercase tracking-wide">{{ ctx.kind === 'admin' ? 'Cách 3: Mở Online Store Themes' : 'Cách 2: Đăng nhập trực tiếp' }}</span>
            <p class="text-[11px] text-slate-500">
              Dành cho trường hợp bạn đã đăng nhập sẵn hoặc có tài khoản staff trực tiếp trên store:
            </p>

            <div class="flex gap-2">
              <button
                class="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50/70 px-2.5 py-1.5 text-xs font-medium text-blue-900 shadow-2xs transition-all hover:bg-blue-100 hover:border-blue-300 hover:text-brand-600 active:scale-98"
                @click="openThemes"
              >
                <UntitledIcon name="shopping-bag" :size="13" class="text-brand-600" />
                <span>Mở Online Store → Themes</span>
              </button>
              <button
                class="inline-flex items-center justify-center gap-1 rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-1.5 text-xs font-medium text-blue-900 shadow-2xs transition-all hover:bg-blue-100 hover:border-blue-300 hover:text-brand-600 active:scale-98"
                title="Bấm sau khi đã đăng nhập Admin ở tab khác"
                @click="refreshAdmin"
              >
                <UntitledIcon name="refresh-cw" :size="12" class="text-brand-600" />
                <span>Kiểm tra lại</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Dropdown chọn Theme đích để Inject (hiển thị khi đã có session theme) -->
        <div v-if="admin?.hasSession" class="space-y-2">
          <!-- Dropdown Theme với overlay/style khi bị khóa -->
          <div class="space-y-1">
            <div class="flex items-center justify-between">
              <label class="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <UntitledIcon name="palette" :size="14" class="text-brand-600" />
                <span>Target Theme</span>
              </label>
              <span v-if="detected?.name" class="text-[11px] text-slate-500 font-mono">
                Detected: <b class="text-slate-700">{{ detected.name }}</b> {{ detected.version }}
              </span>
            </div>

            <div class="relative">
              <select
                v-model="themeId"
                class="tib-input text-xs font-medium transition-all"
                :disabled="ctx.kind === 'storefront' && !unlockThemeSelect"
                :class="ctx.kind === 'storefront' && !unlockThemeSelect
                  ? 'bg-slate-100/90 text-slate-500 border-slate-300 cursor-not-allowed pr-8 select-none'
                  : ''"
              >
                <option v-if="!admin?.themes?.length" value="">(Chưa có theme nào được tải)</option>
                <option v-for="t in admin?.themes || []" :key="t.id" :value="t.id">
                  {{ t.name }} — {{ t.role }}{{ t.id === ctx.themeId ? ' (đang xem)' : '' }}
                </option>
              </select>

              <!-- Huy hiệu ổ khóa overlay đè trực tiếp bên phải dropdown khi bị lock -->
              <div
                v-if="ctx.kind === 'storefront' && !unlockThemeSelect"
                class="absolute right-7 top-1/2 -translate-y-1/2 pointer-events-none flex items-center gap-1 bg-slate-200/90 border border-slate-300/80 text-slate-700 px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide"
              >
                <span>🔒 Đã khóa</span>
              </div>
            </div>

            <!-- 2 Buttons mở Theme Editor và Edit Code + Chi tiết Theme -->
            <div v-if="selectedTheme" class="space-y-1.5 pt-1">
              <!-- Nút mở Editor & Edit Code -->
              <div class="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  class="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50/70 hover:text-blue-700 active:scale-[0.98] transition-all shadow-2xs"
                  title="Mở Customizer / Theme Editor (giao diện kéo thả)"
                  @click="openThemeEditor()"
                >
                  <UntitledIcon name="palette" :size="13" class="text-indigo-500" />
                  <span>Customize</span>
                  <UntitledIcon name="link-external" :size="10" class="text-slate-400" />
                </button>

                <button
                  type="button"
                  class="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50/70 hover:text-blue-700 active:scale-[0.98] transition-all shadow-2xs"
                  title="Mở Code Editor trực tiếp trong Shopify Admin"
                  @click="openThemeCode()"
                >
                  <UntitledIcon name="code-browser" :size="13" class="text-emerald-600" />
                  <span>Edit code</span>
                  <UntitledIcon name="link-external" :size="10" class="text-slate-400" />
                </button>
              </div>

              <!-- Thẻ thông tin chi tiết về Theme được chọn -->
              <div class="rounded-lg border border-slate-200/90 bg-slate-50/60 p-2 text-[10.5px] text-slate-600 space-y-1">
                <div class="flex items-center justify-between text-slate-800 font-medium">
                  <div class="flex items-center gap-1.5 min-w-0">
                    <span class="inline-block h-1.5 w-1.5 rounded-full" :class="selectedTheme.role === 'main' ? 'bg-emerald-500 ring-2 ring-emerald-200' : 'bg-slate-400'"></span>
                    <span class="truncate font-semibold">{{ selectedTheme.name }}</span>
                  </div>
                  <span
                    class="shrink-0 rounded px-1.5 py-0.2 text-[9.5px] font-bold uppercase tracking-wider"
                    :class="selectedTheme.role === 'main' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200/80 text-slate-600'"
                  >
                    {{ selectedTheme.role === 'main' ? 'Live' : selectedTheme.role }}
                  </span>
                </div>

                <div class="grid grid-cols-2 gap-x-2 gap-y-0.5 pt-0.5 text-slate-500 border-t border-slate-200/60 text-[10px]">
                  <div>
                    <span class="text-slate-400">ID: </span>
                    <span class="font-mono text-slate-700 font-semibold">{{ selectedTheme.id }}</span>
                  </div>
                  <div v-if="detected?.version || detected?.name">
                    <span class="text-slate-400">Engine: </span>
                    <span class="text-slate-700">{{ detected?.name || 'Theme' }} {{ detected?.version ? `v${detected.version}` : '' }}</span>
                  </div>
                  <div v-if="selectedTheme.updatedAt" class="col-span-2 truncate">
                    <span class="text-slate-400">Cập nhật: </span>
                    <span class="text-slate-700">{{ new Date(selectedTheme.updatedAt).toLocaleString() }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Cảnh báo an toàn & checkbox mở khóa (nằm ngay dưới dropdown) -->
          <div v-if="ctx.kind === 'storefront'" class="rounded-lg border border-amber-200 bg-amber-50/70 p-2 text-[11.5px] text-amber-900 space-y-1.5">
            <div class="flex items-start gap-1.5">
              <UntitledIcon name="alert-triangle" :size="13" class="mt-0.5 shrink-0 text-amber-600" />
              <div class="flex-1 space-y-0.5">
                <div class="font-semibold text-amber-950">Đã khóa theo theme Storefront đang xem</div>
                <p class="text-[11px] text-amber-800 leading-snug">
                  Đảm bảo bạn inject đúng theme đang preview. Bấm mở khóa bên dưới nếu muốn inject vào theme khác.
                </p>
              </div>
            </div>

            <div class="pt-1 border-t border-amber-200/60 flex items-center justify-between">
              <label class="inline-flex items-center gap-1.5 cursor-pointer text-[11px] font-medium text-amber-950 select-none hover:text-brand-600">
                <input v-model="unlockThemeSelect" type="checkbox" class="rounded border-amber-300 text-brand-600 focus:ring-0 focus:ring-offset-0" />
                <span>Mở khóa để chọn theme khác</span>
              </label>
              <span class="text-[10px] text-amber-700 font-medium">
                {{ unlockThemeSelect ? '🔓 Đang mở khóa' : '🔒 Khóa tự động' }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- step 1: Source & Configuration -->
    <WorkflowSection step="1" title="Source & Configuration" subtitle="Choose your source and configure settings">
      <template #action>
        <span
          v-if="isConfigured"
          class="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 shadow-2xs"
        >
          <UntitledIcon name="check" :size="11" class="text-emerald-600 stroke-[2.5]" />
          <span>Configured</span>
        </span>
      </template>

      <!-- Nguồn dữ liệu với Badge check tròn ở góc -->
      <div class="grid grid-cols-3 gap-2">
        <button
          type="button"
          class="tib-src-card relative text-left transition-all p-2.5 flex flex-col items-center justify-center text-center"
          :class="sourceKind === 'github' ? 'active ring-1 ring-brand-500' : ''"
          @click="pickSource('github')"
        >
          <div
            v-if="sourceKind === 'github'"
            class="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 text-white shadow-2xs"
          >
            <UntitledIcon name="check" :size="10" class="stroke-[3]" />
          </div>
          <img :src="githubIconUrl" alt="GitHub" class="h-6 w-6 object-contain" />
          <div class="mt-1 text-xs font-semibold text-slate-800">GitHub Raw JSON</div>
          <div class="text-[10px] text-slate-500 leading-tight mt-0.5">Load snippets from GitHub repository</div>
        </button>

        <button
          type="button"
          class="tib-src-card relative text-left transition-all p-2.5 flex flex-col items-center justify-center text-center"
          :class="sourceKind === 'sheet' ? 'active ring-1 ring-brand-500' : ''"
          @click="pickSource('sheet')"
        >
          <div
            v-if="sourceKind === 'sheet'"
            class="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 text-white shadow-2xs"
          >
            <UntitledIcon name="check" :size="10" class="stroke-[3]" />
          </div>
          <img :src="googleSheetsIconUrl" alt="Google Sheet" class="h-6 w-6 object-contain" />
          <div class="mt-1 text-xs font-semibold text-slate-800">Google Sheet API</div>
          <div class="text-[10px] text-slate-500 leading-tight mt-0.5">Load snippets from Google Sheet</div>
        </button>

        <button
          type="button"
          class="tib-src-card relative text-left transition-all p-2.5 flex flex-col items-center justify-center text-center"
          :class="sourceKind === 'custom' ? 'active ring-1 ring-brand-500' : ''"
          @click="pickSource('custom')"
        >
          <div
            v-if="sourceKind === 'custom'"
            class="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 text-white shadow-2xs"
          >
            <UntitledIcon name="check" :size="10" class="stroke-[3]" />
          </div>
          <img :src="codeFileIconUrl" alt="Custom URL" class="h-6 w-6 object-contain" />
          <div class="mt-1 text-xs font-semibold text-slate-800">Custom URL</div>
          <div class="text-[10px] text-slate-500 leading-tight mt-0.5">Use any public JSON URL</div>
        </button>
      </div>

      <!-- Source URL Bar: View Mode (khi đã cấu hình xong) -->
      <div v-if="!isEditingSource && activeSourceUrl" class="flex h-9 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/90 px-2.5 text-xs">
        <div class="flex items-center gap-1.5 min-w-0">
          <UntitledIcon name="settings-01" :size="13" class="shrink-0 text-slate-500" />
          <span class="font-medium text-slate-600 shrink-0">Source URL:</span>
          <span class="truncate font-mono text-[11.5px] text-slate-800" :title="activeSourceUrl">{{ activeSourceUrl }}</span>
        </div>
        <button
          type="button"
          class="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-brand-600 hover:text-brand-700 transition-colors"
          @click="isEditingSource = true"
        >
          <UntitledIcon name="edit-02" :size="12" />
          <span>Edit</span>
        </button>
      </div>

      <!-- Source URL Bar: Edit/Input Mode (khi chưa cấu hình hoặc người dùng bấm Edit) -->
      <div v-else class="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white pl-2.5 pr-1.5 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500 transition-all">
        <UntitledIcon name="settings-01" :size="13" class="shrink-0 text-slate-400" />
        <span class="font-medium text-slate-500 shrink-0 text-xs">Source URL:</span>
        <input
          v-model="sourceUrl"
          class="h-full flex-1 min-w-0 border-0 bg-transparent p-0 font-mono text-xs text-slate-800 focus:outline-none focus:ring-0 placeholder:text-slate-400"
          placeholder="https://raw.githubusercontent.com/… or JSON URL"
          @keydown.enter="async () => { await saveSettings(); isEditingSource = false; }"
        />
        <button
          type="button"
          class="inline-flex shrink-0 items-center gap-1 rounded-md bg-brand-500 px-2.5 py-1 text-[11px] font-semibold text-white shadow-2xs hover:bg-brand-600 active:scale-95 transition-all disabled:opacity-50"
          :disabled="loadingSnippets || !sourceUrl.trim()"
          @click="async () => { await saveSettings(); isEditingSource = false; }"
        >
          <UntitledIcon name="refresh-cw" :size="11" :class="loadingSnippets ? 'animate-spin' : ''" />
          <span>{{ loadingSnippets ? 'Đang tải…' : 'Lưu & Tải' }}</span>
        </button>
      </div>

      <!-- Info tip & Format JSON Button -->
      <div class="rounded-lg bg-blue-50/80 px-2.5 py-1.5 text-[11px] text-blue-900 border border-blue-100 space-y-1">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5 min-w-0">
            <UntitledIcon name="info-circle" :size="14" class="shrink-0 text-blue-600" />
            <span class="truncate">Bạn có thể dùng commit SHA để cố định phiên bản</span>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded bg-blue-100/70 px-1.5 py-0.5 text-[10.5px] font-semibold text-blue-800 hover:bg-blue-200/80 transition-colors"
              title="Xem quy định format chuẩn của file JSON & cách xử lý code dài"
              @click="jsonFormatModalOpen = true"
            >
              <UntitledIcon name="file" :size="11" />
              <span>Format JSON</span>
            </button>
            <button
              type="button"
              class="rounded p-0.5 text-blue-500 hover:bg-blue-100 hover:text-blue-700 focus:outline-none"
              title="Bấm để xem thêm hướng dẫn"
              @click="showHelpTip = !showHelpTip"
            >
              <UntitledIcon name="help-circle" :size="14" />
            </button>
          </div>
        </div>
        <div v-if="showHelpTip" class="border-t border-blue-100 pt-1 text-[10.5px] leading-relaxed text-blue-800">
          <p>• Thay nhánh <code>/main/</code> bằng SHA commit cụ thể (vd: <code>.../a1b2c3d/...</code>) để theme không bị ảnh hưởng ngoài ý muốn khi repository có cập nhật mới.</p>
          <p class="mt-0.5">• Code snippet sẽ được ghi thẳng vào theme Shopify của merchant: chỉ sử dụng các nguồn URL tin cậy.</p>
        </div>
      </div>

      <p v-if="snippetsError" class="tib-error">{{ snippetsError }}</p>
      <p v-if="loadingSnippets" class="tib-muted">Đang tải snippets…</p>
    </WorkflowSection>

    <!-- step 2: Choose & Prepare Snippets (Library or Custom) -->
    <WorkflowSection
      step="2"
      title="Snippet Library"
      subtitle="Find and select the snippets you need"
    >
      <template #action>
        <span
          v-if="selectedIds.length"
          class="rounded-full bg-blue-50 border border-blue-200/80 px-2 py-0.5 text-[10.5px] font-bold text-blue-700 shadow-2xs"
        >
          {{ selectedIds.length }} selected
        </span>
      </template>

      <!-- Sub-tabs chuyển đổi giữa Library và Custom Code -->
      <div class="flex rounded-lg bg-blue-100/70 p-0.5 text-xs font-medium border border-blue-200/60">
        <button
          type="button"
          class="flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 transition-all"
          :class="!useCustom ? 'bg-white text-brand-600 tib-active-elevated font-semibold' : 'text-blue-900/70 hover:text-slate-800'"
          @click="useCustom = false"
        >
          <UntitledIcon name="layers-three" :size="14" />
          <span>Danh sách Snippets</span>
          <span v-if="selectedIds.length" class="ml-1 rounded-full bg-blue-100 px-1.5 py-0.2 text-[10px] text-blue-700 font-bold">
            {{ selectedIds.length }}
          </span>
        </button>

        <button
          type="button"
          class="flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 transition-all"
          :class="useCustom ? 'bg-white text-brand-600 tib-active-elevated font-semibold' : 'text-blue-900/70 hover:text-slate-800'"
          @click="useCustom = true"
        >
          <UntitledIcon name="code-02" :size="14" />
          <span>Code tuỳ chỉnh (Custom)</span>
        </button>
      </div>

      <!-- Mode 1: Library Snippets -->
      <div v-if="!useCustom" class="space-y-2 pt-1">
        <!-- Thanh Search & Filters chung một hàng ngang (giống hệt Design) -->
        <div class="flex items-center gap-1.5">
          <!-- Ô Search snippets bo tròn -->
          <div class="relative min-w-0 flex-1 h-8">
            <span class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-400">
              <UntitledIcon name="search-sm" :size="13" />
            </span>
            <input
              v-model="query"
              class="h-full w-full rounded-lg border border-slate-200 bg-white pl-8 pr-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="Search snippets…"
            />
          </div>

          <!-- Filter Theme Dropdown Pill -->
          <div class="relative shrink-0">
            <select
              v-model="themeGroup"
              class="h-8 appearance-none rounded-lg border border-slate-200 bg-white pl-6 pr-5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 focus:border-brand-500 focus:outline-none cursor-pointer"
            >
              <option value="All">Theme</option>
              <option v-for="g in themeGroups.filter((x) => x !== 'All')" :key="g" :value="g">{{ g }}</option>
            </select>
            <div class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-500">
              <UntitledIcon name="palette" :size="12" />
            </div>
            <div class="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400">
              <UntitledIcon name="chevron-down" :size="10" />
            </div>
          </div>

          <!-- Filter Category Dropdown Pill -->
          <div class="relative shrink-0">
            <select
              v-model="category"
              class="h-8 appearance-none rounded-lg border border-slate-200 bg-white pl-6 pr-5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 focus:border-brand-500 focus:outline-none cursor-pointer"
            >
              <option value="">Category</option>
              <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
            </select>
            <div class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-500">
              <UntitledIcon name="layers-three" :size="12" />
            </div>
            <div class="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400">
              <UntitledIcon name="chevron-down" :size="10" />
            </div>
          </div>

          <!-- Filter Type Dropdown Pill (+ More) -->
          <div class="relative shrink-0">
            <select
              v-model="typeFilter"
              class="h-8 appearance-none rounded-lg border border-slate-200 bg-white pl-6 pr-5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 focus:border-brand-500 focus:outline-none cursor-pointer"
            >
              <option value="All">More</option>
              <option value="css">CSS</option>
              <option value="js">JS</option>
              <option value="liquid">Liquid</option>
              <option value="json">JSON</option>
              <option value="mixed">Mixed</option>
            </select>
            <div class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-500">
              <UntitledIcon name="plus" :size="12" class="stroke-[2.5]" />
            </div>
            <div class="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400">
              <UntitledIcon name="chevron-down" :size="10" />
            </div>
          </div>
        </div>

        <!-- Horizontal filter chips (All, Dawn, Debut, Turbo, Favorites) -->
        <div class="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 text-[11px]">
          <button
            type="button"
            class="shrink-0 rounded-full px-2.5 py-1 font-semibold transition-all border"
            :class="activeTabFilter === 'all'
              ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'"
            @click="activeTabFilter = 'all'"
          >
            All ({{ filterCounts.all }})
          </button>

          <button
            type="button"
            class="shrink-0 rounded-full px-2.5 py-1 font-semibold transition-all border"
            :class="activeTabFilter === 'dawn'
              ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'"
            @click="activeTabFilter = 'dawn'"
          >
            Dawn ({{ filterCounts.dawn }})
          </button>

          <button
            type="button"
            class="shrink-0 rounded-full px-2.5 py-1 font-semibold transition-all border"
            :class="activeTabFilter === 'debut'
              ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'"
            @click="activeTabFilter = 'debut'"
          >
            Debut ({{ filterCounts.debut }})
          </button>

          <button
            type="button"
            class="shrink-0 rounded-full px-2.5 py-1 font-semibold transition-all border"
            :class="activeTabFilter === 'turbo'
              ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'"
            @click="activeTabFilter = 'turbo'"
          >
            Turbo ({{ filterCounts.turbo }})
          </button>

          <button
            type="button"
            class="shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold transition-all border"
            :class="activeTabFilter === 'favorites'
              ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'"
            @click="activeTabFilter = 'favorites'"
          >
            <UntitledIcon
              :name="activeTabFilter === 'favorites' ? 'star-filled' : 'star'"
              :size="12"
              :class="activeTabFilter === 'favorites' ? 'text-white' : 'text-slate-500'"
            />
            <span>Favorites ({{ filterCounts.fav }})</span>
          </button>
        </div>

        <label class="flex items-center gap-2 text-xs text-slate-600 pt-0.5">
          <input v-model="showAllThemes" type="checkbox" class="rounded border-slate-300 text-brand-600 focus:ring-0" />
          <span>Hiện cả snippet không khớp theme</span>
        </label>

        <!-- Danh sách Snippet với Tags & Nút Favorite đúng thiết kế -->
        <ul class="max-h-72 space-y-1.5 overflow-auto">
          <li
            v-for="sn in filtered"
            :key="sn.id"
            class="tib-snip-card transition-all"
            :class="selectedIds.includes(sn.id) ? 'selected !border-blue-400 !bg-blue-50/40' : ''"
          >
            <div class="flex items-center gap-2">
              <input
                type="checkbox"
                class="rounded border-slate-300 text-brand-600 focus:ring-0 focus:ring-offset-0 cursor-pointer shrink-0"
                :checked="selectedIds.includes(sn.id)"
                @change="toggleSnippet(sn.id)"
              />

              <!-- Tiêu đề + Tooltip chi tiết khi hover -->
              <div class="min-w-0 flex-1 relative group py-0.5">
                <button
                  type="button"
                  class="w-full text-left truncate text-xs font-semibold text-slate-800 hover:text-brand-600 transition-colors"
                  @click="toggleSnippet(sn.id)"
                >
                  {{ sn.title }}
                </button>

                <!-- Tooltip hover hiển thị Title, Description, Files cần sửa -->
                <div
                  class="pointer-events-none absolute left-0 bottom-full mb-1.5 z-30 hidden w-64 rounded-lg border border-slate-700/80 bg-slate-900/95 p-2 text-white shadow-xl backdrop-blur-xs group-hover:block transition-all"
                >
                  <div class="font-bold text-slate-100 text-[11.5px] leading-tight">{{ sn.title }}</div>
                  <div v-if="sn.description" class="mt-1 text-[10.5px] text-slate-300 leading-snug line-clamp-3">
                    {{ sn.description }}
                  </div>
                  <div class="mt-1.5 pt-1.5 border-t border-slate-700/60 text-[10px] space-y-0.5">
                    <div class="text-slate-400 font-medium">Files cần chỉnh sửa ({{ sn.targets.length }}):</div>
                    <div class="space-y-0.5 font-mono text-[9.5px]">
                      <div
                        v-for="(t, ti) in sn.targets"
                        :key="ti"
                        class="flex items-center justify-between text-slate-300 truncate"
                      >
                        <span class="truncate">{{ t.filename }}</span>
                        <span class="text-slate-400 ml-1 shrink-0">({{ modeLabel[t.mode] || t.mode }})</span>
                      </div>
                    </div>
                  </div>
                  <!-- Tam giác chỉ xuống -->
                  <div class="absolute left-4 top-full -mt-px border-4 border-transparent border-t-slate-900/95"></div>
                </div>
              </div>

              <!-- Tags bên phải: Theme + Type + Favorite Icon Star -->
              <div class="flex items-center gap-1.5 shrink-0" @click.stop>
                <!-- Tag Theme -->
                <span
                  class="rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                  :class="sn.themes.includes('*') ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/60' : 'bg-blue-50 text-blue-700 border border-blue-200/60'"
                >
                  {{ sn.themes.includes('*') ? 'All Themes' : (sn.themes[0] || 'Theme') }}
                </span>

                <!-- Tag Type -->
                <span
                  class="rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase"
                  :class="{
                    'bg-amber-50 text-amber-700 border border-amber-200/60': sn.type === 'js',
                    'bg-purple-50 text-purple-700 border border-purple-200/60': sn.type === 'css',
                    'bg-emerald-50 text-emerald-700 border border-emerald-200/60': sn.type === 'liquid',
                    'bg-slate-100 text-slate-700 border border-slate-200': sn.type === 'mixed' || sn.type === 'json'
                  }"
                >
                  {{ sn.type }}
                </span>

                <!-- Star Favorite Button -->
                <button
                  type="button"
                  class="p-1 rounded text-slate-400 hover:text-amber-500 transition-colors"
                  :class="favorites.includes(sn.id) ? '!text-amber-400' : ''"
                  :title="favorites.includes(sn.id) ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'"
                  @click="toggleFavorite(sn.id)"
                >
                  <UntitledIcon :name="favorites.includes(sn.id) ? 'star-filled' : 'star'" :size="14" />
                </button>

                <!-- Chevron collapse/expand -->
                <button
                  type="button"
                  class="p-0.5 text-slate-400 hover:text-slate-600 transition-colors"
                  @click="toggleExpand(sn.id)"
                >
                  <UntitledIcon :name="expandedId === sn.id ? 'chevron-up' : 'chevron-down'" :size="13" />
                </button>
              </div>
            </div>

            <!-- Expanded Code Preview -->
            <div v-if="expandedId === sn.id" class="mt-2 space-y-1.5 border-t border-slate-100 pt-1.5">
              <p v-if="sn.description" class="text-xs text-slate-600">{{ sn.description }}</p>
              <p class="tib-muted text-[10.5px]">tags: {{ sn.tags.join(', ') || '—' }} · themes: {{ sn.themes.join(', ') }}</p>
              <div v-for="(t, i) in sn.targets" :key="i" class="rounded border bg-slate-50">
                <div class="flex items-center justify-between px-1.5 py-1 text-[11px]">
                  <span class="break-all font-mono">{{ t.filename }}</span>
                  <span class="tib-chip ml-2 bg-slate-200">{{ modeLabel[t.mode] }}</span>
                </div>
                <pre class="max-h-32 overflow-auto border-t p-1.5 font-mono text-[11px]"><code>{{ t.code }}</code></pre>
              </div>
              <button class="inline-flex items-center gap-1 text-xs text-brand-600 underline hover:text-brand-700" @click="copySnippetCode(sn)">
                <UntitledIcon name="copy" :size="12" />
                <span>Copy snippet</span>
              </button>
            </div>
          </li>
        </ul>

        <!-- Footer Step 2: Selected info + Clear all + View all filtered -->
        <div class="flex items-center justify-between rounded-lg bg-blue-50/80 px-2.5 py-1.5 text-xs text-blue-900 border border-blue-100">
          <span class="inline-flex items-center gap-1.5 font-medium">
            <UntitledIcon name="info-circle" :size="14" class="text-blue-600" />
            <span>{{ selectedIds.length }} snippets selected</span>
          </span>
          <div class="flex items-center gap-3">
            <button
              v-if="selectedIds.length"
              type="button"
              class="font-semibold text-blue-700 hover:text-blue-900 transition-colors"
              @click="clearSelection"
            >
              Clear all
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-1 font-semibold text-brand-600 hover:text-brand-700 transition-colors"
              title="Xóa bộ lọc để xem toàn bộ danh sách snippets"
              @click="handleViewAllFiltered"
            >
              <span>View all</span>
              <UntitledIcon name="link-external" :size="11" />
            </button>
          </div>
        </div>
      </div>

      <!-- Mode 2: Custom Code Builder -->
      <div v-else class="space-y-2 pt-1">
        <p class="tib-muted">Tạo file riêng: CSS/JS → assets · Liquid → snippets/sections · JSON → templates</p>
        <div class="flex gap-1.5">
          <button v-for="k in (['css', 'js', 'liquid', 'json'] as const)" :key="k"
            class="tib-btn flex-1 px-1 py-1 text-xs font-semibold" :class="customKind === k ? '!border-brand-500 !bg-blue-50 !text-brand-600 shadow-sm' : ''"
            @click="customKind = k">{{ k.toUpperCase() }}</button>
        </div>
        <div class="grid grid-cols-2 gap-1.5">
          <label class="text-[11px] font-medium">Folder (auto theo loại)
            <select v-model="customFolder" class="tib-input mt-0.5 font-mono text-xs">
              <option v-for="f in CUSTOM_FOLDERS[customKind]" :key="f" :value="f">{{ f }}/</option>
            </select>
          </label>
          <label class="text-[11px] font-medium">Tên file
            <input v-model="customName" class="tib-input mt-0.5 font-mono text-xs" placeholder="teeinblue-custom" />
          </label>
        </div>
        <p class="break-all font-mono text-[11px] text-slate-600">→ {{ customFilename || '(chưa có tên file)' }}</p>
        <label class="block text-[11px] font-medium">Mode
          <select v-model="customMode" class="tib-input mt-0.5 text-xs">
            <option v-for="m in MODES.filter((x) => x !== 'replace')" :key="m" :value="m">{{ modeLabel[m] }}</option>
          </select>
        </label>
        <textarea v-model="customCode" rows="6" class="tib-input font-mono text-xs" placeholder="Nhập code CSS / JS / Liquid / JSON tại đây…" />
        <label v-if="customMode === 'create'" class="flex items-center gap-2 text-xs text-slate-700">
          <input v-model="addReference" type="checkbox" /> Tự link file vào layout/theme.liquid
        </label>
      </div>
    </WorkflowSection>

    <!-- step 3: Inject to Theme -->
    <WorkflowSection step="3" title="Inject to Theme" :subtitle="`${targets.length} file sẽ xử lý`">
      <template #action>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50/80 px-2.5 py-0.5 text-[11px] font-semibold text-blue-800 shadow-2xs hover:bg-blue-100 hover:text-blue-900 transition-colors disabled:opacity-50"
          :disabled="!canInject || confirmLoading"
          title="Xem trước sự thay đổi các file trong Theme"
          @click="openConfirm"
        >
          <UntitledIcon name="eye" :size="12" class="text-blue-600" />
          <span>Preview</span>
        </button>
      </template>

      <label class="block text-xs font-medium text-slate-700">Ghi chú marker (tuỳ chọn — tên người edit, ticket…)
        <input v-model="markerNote" class="tib-input mt-1 text-xs" placeholder="vd: Phat – fix cart drawer #123" />
      </label>
      <p class="tib-muted text-[11px]">Marker: tib-snippet:&lt;id&gt; start · &lt;giờ inject&gt; · &lt;ghi chú&gt; — rollback nhận diện bằng prefix id.</p>

      <div v-if="targets.length" class="space-y-1">
        <div v-for="(t, i) in targets" :key="i" class="flex items-center justify-between gap-2 rounded border bg-white px-2 py-1 text-xs">
          <span class="min-w-0 break-all font-mono">{{ t.filename }}</span>
          <span class="tib-chip shrink-0 bg-slate-100">{{ modeLabel[t.mode] }}</span>
        </div>
        <button class="inline-flex items-center gap-1 text-xs text-brand-600 underline hover:text-brand-700" @click="copyOne(targets.map((t) => `// ${t.filename} [${t.mode}]\n${t.code}`).join('\n\n'))">
          <UntitledIcon name="copy" :size="12" />
          <span>Copy all</span>
        </button>
      </div>

      <p v-if="invalidTarget" class="text-xs text-red-600 font-medium">Filename không hợp lệ hoặc bị chặn: {{ invalidTarget.filename }}</p>

      <!-- Ready to inject Hero Banner (Chính xác như thiết kế) -->
      <div
        class="rounded-xl border p-2.5 shadow-xs flex items-center justify-between gap-2 transition-all"
        :class="canInject
          ? 'border-blue-200/90 bg-gradient-to-r from-blue-50/90 via-indigo-50/50 to-blue-50/90'
          : 'border-slate-200 bg-slate-50/70'"
      >
        <div class="flex items-center gap-2 min-w-0">
          <div
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition-all"
            :class="canInject ? 'bg-blue-600' : 'bg-slate-300 text-slate-500'"
          >
            <UntitledIcon v-if="canInject" name="check" :size="16" class="stroke-[3]" />
            <UntitledIcon v-else name="info-circle" :size="16" class="text-white" />
          </div>
          <div class="min-w-0">
            <div class="font-bold text-xs" :class="canInject ? 'text-slate-900' : 'text-slate-600'">
              {{ canInject ? 'Ready to inject!' : 'Chưa chọn snippet' }}
            </div>
            <div class="text-[11px] text-slate-500 truncate">
              {{ canInject
                ? `${targets.length} file sẽ được cập nhật vào theme.`
                : (!selectedTheme ? 'Vui lòng kết nối theme' : 'Chọn snippet ở Step 2 để tiếp tục.') }}
            </div>
          </div>
        </div>

        <button
          type="button"
          class="inline-flex shrink-0 items-center gap-1.5 px-3 py-2 text-xs font-bold shadow-sm transition-all rounded-lg"
          :class="canInject
            ? 'tib-btn-primary shadow-md hover:shadow-lg active:scale-95'
            : 'bg-slate-200 text-slate-400 cursor-not-allowed'"
          :disabled="!canInject || injecting"
          @click="openConfirm"
        >
          <UntitledIcon name="zap" :size="14" :class="canInject ? 'fill-current' : 'text-slate-400'" />
          <span>{{ injecting ? 'Đang ghi…' : `Inject ${selectedIds.length || targets.length} Snippets →` }}</span>
        </button>
      </div>
    </WorkflowSection>

    <!-- Bottom Navigation 4 nút tiện ích (History, Reset, Docs, Support) -->
    <div class="grid grid-cols-4 gap-1.5 pt-1">
      <button
        type="button"
        class="flex flex-col items-center justify-center gap-1 rounded-xl border border-slate-200/80 bg-white p-2 text-center shadow-2xs hover:border-blue-300 hover:bg-blue-50/50 active:scale-95 transition-all"
        @click="historyOpen = !historyOpen"
      >
        <div class="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-blue-600">
          <UntitledIcon name="clock" :size="15" />
        </div>
        <div class="text-[11px] font-bold text-slate-800">History</div>
        <div class="text-[9.5px] text-slate-500 leading-tight">View past actions</div>
      </button>

      <button
        type="button"
        class="flex flex-col items-center justify-center gap-1 rounded-xl border border-slate-200/80 bg-white p-2 text-center shadow-2xs hover:border-blue-300 hover:bg-blue-50/50 active:scale-95 transition-all"
        @click="handleResetAll"
      >
        <div class="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <UntitledIcon name="refresh-cw" :size="14" />
        </div>
        <div class="text-[11px] font-bold text-slate-800">Reset</div>
        <div class="text-[9.5px] text-slate-500 leading-tight">Clear all selections</div>
      </button>

      <button
        type="button"
        class="flex flex-col items-center justify-center gap-1 rounded-xl border border-slate-200/80 bg-white p-2 text-center shadow-2xs hover:border-blue-300 hover:bg-blue-50/50 active:scale-95 transition-all"
        @click="helpModalOpen = true"
      >
        <div class="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
          <UntitledIcon name="book-open" :size="15" />
        </div>
        <div class="text-[11px] font-bold text-slate-800">Docs</div>
        <div class="text-[9.5px] text-slate-500 leading-tight">Learn more</div>
      </button>

      <button
        type="button"
        class="flex flex-col items-center justify-center gap-1 rounded-xl border border-slate-200/80 bg-white p-2 text-center shadow-2xs hover:border-blue-300 hover:bg-blue-50/50 active:scale-95 transition-all"
        @click="openPartnerStores"
      >
        <div class="flex h-7 w-7 items-center justify-center rounded-full bg-purple-50 text-purple-600">
          <UntitledIcon name="headphones-01" :size="15" />
        </div>
        <div class="text-[11px] font-bold text-slate-800">Support</div>
        <div class="text-[9.5px] text-slate-500 leading-tight">Get help</div>
      </button>
    </div>

    <!-- history collapsible khi click History button -->
    <div v-if="historyOpen && undoList.length" class="tib-card p-2.5 animate-in fade-in duration-150">
      <div class="flex items-center justify-between text-xs font-semibold text-slate-800 border-b border-slate-100 pb-1.5 mb-2">
        <span>Lịch sử inject ({{ undoList.length }})</span>
        <button class="text-slate-400 hover:text-slate-600" @click="historyOpen = false">
          <UntitledIcon name="minus-circle" :size="14" />
        </button>
      </div>
      <ul class="space-y-1.5 max-h-48 overflow-auto">
        <li v-for="u in undoList" :key="u.id" class="rounded-lg border bg-slate-50/80 p-2 text-xs">
          <div class="break-all font-semibold text-slate-900">{{ new Date(u.ts).toLocaleString() }} · {{ (u.snippetIds.length ? u.snippetIds : [u.snippetId]).join(', ') }}</div>
          <div class="tib-muted break-all text-[11px]">{{ u.themeName }}{{ u.themeRole ? ` (${u.themeRole})` : '' }}</div>
          <div v-if="u.markerNote" class="tib-muted break-all text-[11px]">Ghi chú: {{ u.markerNote }}</div>
          <button class="tib-btn mt-1.5 px-2 py-0.5 text-xs font-medium text-red-600 border-red-200 hover:bg-red-50" @click="doUndo(u)">Undo rollback</button>
        </li>
      </ul>
    </div>

    <!-- Modal giải thích chi tiết kiến trúc & flow (Mở từ nút Docs ở Bottom Navigation) -->
    <SnippetHelpModal :open="helpModalOpen" @close="helpModalOpen = false" />

    <!-- Modal định dạng JSON chuẩn & hướng dẫn code dài -->
    <SnippetJsonFormatModal :open="jsonFormatModalOpen" @close="jsonFormatModalOpen = false" />

    <!-- confirm modal -->
    <div v-if="confirmOpen" class="fixed inset-0 z-40 flex items-end bg-black/40 p-3 sm:items-center">
      <div class="max-h-[90vh] w-full space-y-2.5 overflow-auto rounded-lg bg-white p-3 shadow-xl">
        <div class="font-semibold">Xác nhận inject</div>
        <p v-if="isLive" class="flex items-center gap-1.5 rounded bg-red-100 p-2 text-xs font-medium text-red-700">
          <UntitledIcon name="alert-triangle" :size="16" class="shrink-0 text-red-600" />
          <span>Đây là LIVE theme (role main). Thay đổi có hiệu lực ngay với khách hàng.</span>
        </p>
        <p class="text-xs">Theme: <b>{{ selectedTheme?.name }}</b> (id {{ selectedTheme?.id }}, role {{ selectedTheme?.role }})</p>
        <p class="tib-muted">Thời điểm đọc: {{ confirmAt }} · dòng chèn là ước lượng, theme có thể đổi giữa lúc đọc và ghi.</p>
        <p v-if="confirmLoading" class="tib-muted">Đang đọc nội dung theme để tính preview…</p>
        <p v-if="confirmError" class="tib-error">{{ confirmError }}</p>
        <ul v-if="!confirmLoading && !confirmError" class="space-y-1.5">
          <li v-for="(r, i) in confirmRows" :key="i" class="rounded border p-1.5 text-xs">
            <div class="flex items-center gap-1.5">
              <UntitledIcon
                :name="actionIconMap[r.action]?.icon || 'minus-circle'"
                :size="14"
                :class="actionIconMap[r.action]?.color || 'text-slate-400'"
              />
              <span class="break-all font-mono font-medium">{{ r.filename }}</span>
            </div>
            <div class="mt-0.5 text-slate-600">{{ r.action }} — {{ r.detail }}</div>
            <div class="tib-muted">Từ snippet: {{ r.snippetIds.join(', ') || '—' }}{{ r.exists ? '' : ' · file chưa tồn tại' }}</div>
          </li>
        </ul>
        <p v-if="markerNote.trim()" class="tib-muted break-all">Marker note: {{ markerNote.trim() }}</p>
        <div class="flex justify-end gap-2">
          <button class="tib-btn" @click="confirmOpen = false">Huỷ</button>
          <button class="rounded px-3 py-1.5 text-white disabled:opacity-50" :class="isLive ? 'bg-red-600' : 'bg-brand-500'" :disabled="injecting || confirmLoading" @click="doInject">
            {{ injecting ? 'Đang ghi…' : isLive ? 'Inject vào LIVE theme' : 'Inject' }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
