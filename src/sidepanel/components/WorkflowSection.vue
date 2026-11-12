<script setup lang="ts">
import { ref } from 'vue';

withDefaults(defineProps<{ step?: string; title: string; subtitle?: string }>(), { step: '', subtitle: '' });
const open = ref(true);
</script>
<template>
  <section class="tib-card">
    <button class="tib-sec-head" @click="open = !open">
      <span v-if="step" class="tib-step-num">{{ step }}</span>
      <span class="flex-1">
        <span class="block text-sm font-semibold">{{ title }}</span>
        <span v-if="subtitle" class="tib-muted block">{{ subtitle }}</span>
      </span>
      <span class="text-slate-400">{{ open ? '▴' : '▾' }}</span>
    </button>
    <div v-show="open" class="space-y-2 border-t border-slate-100 p-2.5">
      <slot />
    </div>
  </section>
</template>
