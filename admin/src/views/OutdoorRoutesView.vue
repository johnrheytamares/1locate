<template>
  <section class="page">
    <header class="page-header"><div><h1>Outdoor Walking Routes</h1><p class="muted">Configure campus walkways without a floor-plan image. GPS latitude comes first, longitude second.</p></div></header>
    <p>Place nodes at entrances, intersections and every bend. Connect only physically walkable paths, with measured distances. Coordinates must match the destination's saved entrance.</p>
    <div class="actions"><button @click="addNode">Add node</button><button :disabled="graph.nodes.length < 2" @click="addEdge">Add connection</button><button @click="saveDraft">Save local draft</button><button @click="loadDraft">Load local draft</button></div>
    <h2>School infrastructure map</h2>
    <p>Import your school's map image as the background. It does not contain walking routes automatically. Mark only paths you have checked on campus.</p>
    <input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Import school map image" @change="importImage" />
    <template v-if="graph.referenceMap">
      <p>Calibration: {{ graph.referenceMap.anchors.length }}/3 GPS anchors. Choose three widely spaced landmarks that are not on one line. Use only the main campus map area, not the legend or inset maps.</p>
      <div class="actions"><select v-model="mapMode" aria-label="Map editing mode"><option value="anchor">Add GPS calibration anchor</option><option value="node">Add walking node</option></select><input v-model.number="anchorLat" type="number" step="any" placeholder="Measured latitude" aria-label="Anchor latitude" /><input v-model.number="anchorLng" type="number" step="any" placeholder="Measured longitude" aria-label="Anchor longitude" /><button @click="graph.referenceMap.anchors = []">Reset calibration</button><button @click="delete graph.referenceMap">Remove reference image</button></div>
      <p>{{ mapMode === 'anchor' ? 'Enter a verified GPS coordinate pair, then click its exact landmark on the image.' : 'Click an actual entrance, intersection or path bend. GPS coordinates are calculated from your three anchors and still require field verification.' }}</p>
      <CampusMapCanvas :map="graph.referenceMap" :nodes="graph.nodes" :edges="graph.edges" :route="previewCoordinates" editable @point="onMapPoint" />
      <p>Green: open connections. Red dashed: closed. Blue: preview route. Lines represent manually configured connections only.</p>
    </template>
    <h2>Nodes</h2>
    <div class="table-scroll"><table><thead><tr><th>ID</th><th>Name</th><th>Latitude</th><th>Longitude</th><th>Entrance</th><th></th></tr></thead><tbody>
      <tr v-for="(node, index) in graph.nodes" :key="index">
        <td><input v-model="node.id" aria-label="Node ID" /></td><td><input v-model="node.name" aria-label="Node name" /></td>
        <td><input v-model.number="node.latitude" type="number" step="any" aria-label="Latitude" /></td><td><input v-model.number="node.longitude" type="number" step="any" aria-label="Longitude" /></td>
        <td><input v-model="node.entrance" type="checkbox" aria-label="Building entrance" /></td><td><button @click="removeNode(index)">Remove</button></td>
      </tr>
    </tbody></table></div>
    <h2>Walking connections</h2>
    <div class="table-scroll"><table><thead><tr><th>From</th><th>To</th><th>Measured meters</th><th>Open</th><th>Step-free</th><th>One way</th><th></th></tr></thead><tbody>
      <tr v-for="(edge, index) in graph.edges" :key="index">
        <td><select v-model="edge.from" aria-label="From node"><option v-for="node in graph.nodes" :key="node.id" :value="node.id">{{ node.name || node.id }}</option></select></td>
        <td><select v-model="edge.to" aria-label="To node"><option v-for="node in graph.nodes" :key="node.id" :value="node.id">{{ node.name || node.id }}</option></select></td>
        <td><input v-model.number="edge.meters" type="number" min="0.1" step="any" aria-label="Connection meters" /></td>
        <td><input v-model="edge.open" type="checkbox" aria-label="Open connection" /></td><td><input v-model="edge.accessible" type="checkbox" aria-label="Verified step-free connection" /></td><td><input v-model="edge.oneWay" type="checkbox" aria-label="One-way connection" /></td><td><button @click="graph.edges.splice(index, 1)">Remove</button></td>
      </tr>
    </tbody></table></div>
    <p><label><input v-model="graph.verified" type="checkbox" /> I have surveyed this network, checked entrances and distances, and verified path access on campus.</label></p>
    <h2>Preview a route</h2>
    <div class="actions"><select v-model="startId" aria-label="Starting node"><option value="">Choose start</option><option v-for="node in graph.nodes" :key="node.id" :value="node.id">{{ node.name }}</option></select><select v-model="endId" aria-label="Destination entrance"><option value="">Choose entrance</option><option v-for="node in graph.nodes.filter(n => n.entrance)" :key="node.id" :value="node.id">{{ node.name }}</option></select><label><input v-model="stepFree" type="checkbox" /> Step-free</label><button @click="preview">Preview Dijkstra route</button></div>
    <p v-if="previewText" role="status">{{ previewText }}</p>
    <h2>Import / export</h2>
    <p>Export creates <code>campus-walking-network.json</code>. Replace the mobile project's <code>public/campus-walking-network.json</code>, then rebuild the mobile app/APK. Saving a local draft or exporting does not publish to users. Existing installations keep their bundled network until updated.</p>
    <div class="actions"><button v-if="graph.referenceMap" @click="exportReference">Export reference map only</button><button @click="exportNetwork">Export verified network</button><button @click="importNetwork">Import JSON below</button></div>
    <textarea v-model="json" rows="7" aria-label="Walking network JSON" placeholder="Paste an exported walking network to edit" />
    <p v-if="message" role="status">{{ message }}</p>
  </section>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue';
