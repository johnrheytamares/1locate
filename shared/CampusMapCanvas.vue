<template>
  <div class="campus-image" :class="{ editing: editable }">
    <img :src="map.image" alt="Campus infrastructure reference map" @click="choose" />
    <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
      <line v-for="(edge, index) in lines" :key="`edge-${index}`" :x1="edge.a.x * 1000" :y1="edge.a.y * 1000" :x2="edge.b.x * 1000" :y2="edge.b.y * 1000" :class="{ closed: !edge.open }" />
      <polyline v-if="routePoints" :points="routePoints" class="active-route" />
    </svg>
    <span v-for="(anchor, index) in map.anchors" :key="`anchor-${index}`" class="pin anchor" :style="position(anchor)">{{ index + 1 }}</span>
    <span v-for="node in visibleNodes" :key="node.id" class="pin node" :class="{ entrance: node.entrance }" :style="position(node.point)" :title="node.name">{{ node.name }}</span>
    <span v-if="userPoint && inside(userPoint)" class="pin user" :style="position(userPoint)" title="Estimated GPS location">●</span>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { gpsToImage, validImagePoint, type CampusMap, type ImagePoint } from './campus-map';
import type { OutdoorNode, OutdoorEdge, Point } from './outdoor-graph';
const props = defineProps<{ map: CampusMap; nodes?: OutdoorNode[]; edges?: OutdoorEdge[]; route?: [number, number][]; user?: Point | null; editable?: boolean }>();
const emit = defineEmits<{ point: [point: ImagePoint] }>();
const inside = validImagePoint;
const position = (p: ImagePoint) => ({ left: `${p.x * 100}%`, top: `${p.y * 100}%` });
const visibleNodes = computed(() => (props.nodes ?? []).flatMap(node => {
  const point = gpsToImage(props.map, node); return point && inside(point) ? [{ ...node, point }] : [];
}));
const lines = computed(() => (props.edges ?? []).flatMap(edge => {
  const a = visibleNodes.value.find(n => n.id === edge.from)?.point, b = visibleNodes.value.find(n => n.id === edge.to)?.point;
  return a && b ? [{ a, b, open: edge.open }] : [];
}));
const userPoint = computed(() => props.user ? gpsToImage(props.map, props.user) : null);
const routePoints = computed(() => {
  const points = (props.route ?? []).map(([longitude, latitude]) => gpsToImage(props.map, { longitude, latitude }));
  if (points.some(p => !p || !inside(p))) return '';
  return points.map(p => `${p!.x * 1000},${p!.y * 1000}`).join(' ');
});
function choose(event: MouseEvent) {
  if (!props.editable) return;
  const rect = (event.currentTarget as HTMLImageElement).getBoundingClientRect();
  if (rect.width && rect.height) emit('point', { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height });
}
</script>
<style scoped>
.campus-image { position:relative; width:100%; overflow:hidden; background:#edf2f6; }
img { display:block; width:100%; height:auto; } .editing img { cursor:crosshair; }
svg { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
line { stroke:#0f766e; stroke-width:3; vector-effect:non-scaling-stroke; } line.closed { stroke:#b91c1c; stroke-dasharray:6 5; }
.active-route { stroke:#2563eb; stroke-width:6; fill:none; stroke-linejoin:round; vector-effect:non-scaling-stroke; }
.pin { position:absolute; transform:translate(-50%,-50%); pointer-events:none; font-size:10px; font-weight:700; border:2px solid white; border-radius:8px; padding:2px 4px; color:white; background:#0f766e; max-width:110px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.anchor { background:#b45309; font-size:13px; z-index:2; } .entrance { background:#b91c1c; } .user { background:#1d4ed8; border-radius:50%; z-index:3; }
</style>
