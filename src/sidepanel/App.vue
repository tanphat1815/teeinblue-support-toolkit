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
</script>

<template>
  <div class="flex min-h-screen flex-col bg-[#dbe4f0]">
    <!-- Tab bar với style folder/browser tabs dính liền nền bên dưới -->
    <header class="sticky top-0 z-20 bg-slate-900 pt-2 px-2 shadow-sm">
      <nav class="flex items-end gap-1">
        <button
          v-for="t in tabs"
          :key="t.id"
          class="flex flex-1 items-center justify-center gap-1.5 px-2 py-2 text-xs font-semibold rounded-t-lg transition-all"
          :class="active === t.id
            ? 'bg-[#e8eef7] text-blue-900 shadow-[0_-1px_3px_rgba(0,0,0,0.15)] relative z-10'
            : 'text-slate-400 hover:text-white hover:bg-slate-800/80'"
          @click="active = t.id"
        >
          <UntitledIcon :name="t.icon" :size="14" />
          <span>{{ t.label }}</span>
        </button>

        <button
          class="mb-1 inline-flex items-center justify-center rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white active:scale-95 disabled:opacity-50"
          :disabled="loading"
          title="Tải lại trang và ngữ cảnh"
          @click="refresh"
        >
          <UntitledIcon name="refresh-cw" :size="13" :class="loading ? 'animate-spin text-blue-400' : ''" />
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
