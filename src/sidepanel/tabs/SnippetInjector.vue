<script setup lang="ts">
import type { TabContext } from '@/shared/types';
import WorkflowSection from '../components/WorkflowSection.vue';
import { useSnippetInjector } from '../composables/useSnippetInjector';
import { copyText } from '../clipboard';
import { errMsg } from '../api';

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

const actionIcon: Record<string, string> = {
  CREATE: '🟢', INSERT: '🟡', APPEND: '🟡', REPLACE: '🟠', SKIP: '⚪'
};
</script>

<template>
  <section class="space-y-2.5">
    <!-- hero -->
    <div class="tib-card bg-gradient-to-r from-blue-50 to-indigo-100 p-3">
      <div class="text-sm font-bold">⚡ Inject Shopify Snippets in One Click</div>
      <div class="tib-muted">Fetch code từ GitHub / Google Sheet và inject vào theme Shopify hiện tại.</div>
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
          <div class="text-lg">🐙</div><div class="text-xs font-semibold">GitHub Raw JSON</div>
        </button>
        <button class="tib-src-card" :class="sourceKind === 'sheet' ? 'active' : ''" @click="pickSource('sheet')">
          <div class="text-lg">📄</div><div class="text-xs font-semibold">Google Sheet</div>
        </button>
        <button class="tib-src-card" :class="sourceKind === 'custom' ? 'active' : ''" @click="pickSource('custom')">
          <div class="text-lg">🔗</div><div class="text-xs font-semibold">Custom URL</div>
        </button>
      </div>
    </WorkflowSection>

    <!-- step 2 -->
    <WorkflowSection step="2" title="Configure" subtitle="URL nguồn snippet">
      <input v-model="sourceUrl" class="tib-input font-mono text-xs" placeholder="https://raw.githubusercontent.com/…/snippets.json" />
      <div class="flex gap-2">
        <button class="tib-btn-primary px-2 py-1 text-xs" @click="saveSettings">Lưu & tải</button>
        <button class="tib-btn text-xs" @click="loadSnippets(true)">Tải lại</button>
      </div>
      <p class="tib-muted">Khuyến nghị pin vào commit SHA cụ thể. Snippet được ghi thẳng vào theme merchant: chỉ dùng nguồn tin cậy.</p>
      <p v-if="snippetsError" class="tib-error">{{ snippetsError }}</p>
      <p v-if="loadingSnippets" class="tib-muted">Đang tải snippets…</p>
    </WorkflowSection>

    <!-- step 3 -->
    <WorkflowSection step="3" title="Select Snippets" :subtitle="`${filtered.length}/${snippets.length} snippet · đã chọn ${selectedIds.length}`">
      <input v-model="query" class="tib-input" placeholder="🔍 Search snippets…" />
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
      <label class="flex items-center gap-2 text-xs"><input v-model="showAllThemes" type="checkbox" /> Hiện cả snippet không khớp theme</label>

      <ul class="max-h-64 space-y-1.5 overflow-auto">
        <li v-for="sn in filtered" :key="sn.id" class="tib-snip-card" :class="selectedIds.includes(sn.id) ? 'selected' : ''">
          <div class="flex items-center gap-2">
            <input type="checkbox" :checked="selectedIds.includes(sn.id)" @change="toggleSnippet(sn.id)" />
            <button class="min-w-0 flex-1 text-left" @click="toggleSnippet(sn.id)">
              <div class="truncate text-sm font-medium">{{ sn.title }}</div>
              <div class="tib-muted truncate">{{ sn.category }} · {{ sn.targets.length }} file · {{ sn.type }}</div>
            </button>
            <button class="tib-btn px-1.5 py-0.5 text-xs" @click="toggleExpand(sn.id)">{{ expandedId === sn.id ? '▴' : '▾' }}</button>
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
            <button class="text-xs underline" @click="copySnippetCode(sn)">Copy snippet</button>
          </div>
        </li>
      </ul>
      <div v-if="selectedIds.length" class="flex items-center justify-between rounded bg-blue-50 px-2 py-1 text-xs text-blue-800">
        <span>ⓘ {{ selectedIds.length }} snippets selected</span>
        <button class="underline" @click="clearSelection">Clear all</button>
      </div>
    </WorkflowSection>

    <!-- custom builder -->
    <WorkflowSection title="Custom Code" subtitle="Tạo file riêng: CSS/JS → assets · Liquid → snippets/sections · JSON → templates">
      <label class="flex items-center gap-2 text-xs"><input v-model="useCustom" type="checkbox" /> Dùng code tuỳ chỉnh</label>
      <div v-if="useCustom" class="space-y-1.5">
        <div class="flex gap-1.5">
          <button v-for="k in (['css', 'js', 'liquid', 'json'] as const)" :key="k"
            class="tib-btn flex-1 px-1 py-1 text-xs" :class="customKind === k ? 'border-brand-500 bg-blue-50' : ''"
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
        <textarea v-model="customCode" rows="6" class="tib-input font-mono text-xs" placeholder="CSS / JS / Liquid / JSON…" />
        <label v-if="customMode === 'create'" class="flex items-center gap-2 text-xs"><input v-model="addReference" type="checkbox" /> Tự link file vào layout/theme.liquid</label>
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
        <button class="text-xs underline" @click="copyOne(targets.map((t) => `// ${t.filename} [${t.mode}]\n${t.code}`).join('\n\n'))">Copy all</button>
      </div>
      <p v-if="invalidTarget" class="text-xs text-red-600">Filename không hợp lệ hoặc bị chặn: {{ invalidTarget.filename }}</p>
      <div class="flex gap-2">
        <button class="tib-btn flex-1" @click="resetAll">↻ Reset</button>
        <button class="tib-btn-primary flex-[2]" :disabled="!canInject || injecting" @click="openConfirm">
          ⚡ {{ injecting ? 'Đang ghi…' : `Inject${selectedTheme ? ` vào “${selectedTheme.name}”` : ''}` }} →
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
        <p v-if="isLive" class="rounded bg-red-100 p-2 text-xs font-medium text-red-700">⚠ Đây là LIVE theme (role main). Thay đổi có hiệu lực ngay với khách hàng.</p>
        <p class="text-xs">Theme: <b>{{ selectedTheme?.name }}</b> (id {{ selectedTheme?.id }}, role {{ selectedTheme?.role }})</p>
        <p class="tib-muted">Thời điểm đọc: {{ confirmAt }} · dòng chèn là ước lượng, theme có thể đổi giữa lúc đọc và ghi.</p>
        <p v-if="confirmLoading" class="tib-muted">Đang đọc nội dung theme để tính preview…</p>
        <p v-if="confirmError" class="tib-error">{{ confirmError }}</p>
        <ul v-if="!confirmLoading && !confirmError" class="space-y-1.5">
          <li v-for="(r, i) in confirmRows" :key="i" class="rounded border p-1.5 text-xs">
            <div class="flex items-center gap-1.5">
              <span>{{ actionIcon[r.action] }}</span>
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
