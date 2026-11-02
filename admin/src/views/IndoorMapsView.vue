<template>
  <div class="maps-page">
    <header class="page-header"><div><h1>Indoor Maps & Routes</h1><p class="muted">Map corridors, connect floors, and preview verified routes.</p></div></header>
    <p v-if="error" class="notice error" role="alert">{{ error }}</p>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <fieldset :disabled="busy">
      <section class="card controls">
        <label>Building<select v-model="buildingId" @change="changeBuilding"><option value="">Choose building</option><option v-for="b in buildings" :key="b.id" :value="b.id">{{ b.name }}</option></select></label>
        <label>Floor<select v-model="floorId" @change="selectFloor"><option value="">Choose floor</option><option v-for="f in buildingFloors" :key="f.id" :value="f.id">{{ f.name }} ({{ f.level }})</option></select></label>
        <label>Map<select v-model="mapId" @change="showMap"><option value="">Choose map</option><option v-for="m in floorMaps" :key="m.id" :value="m.id">{{ m.title }} {{ m.is_active ? '(published)' : '(draft)' }}</option></select></label>
        <label>Upload floor plan<input type="file" accept="image/png,image/jpeg,image/webp" :disabled="!floorId" @change="upload" /><small>JPEG, PNG, WebP · up to 5 MB</small></label>
      </section>
      <template v-if="buildingId">
        <div class="workspace">
          <section class="card map-panel">
            <div class="panel-heading"><h2>{{ currentMap?.title || 'Select or upload a floor plan' }}</h2><span>{{ graph.nodes.length }} nodes · {{ graph.edges.length }} edges</span></div>
            <p class="muted">Choose a mode, then tap the map. Place nodes at corridor junctions, room doors and landings.</p>
            <label>Map tool<select v-model="tool"><option value="select">Select / move selected node</option><option value="add">Add node at tap</option><option value="calibrate">Calibrate: tap two measured points</option></select></label>
            <p v-if="tool === 'calibrate'" class="notice">{{ calibration.length }} / 2 points selected. Enter the measured distance below.</p>
            <FloorMapCanvas v-if="currentMap && url" :url="url" :width="currentMap.width_px" :height="currentMap.height_px" :nodes="visibleNodes" :edges="graph.edges" :selected="selectedId" :measurements="tool === 'calibrate' ? calibration : []" :highlight="preview?.legs.map(l => l.edge.id) ?? []" @point="tapMap" @node="selectNode" />
            <p v-else class="empty">Select a floor map to begin editing.</p>
            <div v-if="currentMap" class="controls map-settings">
              <label>Measured calibration distance (m)<input v-model.number="calibrationMeters" type="number" min="0.01" step="0.01" /></label>
              <button type="button" :disabled="calibration.length !== 2" @click="calibrate">Apply scale</button>
              <span class="muted">{{ currentMap.meters_per_pixel ? `${currentMap.meters_per_pixel.toFixed(5)} m / pixel` : 'Map not calibrated' }}</span>
              <button class="secondary" type="button" @click="toggleMap">{{ currentMap.is_active ? 'Unpublish map' : 'Publish calibrated map' }}</button>
            </div>
          </section>
          <aside class="card inspector">
            <h2>Node details</h2>
            <label>Node<select v-model="selectedId"><option value="">Choose node</option><option v-for="n in graph.nodes" :key="n.id" :value="n.id">{{ floorName(n.floor_id) }} · {{ n.name }}</option></select></label>
            <template v-if="selectedNode">
              <label>Name<input v-model="selectedNode.name" maxlength="120" @input="dirty = true" /></label>
              <label>Type<select v-model="selectedNode.kind" @change="selectedNode.room_id = null; dirty = true"><option>entrance</option><option>junction</option><option>room</option><option>stairs</option><option>elevator</option></select></label>
              <label v-if="selectedNode.kind === 'room'">Room door<select v-model="selectedNode.room_id" @change="dirty = true"><option :value="null">Choose room</option><option v-for="r in rooms.filter(r => r.floor_id === selectedNode?.floor_id)" :key="r.id" :value="r.id">{{ r.name }} {{ r.room_number }}</option></select></label>
              <p class="muted">To move this node, use Select mode and tap its new location on its floor map.</p>
              <button class="secondary" type="button" @click="removeNode">Delete node and connected edges</button>
            </template>
            <h2>Connect two nodes</h2>
            <label>From<select v-model="edgeFrom"><option value="">Choose node</option><option v-for="n in graph.nodes" :key="n.id" :value="n.id">{{ floorName(n.floor_id) }} · {{ n.name }}</option></select></label>
            <label>To<select v-model="edgeTo"><option value="">Choose node</option><option v-for="n in graph.nodes" :key="n.id" :value="n.id">{{ floorName(n.floor_id) }} · {{ n.name }}</option></select></label>
            <label>Connection<select v-model="edgeKind"><option>walk</option><option>stairs</option><option>elevator</option></select></label>
            <label>Distance (m)<input v-model.number="edgeMeters" type="number" min="0.01" max="10000" step="0.01" /></label>
            <button class="secondary" type="button" @click="estimateDistance">Estimate from calibrated map</button>
            <label class="check"><input v-model="edgeAccessible" type="checkbox" /> Step-free / accessible</label>
            <label class="check"><input v-model="edgeBothWays" type="checkbox" /> Both directions</label>
            <button type="button" @click="addEdge">Add connection</button>
          </aside>
        </div>
        <section class="card edges-panel">
          <h2>Connections</h2><p class="muted">Connect adjacent nodes along clear corridors only. Use intermediate nodes for bends. Disabling an edge closes it to new routes.</p>
          <div v-for="e in graph.edges" :key="e.id" class="edge-row">
            <span>{{ nodeName(e.from) }} {{ e.bidirectional ? '↔' : '→' }} {{ nodeName(e.to) }} · {{ e.kind }}</span>
            <label>Meters<input v-model.number="e.meters" type="number" min="0.01" max="10000" step="0.01" @input="dirty = true" /></label>
            <label class="check"><input v-model="e.accessible" type="checkbox" :disabled="e.kind === 'stairs'" @change="dirty = true" /> Step-free</label>
            <label class="check"><input v-model="e.enabled" type="checkbox" @change="dirty = true" /> Open</label>
            <button class="secondary" type="button" @click="graph.edges = graph.edges.filter(x => x.id !== e.id); dirty = true">Remove</button>
          </div>
        </section>
        <section class="card preview-panel">
          <h2>Preview route</h2>
          <div class="controls">
            <label>Starting entrance<select v-model="startId"><option value="">Choose entrance</option><option v-for="n in graph.nodes.filter(n => n.kind === 'entrance')" :key="n.id" :value="n.id">{{ n.name }}</option></select></label>
            <label>Destination<select v-model="goalId"><option value="">Choose room</option><option v-for="n in graph.nodes.filter(n => n.kind === 'room' && n.room_id)" :key="n.id" :value="n.id">{{ n.name }}</option></select></label>
            <label class="check"><input v-model="stepFree" type="checkbox" /> Step-free route</label>
            <button type="button" @click="calculate">Generate preview</button>
          </div>
          <template v-if="preview"><p>{{ preview.meters.toFixed(2) }} m · {{ preview.legs.length }} connections</p><ol><li v-for="leg in preview.legs" :key="leg.edge.id">{{ legInstruction(leg, floorName(leg.to.floor_id)) }}</li></ol></template>
        </section>
        <footer class="card save-bar"><span>{{ dirty ? 'Unsaved changes' : 'Draft ready' }} · Publishing requires field verification.</span><button type="button" @click="save(false)">Save draft</button><button type="button" @click="save(true)">Publish verified graph</button><button class="secondary" type="button" @click="unpublish">Unpublish graph</button></footer>
      </template>
    </fieldset>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import FloorMapCanvas from '../../../shared/FloorMapCanvas.vue';
