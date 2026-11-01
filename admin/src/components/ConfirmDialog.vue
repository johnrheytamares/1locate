<template>
  <div class="overlay" role="dialog" aria-modal="true" :aria-label="title" @keydown.esc="$emit('cancel')">
    <div class="dialog small">
      <h2>{{ title }}</h2>
      <slot />
      <div class="form-actions">
        <button class="secondary" type="button" data-test="confirm-cancel" :disabled="busy" @click="$emit('cancel')">Cancel</button>
        <button :class="danger ? 'danger' : ''" type="button" data-test="confirm-ok" :disabled="busy" @click="$emit('confirm')">
          {{ busy ? 'Working...' : confirmLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  title: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
}>(), {
  confirmLabel: 'Confirm',
  danger: false,
  busy: false,
});

defineEmits<{ confirm: []; cancel: [] }>();
</script>
