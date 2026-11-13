<script setup lang="ts">
import { ref } from 'vue';
import UntitledIcon from './UntitledIcon.vue';

withDefaults(defineProps<{ step?: string; title: string; subtitle?: string }>(), { step: '', subtitle: '' });
const open = ref(true);
</script>
<template>
  <section class="tib-card">
    <div class="tib-sec-head cursor-pointer select-none" @click="open = !open">
      <span v-if="step" class="tib-step-num">{{ step }}</span>
      <span class="flex-1 min-w-0 pr-2">
        <span class="block text-sm font-semibold truncate">{{ title }}</span>
        <span v-if="subtitle" class="tib-muted block truncate">{{ subtitle }}</span>
      </span>
      <div class="flex items-center gap-1.5 shrink-0" @click.stop>
        <slot name="action" />
        <button
          type="button"
          class="p-0.5 text-slate-400 hover:text-slate-600 transition-colors"
          @click="open = !open"
        >
          <UntitledIcon :name="open ? 'chevron-up' : 'chevron-down'" :size="14" />
        </button>
      </div>
    </div>
    <div v-show="open" class="space-y-2 border-t border-slate-100 p-2.5">
      <slot />
    </div>
  </section>
</template>
