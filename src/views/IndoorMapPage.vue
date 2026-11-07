<template>
  <ion-page>
    <ion-header><ion-toolbar><ion-buttons slot="start"><ion-back-button default-href="/destinations" /></ion-buttons><ion-title><span class="brand"><img src="/images/1locate-logo.png" alt="" />Indoor map route</span></ion-title></ion-toolbar></ion-header>
    <ion-content class="map-content">
      <main>
        <p v-if="isTestJourney()" class="message">TEST SESSION - not a verified physical journey.</p>
        <p v-if="loading" role="status">Loading published campus maps…</p>
        <div v-if="error" class="message error" role="alert">{{ error }} <ion-button v-if="!data" size="small" @click="load">Retry</ion-button></div>
        <p v-if="data && !data.graphs.length" class="message">No published map routes are available yet. You can still use the existing destination routes.</p>
        <section v-if="data?.graphs.length" class="panel">
          <h1>Plan your indoor route</h1><p>Choose the entrance you are physically at. This map does not track your indoor position.</p>
          <fieldset :disabled="!!activePath">
            <label>Building<select v-model="buildingId" @change="resetSelections"><option value="">Choose building</option><option v-for="b in data.buildings.filter(b => data!.graphs.some(g => g.building_id === b.id))" :key="b.id" :value="b.id">{{ b.name }}</option></select></label>
            <label>Starting entrance<select v-model="startId"><option value="">Choose entrance</option><option v-for="n in graph.nodes.filter(n => n.kind === 'entrance')" :key="n.id" :value="n.id">{{ n.name }} · {{ floorName(n.floor_id) }}</option></select></label>
            <label>Destination room<select v-model="goalId"><option value="">Choose room</option><option v-for="n in graph.nodes.filter(n => n.kind === 'room' && n.room_id)" :key="n.id" :value="n.id">{{ n.name }} · {{ floorName(n.floor_id) }}</option></select></label>
            <label class="check"><input v-model="stepFree" type="checkbox" /> Step-free route (excludes stairs)</label>
          </fieldset>
          <ion-button v-if="!activePath" expand="block" :disabled="!startId || !goalId" @click="plan">Generate route</ion-button>
        </section>
        <section v-if="preview && !activePath" class="panel">
          <h2>{{ preview.meters.toFixed(2) }} m · {{ preview.legs.length }} connections</h2>
          <ol><li v-for="leg in preview.legs" :key="leg.edge.id">{{ legInstruction(leg, floorName(leg.to.floor_id)) }}</li></ol>
          <label class="check"><input v-model="entranceConfirmed" type="checkbox" /> I am at {{ nodeName(startId) }}, ready to follow the marked route.</label>
          <ion-button expand="block" :disabled="!entranceConfirmed" @click="begin">Start map guidance</ion-button>
        </section>
        <section v-if="activePath" class="panel guidance" aria-live="polite">
          <span class="eyebrow">{{ arrived ? 'ROUTE COMPLETE' : paused ? 'GUIDANCE PAUSED' : `CONNECTION ${legIndex + 1} / ${activePath.legs.length}` }}</span>
          <h2 v-if="arrived">You reached {{ nodeName(goalId) }}.</h2>
          <template v-else-if="currentLeg">
            <h2>{{ currentInstruction }}</h2>
            <p v-if="!facingConfirmed">Face the {{ currentLeg.edge.kind === 'walk' ? 'highlighted corridor' : currentLeg.edge.kind }} at {{ currentLeg.from.name }}. Confirm your direction before continuing.</p>
            <p v-else>Follow the highlighted connection. Confirm only when you physically reach the next checkpoint.</p>
            <ion-button v-if="!paused && !facingConfirmed" expand="block" @click="facingConfirmed = true">I am facing the path</ion-button>
            <ion-button v-if="!paused && facingConfirmed" expand="block" @click="advance">{{ currentLeg.edge.kind === 'walk' ? `I reached ${currentLeg.to.name}` : `I am at ${floorName(currentLeg.to.floor_id)} landing` }}</ion-button>
            <ion-button v-if="!paused" fill="outline" expand="block" @click="paused = true">I lost my way</ion-button>
            <template v-if="paused"><p>The app cannot determine your position. Resume only from the same route position, or return to the starting entrance.</p><ion-button expand="block" @click="paused = false">Resume at same position</ion-button><ion-button expand="block" fill="outline" @click="restart">Restart from entrance</ion-button></template>
          </template>
          <ion-button expand="block" fill="clear" @click="stopGuidance">Choose another route</ion-button>
        </section>
        <ArrivalFeedbackModal
          :is-open="showFeedback"
          :session-id="feedbackSessionId"
          :destination-id="feedbackDestinationId"
          :destination-name="nodeName(goalId)"
          @close="closeFeedback"
        />
        <p v-if="feedbackNotice" class="message ok" role="status" data-test="feedback-notice">{{ feedbackNotice }}</p>
        <section v-if="graph.nodes.length" class="panel">
          <label>View floor<select v-model="mapId" @change="showMap"><option v-for="m in buildingMaps" :key="m.id" :value="m.id">{{ floorName(m.floor_id) }}</option></select></label>
          <FloorMapCanvas v-if="currentMap && url" :url="url" :width="currentMap.width_px" :height="currentMap.height_px" :nodes="graph.nodes.filter(n => n.map_id === mapId)" :edges="graph.edges" :highlight="highlightEdges" :selected="currentLeg?.from.id" @node="inspectNode" />
          <p v-if="inspected" class="message">{{ inspected }} · Map marker only, not your detected location.</p>
          <p class="map-note">Red lines show your planned route. Floor connectors appear in the instructions. Confirm each landing; floors are not detected automatically.</p>
        </section>
      </main>
    </ion-content>
  </ion-page>
