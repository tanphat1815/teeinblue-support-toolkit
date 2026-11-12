<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { BugContext, TabContext } from '@/shared/types';
import { formatBugReport } from '@/shared/format-bug-report';
import { call, errMsg } from '../api';
import { copyText } from '../clipboard';
import { useToast } from '../composables/useToast';
import UntitledIcon from '../components/UntitledIcon.vue';

const props = defineProps<{ ctx: TabContext }>();
const toast = useToast();
const loading = ref(false);
const bug = ref<BugContext | null>(null);
const note = ref('');
const includeErrors = ref(true);
const markdown = ref('');
const canRun = computed(() => props.ctx.kind === 'storefront');

function rebuild() {
  if (bug.value) markdown.value = formatBugReport(bug.value, { note: note.value, includeErrors: includeErrors.value });
}
watch([note, includeErrors], rebuild);

async function capture() {
  loading.value = true;
  try { bug.value = await call<BugContext>({ type: 'CAPTURE_BUG' }); rebuild(); }
  catch (e) { toast.error(errMsg(e)); }
  finally { loading.value = false; }
}
async function copy() {
  if (!markdown.value) return;
  try { await copyText(markdown.value); toast.success('Đã copy Markdown vào clipboard!'); }
  catch (e) { toast.error(errMsg(e)); }
}
</script>

<template>
  <section class="space-y-3">
    <p v-if="!canRun" class="flex items-center gap-1.5 rounded bg-yellow-50 p-2 text-xs text-yellow-800">
      <UntitledIcon name="alert-triangle" :size="14" class="shrink-0 text-yellow-600" />
      <span>Mở tab storefront của merchant (trang đang cần báo lỗi) để dùng tính năng này.</span>
    </p>

    <textarea v-model="note" rows="2" class="w-full rounded border p-2 text-xs" placeholder="Mô tả ngắn lỗi / ticket link (tuỳ chọn)"></textarea>
    <label class="flex items-center gap-2 text-xs"><input v-model="includeErrors" type="checkbox" /> Kèm console errors</label>

    <div class="flex gap-2">
      <button
        class="inline-flex flex-1 items-center justify-center gap-1.5 rounded bg-brand-500 px-3 py-2 font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        :disabled="!canRun || loading"
        @click="capture"
      >
        <UntitledIcon :name="loading ? 'refresh-cw' : 'bug'" :size="15" :class="loading ? 'animate-spin' : ''" />
        <span>{{ loading ? 'Đang thu thập…' : 'Capture & Format Markdown' }}</span>
      </button>
      <button
        class="inline-flex items-center gap-1 rounded border px-3 py-2 text-xs hover:bg-slate-100 disabled:opacity-50"
        :disabled="!markdown"
        @click="copy"
      >
        <UntitledIcon name="copy" :size="13" />
        <span>Copy to Clipboard</span>
      </button>
    </div>

    <template v-if="bug">
      <p v-if="bug.errors === null" class="flex items-center gap-1.5 rounded bg-yellow-50 p-2 text-xs text-yellow-800">
        <UntitledIcon name="alert-triangle" :size="14" class="shrink-0 text-yellow-600" />
        <span>Chưa bắt được console error vì trang được load trước khi extension hoạt động. Reload trang, tái hiện lỗi rồi Capture lại.</span>
      </p>
      <p v-else class="text-xs text-slate-500">Console errors: {{ bug.errors.length }} · Page: {{ bug.pageType }} · Theme: {{ bug.theme.schemaName || 'N/A' }} {{ bug.theme.schemaVersion }}</p>
      <textarea v-model="markdown" rows="16" class="w-full rounded border bg-white p-2 font-mono text-xs"></textarea>
    </template>
  </section>
</template>