import { emptyGraph, legInstruction, shortestPath, validateGraph, type GraphPath, type MapEdge } from '../../../shared/indoor-graph';
import { listBuildings, listFloors, listRooms } from '@/services/campus';
import { listFloorMaps, loadGraph, mapUrl, saveGraph, unpublishGraph, updateFloorMap, uploadFloorMap, type FloorMap } from '@/services/indoor-maps';
import { describeError } from '@/lib/errors';
import type { Building, Floor, Room } from '@/types';

const buildings = ref<Building[]>([]), floors = ref<Floor[]>([]), rooms = ref<Room[]>([]), maps = ref<FloorMap[]>([]);
const buildingId = ref(''), floorId = ref(''), mapId = ref(''), url = ref('');
const graph = ref(emptyGraph()), busy = ref(false), dirty = ref(false), error = ref(''), notice = ref('');
const tool = ref('select'), selectedId = ref('');
const calibration = ref<[number,number][]>([]), calibrationMeters = ref(0);
const edgeFrom = ref(''), edgeTo = ref(''), edgeKind = ref<MapEdge['kind']>('walk'), edgeMeters = ref(0), edgeAccessible = ref(false), edgeBothWays = ref(true);
const startId = ref(''), goalId = ref(''), stepFree = ref(false), preview = ref<GraphPath | null>(null);
const buildingFloors = computed(() => floors.value.filter(f => f.building_id === buildingId.value));
const floorMaps = computed(() => maps.value.filter(m => m.floor_id === floorId.value));
const currentMap = computed(() => maps.value.find(m => m.id === mapId.value));
const selectedNode = computed(() => graph.value.nodes.find(n => n.id === selectedId.value));
const visibleNodes = computed(() => graph.value.nodes.filter(n => n.map_id === mapId.value));
function floorName(id: string) { return floors.value.find(f => f.id === id)?.name ?? 'Unknown floor'; }
function nodeName(id: string) { return graph.value.nodes.find(n => n.id === id)?.name ?? id; }
async function run(action: () => Promise<void>) { busy.value = true; error.value = ''; notice.value = ''; try { await action(); } catch (err) { error.value = err instanceof Error ? err.message : describeError(err); } finally { busy.value = false; } }
let loadedBuilding = '';
async function changeBuilding() {
  if (dirty.value && !window.confirm('Discard unsaved graph changes?')) { buildingId.value = loadedBuilding; return; }
  await run(async () => {
    floorId.value = ''; mapId.value = ''; url.value = ''; selectedId.value = ''; preview.value = null; graph.value = emptyGraph();
    if (buildingId.value) graph.value = await loadGraph(buildingId.value, false) ?? await loadGraph(buildingId.value, true) ?? emptyGraph();
    loadedBuilding = buildingId.value; dirty.value = false;
  });
}
function selectFloor() { mapId.value = floorMaps.value.find(m => m.is_active)?.id ?? floorMaps.value[0]?.id ?? ''; void showMap(); }
let imageRequest = 0;
async function showMap() {
  const request = ++imageRequest; url.value = ''; calibration.value = [];
  const m = currentMap.value;
  if (m) try { const signed = await mapUrl(m.storage_path); if (request === imageRequest) url.value = signed; } catch (err) { error.value = describeError(err); }
}
async function upload(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0];
  if (!file || !floorId.value) return;
  await run(async () => { const m = await uploadFloorMap(floorId.value, file); maps.value.push(m); mapId.value = m.id; await showMap(); notice.value = 'Map uploaded as draft. Calibrate before publishing.'; }); input.value = '';
}
function tapMap(x: number, y: number) {
  if (busy.value || !currentMap.value) return;
  if (tool.value === 'calibrate') { if (calibration.value.length === 2) calibration.value = []; calibration.value.push([x,y]); return; }
  if (tool.value === 'add') {
    const id = crypto.randomUUID(); graph.value.nodes.push({ id, floor_id: floorId.value, map_id: mapId.value, x, y, name: `Node ${graph.value.nodes.length+1}`, kind: 'junction', room_id: null }); selectedId.value = id; dirty.value = true;
  } else if (selectedNode.value?.map_id === mapId.value) { selectedNode.value.x = x; selectedNode.value.y = y; dirty.value = true; }
}
function selectNode(id: string) {
  const n = graph.value.nodes.find(n => n.id === id);
  if (!n) return;
  if (tool.value === 'calibrate') { tapMap(n.x,n.y); return; }
  selectedId.value = id;
}
function removeNode() { if (!window.confirm('Delete this node and all connected edges?')) return; graph.value.nodes = graph.value.nodes.filter(n => n.id !== selectedId.value); graph.value.edges = graph.value.edges.filter(e => e.from !== selectedId.value && e.to !== selectedId.value); selectedId.value = ''; dirty.value = true; }
async function calibrate() {
  await run(async () => {
    const m = currentMap.value;
    if (!m || calibration.value.length !== 2 || !Number.isFinite(calibrationMeters.value) || calibrationMeters.value <= 0) throw new Error('Select two points and enter their measured distance.');
    const [a,b] = calibration.value, pixels = Math.hypot((b[0]-a[0])*m.width_px,(b[1]-a[1])*m.height_px);
    if (pixels < 1) throw new Error('Choose distinct calibration points.');
    const updated = await updateFloorMap(m.id, calibrationMeters.value/pixels, m.is_active); maps.value = maps.value.map(x => x.id === updated.id ? updated : x); notice.value = 'Scale saved. Existing edge distances are unchanged; review measurements.';
  });
}
async function toggleMap() { await run(async () => { const m = currentMap.value!; const updated = await updateFloorMap(m.id, m.meters_per_pixel ?? 0, !m.is_active); maps.value = maps.value.map(x => x.id === updated.id ? updated : x); notice.value = 'Map publication updated. Only one map per floor can be active.'; }); }
function estimateDistance() {
  const a = graph.value.nodes.find(n => n.id === edgeFrom.value), b = graph.value.nodes.find(n => n.id === edgeTo.value);
  const m = maps.value.find(m => m.id === a?.map_id);
  if (!a || !b || a.map_id !== b.map_id || !m?.meters_per_pixel) { error.value = 'Choose two nodes on the same calibrated map. Survey connector distances separately.'; return; }
  edgeMeters.value = Math.round(Math.hypot((a.x-b.x)*m.width_px,(a.y-b.y)*m.height_px)*m.meters_per_pixel*100)/100;
}
function addEdge() {
  try {
    const e: MapEdge = { id: crypto.randomUUID(), from: edgeFrom.value, to: edgeTo.value, kind: edgeKind.value, meters: edgeMeters.value, accessible: edgeKind.value === 'stairs' ? false : edgeAccessible.value, bidirectional: edgeBothWays.value, enabled: true };
    validateGraph({ nodes: graph.value.nodes, edges: [...graph.value.edges, e] }); graph.value.edges.push(e); dirty.value = true; error.value = '';
  } catch (err) { error.value = (err as Error).message; }
}
function calculate() { try { preview.value = shortestPath(graph.value, startId.value, goalId.value, stepFree.value); error.value = preview.value ? '' : 'No connected route for this preference. Check connections and closed edges.'; } catch (err) { preview.value = null; error.value = (err as Error).message; } }
async function save(active: boolean) {
  if (active && !window.confirm('Have all paths, floor transitions, map scales and accessibility flags been verified on site? Publishing replaces the public graph snapshot.')) return;
  await run(async () => {
    validateGraph(graph.value);
    if (active) {
      if (!graph.value.nodes.some(n => n.kind === 'entrance')) throw new Error('Add an entrance node.');
      if (!graph.value.nodes.some(n => n.kind === 'room' && n.room_id)) throw new Error('Add a room-door node linked to an existing room.');
      for (const room of graph.value.nodes.filter(n => n.kind === 'room' && n.room_id)) {
        if (!graph.value.nodes.filter(n => n.kind === 'entrance').some(n => shortestPath(graph.value, n.id, room.id))) throw new Error(`Room ${room.name} is unreachable from every entrance.`);
      }
    }
    await saveGraph(buildingId.value, graph.value, false);
    if (active) await saveGraph(buildingId.value, graph.value, true);
    dirty.value = false; notice.value = active ? 'Graph published. Test it on the mobile map route screen.' : 'Draft saved. The published graph is unchanged.';
  });
}
async function unpublish() { if (window.confirm('Remove the public graph? The draft is kept.')) await run(async () => { await unpublishGraph(buildingId.value); notice.value = 'Graph unpublished.'; }); }
watch([graph, startId, goalId, stepFree], () => { preview.value = null; }, { deep: true });
onBeforeRouteLeave(() => !dirty.value || window.confirm('Leave and discard unsaved graph changes?'));
onMounted(() => run(async () => { [buildings.value, floors.value, rooms.value, maps.value] = await Promise.all([listBuildings(), listFloors(), listRooms(), listFloorMaps()]); }));
</script>

