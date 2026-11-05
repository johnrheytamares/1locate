<template>
  <div class="overlay" aria-hidden="true">
    <p v-if="instruction" class="guide">{{ instruction }}</p>
    <div class="path-shift" :style="shiftStyle">
    <DestinationMarker :name="destinationName" :distance-label="distanceLabel" />
    <div v-if="arrows.length" class="lane">
      <span class="path-beacon" />
      <div
        v-for="arrow in farToNear"
        :key="arrow.id"
        class="slot"
        :class="arrow.direction"
        :style="{ top: `${arrow.position}%`, width: `${arrow.width}px` }"
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

// Decorative trail density is independent of route-step count.
// Only the distant tip shows an upcoming turn; nearby chevrons keep pointing along the path.
const farToNear = computed(() => {
  if (!props.arrows.length) return [];
  const farthest = props.arrows[props.arrows.length - 1];
  const current = props.arrows[0];
  return Array.from({ length: 10 }, (_, index) => {
    const depth = index / 9;
    return {
      id: `trail-${index}`,
      direction: index === 0 ? farthest.direction : current.direction,
      active: index >= 7,
      position: 3 + Math.pow(depth, 1.8) * 87,
      width: 14 + Math.pow(depth, 1.65) * 190,
    };
  });
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
  position: absolute;
  top: 29%;
  bottom: -8%;
  left: 0;
  width: 100%;
}
.lane::before {
  content: '';
  position: absolute;
  inset: 0 -5% -8%;
  clip-path: polygon(49% 0, 51% 0, 87% 100%, 13% 100%);
  background: linear-gradient(180deg, #00cfff30, #009cff65 55%, #006fff90);
  filter: blur(6px);
}
.lane::after {
  content: '';
  position: absolute;
  inset: 0;
  clip-path: polygon(49.5% 0, 50.5% 0, 69% 100%, 31% 100%);
  background: linear-gradient(180deg, #a4faff60, #00baff25);
}
.slot {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1;
}
.slot :deep(.arrow) { width: 100%; height: auto; }
.path-beacon {
  position: absolute;
  left: 50%;
  top: -2%;
  width: 34px;
  height: 9px;
  transform: translateX(-50%);
  border: 2px solid #d7ffff;
  border-radius: 50%;
  background: #00bfff;
  box-shadow: 0 0 6px #fff, 0 0 16px #00bfff, 0 0 28px #007dff;
  z-index: 2;
}
.path-shift > :deep(.marker) { position: absolute; top: 7%; left: 50%; transform: translateX(-50%); z-index: 2; }
@media (prefers-reduced-motion: reduce) { .path-shift { transition: none; } }
</style>
