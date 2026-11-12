<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TabContext } from '@/shared/types';
import WorkflowSection from '../components/WorkflowSection.vue';
import UntitledIcon, { type IconName } from '../components/UntitledIcon.vue';
import SnippetHelpModal from '../components/SnippetHelpModal.vue';
import { useSnippetInjector } from '../composables/useSnippetInjector';
import { copyText } from '../clipboard';
import { errMsg } from '../api';
import githubIconUrl from '@/assets/icons/github.svg';
import googleSheetsIconUrl from '@/assets/icons/google-sheets.svg';
import codeFileIconUrl from '@/assets/icons/code-file.svg';

const props = defineProps<{ ctx: TabContext }>();
const s = useSnippetInjector(props);
const {
  toast, sourceUrl, markerNote, sourceKind, pickSource, saveSettings,
  snippets, source, snippetsError, loadingSnippets, loadSnippets,
  admin, themeId, detected, selectedTheme, refreshAdmin, openThemes,
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

          <!-- Cách 1: Qua Partner Dashboard (Khuyên dùng khi support khách) -->
          <div class="rounded-lg border border-slate-200/90 bg-white p-2.5 space-y-2 shadow-sm">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-slate-800 text-[11px] uppercase tracking-wide">Cách 1: Qua Partner Dashboard</span>
              <!-- Partner switcher tone xanh -->
              <div class="inline-flex rounded-md bg-blue-100/70 p-0.5 text-[11px] border border-blue-200/60">
                <button
                  v-for="p in PARTNER_DASHBOARDS"
                  :key="p.id"
                  type="button"
                  class="rounded px-2.5 py-0.5 font-medium transition-all"
                  :class="partnerId === p.id ? 'bg-white text-brand-600 shadow-2xs font-semibold' : 'text-blue-900/70 hover:text-brand-600'"
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

          <!-- Cách 2: Đăng nhập trực tiếp (Nếu đã có quyền hoặc đang login sẵn) -->
          <div class="rounded-lg border border-slate-200/90 bg-white p-2.5 space-y-2 shadow-sm">
            <span class="block font-semibold text-slate-800 text-[11px] uppercase tracking-wide">Cách 2: Đăng nhập trực tiếp</span>
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

        <!-- Dropdown chọn Theme đích để Inject (chỉ hiển thị khi ĐANG Ở TRANG SHOPIFY và đã có session) -->
        <div v-if="isCurrentTabShopify && admin?.hasSession" class="space-y-2">
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
    <WorkflowSection step="1" title="Source & Configuration" subtitle="Chọn nguồn và tải danh sách snippets">
      <!-- Nguồn dữ liệu -->
      <div class="flex gap-2">
        <button class="tib-src-card" :class="sourceKind === 'github' ? 'active' : ''" @click="pickSource('github')">
          <img :src="githubIconUrl" alt="GitHub" class="h-6 w-6 object-contain" />
          <div class="text-xs font-semibold">GitHub Raw JSON</div>
        </button>
        <button class="tib-src-card" :class="sourceKind === 'sheet' ? 'active' : ''" @click="pickSource('sheet')">
          <img :src="googleSheetsIconUrl" alt="Google Sheet" class="h-6 w-6 object-contain" />
          <div class="text-xs font-semibold">Google Sheet</div>
        </button>
        <button class="tib-src-card" :class="sourceKind === 'custom' ? 'active' : ''" @click="pickSource('custom')">
          <img :src="codeFileIconUrl" alt="Custom URL" class="h-6 w-6 object-contain" />
          <div class="text-xs font-semibold">Custom URL</div>
        </button>
      </div>

      <!-- Ô nhập URL và nút tải -->
      <div class="flex items-center gap-1.5 pt-1">
        <div class="relative min-w-0 flex-1">
          <span class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-400">
            <UntitledIcon name="link" :size="14" />
          </span>
          <input
            v-model="sourceUrl"
            class="tib-input !pl-8 font-mono text-xs"
            placeholder="https://github.com/… or raw JSON URL"
          />
        </div>
        <button
          class="tib-btn-primary inline-flex shrink-0 items-center gap-1 px-2.5 py-1.5 text-xs font-semibold"
          @click="saveSettings"
        >
          <UntitledIcon name="folder-download" :size="14" />
          <span>Lưu & Tải</span>
        </button>
        <button
          class="tib-btn inline-flex shrink-0 items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700"
          @click="loadSnippets(true)"
        >
          <UntitledIcon name="refresh-cw" :size="13" :class="loadingSnippets ? 'animate-spin' : ''" />
          <span>Tải lại</span>
        </button>
      </div>

      <!-- Info tip -->
      <div class="rounded-lg bg-blue-50/80 px-2.5 py-1.5 text-[11px] text-blue-900 border border-blue-100">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <UntitledIcon name="info-circle" :size="14" class="shrink-0 text-blue-600" />
            <span>Bạn có thể dùng commit SHA để cố định phiên bản</span>
          </div>
          <button
            type="button"
            class="rounded p-0.5 text-blue-500 hover:bg-blue-100 hover:text-blue-700 focus:outline-none"
            title="Bấm để xem thêm hướng dẫn"
            @click="showHelpTip = !showHelpTip"
          >
            <UntitledIcon name="help-circle" :size="14" />
          </button>
        </div>
        <div v-if="showHelpTip" class="mt-1.5 border-t border-blue-100 pt-1.5 text-[10.5px] leading-relaxed text-blue-800">
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
      title="Select Snippets"
      :subtitle="useCustom ? 'Code tuỳ chỉnh' : `${filtered.length}/${snippets.length} snippet · đã chọn ${selectedIds.length}`"
    >
      <!-- Sub-tabs chuyển đổi giữa Library và Custom Code -->
      <div class="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
        <button
          type="button"
          class="flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 transition-all"
          :class="!useCustom ? 'bg-white text-brand-600 shadow-sm font-semibold' : 'text-slate-500 hover:text-slate-800'"
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
          :class="useCustom ? 'bg-white text-brand-600 shadow-sm font-semibold' : 'text-slate-500 hover:text-slate-800'"
          @click="useCustom = true"
        >
          <UntitledIcon name="code-02" :size="14" />
          <span>Code tuỳ chỉnh (Custom)</span>
        </button>
      </div>

      <!-- Mode 1: Library Snippets -->
      <div v-if="!useCustom" class="space-y-2 pt-1">
        <div class="relative">
          <span class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-400">
            <UntitledIcon name="search-sm" :size="14" />
          </span>
          <input v-model="query" class="tib-input !pl-8" placeholder="Search snippets…" />
        </div>
        <div class="grid grid-cols-3 gap-1.5">
          <label class="text-[11px] font-medium">Theme
            <select v-model="themeGroup" class="tib-input mt-0.5 text-xs">
              <option v-for="g in themeGroups" :key="g" :value="g">{{ g === 'All' ? 'All Themes' : g }}</option>
            </select>
          </label>
          <label class="text-[11px] font-medium">Category
            <select v-model="category" class="tib-input mt-0.5 text-xs">
              <option value="">Tất cả</option>
              <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
            </select>
          </label>
          <label class="text-[11px] font-medium">Type
            <select v-model="typeFilter" class="tib-input mt-0.5 text-xs">
              <option>All</option><option>css</option><option>js</option><option>liquid</option><option>json</option><option>mixed</option>
            </select>
          </label>
        </div>
        <label class="flex items-center gap-2 text-xs text-slate-600"><input v-model="showAllThemes" type="checkbox" /> Hiện cả snippet không khớp theme</label>

        <ul class="max-h-64 space-y-1.5 overflow-auto">
          <li v-for="sn in filtered" :key="sn.id" class="tib-snip-card" :class="selectedIds.includes(sn.id) ? 'selected' : ''">
            <div class="flex items-center gap-2">
              <input type="checkbox" :checked="selectedIds.includes(sn.id)" @change="toggleSnippet(sn.id)" />
              <button class="min-w-0 flex-1 text-left" @click="toggleSnippet(sn.id)">
                <div class="truncate text-sm font-medium">{{ sn.title }}</div>
                <div class="tib-muted truncate">{{ sn.category }} · {{ sn.targets.length }} file · {{ sn.type }}</div>
              </button>
              <button class="tib-btn px-1.5 py-0.5 text-xs text-slate-500" @click="toggleExpand(sn.id)">
                <UntitledIcon :name="expandedId === sn.id ? 'chevron-up' : 'chevron-down'" :size="12" />
              </button>
            </div>
            <div v-if="expandedId === sn.id" class="mt-1.5 space-y-1.5 border-t border-slate-100 pt-1.5">
              <p v-if="sn.description" class="text-xs text-slate-600">{{ sn.description }}</p>
              <p class="tib-muted">tags: {{ sn.tags.join(', ') || '—' }} · themes: {{ sn.themes.join(', ') }}</p>
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
        <div v-if="selectedIds.length" class="flex items-center justify-between rounded bg-blue-50 px-2 py-1.5 text-xs text-blue-800">
          <span class="inline-flex items-center gap-1.5">
            <UntitledIcon name="info-circle" :size="14" class="text-blue-600" />
            <span>{{ selectedIds.length }} snippets selected</span>
          </span>
          <button class="font-medium underline hover:text-blue-950" @click="clearSelection">Clear all</button>
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
      <label class="block text-xs font-medium">Ghi chú marker (tuỳ chọn — tên người edit, ticket…)
        <input v-model="markerNote" class="tib-input mt-1 text-xs" placeholder="vd: Phat – fix cart drawer #123" />
      </label>
      <p class="tib-muted">Marker: tib-snippet:&lt;id&gt; start · &lt;giờ inject&gt; · &lt;ghi chú&gt; — rollback nhận diện bằng prefix id.</p>
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
      <p v-if="invalidTarget" class="text-xs text-red-600">Filename không hợp lệ hoặc bị chặn: {{ invalidTarget.filename }}</p>
      <div class="flex gap-2">
        <button class="tib-btn inline-flex flex-1 items-center justify-center gap-1" @click="resetAll">
          <UntitledIcon name="refresh-cw" :size="13" />
          <span>Reset</span>
        </button>
        <button class="tib-btn-primary inline-flex flex-[2] items-center justify-center gap-1.5" :disabled="!canInject || injecting" @click="openConfirm">
          <UntitledIcon name="code-02" :size="14" />
          <span>{{ injecting ? 'Đang ghi…' : `Inject${selectedTheme ? ` vào “${selectedTheme.name}”` : ''}` }} →</span>
        </button>
      </div>
    </WorkflowSection>

    <!-- history -->
    <details v-if="undoList.length" class="tib-card p-2.5">
      <summary class="cursor-pointer text-xs font-medium">Lịch sử inject ({{ undoList.length }})</summary>
      <ul class="mt-2 space-y-1.5">
        <li v-for="u in undoList" :key="u.id" class="rounded border p-1.5 text-xs">
          <div class="break-all font-medium">{{ new Date(u.ts).toLocaleString() }} · {{ (u.snippetIds.length ? u.snippetIds : [u.snippetId]).join(', ') }}</div>
          <div class="tib-muted break-all">{{ u.themeName }}{{ u.themeRole ? ` (${u.themeRole})` : '' }} · {{ u.createdAt }}</div>
          <div v-if="u.markerNote" class="tib-muted break-all">Ghi chú: {{ u.markerNote }}</div>
          <div class="tib-muted break-all">Files: {{ u.files.map((f) => f.filename).join(', ') }}</div>
          <button class="tib-btn mt-1 px-2 py-0.5 text-xs" @click="doUndo(u)">Undo</button>
        </li>
      </ul>
    </details>

    <!-- Floating Help Button ở góc dưới phải -->
    <div class="flex justify-end pt-1 pb-2">
      <button
        type="button"
        class="group inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-white/90 px-3 py-1.5 text-[11px] font-medium text-slate-600 shadow-sm backdrop-blur hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 active:scale-95 transition-all"
        title="Tìm hiểu cách Snippet Injector hoạt động"
        @click="helpModalOpen = true"
      >
        <div class="flex h-4 w-4 items-center justify-center rounded-full bg-blue-100 text-blue-700 group-hover:bg-blue-600 group-hover:text-white transition-colors">
          <UntitledIcon name="info-circle" :size="11" />
        </div>
        <span>Cơ chế hoạt động & Architecture</span>
      </button>
    </div>

    <!-- Modal giải thích chi tiết kiến trúc & flow -->
    <SnippetHelpModal :open="helpModalOpen" @close="helpModalOpen = false" />

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