import CampusMapCanvas from '../../../shared/CampusMapCanvas.vue';
import { imageToGps, validateCampusMap, type ImagePoint } from '../../../shared/campus-map';
import { validPoint } from '../../../shared/outdoor-graph';
import { campusWalkingRoute, EMPTY_OUTDOOR_GRAPH, parseOutdoorGraph, type OutdoorGraph } from '../../../shared/outdoor-graph';
const graph = ref<OutdoorGraph>(structuredClone(EMPTY_OUTDOOR_GRAPH));
const json = ref(''), message = ref(''), previewText = ref(''), startId = ref(''), endId = ref(''), stepFree = ref(false);
watch(() => JSON.stringify({ nodes: graph.value.nodes, edges: graph.value.edges, referenceMap: graph.value.referenceMap }), () => { graph.value.verified = false; }, { flush: 'sync' });
const mapMode = ref<'anchor' | 'node'>('anchor');
const anchorLat = ref<number>(NaN), anchorLng = ref<number>(NaN);
const previewCoordinates = ref<[number, number][]>([]);
const DRAFT_KEY = '1locate-outdoor-network-draft-v1';
function addNode() {
  let index = graph.value.nodes.length + 1;
  while (graph.value.nodes.some(n => n.id === `node-${index}`)) index++;
  // NaN deliberately renders empty; there are no invented campus coordinates.
  graph.value.nodes.push({ id: `node-${index}`, name: '', latitude: NaN, longitude: NaN, entrance: false });
  graph.value.verified = false;
}
function removeNode(index: number) {
  const id = graph.value.nodes[index].id;
  graph.value.nodes.splice(index, 1);
  graph.value.edges = graph.value.edges.filter(e => e.from !== id && e.to !== id);
}
function addEdge() { graph.value.edges.push({ from: graph.value.nodes[0].id, to: graph.value.nodes[1].id, meters: 0, open: true, accessible: false, oneWay: false }); graph.value.verified = false; }
function run(action: () => void) { try { action(); } catch (error) { message.value = error instanceof Error ? error.message : 'Network operation failed.'; } }
function saveDraft() { run(() => { localStorage.setItem(DRAFT_KEY, JSON.stringify(parseOutdoorGraph(graph.value))); message.value = 'Draft saved on this browser only.'; }); }
function loadDraft() { run(() => { const saved = localStorage.getItem(DRAFT_KEY); if (!saved) throw new Error('No local draft found.'); graph.value = { ...parseOutdoorGraph(JSON.parse(saved)), verified: false }; message.value = 'Local draft loaded.'; }); }
function importNetwork() { run(() => { if (json.value.length > 2_000_000) throw new Error('Network JSON is too large.'); graph.value = { ...parseOutdoorGraph(JSON.parse(json.value)), verified: false }; message.value = 'Network imported for review.'; }); }
function preview() { run(() => {
  previewText.value = ''; previewCoordinates.value = [];
  const valid = parseOutdoorGraph(graph.value), start = valid.nodes.find(n => n.id === startId.value), end = valid.nodes.find(n => n.id === endId.value);
  if (!start || !end) throw new Error('Choose a start and destination entrance.');
  const result = campusWalkingRoute({ ...valid, verified: true }, start, end, stepFree.value);
  if (!result) throw new Error('No route found. Check entrance flags.');
  previewCoordinates.value = result.coordinates;
  previewText.value = `${Math.round(result.distance)} m via ${result.coordinates.length - 1} path segments. Draft preview only; verify on site.`;
}); }
async function importImage(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1_000_000) { message.value = 'Use a PNG, JPEG or WebP campus map up to 1 MB.'; return; }
  try {
    const image = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Image could not be read.')); reader.readAsDataURL(file);
    });
    await new Promise<void>((resolve, reject) => {
      const previewImage = new Image(); previewImage.onload = () => resolve(); previewImage.onerror = () => reject(new Error('The selected file is not a readable map image.')); previewImage.src = image;
    });
    graph.value.referenceMap = validateCampusMap({ image, anchors: [] });
    mapMode.value = 'anchor'; message.value = 'School map loaded. Add three verified GPS anchors before placing nodes.';
  } catch (error) { message.value = error instanceof Error ? error.message : 'Image import failed.'; }
}
function onMapPoint(point: ImagePoint) { run(() => {
  const map = graph.value.referenceMap;
  if (!map) return;
  if (mapMode.value === 'anchor') {
    if (map.anchors.length >= 3) throw new Error('Three anchors are already set. Choose Add walking node or reset calibration.');
    if (!validPoint({ latitude: anchorLat.value, longitude: anchorLng.value })) throw new Error('Enter the verified latitude and longitude for this landmark.');
    const next = { ...map, anchors: [...map.anchors, { ...point, latitude: anchorLat.value, longitude: anchorLng.value }] };
    validateCampusMap(next); graph.value.referenceMap = next;
    anchorLat.value = NaN; anchorLng.value = NaN;
    if (next.anchors.length === 3) mapMode.value = 'node';
  } else {
    const gps = imageToGps(map, point);
    if (!gps) throw new Error('Add three valid GPS calibration anchors first.');
    addNode(); Object.assign(graph.value.nodes[graph.value.nodes.length - 1], gps);
    message.value = 'Node placed. Name it below, mark entrances, and connect only actual walkways.';
  }
}); }
function downloadJson(value: OutdoorGraph) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'campus-walking-network.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportReference() { run(() => {
  if (!graph.value.referenceMap) throw new Error('Import the school map first.');
  const reference = parseOutdoorGraph({ version: 1, verified: false, nodes: [], edges: [], referenceMap: graph.value.referenceMap });
  downloadJson(reference); message.value = 'Reference map exported without routing or live GPS pins. Replace the mobile public JSON and rebuild.';
}); }
function exportNetwork() { run(() => {
  const valid = parseOutdoorGraph(graph.value);
  if (!valid.verified || !valid.nodes.some(n => n.entrance) || !valid.edges.length) throw new Error('Survey the network and confirm verification before export.');
  downloadJson(valid); message.value = 'Exported. Replace the mobile public JSON and rebuild to publish.';
}); }
</script>
<style scoped>
.actions { display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin:14px 0; }
.table-scroll { overflow-x:auto; } table { width:100%; } td,th { padding:8px; text-align:left; }
input:not([type=checkbox]), select { min-width:110px; max-width:200px; padding:8px; } textarea { width:100%; box-sizing:border-box; }
p { line-height:1.6; } button { padding:9px 12px; cursor:pointer; } h2 { margin-top:24px; }
</style>
