<script setup lang="ts">
import { useToast } from '../composables/useToast';
const { toasts } = useToast();
const cls = { success: 'bg-green-600', error: 'bg-red-600', info: 'bg-slate-700' } as const;
</script>
<template>
  <div class="pointer-events-none fixed inset-x-0 bottom-3 z-50 flex flex-col items-center gap-2 px-3">
    <div v-for="t in toasts" :key="t.id" class="pointer-events-auto max-w-full whitespace-pre-line rounded-md px-3 py-2 text-white shadow-lg" :class="cls[t.kind]">
      {{ t.text }}
    </div>
  </div>
</template>
