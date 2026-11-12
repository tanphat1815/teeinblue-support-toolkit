<script setup lang="ts">
import { computed, ref } from 'vue';
import { useTabContext } from './composables/useTabContext';
import ToastHost from './components/ToastHost.vue';
import UntitledIcon, { type IconName } from './components/UntitledIcon.vue';
import BugReporter from './tabs/BugReporter.vue';
import SnippetInjector from './tabs/SnippetInjector.vue';
import StoreHealth from './tabs/StoreHealth.vue';

const { ctx, loading, refresh } = useTabContext();
const tabs: Array<{ id: 'bug' | 'snippet' | 'health'; label: string; icon: IconName }> = [
  { id: 'bug', label: 'Bug Reporter', icon: 'bug' },
  { id: 'snippet', label: 'Snippet Injector', icon: 'code-02' },
  { id: 'health', label: 'Store Health', icon: 'search-lg' }
];
const active = ref<(typeof tabs)[number]['id']>('bug');

const pill = computed(() => {
  if (ctx.value.kind === 'admin') return `Shopify Admin · ${ctx.value.storeHandle}`;
  if (ctx.value.kind === 'storefront') return `Storefront · ${ctx.value.storeHandle || 'Shopify'}`;
  return 'Không phải trang Shopify';
});
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <header class="sticky top-0 z-20 border-b bg-white">
      <div class="flex items-center justify-between px-3 py-2">
        <div class="font-semibold text-brand-600">Teeinblue Support Toolkit</div>
        <button
          class="inline-flex items-center justify-center rounded border p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          :disabled="loading"
          title="Tải lại ngữ cảnh"
          @click="refresh"
        >
          <UntitledIcon name="refresh-cw" :size="13" :class="loading ? 'animate-spin text-brand-600' : ''" />
        </button>
      </div>
      <div class="px-3 pb-2 text-xs text-slate-500">{{ pill }}</div>
      <nav class="flex border-t">
        <button
          v-for="t in tabs"
          :key="t.id"
          class="flex flex-1 items-center justify-center gap-1.5 px-1 py-2 text-xs font-medium transition-colors"
          :class="active === t.id ? 'border-b-2 border-brand-500 text-brand-600' : 'text-slate-500 hover:bg-slate-50'"
          @click="active = t.id"
        >
          <UntitledIcon :name="t.icon" :size="14" />
          <span>{{ t.label }}</span>
        </button>
      </nav>
    </header>
    <main class="flex-1 p-3">
      <BugReporter v-show="active === 'bug'" :ctx="ctx" />
      <SnippetInjector v-show="active === 'snippet'" :ctx="ctx" />
      <StoreHealth v-show="active === 'health'" :ctx="ctx" />
    </main>
    <ToastHost />
  </div>
</template>
