<template>
  <div class="map-scroll">
    <svg :viewBox="`0 0 ${width} ${height}`" role="img" :aria-label="label" @click="point">
      <image :href="url" :width="width" :height="height" />
      <line v-if="measurements.length === 2" :x1="measurements[0][0]*width" :y1="measurements[0][1]*height" :x2="measurements[1][0]*width" :y2="measurements[1][1]*height" stroke="#e34b32" stroke-width="3" stroke-dasharray="5 4" vector-effect="non-scaling-stroke" />
      <circle v-for="(p,i) in measurements" :key="`measure-${i}`" :cx="p[0]*width" :cy="p[1]*height" :r="Math.max(width,height)*.012" fill="#f59e0b" stroke="white" stroke-width="2" vector-effect="non-scaling-stroke" />
      <template v-for="edge in edges" :key="edge.id">
        <line v-if="node(edge.from) && node(edge.to)" :x1="node(edge.from)!.x * width" :y1="node(edge.from)!.y * height" :x2="node(edge.to)!.x * width" :y2="node(edge.to)!.y * height" :stroke="highlight.includes(edge.id) ? '#e34b32' : edge.enabled ? '#2563eb' : '#94a3b8'" :stroke-dasharray="edge.enabled ? undefined : '6 4'" stroke-width="4" vector-effect="non-scaling-stroke" />
      </template>
      <g v-for="n in nodes" :key="n.id" role="button" tabindex="0" :aria-label="n.name" @click.stop="$emit('node', n.id)" @keydown.enter.prevent="$emit('node', n.id)" @keydown.space.prevent="$emit('node', n.id)">
        <circle :cx="n.x * width" :cy="n.y * height" :r="Math.max(width, height) * .014" :fill="n.id === selected ? '#e34b32' : n.kind === 'entrance' ? '#059669' : '#1749a5'" stroke="white" stroke-width="2" vector-effect="non-scaling-stroke" />
        <title>{{ n.name }}</title>
        <text :x="n.x * width" :y="n.y * height - Math.max(width,height)*.021" text-anchor="middle" :font-size="Math.max(width,height)*.018" font-weight="700" fill="#102e52" stroke="white" stroke-width="3" paint-order="stroke">{{ n.name }}</text>
      </g>
    </svg>
  </div>
</template>
<script setup lang="ts">
import type { MapNode, MapEdge } from './indoor-graph';
const props = withDefaults(defineProps<{ url: string; width: number; height: number; nodes: MapNode[]; edges: MapEdge[]; selected?: string; highlight?: string[]; measurements?: [number,number][]; label?: string }>(), { selected: '', highlight: () => [], measurements: () => [], label: 'Floor map and navigation paths' });
const emit = defineEmits<{ point: [x: number, y: number]; node: [id: string] }>();
function node(id: string) { return props.nodes.find(n => n.id === id); }
function point(event: MouseEvent) {
  const bounds = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
  emit('point', Math.max(0, Math.min(1, (event.clientX-bounds.left)/bounds.width)), Math.max(0, Math.min(1, (event.clientY-bounds.top)/bounds.height)));
}
</script>
<style scoped>
.map-scroll { overflow: auto; border: 1px solid #dce5f0; border-radius: 12px; background: #f7faff; }
svg { display: block; width: 100%; height: auto; min-width: 260px; }
g[role=button] { cursor: pointer; }
g:focus-visible circle { stroke: #ffb020; stroke-width: 5; }
</style>
