<template>
  <div v-if="points.length" class="network" aria-label="GPS walking network diagram">
    <svg viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
      <line v-for="(line, index) in lines" :key="index" :x1="line.a.x * 10" :y1="line.a.y * 6" :x2="line.b.x * 10" :y2="line.b.y * 6" :class="{ closed: !line.open }" />
      <polyline v-if="routeLine" :points="routeLine" />
    </svg>
    <button v-for="point in points" :key="point.id" type="button" :style="{ left: `${point.x}%`, top: `${point.y}%` }" :class="{ selected: selected === point.id, entrance: point.entrance }" :aria-label="`Connect ${point.name || point.id}`" :aria-pressed="selected === point.id" @click="emit('node', point.id)">{{ point.name || point.id }}</button>
  </div>
  <p v-else>Wala pang GPS points. Piliin ang building o ilagay ang unang lugar sa ibaba.</p>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { validPoint, type OutdoorNode, type OutdoorEdge } from '../../../shared/outdoor-graph';
const props = defineProps<{ nodes: OutdoorNode[]; edges: OutdoorEdge[]; selected: string; route: [number, number][] }>();
const emit = defineEmits<{ node: [id: string] }>();
const bounds = computed(() => {
  const valid = props.nodes.filter(validPoint);
  const lat = valid.map(n => n.latitude), lng = valid.map(n => n.longitude);
  return { south: Math.min(...lat), west: Math.min(...lng), height: Math.max(0.0001, Math.max(...lat) - Math.min(...lat)), width: Math.max(0.0001, Math.max(...lng) - Math.min(...lng)) };
});
function position(latitude: number, longitude: number) {
  const b = bounds.value;
  return { x: 12 + (longitude - b.west) / b.width * 76, y: 88 - (latitude - b.south) / b.height * 76 };
}
const points = computed(() => props.nodes.filter(validPoint).map(n => ({ ...n, ...position(n.latitude, n.longitude) })));
const lines = computed(() => props.edges.flatMap(edge => {
  const a = points.value.find(n => n.id === edge.from), b = points.value.find(n => n.id === edge.to);
  return a && b ? [{ a, b, open: edge.open }] : [];
}));
const routeLine = computed(() => props.route.map(([lng, lat]) => { const p = position(lat, lng); return `${p.x * 10},${p.y * 6}`; }).join(' '));
</script>
<style scoped>
.network { position:relative; height:340px; border:1px solid #cdd9e7; border-radius:12px; background: repeating-linear-gradient(0deg, #f4f8fc, #f4f8fc 39px, #e3ebf3 40px); overflow:hidden; }
svg { position:absolute; width:100%; height:100%; pointer-events:none; }
line { stroke:#0f766e; stroke-width:4; vector-effect:non-scaling-stroke; } .closed { stroke:#b91c1c; stroke-dasharray:7 5; }
polyline { fill:none; stroke:#2563eb; stroke-width:6; vector-effect:non-scaling-stroke; }
button { position:absolute; transform:translate(-50%,-50%); min-height:44px; max-width:130px; padding:6px 9px; border:2px solid white; border-radius:9px; background:#0f766e; color:white; cursor:pointer; font-size:12px; overflow-wrap:anywhere; }
.entrance { background:#9f1239; } .selected { outline:3px solid #2563eb; background:#1d4ed8; }
</style>
