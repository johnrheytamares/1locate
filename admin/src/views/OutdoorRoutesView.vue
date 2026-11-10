<template>
  <section class="page route-builder">
    <header class="builder-header"><span class="eyebrow">CAMPUS NAVIGATION</span><h1>Walking routes</h1><p>Choose a destination. Walk the path. Review and publish.</p></header>
    <ol class="progress-steps" aria-label="Route setup"><li :class="{ active: !buildingId }"><b>1</b> Building</li><li :class="{ active: !!buildingId && !reviewing }"><b>2</b> Record walk</li><li :class="{ active: reviewing }"><b>3</b> Review</li></ol>
    <section class="builder-card destination-card"><label for="route-building">Where are you walking to?</label><select id="route-building" v-model="buildingId" :disabled="recorderBusy" aria-label="Choose building" @change="useBuildingEntrance"><option value="">Choose a building</option><option v-for="building in buildings" :key="building.id" :value="building.id">{{ building.name }}</option></select><p v-if="buildingError" class="helper" role="status">{{ buildingError }}</p><p v-else-if="selectedBuilding" class="helper">Destination: {{ selectedBuilding.entrance_name || selectedBuilding.name + ' entrance' }}</p></section>
    <GpsRouteRecorder :building="selectedBuilding" :graph="graph" :map="graph.referenceMap" @network="graph = $event" @activity="recorderBusy = $event" @review="reviewing = $event" @setup="advancedOpen = true; manualOpen = true; mapMode = 'anchor'" @destination="buildingId = $event" />
    <details class="manual-editor builder-card" v-show="!recorderBusy" :open="manualOpen" @toggle="manualOpen = ($event.target as HTMLDetailsElement).open"><summary>Advanced setup <span>Map alignment and manual path correction</span></summary><div class="advanced-body">
    <section class="builder-card map-card">
      <div class="map-toolbar"><div><h2>School map</h2><span>{{ reviewing ? 'Check the highlighted walking path.' : 'Tap the start, each corner, then the entrance.' }}</span></div><button class="quiet" :disabled="!undoHistory.length" @click="undo">↶ Undo</button></div>
      <div v-if="!mapReady" class="setup-note"><span class="note-icon" aria-hidden="true">ⓘ</span><div><strong>Map needs a one-time setup</strong><p>Match 3 landmarks to their GPS locations before drawing a path.</p><button class="text-button" @click="advancedOpen = true; mapMode = 'anchor'">Set up map →</button></div></div>
      <div class="map-viewport"><div :style="{ width: `${zoom * 100}%` }"><CampusMapCanvas :map="graph.referenceMap || defaultMap" :nodes="mapReady ? graph.nodes : []" :edges="graph.edges" :route="previewCoordinates" :selected="selectedNode" :editable="!reviewing && (mapReady || advancedOpen)" @point="onMapPoint" @node="connectPoint" /></div></div>
      <div class="map-footer"><span><i></i> Walking path <i class="entrance-key"></i> Entrance</span><div class="zoom-controls"><button class="quiet" aria-label="Zoom out" :disabled="zoom <= 1" @click="zoom = Math.max(1, zoom - 0.5)">−</button><button class="quiet" aria-label="Zoom in" :disabled="zoom >= 4" @click="zoom = Math.min(4, zoom + 0.5)">+</button></div></div>
      <p class="drawing-hint" role="status">{{ drawHint }}</p>
    </section>
    <p v-if="message" class="feedback" role="status">{{ message }}</p>
    <section v-if="reviewing" class="builder-card review-card"><h2>Review your path</h2><p v-if="previewText" role="status">{{ previewText }}</p><ul v-if="validationIssues.length"><li v-for="issue in validationIssues" :key="issue">{{ issue }}</li></ul><p class="helper">Distances are GPS estimates. Check the path and measurements on campus.</p><label class="check-row"><input v-model="graph.verified" type="checkbox" /> <span>I checked this path and its distances on campus.</span></label><button :disabled="!graph.verified || !previewCoordinates.length || !!validationIssues.length" @click="exportNetwork">Download checked route</button><p class="helper">Downloading does not update the mobile app. Installation steps are in Advanced setup.</p></section>
    <footer class="builder-actions"><div><strong>{{ graph.edges.length }} path sections</strong><small>{{ Math.round(graph.edges.reduce((sum, e) => sum + e.meters, 0)) }} m · estimated network length</small></div><div class="primary-actions"><button class="quiet" @click="saveDraft">Save draft</button><button v-if="!reviewing" :disabled="!buildingId || !startId || !endId || !graph.edges.length" @click="reviewPath">Review path →</button><button v-else class="quiet" @click="reviewing = false">Back to drawing</button></div><p v-if="draftSaved" class="helper" role="status">Saved in this browser. Not published to the mobile app.</p></footer>
    <details class="advanced builder-card" :open="advancedOpen" @toggle="advancedOpen = ($event.target as HTMLDetailsElement).open"><summary>Route data <span>GPS points, saved files and network testing</span></summary><div class="advanced-body">
      <h2>Map alignment</h2><p>Choose 3 known landmarks spread across the map. Enter each landmark's GPS, then tap its position on the map above. After three landmarks, choose Add independent alignment check and verify a fourth landmark not used for alignment.</p><p>{{ graph.referenceMap?.anchors.length || 0 }} of 3 landmarks added</p>
      <div class="field-grid"><label>Map tool<select v-model="mapMode" aria-label="Map editing mode"><option value="anchor">Align a landmark</option><option value="node">Draw walking path</option><option value="check">Add independent alignment check</option></select></label><label>Landmark latitude<input v-model.number="anchorLat" type="number" step="any" aria-label="Anchor latitude" /></label><label>Landmark longitude<input v-model.number="anchorLng" type="number" step="any" aria-label="Anchor longitude" /></label></div><button class="quiet" @click="resetCalibration">Reset map alignment</button><label>Replace school map<input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Import school map image" @change="importImage" /></label>
      <h2>Saved routes</h2><div class="actions"><button class="quiet" @click="loadBundled">Load mobile network</button><button class="quiet" @click="loadDraft">Load saved draft</button><button v-if="graph.referenceMap" class="quiet" @click="exportReference">Download map only</button></div>
      <details><summary>GPS network diagram</summary><OutdoorNetworkCanvas :nodes="graph.nodes" :edges="graph.edges" :selected="selectedNode" :route="previewCoordinates" @node="connectPoint" /><p class="helper">GPS layout only; not a campus basemap or a distance scale.</p></details>
    <h2>Walking points</h2><p>Edit point names and GPS coordinates.</p><button @click="addNode">Add point</button>
    <div class="table-scroll"><table><thead><tr><th>ID</th><th>Name</th><th>Latitude</th><th>Longitude</th><th>Entrance</th><th></th></tr></thead><tbody>
      <tr v-for="(node, index) in graph.nodes" :key="index">
        <td data-label="ID"><span>{{ node.id }}</span></td><td data-label="Name"><input v-model="node.name" aria-label="Node name" /></td>
        <td data-label="Latitude"><input v-model.number="node.latitude" type="number" step="any" aria-label="Latitude" /></td><td data-label="Longitude"><input v-model.number="node.longitude" type="number" step="any" aria-label="Longitude" /></td>
        <td data-label="Entrance"><input v-model="node.entrance" type="checkbox" aria-label="Building entrance" /></td><td data-label=""><button @click="removeNode(index)">Remove</button></td>
      </tr>
    </tbody></table></div>
    <h2>Path sections</h2><p>Adjust distances and access for each path section.</p><button :disabled="graph.nodes.length < 2" @click="addEdge">Add section</button><p v-if="graph.nodes.length < 2" class="muted">Add two points first.</p>
    <div class="table-scroll"><table><thead><tr><th>From</th><th>To</th><th>Distance (m)</th><th>Open</th><th>Step-free</th><th>One way</th><th></th></tr></thead><tbody>
      <tr v-for="(edge, index) in graph.edges" :key="index">
        <td data-label="From"><select v-model="edge.from" @change="updateEndpoints(edge)" aria-label="From node"><option v-for="node in graph.nodes" :key="node.id" :value="node.id">{{ node.name || node.id }}</option></select></td>
        <td data-label="To"><select v-model="edge.to" @change="updateEndpoints(edge)" aria-label="To node"><option v-for="node in graph.nodes" :key="node.id" :value="node.id">{{ node.name || node.id }}</option></select></td>
        <td data-label="Distance"><input v-model.number="edge.meters" type="number" min="0.1" step="any" aria-label="Connection meters" @input="edge.distanceSource = 'measured'" /><small>{{ edge.distanceSource === 'gps' ? 'Recorded GPS distance · estimated' : edge.distanceSource === 'estimated' ? 'Estimated distance · GPS' : 'Manually entered distance · verify on site' }}</small><button type="button" @click="estimate(edge)">Use GPS estimate</button></td>
        <td data-label="Open"><input v-model="edge.open" type="checkbox" aria-label="Open connection" /></td><td data-label="No stairs"><input v-model="edge.accessible" type="checkbox" aria-label="Verified step-free connection" /></td><td data-label="One way"><input v-model="edge.oneWay" type="checkbox" aria-label="One-way connection" /></td><td data-label=""><button @click="graph.edges.splice(index, 1)">Remove</button></td>
      </tr>
    </tbody></table></div>

      <h2>Test a route</h2><div class="field-grid"><label>Starting point<select v-model="startId" aria-label="Starting node"><option value="">Choose start</option><option v-for="node in graph.nodes" :key="node.id" :value="node.id">{{ node.name }}</option></select></label><label>Entrance<select v-model="endId" aria-label="Destination entrance"><option value="">Choose entrance</option><option v-for="node in graph.nodes.filter(n => n.entrance)" :key="node.id" :value="node.id">{{ node.name }}</option></select></label></div><label class="check-row"><input v-model="stepFree" type="checkbox" /> <span>Avoid stairs</span></label><button class="quiet" @click="preview">Test route</button>
      <h2>Import route file</h2><textarea v-model="json" rows="5" aria-label="Walking network JSON" placeholder="Paste a previously exported route file" /><button class="quiet" @click="importNetwork">Import route file</button>
      <h2>Install in the mobile app</h2><p>Published GPS routes synchronize and cache automatically in the updated mobile app. Manual file installation is only a fallback: replace <code>public/campus-walking-network.json</code> in the mobile project and rebuild the app. Existing installations need this feature update once; later published data updates do not need another APK.</p>
    </div></details>
    </div></details>
    <NetworkPublisher v-if="!recorderBusy" :graph="graph" @network="graph = $event" />
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import NetworkPublisher from '../components/NetworkPublisher.vue';
import GpsRouteRecorder from '../components/GpsRouteRecorder.vue';
import OutdoorNetworkCanvas from '../components/OutdoorNetworkCanvas.vue';
import { loadPublishedNetwork } from '../services/outdoor-recordings';
import { listBuildings } from '../services/campus';
import type { Building } from '../types';
import CampusMapCanvas from '../../../shared/CampusMapCanvas.vue';
import { imageToGps, validateCampusMap, type ImagePoint, type CampusMap } from '../../../shared/campus-map';
import { validPoint, metersBetween, type OutdoorEdge } from '../../../shared/outdoor-graph';
import { campusWalkingRoute, EMPTY_OUTDOOR_GRAPH, parseOutdoorGraph, type OutdoorGraph } from '../../../shared/outdoor-graph';
const defaultMap: CampusMap = { image: '/images/updated_map.png', anchors: [] };
const buildings = ref<Building[]>([]), buildingId = ref(''), buildingError = ref(''), selectedNode = ref('');
const recorderBusy = ref(false), manualOpen = ref(false);
const advancedOpen = ref(false), reviewing = ref(false), draftSaved = ref(false), zoom = ref(1);
const undoHistory = ref<{ graph: OutdoorGraph; selected: string; start: string; end: string }[]>([]);
const mapReady = computed(() => graph.value.referenceMap?.anchors.length === 3);
const drawHint = computed(() => !buildingId.value ? 'Choose a building to start.' : !mapReady.value ? 'Complete map alignment in Advanced setup.' : reviewing.value ? 'Check the route before downloading.' : !selectedNode.value ? 'Tap where the walk starts.' : selectedNode.value === endId.value ? 'Entrance reached. Select Review path.' : 'Tap the next corner, or tap the building entrance to finish.');
function remember() { undoHistory.value.push({ graph: JSON.parse(JSON.stringify(graph.value)), selected: selectedNode.value, start: startId.value, end: endId.value }); if (undoHistory.value.length > 100) undoHistory.value.shift(); }
function undo() { const previous = undoHistory.value.pop(); if (!previous) return; graph.value = previous.graph; selectedNode.value = previous.selected; startId.value = previous.start; endId.value = previous.end; reviewing.value = false; message.value = 'Last point undone.'; }
function reviewPath() { preview(); reviewing.value = !!previewCoordinates.value.length; }
function resetCalibration() { if (!window.confirm('Reset map alignment? Existing GPS points will stay in place.')) return; if (graph.value.referenceMap) graph.value.referenceMap.anchors = []; if (graph.value.referenceMap) delete graph.value.referenceMap.checks; mapMode.value = 'anchor'; }
const selectedBuilding = computed(() => buildings.value.find(b => b.id === buildingId.value));
onMounted(async () => {
  const loading = listBuildings().then(value => { buildings.value = value; }).catch(() => { buildingError.value = 'Buildings could not load. Reload the page to try again.'; });
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}campus-walking-network.json`);
    if (response.ok && !graph.value.nodes.length && !graph.value.edges.length) { const loaded = parseOutdoorGraph(await response.json()); if (!graph.value.nodes.length) graph.value = { ...loaded, verified: false }; }
  } catch { /* The supplied school map remains available offline. */ }
  if (!graph.value.referenceMap) graph.value.referenceMap = { image: '/images/updated_map.png', anchors: [] };
  await loading;
  try { const published = await loadPublishedNetwork(); if (published && !buildingId.value && !selectedNode.value) graph.value = published; } catch { /* Additive migration may not be installed yet; retain the bundled/manual network. */ }
});
const graph = ref<OutdoorGraph>(structuredClone(EMPTY_OUTDOOR_GRAPH));
const json = ref(''), message = ref(''), previewText = ref(''), startId = ref(''), endId = ref(''), stepFree = ref(false);
watch(() => JSON.stringify({ nodes: graph.value.nodes, edges: graph.value.edges, referenceMap: graph.value.referenceMap }), () => { graph.value.verified = false; draftSaved.value = false; previewCoordinates.value = []; previewText.value = ''; }, { flush: 'sync' });
const mapMode = ref<'anchor' | 'node' | 'check'>('node');
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
function addEdge() {
  if (graph.value.nodes.length < 2) return;
  connect(graph.value.nodes[0].id, graph.value.nodes[1].id);
}
function estimate(edge: OutdoorEdge) {
  const a = graph.value.nodes.find(n => n.id === edge.from), b = graph.value.nodes.find(n => n.id === edge.to);
  edge.distanceSource = 'estimated';
  edge.meters = a && b && validPoint(a) && validPoint(b) ? Math.round(metersBetween(a, b) * 10) / 10 : 0;
}
function updateEndpoints(edge: OutdoorEdge) { estimate(edge); }
function connect(from: string, to: string) {
  if (from === to) { message.value = 'Choose two different points.'; return; }
  if (graph.value.edges.some(e => e.from === from && e.to === to || !e.oneWay && e.from === to && e.to === from)) { message.value = 'These points are already connected.'; return; }
  const edge: OutdoorEdge = { from, to, meters: 0, open: true, accessible: false, oneWay: false, distanceSource: 'estimated' };
  estimate(edge); graph.value.edges.push(edge);
  message.value = edge.meters > 0 ? `Connected · ${edge.meters} m estimated. Check the path and distance on campus.` : 'Connected. Add valid GPS coordinates to estimate the distance.';
}
function connectPoint(id: string) {
  if (reviewing.value) return;
  if (!buildingId.value) { message.value = 'Choose a building first.'; return; }
  if (id === selectedNode.value) return;
  remember();
  if (!selectedNode.value) { selectedNode.value = id; startId.value = id; return; }
  connect(selectedNode.value, id); selectedNode.value = id;
}
function useBuildingEntrance() {
  selectedNode.value = ''; startId.value = ''; reviewing.value = false; undoHistory.value = [];
  const b = selectedBuilding.value;
  if (!b) return;
  if (b.entrance_lat == null || b.entrance_lng == null || !validPoint({ latitude: b.entrance_lat, longitude: b.entrance_lng })) { message.value = 'Add this building’s entrance GPS in Buildings first.'; return; }
  const point = { latitude: b.entrance_lat, longitude: b.entrance_lng };
  const existing = graph.value.nodes.find(n => n.entrance && metersBetween(n, point) < 1);
  if (existing) endId.value = existing.id;
  else { addNode(); const n = graph.value.nodes[graph.value.nodes.length - 1]; Object.assign(n, point, { name: `${b.name} — ${b.entrance_name || 'Entrance'}`, entrance: true }); endId.value = n.id; }
  message.value = 'Entrance ready. Tap the start and each corner on the map.';
}
watch(() => graph.value.nodes.map(n => `${n.id}:${n.latitude}:${n.longitude}`).join('|'), () => {
  for (const edge of graph.value.edges) if (edge.distanceSource === 'estimated') estimate(edge);
  if (!graph.value.nodes.some(n => n.id === selectedNode.value)) selectedNode.value = '';
});
const validationIssues = computed(() => {
  const issues: string[] = [];
  if (!graph.value.nodes.some(n => n.entrance)) issues.push('Add a building entrance.');
  if (graph.value.nodes.some(n => !validPoint(n) || !n.name.trim())) issues.push('Add a name and valid GPS for each point.');
  if (graph.value.nodes.some(n => !graph.value.edges.some(e => e.open && (e.from === n.id || e.to === n.id)))) issues.push('Some points are not connected to an open path.');
  if (graph.value.edges.some(e => e.meters <= 0)) issues.push('Some path sections need a valid distance.');
  const b = selectedBuilding.value;
  if (b && b.entrance_lat != null && b.entrance_lng != null && !graph.value.nodes.some(n => n.entrance && metersBetween(n, { latitude: b.entrance_lat!, longitude: b.entrance_lng! }) <= 8)) issues.push('The path does not match the saved building entrance.');
  return issues;
});
async function loadBundled() {
  try {
    if ((graph.value.nodes.length || graph.value.edges.length) && !window.confirm('Replace the current editor network? Save a local draft first if needed.')) return;
    const response = await fetch(`${import.meta.env.BASE_URL}campus-walking-network.json`);
    if (!response.ok) throw new Error('Could not load the mobile network. Import a route file instead.');
    graph.value = { ...parseOutdoorGraph(await response.json()), verified: false };
    message.value = 'Bundled network loaded for review. Deployment may use a different APK version.';
  } catch (error) { message.value = error instanceof Error ? error.message : 'Could not load network.'; }
}
function run(action: () => void) { try { message.value = ''; action(); } catch (error) { message.value = error instanceof Error ? error.message : 'Network operation failed.'; } }
function saveDraft() { run(() => { const draft = parseOutdoorGraph(graph.value); localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); draftSaved.value = true; message.value = 'Draft saved in this browser.'; }); }
function resetDrawing() { selectedNode.value = ''; startId.value = ''; reviewing.value = false; undoHistory.value = []; }
function loadDraft() { run(() => { const saved = localStorage.getItem(DRAFT_KEY); if (!saved) throw new Error('No local draft found.'); graph.value = { ...parseOutdoorGraph(JSON.parse(saved)), verified: false }; resetDrawing(); message.value = 'Saved draft loaded.'; }); }
function importNetwork() { run(() => { if (json.value.length > 2_000_000) throw new Error('Network JSON is too large.'); graph.value = { ...parseOutdoorGraph(JSON.parse(json.value)), verified: false }; resetDrawing(); message.value = 'Network imported for review.'; }); }
function preview() { run(() => {
  previewText.value = ''; previewCoordinates.value = [];
  const valid = parseOutdoorGraph(graph.value), start = valid.nodes.find(n => n.id === startId.value), end = valid.nodes.find(n => n.id === endId.value);
  if (!start || !end) throw new Error('Choose a start and destination entrance.');
  if (selectedBuilding.value && validationIssues.value.some(issue => issue.includes('does not match'))) throw new Error('The path does not match the saved building entrance.');
  const result = campusWalkingRoute({ ...valid, verified: true }, start, end, stepFree.value);
  if (!result) throw new Error('No route found. Check entrance flags.');
  previewCoordinates.value = result.coordinates;
  previewText.value = `${Math.round(result.distance)} m via ${result.coordinates.length - 1} path sections. Draft preview only; verify on site.`;
  reviewing.value = true;
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
  const map = graph.value.referenceMap || defaultMap;
  if (reviewing.value) return;
  if (mapMode.value === 'check') {
    if (map.anchors.length !== 3 || !validPoint({ latitude: anchorLat.value, longitude: anchorLng.value })) throw new Error('Align three landmarks first, then enter the independent check GPS.');
    graph.value.referenceMap = validateCampusMap({ ...map, checks: [...(map.checks || []), { ...point, latitude: anchorLat.value, longitude: anchorLng.value }] });
    anchorLat.value = NaN; anchorLng.value = NaN; message.value = 'Independent GPS check added.';
  } else if (mapMode.value === 'anchor') {
    if (map.anchors.length >= 3) throw new Error('Three anchors are already set. Choose Add walking node or reset calibration.');
    if (!validPoint({ latitude: anchorLat.value, longitude: anchorLng.value })) throw new Error('Enter the verified latitude and longitude for this landmark.');
    const next = { ...map, anchors: [...map.anchors, { ...point, latitude: anchorLat.value, longitude: anchorLng.value }] };
    validateCampusMap(next); graph.value.referenceMap = next;
    anchorLat.value = NaN; anchorLng.value = NaN;
    if (next.anchors.length === 3) mapMode.value = 'node';
  } else {
    if (!buildingId.value) throw new Error('Choose a building first.');
    const gps = imageToGps(map, point);
    if (!gps) throw new Error('Add three valid GPS calibration anchors first.');
    remember();
    const previous = selectedNode.value;
    addNode(); const node = graph.value.nodes[graph.value.nodes.length - 1];
    Object.assign(node, gps, { name: `Point ${graph.value.nodes.length}` });
    if (previous) connect(previous, node.id); else startId.value = node.id;
    selectedNode.value = node.id;
    message.value = 'Point added. Tap the next corner or the entrance.';
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
  if (validationIssues.value.length) throw new Error(validationIssues.value.join(' '));
  if (!previewCoordinates.value.length) throw new Error('Test the path from its starting point to the entrance before downloading.');
  downloadJson(valid); message.value = 'Route downloaded. See Advanced setup to install it in the mobile app.';
}); }
</script>
<style scoped>
.route-builder { max-width:1080px; margin:0 auto; color:#18324e; padding-bottom:24px; }
.route-builder * { box-sizing:border-box; }
.builder-header { margin-bottom:20px; }.eyebrow { font-size:10px; letter-spacing:.12em; font-weight:750; color:#637991; }h1 { margin:6px 0 8px; font-size:28px; letter-spacing:-.6px; }p { line-height:1.6; margin:8px 0; }.builder-header p,.helper { color:#61758b; font-size:13px; }
.progress-steps { display:flex; list-style:none; padding:0; margin:0 0 20px; gap:24px; font-size:13px; color:#718299; }.progress-steps li { display:flex; align-items:center; gap:8px; }.progress-steps b { display:grid; place-items:center; width:26px; height:26px; border-radius:50%; background:#e7edf5; font-size:12px; }.progress-steps .active { color:#1d4ed8; font-weight:700; }.active b { background:#2563eb; color:white; }
.builder-card { background:white; border:1px solid #dce5ef; border-radius:14px; margin-bottom:16px; padding:20px; }label { display:block; font-size:13px; font-weight:650; }input:not([type=checkbox]),select,textarea { display:block; width:100%; min-width:0; min-height:44px; margin:8px 0; padding:10px 12px; border:1px solid #cdd9e7; border-radius:9px; color:#18324e; background:white; font:inherit; font-size:14px; }input[type=checkbox] { width:20px; height:20px; min-height:20px; flex:0 0 20px; margin:0; accent-color:#2563eb; }.check-row { display:flex; gap:10px; align-items:flex-start; margin:16px 0; line-height:1.5; }
button { min-height:44px; padding:10px 16px; border:1px solid #2563eb; border-radius:9px; background:#2563eb; color:white; font-size:13px; font-weight:650; cursor:pointer; }button:disabled { opacity:.45; cursor:not-allowed; }.quiet { background:white; color:#355474; border-color:#d6e0eb; }.text-button { min-height:32px; padding:4px 0; background:none; border:0; color:#1d4ed8; }button:focus-visible,summary:focus-visible,input:focus-visible,select:focus-visible { outline:3px solid #93b4ff; outline-offset:3px; }
h2 { font-size:16px; margin:0 0 8px; }.map-card { padding:0; overflow:hidden; }.map-toolbar { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:16px 20px; }.map-toolbar span { color:#61758b; font-size:12px; }.map-toolbar h2 { margin-bottom:4px; }.setup-note { display:flex; gap:10px; padding:12px 20px; background:#fff8e9; border-top:1px solid #f3e4c2; color:#775a24; font-size:12px; }.setup-note p { margin:3px 0; }.note-icon { font-size:18px; }.map-viewport { overflow:auto; max-height:65vh; background:#e9f2e4; }.map-viewport > div { min-width:100%; }.map-footer { display:flex; align-items:center; justify-content:space-between; padding:10px 16px; gap:8px; font-size:11px; color:#61758b; }.map-footer i { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:4px; background:#0f766e; }.map-footer .entrance-key { background:#b91c1c; margin-left:12px; }.zoom-controls { display:flex; gap:5px; }.zoom-controls button { min-height:36px; width:36px; padding:4px; font-size:18px; }.drawing-hint { padding:12px 16px; margin:0; background:#f4f7fc; border-top:1px solid #e2e9f2; font-size:13px; }.feedback { padding:12px 16px; background:#edf4ff; border-radius:9px; font-size:13px; overflow-wrap:anywhere; }.builder-actions { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:14px; padding:4px 0 20px; }.builder-actions strong,.builder-actions small { display:block; }.builder-actions strong { font-size:13px; }.builder-actions small { color:#61758b; font-size:11px; margin-top:5px; }.primary-actions { display:flex; gap:8px; }.builder-actions > p { flex-basis:100%; margin:0; }.empty-map { padding:60px 20px; text-align:center; }
summary { cursor:pointer; font-size:14px; font-weight:650; }summary span { display:block; color:#718299; font-size:12px; font-weight:400; margin:6px 0 0 18px; }.advanced-body { padding-top:24px; }.advanced-body h2 { margin-top:24px; }.advanced-body p { font-size:13px; color:#61758b; }.advanced-body .actions { display:flex; flex-wrap:wrap; gap:8px; margin:12px 0; }.field-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; }.table-scroll { overflow:auto; margin:12px 0; }table { width:100%; }td,th { padding:8px; text-align:left; font-size:12px; }td small { display:block; color:#61758b; }td input:not([type=checkbox]),td select { min-width:110px; }code { overflow-wrap:anywhere; }
@media(max-width:600px) { h1 { font-size:24px; }.builder-header { margin-bottom:16px; }.progress-steps { gap:16px; justify-content:space-between; font-size:12px; }.builder-card { padding:16px; border-radius:12px; }.map-card { padding:0; }.map-toolbar { padding:14px; align-items:flex-start; }.map-toolbar span { display:block; line-height:1.5; }.setup-note { padding:12px 14px; }.primary-actions { width:100%; display:grid; grid-template-columns:1fr 1.5fr; }.builder-actions { padding-bottom:18px; }input:not([type=checkbox]),select,textarea { font-size:16px; }thead { display:none; }table,tbody,tr,td { display:block; width:100%; }tr { border:1px solid #dce5ef; border-radius:10px; padding:10px; margin-bottom:10px; }td::before { content:attr(data-label); display:block; color:#61758b; font-size:12px; margin-bottom:4px; }td { padding:6px 0; }td input:not([type=checkbox]),td select { min-width:0; } }
</style>
