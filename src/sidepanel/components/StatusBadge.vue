<script setup lang="ts">
import { computed } from 'vue';
import type { Status } from '@/shared/types';
import UntitledIcon, { type IconName } from './UntitledIcon.vue';

const props = withDefaults(
  defineProps<{
    status: Status;
    iconOnly?: boolean;
    size?: number;
  }>(),
  {
    iconOnly: false,
    size: 13
  }
);

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
    badgeCls: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80',
    iconCls: 'text-emerald-600'
  },
  warning: {
    icon: 'alert-triangle',
    text: 'Warning',
    badgeCls: 'bg-amber-50 text-amber-700 border border-amber-200/80',
    iconCls: 'text-amber-600'
  },
  error: {
    icon: 'alert-circle',
    text: 'Error',
    badgeCls: 'bg-red-50 text-red-700 border border-red-200/80',
    iconCls: 'text-red-600'
  }
};

const s = computed(() => map[props.status]);
</script>

<template>
  <span
    class="inline-flex items-center justify-center shrink-0 rounded-full font-medium"
    :class="[
      s.badgeCls,
      iconOnly ? 'p-1' : 'gap-1 px-2 py-0.5 text-xs'
    ]"
    :title="s.text"
  >
    <UntitledIcon :name="s.icon" :size="size" :class="s.iconCls" />
    <span v-if="!iconOnly">{{ s.text }}</span>
  </span>
</template>
