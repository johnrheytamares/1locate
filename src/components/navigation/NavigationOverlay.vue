<template>
  <div class="overlay" aria-hidden="true">
    <p v-if="instruction" class="guide">{{ instruction }}</p>
    <div class="path-shift" :style="shiftStyle">
    <DestinationMarker :name="destinationName" :distance-label="distanceLabel" />
    <div class="lane">
      <div
        v-for="arrow in farToNear"
        :key="arrow.id"
        class="slot"
        :class="arrow.direction"
        :style="{ transform: `scale(${arrow.scale})` }"
      >
        <NavigationArrow
          :direction="arrowFacing(arrow.direction)"
          :active="arrow.active"
        />
      </div>
    </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { GuideArrow } from '@/services/navigation.service';
import type { RouteDirection } from '@/models/navigation';
import DestinationMarker from './DestinationMarker.vue';
import NavigationArrow from './NavigationArrow.vue';

const props = defineProps<{
  arrows: GuideArrow[];
  destinationName: string;
  distanceLabel: string;
  instruction: string;
  headingOffset: number | null;
}>();

const shiftStyle = computed(() => {
  if (props.headingOffset == null) return undefined;
  const clamped = Math.max(-90, Math.min(90, props.headingOffset));
  const shiftX = (clamped / 90) * 150;
  const lean = (clamped / 90) * 34;
  return { transform: `translateX(${shiftX}px) rotate(${lean}deg)` };
});

function arrowFacing(direction: RouteDirection): 'up' | 'right' | 'left' {
  if (direction === 'right') return 'right';
  if (direction === 'left') return 'left';
  return 'up';
}

const farToNear = computed(() => {
  const count = props.arrows.length;
  return props.arrows.map((arrow, index) => ({
    ...arrow,
    scale: count <= 1 ? 1 : 0.4 + ((count - 1 - index) / (count - 1)) * 0.85,
  })).reverse();
});
</script>

<style scoped>
.overlay {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding: 12px 16px 8px;
  pointer-events: none;
}

.guide {
  max-width: 280px;
  margin: 0 0 auto;
  padding: 10px 14px;
  border-radius: 14px;
  background: rgba(7, 24, 32, 0.72);
  color: #f4fbff;
  text-align: center;
  font-size: 15px;
}

.path-shift {
  position: relative;
  width: min(100%, 340px);
  height: 100%;
  transform-origin: center 88%;
  transition: transform 100ms linear;
}

.lane {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  position: absolute;
  bottom: 0;
  left: 0;
  gap: 0;
  width: 100%;
  height: 72%;
  padding: 0 0 10px;
  transform: perspective(620px) rotateX(32deg);
  transform-origin: center bottom;
}

.slot {
  display: flex;
  justify-content: center;
  position: relative;
  z-index: 1;
  transform-origin: center;
  flex: 0 1 auto;
  min-height: 0;
}

.slot:last-child {
  margin-top: 0;
}

.slot.left {
  align-self: flex-start;
  margin-left: 28px;
}

.slot.right {
  align-self: flex-end;
  margin-right: 28px;
}
.lane::before { content: ''; position: absolute; inset: 0 -12px -20px; background: linear-gradient(180deg, transparent, #00b9ff10 20%, #00b9ff50); clip-path: polygon(48% 0, 52% 0, 90% 100%, 10% 100%); filter: blur(5px); }
.path-shift > :deep(.marker) { position: absolute; top: 4%; left: 50%; transform: translateX(-50%); z-index: 2; }
@media (prefers-reduced-motion: reduce) { .path-shift { transition: none; } }
</style>
