<script setup lang="ts">
import { computed, ref } from 'vue';
import { useTabContext } from './composables/useTabContext';
import ToastHost from './components/ToastHost.vue';
import BugReporter from './tabs/BugReporter.vue';
import SnippetInjector from './tabs/SnippetInjector.vue';
import StoreHealth from './tabs/StoreHealth.vue';

const { ctx, loading, refresh } = useTabContext();
const tabs = [
  { id: 'bug', label: '🐛 Bug Reporter' },
  { id: 'snippet', label: '⚡ Snippet Injector' },
  { id: 'health', label: '🔍 Store Health' }
] as const;
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
        <button class="rounded border px-2 py-0.5 text-xs hover:bg-slate-100" :disabled="loading" @click="refresh">↻</button>
      </div>
      <div class="px-3 pb-2 text-xs text-slate-500">{{ pill }}</div>
      <nav class="flex border-t">
        <button v-for="t in tabs" :key="t.id" class="flex-1 px-1 py-2 text-xs font-medium"
          :class="active === t.id ? 'border-b-2 border-brand-500 text-brand-600' : 'text-slate-500 hover:bg-slate-50'" @click="active = t.id">
          {{ t.label }}
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