<style scoped>
fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
.card { padding: 20px; margin-bottom: 16px; }
.controls { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; }
label { display: grid; gap: 6px; margin-bottom: 10px; font-size: 12px; color: #526880; flex: 1 1 150px; min-width: 0; }
small, .panel-heading span { font-size: 11px; color: #70849a; }
.workspace { display: grid; grid-template-columns: minmax(0, 1fr) 290px; gap: 16px; }
.map-panel, .inspector { min-width: 0; }
.panel-heading { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; }
h2 { font-size: 16px; margin: 0 0 12px; }
.inspector h2:not(:first-child) { margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 20px; }
.muted, li { font-size: 12px; line-height: 1.7; }
.map-settings { margin-top: 16px; }
.check { display: flex; align-items: center; gap: 8px; }
.check input { width: 18px; height: 18px; }
.edge-row { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 12px 0; border-top: 1px solid #e2e8f0; }
.edge-row > span { flex: 2 1 200px; font-size: 12px; }
.edge-row label { flex: 0 1 110px; margin: 0; }
.save-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.save-bar > span { flex: 1 1 240px; font-size: 12px; color: #70849a; }
button { min-height: 44px; font-size: 12px; }
@media(max-width: 1000px) { .workspace { grid-template-columns: 1fr; } }
@media(max-width: 640px) { .card { padding: 14px; } .controls { display: grid; grid-template-columns: minmax(0,1fr); } input, select { font-size: 16px; } .save-bar button { flex: 1 1 150px; } }

@media (max-width: 640px) {
  .maps-page > .page-header { margin-bottom: 14px; }
  .maps-page h1 { font-size: 19px; }
  .maps-page .page-header p { margin: 4px 0 0; font-size: 11px; line-height: 1.5; }
  .maps-page fieldset > .controls { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px 10px; padding: 14px; }
  .maps-page fieldset > .controls > label:first-child,
  .maps-page fieldset > .controls > label:last-child { grid-column: 1 / -1; }
  .maps-page label { margin-bottom: 0; gap: 6px; font-size: 11px; }
  .maps-page select, .maps-page input { min-width: 0; width: 100%; min-height: 44px; padding: 8px; font-size: 16px; }
  .maps-page input[type=file] { font-size: 12px; background: #f7faff; border-style: dashed; }
  .maps-page input[type=file]::file-selector-button { border: 0; background: #e4efff; color: #215ba9; padding: 8px 10px; border-radius: 6px; margin-right: 8px; font-weight: 600; }
  .maps-page .check input { width: 18px; min-height: 18px; }
  .inspector { display: grid; gap: 12px; }
  .map-panel > label { margin-bottom: 12px; }
  .edge-row { gap: 8px; }
  .edge-row > span { flex-basis: 100%; }
}
</style>
