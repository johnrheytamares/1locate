<template>
  <div class="field" :class="{ invalid: !!error, full }">
    <label :for="id">{{ label }}<span v-if="required" aria-hidden="true"> *</span></label>
    <slot :id="id" />
    <span v-if="error" class="field-error" :data-test="`error-${name}`">{{ error }}</span>
    <span v-else-if="hint" class="hint">{{ hint }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  name: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  full?: boolean;
}>();

const id = computed(() => `field-${props.name}`);
</script>
