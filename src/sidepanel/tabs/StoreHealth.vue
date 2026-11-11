<script setup lang="ts">
import { computed, ref } from 'vue';
import type { HealthReport, TabContext } from '@/shared/types';
import { call, errMsg } from '../api';
import { copyText } from '../clipboard';
import { useToast } from '../composables/useToast';
import StatusBadge from '../components/StatusBadge.vue';

const props = defineProps<{ ctx: TabContext }>();
const toast = useToast();
const loading = ref(false);
const report = ref<HealthReport | null>(null);
const canRun = computed(() => props.ctx.kind === 'storefront');
const icon = { ok: '🟢', warning: '🟡', error: '🔴' } as const;

async function scan() {
  loading.value = true;
  try { report.value = await call<HealthReport>({ type: 'RUN_HEALTH' }); }
  catch (e) { toast.error(errMsg(e)); }
  finally { loading.value = false; }
}
async function copyReport() {
  const r = report.value;
  if (!r) return;
  const lines = [`### 🔍 Store Health — ${r.overall.toUpperCase()}`, `- URL: ${r.url}`, `- Page type: ${r.pageType}`, ''];
  r.checks.forEach((c) => lines.push(`- ${icon[c.status]} **${c.label}**: ${c.detail.replace(/\n/g, ' | ')}`));
  if (r.conflicts.length) {
    lines.push('', '**Conflicts:**');
    r.conflicts.forEach((c) => lines.push(`- ${c.name} (${c.category}) — ${c.evidence}`));
  }
  try { await copyText(lines.join('\n')); toast.success('Đã copy báo cáo!'); } catch (e) { toast.error(errMsg(e)); }
}
</script>

<template>
  <section class="space-y-3">
    <p v-if="!canRun" class="rounded bg-yellow-50 p-2 text-yellow-800">Mở storefront của merchant (tốt nhất là product page có Teeinblue) để quét.</p>
    <button class="w-full rounded bg-brand-500 px-3 py-2 font-medium text-white hover:bg-brand-600 disabled:opacity-50" :disabled="!canRun || loading" @click="scan">
      {{ loading ? 'Đang quét…' : 'Quét Store Health' }}
    </button>

    <template v-if="report">
      <p v-if="!report.isShopify" class="rounded bg-yellow-50 p-2 text-yellow-800">Trang này không phải storefront Shopify.</p>
      <template v-else>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2"><span class="font-medium">Tổng quan:</span><StatusBadge :status="report.overall" /></div>
          <button class="rounded border px-2 py-1 text-xs hover:bg-slate-100" @click="copyReport">Copy</button>
        </div>
        <ul class="space-y-2">
          <li v-for="c in report.checks" :key="c.id" class="rounded border bg-white p-2">
            <div class="flex items-center justify-between"><span class="font-medium">{{ c.label }}</span><StatusBadge :status="c.status" /></div>
            <p class="mt-1 whitespace-pre-line break-all text-xs text-slate-600">{{ c.detail }}</p>
          </li>
        </ul>
        <div v-if="report.conflicts.length" class="rounded border border-yellow-300 bg-yellow-50 p-2">
          <div class="mb-1 font-medium text-yellow-800">App có khả năng xung đột</div>
          <ul class="space-y-1 text-xs">
            <li v-for="c in report.conflicts" :key="c.id"><b>{{ c.name }}</b> · {{ c.category }} <span class="break-all text-slate-500">— {{ c.evidence }}</span></li>
          </ul>
          <p class="mt-1 text-[11px] text-slate-500">Kết quả dựa trên heuristic, cần xác nhận thủ công.</p>
        </div>
      </template>
    </template>
  </section>
</template>