</template>
<script setup lang="ts">
import { computed, nextTick, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, onBeforeRouteLeave } from 'vue-router';
import { IonPage, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonButton, useIonRouter, onIonViewWillEnter, onIonViewWillLeave } from '@ionic/vue';
import FloorMapCanvas from '../../shared/FloorMapCanvas.vue';
import ArrivalFeedbackModal from '@/components/navigation/ArrivalFeedbackModal.vue';
import { useArrivalFeedback } from '@/composables/useArrivalFeedback';
import { emptyGraph, shortestPath, legInstruction, routeInstruction, type GraphPath } from '../../shared/indoor-graph';
import { getSelectedDestination } from '@/services/navigation.service';
import { confirmRoomArrival, isTestJourney } from '@/services/journey.service';
import { loadIndoorMaps, signedMapUrl } from '@/services/indoor-map.service';

const route = useRoute();
const router = useIonRouter();
const data = ref<Awaited<ReturnType<typeof loadIndoorMaps>> | null>(null), error = ref(''), loading = ref(false);
const buildingId = ref(''), startId = ref(''), goalId = ref(''), stepFree = ref(false), mapId = ref(''), url = ref('');
const preview = ref<GraphPath | null>(null), activePath = ref<GraphPath | null>(null), entranceConfirmed = ref(false);
const legIndex = ref(0), paused = ref(false), facingConfirmed = ref(false), inspected = ref('');
const graph = computed(() => data.value?.graphs.find(g => g.building_id === buildingId.value)?.graph ?? emptyGraph());
const buildingMaps = computed(() => data.value?.maps.filter(m => graph.value.nodes.some(n => n.map_id === m.id)) ?? []);
const currentMap = computed(() => buildingMaps.value.find(m => m.id === mapId.value));
const currentLeg = computed(() => activePath.value?.legs[legIndex.value]);
const currentInstruction = computed(() => {
  if (!activePath.value || !currentLeg.value) return '';
  const m = data.value?.maps.find(m => m.id === currentLeg.value?.from.map_id);
  return routeInstruction(activePath.value, legIndex.value, floorName(currentLeg.value.to.floor_id), m?.width_px ?? 1, m?.height_px ?? 1);
});
const arrived = computed(() => !!activePath.value && legIndex.value >= activePath.value.legs.length);
const {
  showFeedback,
  sessionId: feedbackSessionId,
  notice: feedbackNotice,
  beginSession: beginFeedbackSession,
  offerAfterArrival,
  closeFeedback,
} = useArrivalFeedback();
const feedbackDestinationId = computed(() => {
  const node = graph.value.nodes.find((item) => item.id === goalId.value);
  return node?.room_id ?? goalId.value ?? null;
});
watch(arrived, (isArrived, wasArrived) => {
  if (isArrived && !wasArrived && activePath.value) {
    void nextTick(() => offerAfterArrival());
  }
});
const highlightEdges = computed(() => activePath.value ? currentLeg.value ? [currentLeg.value.edge.id] : [] : preview.value?.legs.map(l => l.edge.id) ?? []);
function floorName(id: string) { return data.value?.floors.find(f => f.id === id)?.name ?? 'the indicated floor'; }
function nodeName(id: string) { return graph.value.nodes.find(n => n.id === id)?.name ?? 'the selected entrance'; }
function inspectNode(id: string) { inspected.value = nodeName(id); }
let loadRequest = 0, imageRequest = 0;
async function load() {
  const request = ++loadRequest; loading.value = true; error.value = ''; data.value = null;
  try {
    const result = await loadIndoorMaps(); if (request !== loadRequest) return; data.value = result;
    const roomId = typeof route.query.room === 'string' ? route.query.room : '';
    const chosen = result.graphs.find(g => g.graph.nodes.some(n => n.room_id === roomId));
    buildingId.value = chosen?.building_id ?? result.graphs[0]?.building_id ?? ''; resetSelections();
    if (chosen) goalId.value = chosen.graph.nodes.find(n => n.room_id === roomId)?.id ?? '';
  } catch { if (request === loadRequest) error.value = 'Campus maps could not be loaded. Check your connection and whether the indoor graph migration has been applied.'; }
  finally { if (request === loadRequest) loading.value = false; }
}
function resetSelections() { startId.value = ''; goalId.value = ''; preview.value = null; entranceConfirmed.value = false; inspected.value = ''; mapId.value = buildingMaps.value[0]?.id ?? ''; void showMap(); }
async function showMap() { const request = ++imageRequest; url.value = ''; if (currentMap.value) try { const signed = await signedMapUrl(currentMap.value.storage_path); if (request === imageRequest) url.value = signed; } catch { error.value = 'The floor plan could not be loaded. Refresh campus maps before starting a route.'; } }
function plan() { error.value = ''; entranceConfirmed.value = false; try { preview.value = shortestPath(graph.value, startId.value, goalId.value, stepFree.value); if (!preview.value) error.value = 'No connected route for this preference. Try another entrance or contact campus staff.'; else { mapId.value = graph.value.nodes.find(n => n.id === startId.value)!.map_id; void showMap(); } } catch (err) { error.value = (err as Error).message; } }
function begin() {
  if (!preview.value || !entranceConfirmed.value) return;
  beginFeedbackSession();
  activePath.value = preview.value;
  legIndex.value = 0;
  paused.value = false;
  facingConfirmed.value = false;
}
function advance() {
  if (paused.value || !facingConfirmed.value || !currentLeg.value) return;
  legIndex.value++; facingConfirmed.value = false;
  const selected = getSelectedDestination();
  const goalRoom = graph.value.nodes.find(node => node.id === goalId.value)?.room_id;
  if (arrived.value && selected?.details?.roomId && selected.details.roomId === goalRoom) {
    confirmRoomArrival(selected);
    router.replace('/arrival');
    return;
  }
  const nextMap = currentLeg.value?.from.map_id ?? graph.value.nodes.find(n => n.id === goalId.value)?.map_id;
  if (nextMap && nextMap !== mapId.value) { mapId.value = nextMap; void showMap(); }
}
function restart() {
  if (window.confirm(`Have you physically returned to ${nodeName(startId.value)}?`)) {
    beginFeedbackSession();
    legIndex.value = 0;
    paused.value = false;
    facingConfirmed.value = false;
    mapId.value = graph.value.nodes.find(n => n.id === startId.value)!.map_id;
    void showMap();
  }
}
function stopGuidance() {
  showFeedback.value = false;
  activePath.value = null;
  preview.value = null;
  entranceConfirmed.value = false;
  facingConfirmed.value = false;
  legIndex.value = 0;
}
watch([buildingId,startId,goalId,stepFree], () => { preview.value = null; entranceConfirmed.value = false; });
onIonViewWillEnter(() => { if (!activePath.value) void load(); });
onIonViewWillLeave(() => { loadRequest++; imageRequest++; if (activePath.value) paused.value = true; });
onBeforeRouteLeave(() => !activePath.value || window.confirm('Leave map guidance? Your route will be paused.'));
function backgrounded() { if (document.hidden && activePath.value) paused.value = true; }
onMounted(() => document.addEventListener('visibilitychange', backgrounded));
onBeforeUnmount(() => { loadRequest++; imageRequest++; document.removeEventListener('visibilitychange', backgrounded); });
</script>
<style scoped>
ion-toolbar { --background: #0c2d52; --color: white; }
.brand { display: flex; align-items: center; gap: 8px; font-size: 16px; }
.brand img { width: 28px; height: 32px; object-fit: contain; }
.map-content { --background: #eef3f8; --color: #173452; }
main { max-width: 760px; padding: 12px; margin: auto; }
.panel { background: white; padding: 16px; border-radius: 14px; margin-bottom: 12px; border: 1px solid #e0e7f0; }
h1 { font-size: 19px; font-weight: 750; margin: 0 0 8px; }
h2 { font-size: 17px; line-height: 1.5; margin: 10px 0; }
p, li { font-size: 12px; line-height: 1.6; color: #607891; }
.message.ok { color: #15803d; }
label { display: grid; gap: 7px; font-size: 12px; font-weight: 600; margin: 12px 0; }
select { width: 100%; min-height: 44px; font-size: 16px; border: 1px solid #cbd9ec; border-radius: 9px; padding: 8px; background: white; color: #173452; }
fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
.check { display: flex; align-items: flex-start; gap: 8px; line-height: 1.6; }
.check input { width: 18px; height: 18px; flex-shrink: 0; }
ion-button { --background: #1d4ed8; --color: white; --border-radius: 10px; --box-shadow: none; min-height: 44px; text-transform: none; font-size: 13px; }
ion-button[fill=outline], ion-button[fill=clear] { --color: #1d4ed8; }
.message { padding: 12px; border-radius: 10px; background: #e7f0fb; font-size: 12px; line-height: 1.6; }
.error { background: #fff0ee; color: #a03529; }
.eyebrow { font-size: 10px; letter-spacing: .08em; font-weight: 750; color: #2563eb; }
.map-note { margin-bottom: 0; }
</style>
