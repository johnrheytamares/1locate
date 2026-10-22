<template>
  <svg
    class="arrow"
    :class="[direction, { dimmed, active }]"
    :viewBox="direction === 'up' ? '0 0 80 96' : '0 0 104 84'"
    aria-hidden="true"
  >
    <template v-if="direction === 'up'">
      <path class="body" d="M40 6 L68 40 H54 V90 H26 V40 H12 Z" />
      <path class="shine" d="M40 18 L54 36 H46 V78 H34 V36 H26 Z" />
    </template>
    <template v-else>
      <path class="body" d="M22 78 V46 H58 V28 L90 52 L58 76 V58 H38 V78 Z" />
      <path class="shine" d="M34 68 V52 H58 V40 L76 52 L58 64 V56 H42 V68 Z" />
    </template>
  </svg>
</template>

<script setup lang="ts">
defineProps<{
  direction: 'up' | 'right' | 'left';
  dimmed?: boolean;
  active?: boolean;
}>();
</script>

<style scoped>
.arrow {
  display: block;
  overflow: visible;
  filter: drop-shadow(0 0 8px rgba(64, 210, 255, 0.75));
}

.arrow.up {
  width: 54px;
  height: 64px;
}

.arrow.right,
.arrow.left {
  width: 78px;
  height: 62px;
}

.arrow.left {
  transform: scaleX(-1);
}

.body {
  fill: rgba(58, 196, 255, 0.9);
  stroke: rgba(236, 251, 255, 0.95);
  stroke-width: 3;
  stroke-linejoin: round;
}

.shine {
  fill: rgba(255, 255, 255, 0.42);
}

.arrow.active .body {
  fill: rgba(214, 248, 255, 0.96);
}

.arrow.active {
  filter: drop-shadow(0 0 10px rgba(186, 244, 255, 0.95));
  animation: glow 1.5s ease-in-out infinite;
}

.arrow.dimmed {
  opacity: 0.28;
  filter: none;
  animation: none;
}

.arrow.dimmed .body {
  fill: rgba(120, 190, 214, 0.55);
}

@keyframes glow {
  0%,
  100% {
    filter: drop-shadow(0 0 6px rgba(90, 214, 255, 0.7));
  }
  50% {
    filter: drop-shadow(0 0 16px rgba(210, 248, 255, 1));
  }
}
</style>
