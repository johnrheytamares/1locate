<template>
  <div class="gps-trace" role="img" aria-label="Recorded GPS path diagram">
    <svg viewBox="0 0 500 300"><polyline v-for="(part, i) in parts" :key="i" :points="part" /><circle v-if="positions.length" :cx="positions[0].x" :cy="positions[0].y" r="6" class="start" /><circle v-if="positions.length > 1" :cx="positions[positions.length - 1].x" :cy="positions[positions.length - 1].y" r="6" class="end" /><text x="474" y="25">N ↑</text></svg>
    <p>Recorded GPS path · start <span class="start-key">●</span> · finish <span class="end-key">●</span></p><small>GPS geometry only. This diagram is not positioned on the school map. Gaps are not connected.</small>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import type { Fix } from '../../../shared/gps-recording';
const props = defineProps<{ points: Fix[] }>();
const positions = computed(() => {
  if (!props.points.length) return [];
  const origin = props.points[0], cosine = Math.max(0.01, Math.cos(origin.latitude * Math.PI / 180));
  const projected = props.points.map(p => ({ x: (p.longitude - origin.longitude) * cosine, y: origin.latitude - p.latitude, gap: p.breakBefore }));
  const minX = Math.min(...projected.map(p => p.x)), maxX = Math.max(...projected.map(p => p.x));
  const minY = Math.min(...projected.map(p => p.y)), maxY = Math.max(...projected.map(p => p.y));
  const scale = Math.max((maxX - minX) / 420, (maxY - minY) / 220, 1e-9);
  return projected.map(p => ({ x: 250 + (p.x - (minX + maxX) / 2) / scale, y: 150 + (p.y - (minY + maxY) / 2) / scale, gap: p.gap }));
});
const parts = computed(() => {
  const runs: string[][] = [];
  positions.value.forEach(p => { if (!runs.length || p.gap) runs.push([]); runs[runs.length - 1].push(`${p.x},${p.y}`); });
  return runs.map(run => run.join(' '));
});
</script>
<style scoped>
.gps-trace { border:1px solid #dce5ef; border-radius:10px; padding:12px; background:#f5f8fc; }.gps-trace svg { display:block; width:100%; height:auto; }polyline { fill:none; stroke:#2563eb; stroke-width:4; stroke-linecap:round; stroke-linejoin:round; }circle { stroke:white; stroke-width:2; }.start { fill:#0f766e; }.end { fill:#be123c; }text { fill:#61758b; font-size:12px; text-anchor:end; }p { margin:5px 0; font-size:12px; color:#526880; }.start-key { color:#0f766e; }.end-key { color:#be123c; }small { font-size:11px; color:#61758b; line-height:1.5; display:block; }
</style>
