<script setup lang="ts">
import { computed } from 'vue';
import type { Status } from '@/shared/types';
import UntitledIcon, { type IconName } from './UntitledIcon.vue';

const props = defineProps<{ status: Status }>();

interface StatusConfig {
  icon: IconName;
  text: string;
  badgeCls: string;
  iconCls: string;
}

const map: Record<Status, StatusConfig> = {
  ok: {
    icon: 'check-circle',
    text: 'OK',
    badgeCls: 'bg-green-100 text-green-800',
    iconCls: 'text-green-600'
  },
  warning: {
    icon: 'alert-triangle',
    text: 'Warning',
    badgeCls: 'bg-yellow-100 text-yellow-800',
    iconCls: 'text-yellow-600'
  },
  error: {
    icon: 'alert-circle',
    text: 'Error',
    badgeCls: 'bg-red-100 text-red-800',
    iconCls: 'text-red-600'
  }
};

const s = computed(() => map[props.status]);
</script>

<template>
  <span class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium" :class="s.badgeCls">
    <UntitledIcon :name="s.icon" :size="13" :class="s.iconCls" />
    <span>{{ s.text }}</span>
  </span>
</template>
