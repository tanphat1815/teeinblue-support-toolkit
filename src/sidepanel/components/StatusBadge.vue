<script setup lang="ts">
import { computed } from 'vue';
import type { Status } from '@/shared/types';
const props = defineProps<{ status: Status }>();
const map = {
  ok: { icon: '🟢', text: 'OK', cls: 'bg-green-100 text-green-800' },
  warning: { icon: '🟡', text: 'Warning', cls: 'bg-yellow-100 text-yellow-800' },
  error: { icon: '🔴', text: 'Error', cls: 'bg-red-100 text-red-800' }
} as const;
const s = computed(() => map[props.status]);
</script>
<template>
  <span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium" :class="s.cls">{{ s.icon }} {{ s.text }}</span>
</template>
