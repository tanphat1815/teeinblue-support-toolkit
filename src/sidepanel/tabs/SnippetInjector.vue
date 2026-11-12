<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TabContext } from '@/shared/types';
import WorkflowSection from '../components/WorkflowSection.vue';
import UntitledIcon, { type IconName } from '../components/UntitledIcon.vue';
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
  undoList, doUndo, copySnippetCode
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
</script>

<template>
  <section class="space-y-2.5">
    <!-- hero -->
    <div class="tib-card bg-gradient-to-r from-blue-50 to-indigo-100 p-3">
      <div class="flex items-center gap-1.5 text-sm font-bold text-slate-800">
        <UntitledIcon name="code-02" :size="16" class="text-brand-600" />
        <span>Inject Shopify Snippets in One Click</span>
      </div>
      <div class="tib-muted mt-0.5">Fetch code từ GitHub / Google Sheet và inject vào theme Shopify hiện tại.</div>
      <div class="tib-muted mt-1">Nguồn: {{ source || '—' }} · {{ snippets.length }} snippet</div>
    </div>

    <!-- trạng thái admin -->
    <div v-if="!admin?.adminTabId" class="tib-warn">
      Chưa thấy tab Shopify Admin của store{{ ctx.storeHandle ? ` "${ctx.storeHandle}"` : '' }}. Đăng nhập Admin rồi bấm bên dưới.
      <div class="mt-2 flex gap-2">
        <button class="tib-btn-primary px-2 py-1 text-xs" @click="openThemes">Mở Online Store → Themes</button>
        <button class="tib-btn text-xs" @click="refreshAdmin">Kiểm tra lại</button>
      </div>
    </div>
    <div v-else-if="!admin.hasSession" class="tib-warn">
      Chưa bắt được session Shopify. Ở tab Admin hãy vào <b>Online Store → Themes</b>, đợi danh sách theme load xong (reload tab nếu vừa cài/reload extension).
      <div class="mt-2 flex gap-2">
        <button class="tib-btn-primary px-2 py-1 text-xs" @click="openThemes">Mở Themes</button>
        <button class="tib-btn text-xs" @click="refreshAdmin">Kiểm tra lại</button>
      </div>
    </div>

    <!-- theme bar -->
    <div class="tib-card space-y-1.5 p-2.5">
      <label class="block text-xs font-medium">Theme
        <select v-model="themeId" class="tib-input mt-1">
          <option v-for="t in admin?.themes || []" :key="t.id" :value="t.id">{{ t.name }} — {{ t.role }}{{ t.id === ctx.themeId ? ' (đang xem)' : '' }}</option>
        </select>
      </label>
      <p v-if="detected?.name" class="tib-muted">Detected: {{ detected.name }} {{ detected.version }}</p>
    </div>

    <!-- step 1 -->
    <WorkflowSection step="1" title="Choose Source" subtitle="GitHub JSON · Google Sheet · Custom URL">
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
    </WorkflowSection>

    <!-- step 2 -->
    <WorkflowSection step="2" title="Configure" subtitle="Enter URL and load snippets">
      <div class="flex items-center gap-1.5">
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

    <!-- step 3: Choose & Prepare Snippets (Library or Custom) -->
    <WorkflowSection
      step="3"
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

    <!-- step 4 -->
    <WorkflowSection step="4" title="Inject to Theme" :subtitle="`${targets.length} file sẽ xử lý`">
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
