<script setup lang="ts">
import { ref, watch } from 'vue';
import UntitledIcon from './UntitledIcon.vue';

const props = withDefaults(
  defineProps<{
    step?: string;
    title: string;
    subtitle?: string;
    modelValue?: boolean;
    defaultOpen?: boolean;
  }>(),
  { step: '', subtitle: '', defaultOpen: true }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const isOpen = ref(props.modelValue !== undefined ? props.modelValue : props.defaultOpen);

watch(() => props.modelValue, (v) => {
  if (v !== undefined) isOpen.value = v;
});

function toggle() {
  isOpen.value = !isOpen.value;
  emit('update:modelValue', isOpen.value);
}
</script>
<template>
  <section class="tib-card">
    <div class="tib-sec-head cursor-pointer select-none" @click="toggle">
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
          @click="toggle"
        >
          <UntitledIcon :name="isOpen ? 'chevron-up' : 'chevron-down'" :size="14" />
        </button>
      </div>
    </div>
    <div v-show="isOpen" class="space-y-2 border-t border-slate-100 p-2.5">
      <slot />
    </div>
  </section>
</template>
