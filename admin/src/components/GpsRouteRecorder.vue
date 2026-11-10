<template>
<section class="gps-recorder" aria-label="Outdoor GPS route recorder">
  <div v-if="recovery && !record" class="recovery"><strong>Unfinished walk found</strong><p>{{ recovery.name }} · {{ recovery.points.length }} GPS points</p><button @click="restore">Recover draft</button></div>
  <header><div><span class="eyebrow">WALK TO RECORD</span><h2>{{ record?.name || building?.name || 'Choose a destination above' }}</h2><p>{{ record ? statusLabel : 'Walk the actual path. GPS records the route and distance.' }}</p></div><span class="signal" :class="active ? quality : 'inactive'">{{ signalLabel }}</span></header>
  <p v-if="building" class="entrance">Finish at {{ building.entrance_name || building.name + ' entrance' }}<small>{{ building.entrance_lat == null || building.entrance_lng == null ? 'Entrance GPS is not set.' : `${building.entrance_lat.toFixed(6)}, ${building.entrance_lng.toFixed(6)}` }}</small></p>
  <div v-if="active || preparing || phase === 'paused'" class="camera-panel"><video ref="video" autoplay playsinline muted aria-label="Live camera visual reference" /><div class="camera-top"><span>{{ preparing ? 'Preparing GPS and camera…' : phase === 'paused' ? 'Paused' : 'Recording' }}</span><strong>{{ duration }}</strong></div><div class="camera-direction"><strong>{{ directionText }}</strong><b>{{ distance.toFixed(1) }} <small>m</small></b><span>GPS-estimated walking distance</span></div><p class="camera-note">Camera reference only · arrows are not spatial AR</p></div>
  <p v-if="cameraMessage" class="notice">{{ cameraMessage }}</p>
  <div v-if="record" class="metrics"><div><strong>{{ (phase === 'review' ? distance : segmentDistance).toFixed(1) }} m</strong><span>{{ phase === 'review' ? 'Total estimated distance' : 'Current section' }}</span></div><div><strong>{{ rawFix ? '±' + Math.round(rawFix.accuracy) + ' m' : '—' }}</strong><span>{{ active ? 'GPS accuracy' : 'Last GPS accuracy' }}</span></div><div><strong>{{ record.points.length }}</strong><span>Accepted points</span></div><div><strong>{{ duration }}</strong><span>Walking time</span></div></div>
  <p v-if="rawFix && record && phase !== 'review'" class="location">{{ active ? 'Current GPS:' : 'Last GPS fix:' }} {{ rawFix.latitude.toFixed(6) }}, {{ rawFix.longitude.toFixed(6) }}</p><p class="gps-message" role="status">{{ displayMessage }}</p><p v-if="checkpointError" class="notice checkpoint-message" role="status">{{ checkpointError }}</p><p v-if="error" role="alert" class="error">{{ error }}</p><p v-if="storageError" role="alert" class="error">{{ storageError }}</p>
  <div v-if="active" class="directions"><button @click="checkpoint('straight')">↑ Straight</button><button @click="checkpoint('left')">← Turn Left</button><button @click="checkpoint('right')">→ Turn Right</button></div>
  <div v-if="active || preparing || phase === 'paused'" class="record-actions"><button class="secondary" :disabled="preparing" @click="active ? pause() : start(true)">{{ active ? 'Pause' : 'Resume' }}</button><button :disabled="preparing || !record?.points.length" @click="finish">Finish Route</button><button class="cancel" @click="cancel">Cancel Recording</button></div>
  <div v-else-if="phase !== 'review'" class="start-area"><button class="start-button" :disabled="!canStart || busy" @click="start(false)">● Start Recording</button><p>{{ !session.canManageContent.value ? 'Sign in as an administrator or editor to record routes.' : !building ? 'Select a building destination first.' : 'Location permission is required. Allow the camera for a live visual reference.' }}</p></div>
  <section v-if="record && phase === 'review'" class="review"><div class="review-title"><h3>Review recorded route</h3><span class="state">{{ record.status }}</span></div><p>{{ distance.toFixed(1) }} m estimated · {{ record.points.length }} points · {{ duration }}</p><p class="helper">{{ record.good }} good, {{ record.reduced }} reduced-accuracy points · {{ record.rejected }} readings ignored</p><p>{{ entranceStatus }}</p>
    <ol class="instruction-summary" aria-label="Recorded instructions"><li v-for="(turn, index) in record.checkpoints" :key="index">{{ turn.direction === 'straight' ? 'Walk straight' : turn.direction === 'left' ? 'Turn left' : 'Turn right' }}<span> · {{ instructionDistance(index).toFixed(1) }} m</span></li></ol><fieldset :disabled="busy" class="review-editor"><details class="technical-review"><summary>Edit instructions and GPS details</summary><p>Start: {{ coordinate(record.points[0]) }}<br />End: {{ coordinate(record.points.at(-1)) }}</p><ol class="turn-list"><li v-for="(turn, index) in record.checkpoints" :key="index"><label>Checkpoint {{ index + 1 }}<select v-model="turn.direction" :disabled="record.status === 'published'" @change="invalidate"><option value="straight">Straight</option><option value="left">Turn Left</option><option value="right">Turn Right</option></select></label><label>GPS point<input v-model.number="turn.index" :disabled="record.status === 'published'" type="number" min="0" :max="record.points.length - 1" @change="invalidate" /></label></li></ol>
    </details><details v-if="record.status !== 'published'"><summary>Correct a problem section</summary><p>Remove a bad intermediate point, move a checkpoint using its point number above, or walk again from a selected point. Edits require validation again.</p><label>Point to correct<select v-model.number="editIndex"><option v-for="(point, index) in record.points" :key="index" :value="index">{{ index }} · {{ coordinate(point) }} · ±{{ Math.round(point.accuracy) }} m</option></select></label><div class="row"><button class="secondary" @click="addCheckpoint">Split at this point</button><button class="secondary" @click="removePoint">Remove point</button><button class="secondary" @click="retrySection">Re-record from here</button></div></details>
    <details><summary>Shared pathway review ({{ nearby.length }} nearby {{ nearby.length === 1 ? 'point' : 'points' }})</summary><p>Nearby GPS points may be separated by walls or fences. Reuse endpoints only after checking the actual walkway. Duplicate sections are rejected.</p><label>Reuse starting point<select v-model="sharedStart" :disabled="record.status === 'published'" @change="invalidate"><option value="">Keep a separate start</option><option v-for="node in startCandidates" :key="node.id" :value="node.id">{{ node.name }}</option></select></label><label>Reuse ending point<select v-model="sharedEnd" :disabled="record.status === 'published'" @change="invalidate"><option value="">Keep recorded endpoint</option><option v-for="node in endCandidates" :key="node.id" :value="node.id">{{ node.name }}</option></select></label><p v-if="nearby.length">Nearby: {{ nearby.map(n => n.name).join(', ') }}</p></details>
    <div class="checks" v-if="record.status !== 'published'"><label><input v-model="checks.walked" type="checkbox" @change="invalidate" /> I walked this path and checked that it is safe to use.</label><label><input v-model="checks.overlaps" type="checkbox" @change="invalidate" /> I checked nearby paths and any shared connections.</label><label><input v-model="checks.alignment" type="checkbox" @change="invalidate" /> I checked that the route appears in the correct place on the school map.</label></div>
    </fieldset><ul v-if="validationErrors.length" class="error" role="alert"><li v-for="issue in validationErrors" :key="issue">{{ issue }}</li></ul>
    <div class="review-actions"><button class="secondary" :disabled="busy" @click="saveLocalDraft">Save Draft</button><button :disabled="busy || record.status === 'published'" @click="validate">Validate Route</button><button :disabled="busy || record.status !== 'validated' || !session.isAdmin.value" @click="publish">Publish Route</button></div><p class="helper" role="status">{{ syncMessage }}</p><details><summary>Online save</summary><p>Save a private copy online. Publishing also saves the route online.</p><button class="secondary" :disabled="busy || record.status === 'published'" @click="sync">{{ busy ? 'Working…' : 'Save online' }}</button></details>
  </section>
  <section v-if="record?.points.length" class="recorded-map"><div class="map-heading"><h3>Recorded path</h3><div class="row"><button class="secondary" aria-label="Zoom recorded map out" :disabled="zoom <= 1" @click="zoom = Math.max(1, zoom - 0.5)">−</button><button class="secondary" aria-label="Zoom recorded map in" :disabled="zoom >= 4" @click="zoom = Math.min(4, zoom + 0.5)">+</button></div></div><p v-if="!canOverlay" class="notice">{{ mapMessage }}<button class="secondary" @click="emit('setup')">Map setup</button></p><p v-else>School map overlay · alignment checked to {{ alignment!.toFixed(1) }} m. GPS distance is an estimate.</p><div v-if="canOverlay" class="map-scroll"><div :style="{ width: `${zoom * 100}%` }"><CampusMapCanvas :map="map!" :nodes="[...graph.nodes, ...previewNodes]" :edges="graph.edges" :route="overlay" :route-status="validationErrors.length ? 'invalid' : record.status === 'validated' || record.status === 'published' ? 'selected' : 'review'" :user="active ? rawFix : null" /></div></div><div v-else class="map-scroll"><div :style="{ width: `${zoom * 100}%` }"><RecordedGpsTrace :points="record.points" /></div></div><p v-if="canOverlay" class="helper">Blue: selected route · Green: checked network · Orange: needs review · Red: closed</p></section>
  <details v-if="!active && !preparing" class="gps-settings"><summary>GPS recording settings</summary><p>Defaults suit outdoor walking. Poor GPS never adds distance automatically. Changes apply to the next recording.</p><label>Good accuracy (m)<input v-model.number="config.goodAccuracy" type="number" min="1" max="30" /></label><label>Maximum accepted accuracy (m)<input v-model.number="config.maxAccuracy" type="number" min="3" max="50" /></label><label>Minimum movement (m)<input v-model.number="config.minMovement" type="number" min="1" max="15" /></label><label>Maximum walking speed (m/s)<input v-model.number="config.maxSpeed" type="number" min="1" max="5" step="0.1" /></label></details>
</section>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { App } from '@capacitor/app';
import type { Building } from '../types';
import { useSession } from '../stores/session';
import { describeError } from '../lib/errors';
import { saveRecording, publishRecording, loadPublishedNetwork } from '../services/outdoor-recordings';
import RecordedGpsTrace from './RecordedGpsTrace.vue';
import CampusMapCanvas from '../../../shared/CampusMapCanvas.vue';
import { gpsToImage, validImagePoint, alignmentError, type CampusMap } from '../../../shared/campus-map';
import { validPoint, metersBetween, type OutdoorGraph } from '../../../shared/outdoor-graph';
import { acceptFix, createRecording, DEFAULT_GPS_CONFIG, validConfig, markTurn, nearbyConnections, recordedDistance, recordingNetwork, removeFix, restoreRecording, validateRecording, type Direction, type Fix, type Recording } from '../../../shared/gps-recording';
import { readRouteDraft, writeRouteDraft } from '../../../shared/route-drafts';
const props = defineProps<{ building?: Building; graph: OutdoorGraph; map?: CampusMap }>();
const emit = defineEmits<{ network: [graph: OutdoorGraph]; setup: []; destination: [id: string]; activity: [active: boolean]; review: [active: boolean] }>();
const session = useSession(), owner = session.state.userId;
const key = `outdoor-gps:${owner || 'signed-out'}`;
const record = ref<Recording | null>(null), recovery = ref<Recording | null>(null), config = ref({ ...DEFAULT_GPS_CONFIG });
const phase = ref<'idle' | 'recording' | 'paused' | 'review'>('idle'), preparing = ref(false), busy = ref(false);
const positionReliable = ref(false), checkpointError = ref('');
const rawFix = ref<Fix | null>(null), quality = ref('unavailable'), gpsMessage = ref('GPS will start when you begin recording.');
const error = ref(''), storageError = ref(''), cameraMessage = ref(''), syncMessage = ref('');
const video = ref<HTMLVideoElement>(), tick = ref(Date.now()), direction = ref<Direction>('straight');
const validationErrors = ref<string[]>([]), checks = ref({ walked: false, overlaps: false, alignment: false });
const sharedStart = ref(''), sharedEnd = ref(''), editIndex = ref(1), zoom = ref(1);
const active = computed(() => phase.value === 'recording');
const canStart = computed(() => session.canManageContent.value && owner && props.building && props.building.entrance_lat != null && props.building.entrance_lng != null && validPoint({ latitude: props.building.entrance_lat, longitude: props.building.entrance_lng }));
let stream: MediaStream | null = null, watchId: string | null = null, generation = 0, alive = true, resumed = false;
let runAt = 0, appListener: PluginListenerHandle | undefined, timer: ReturnType<typeof setInterval> | undefined;
let writes: Promise<void> = Promise.resolve();
const elapsed = computed(() => (record.value?.elapsed || 0) + (active.value ? Math.max(0, tick.value - runAt) : 0));
const duration = computed(() => { const seconds = Math.floor(elapsed.value / 1000); return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`; });
const distance = computed(() => record.value ? recordedDistance(record.value.points) : 0);
const segmentDistance = computed(() => record.value ? recordedDistance(record.value.points.slice(record.value.checkpoints.at(-1)?.index || 0)) : 0);
const directionText = computed(() => ({ straight: '↑ Straight', left: '← Turn Left', right: '→ Turn Right' })[direction.value]);
const signalLabel = computed(() => preparing.value ? 'Getting GPS signal' : phase.value === 'review' ? 'Recording finished' : phase.value === 'paused' ? 'Recording paused' : !active.value ? 'Not recording' : !rawFix.value || tick.value - rawFix.value.timestamp > (record.value?.config.maxAge || config.value.maxAge) ? 'GPS unavailable' : quality.value === 'unavailable' ? 'GPS unavailable' : quality.value === 'good' ? 'Good GPS signal' : quality.value === 'reduced' ? 'Reduced accuracy' : 'Unreliable GPS');
const statusLabel = computed(() => active.value ? 'Recording actual GPS movement' : phase.value === 'paused' ? 'Paused · resume at your last recorded position' : 'Review before publishing');
const displayMessage = computed(() => phase.value === 'review' ? 'Recording finished. GPS tracking is stopped; your recorded path is kept for review.' : !record.value && !preparing.value ? 'GPS will start when you begin recording.' : gpsMessage.value);
const alignment = computed(() => props.map ? alignmentError(props.map) : null);
const insideMap = computed(() => !!props.map && props.map.anchors.length === 3 && !!record.value?.points.length && record.value.points.every(p => { const image = gpsToImage(props.map!, p); return image && validImagePoint(image); }));
const canOverlay = computed(() => insideMap.value && alignment.value != null && alignment.value <= (record.value?.config.maxAlignmentError || config.value.maxAlignmentError));
const mapMessage = computed(() => !props.map || props.map.anchors.length !== 3 ? 'School map is not aligned yet. Your recorded GPS path is shown below.' : !insideMap.value ? 'This recording is outside the aligned school map. Check your location and map setup before publishing.' : 'School map alignment needs checking. Your GPS path is shown separately below.');
function instructionDistance(index: number) { if (!record.value) return 0; const from = record.value.checkpoints[index].index, to = record.value.checkpoints[index + 1]?.index ?? record.value.points.length - 1; return recordedDistance(record.value.points.slice(from, to + 1)); }
const overlay = computed<[number, number][]>(() => record.value && canOverlay.value ? record.value.points.map(p => [p.longitude, p.latitude]) : []);
const previewNodes = computed(() => record.value ? record.value.checkpoints.flatMap((c, i) => { const p = record.value!.points[c.index]; return p ? [{ ...p, id: `checkpoint-${i}`, name: i === 0 ? 'Start' : `${i}: ${c.direction}`, entrance: false }] : []; }).concat(record.value.points.length ? [{ ...record.value.points.at(-1)!, id: 'recorded-end', name: 'End', entrance: true }] : []) : []);
const nearby = computed(() => record.value ? nearbyConnections(record.value, props.graph) : []);
const startCandidates = computed(() => nearby.value.filter(n => record.value?.points[0] && metersBetween(n, record.value.points[0]) <= 8));
const endCandidates = computed(() => nearby.value.filter(n => n.entrance && record.value?.points.at(-1) && metersBetween(n, record.value.entrance) <= 8 && metersBetween(n, record.value.points.at(-1)!) <= 8));
const entranceStatus = computed(() => record.value?.points.length ? `Endpoint is ${metersBetween(record.value.points.at(-1)!, record.value.entrance).toFixed(1)} m from the saved entrance.` : 'No accepted GPS points yet.');
function coordinate(p?: Fix) { return p ? `${p.latitude.toFixed(6)}, ${p.longitude.toFixed(6)}` : '—'; }
function invalidate() { if (record.value && record.value.status !== 'published') { record.value.status = 'draft'; validationErrors.value = []; syncMessage.value = ''; void persist(); } }
async function persist() {
  if (!owner || !record.value) return;
  const snapshot = JSON.parse(JSON.stringify({ ...record.value, elapsed: elapsed.value }));
  writes = writes.catch(() => {}).then(() => writeRouteDraft(key, snapshot));
  try { await writes; storageError.value = ''; } catch { storageError.value = 'Local recovery storage failed. Keep this page open and save to Supabase when connected.'; }
}
async function saveLocalDraft() { await persist(); if (!storageError.value) syncMessage.value = 'Draft saved on this device. It is not published.'; }
function resetFeedback() { rawFix.value = null; positionReliable.value = false; quality.value = 'unavailable'; checkpointError.value = ''; gpsMessage.value = 'GPS will start when you begin recording.'; error.value = ''; cameraMessage.value = ''; syncMessage.value = ''; validationErrors.value = []; direction.value = 'straight'; }
function release() {
  generation++; preparing.value = false; positionReliable.value = false;
  if (watchId) { void Geolocation.clearWatch({ id: watchId }).catch(() => {}); watchId = null; }
  stream?.getTracks().forEach(t => { t.onended = null; t.stop(); }); stream = null;
  if (video.value) video.value.srcObject = null;
}
function pause() {
  if (active.value && record.value) { const ms = record.value.elapsed + Math.max(0, Date.now() - runAt); phase.value = 'paused'; record.value.elapsed = ms; }
  release(); phase.value = 'paused'; resumed = true; gpsMessage.value = 'Paused. No distance is recorded. Resume at the last recorded position.'; void persist();
}
async function start(resume = false) {
  if (preparing.value || active.value || !canStart.value) return;
  if (!validConfig(config.value)) { error.value = 'Check the GPS limits in recording settings.'; return; }
  if (!resume && record.value?.points.length && !window.confirm('Start a new recording? Save the current draft first.')) return;
  const b = props.building!;
  if (!resume) { record.value = createRecording(crypto.randomUUID(), b.id, b.name, { latitude: b.entrance_lat!, longitude: b.entrance_lng! }, Date.now(), config.value); checks.value = { walked: false, overlaps: false, alignment: false }; sharedStart.value = ''; sharedEnd.value = ''; direction.value = 'straight'; rawFix.value = null; }
  if (!record.value || record.value.buildingId !== b.id) { error.value = 'Select the recovered recording’s building before resuming.'; return; }
  invalidate(); resetFeedback(); direction.value = record.value.checkpoints.at(-1)?.direction || 'straight'; gpsMessage.value = 'Getting your current GPS position…'; preparing.value = true; resumed = resume; void persist();
  const request = ++generation;
  const current = () => alive && request === generation;
  try {
    if (Capacitor.isNativePlatform()) {
      const permission = await Geolocation.checkPermissions(); if (!current()) return;
      if (permission.location !== 'granted') { const granted = await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] }); if (granted.location !== 'granted') throw new Error('Enable precise location permission to record outdoor routes.'); }
    }
    const first = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    if (!current()) return;
    phase.value = 'recording'; runAt = Date.now(); tick.value = runAt; preparing.value = false;
    function receive(position: typeof first | null, reason?: unknown) {
      if (!current() || !active.value || !record.value) return;
      if (reason || !position) { positionReliable.value = false; quality.value = 'unavailable'; gpsMessage.value = 'GPS temporarily unavailable. Valid points are kept. Pause and retry if needed.'; return; }
      const fix: Fix = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, timestamp: position.timestamp };
      rawFix.value = fix;
      const result = acceptFix(record.value, fix, Date.now(), resumed); quality.value = result.quality; positionReliable.value = result.quality !== 'unreliable'; gpsMessage.value = result.message; if (positionReliable.value) checkpointError.value = '';
      if (result.accepted) { resumed = false; void persist(); }
    }
    receive(first);
    const id = await Geolocation.watchPosition({ enableHighAccuracy: true, maximumAge: 0, timeout: 20000, interval: 2000, minimumUpdateInterval: 1000 }, receive);
    if (!current()) { await Geolocation.clearWatch({ id }); return; } watchId = id;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('No camera API');
      const opened = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } });
      if (!current()) { opened.getTracks().forEach(t => t.stop()); return; } stream = opened;
      await nextTick(); if (video.value) { video.value.srcObject = opened; await video.value.play(); }
      opened.getVideoTracks().forEach(track => { track.onended = () => { if (current()) { pause(); cameraMessage.value = 'Camera disconnected. Resume to retry.'; } }; });
    } catch { if (current()) { stream?.getTracks().forEach(t => { t.onended = null; t.stop(); }); stream = null; cameraMessage.value = 'Camera unavailable. GPS recording continues. Enable camera permission and use HTTPS or localhost for a live preview.'; } }
  } catch (reason) {
    if (!current()) return;
    pause(); error.value = `${describeError(reason)} Turn on Location Services, grant precise location permission, then Resume.`;
  }
}
function checkpoint(next: Direction) {
  if (!active.value || !record.value) return;
  try {
    if (!positionReliable.value || !rawFix.value || Date.now() - rawFix.value.timestamp > record.value.config.maxAge) throw new Error('Wait for a fresh reliable GPS reading before marking a turn.');
    // A fresh stationary fix confirms the existing checkpoint location; it adds no movement.
    markTurn(record.value, next); direction.value = next; checkpointError.value = ''; void persist();
  } catch (reason) { checkpointError.value = (reason as Error).message; }
}
function finish() { if (!record.value) return; pause(); phase.value = 'review'; error.value = ''; checkpointError.value = ''; cameraMessage.value = ''; gpsMessage.value = 'Recording finished. Your recorded path is kept for review.'; void persist(); }
function cancel() { if (!window.confirm('Discard this recording and its local recovery draft?')) return; release(); phase.value = 'idle'; record.value = null; recovery.value = null; resetFeedback(); writes = writes.catch(() => {}).then(() => writeRouteDraft(key, null)).catch(() => { storageError.value = 'Could not delete local draft.'; }); }
function restore() { if (!recovery.value) return; resetFeedback(); record.value = recovery.value; rawFix.value = record.value.points.at(-1) || null; direction.value = record.value.checkpoints.at(-1)?.direction || 'straight'; recovery.value = null; phase.value = record.value.status === 'published' || record.value.syncPending ? 'review' : 'paused'; resumed = true; emit('destination', record.value.buildingId); gpsMessage.value = 'Draft recovered. Resume at the last recorded position, or finish to review.'; }
function addCheckpoint() { if (!record.value || record.value.checkpoints.some(c => c.index === editIndex.value) || editIndex.value <= 0 || editIndex.value >= record.value.points.length - 1) { error.value = 'Choose an intermediate point without an existing checkpoint.'; return; } record.value.checkpoints.push({ index: editIndex.value, direction: 'straight' }); record.value.checkpoints.sort((a,b) => a.index-b.index); invalidate(); }
function removePoint() { if (!record.value) return; try { removeFix(record.value, editIndex.value); invalidate(); void persist(); } catch (reason) { error.value = (reason as Error).message; } }
function retrySection() { if (!record.value || !window.confirm('Discard points after this point? Return physically to the selected point before resuming.')) return; record.value.points = record.value.points.slice(0, editIndex.value + 1); record.value.checkpoints = record.value.checkpoints.filter(c => c.index <= editIndex.value); record.value.good = record.value.points.filter(p => p.accuracy <= record.value!.config.goodAccuracy).length; record.value.reduced = record.value.points.length - record.value.good; invalidate(); phase.value = 'paused'; resumed = true; void persist(); }
function validate() {
  if (!record.value) return;
  validationErrors.value = validateRecording(record.value, props.map, checks.value);
  const b = props.building;
  if (!b || b.id !== record.value.buildingId || b.entrance_lat !== record.value.entrance.latitude || b.entrance_lng !== record.value.entrance.longitude) validationErrors.value.push('The building entrance changed or another building is selected. Review the saved entrance.');
  if (!validationErrors.value.length) { try { recordingNetwork(record.value, props.graph, sharedStart.value, sharedEnd.value); record.value.status = 'validated'; syncMessage.value = 'Validated locally. Save to Supabase, then an administrator can publish.'; void persist(); } catch (reason) { validationErrors.value.push((reason as Error).message); } }
}
async function sync() {
  if (!record.value || !owner || busy.value || record.value.status === 'published') return;
  busy.value = true; error.value = ''; record.value.syncPending = true;
  try { const value = { ...record.value, status: record.value.status === 'validated' ? 'validated' as const : 'saved' as const }; await saveRecording(value, owner); record.value.status = value.status; record.value.syncPending = false; syncMessage.value = 'Saved to Supabase. Not published yet.'; await persist(); }
  catch (reason) { syncMessage.value = `Not synchronized: ${describeError(reason)}. Local draft kept. Retry Save to Supabase when connected.`; await persist(); }
  finally { busy.value = false; }
}
async function publish() {
  if (!record.value || !owner || busy.value || !session.isAdmin.value) return;
  validate(); if (record.value.status !== 'validated' || validationErrors.value.length) return;
  if (!window.confirm('Publish this checked network for mobile navigation? Confirm all included pathways have been surveyed.')) return;
  busy.value = true;
  try {
    const latest = await loadPublishedNetwork();
    if (latest && JSON.stringify([latest.nodes, latest.edges]) !== JSON.stringify([props.graph.nodes, props.graph.edges])) {
      if (!window.confirm('A newer published network is available. Load it for overlap review while keeping this GPS recording? Save any manual network edits first.')) throw new Error('Publication paused. Load and review the latest network before retrying.');
      emit('network', { ...latest, referenceMap: props.map || latest.referenceMap }); checks.value = { walked: false, overlaps: false, alignment: false }; invalidate();
      throw new Error('Network updated for review. Check nearby paths and validate again before publishing.');
    }
    const base = latest ? { ...latest, referenceMap: props.map || latest.referenceMap } : props.graph;
    const network = recordingNetwork(record.value, base, sharedStart.value, sharedEnd.value);
    await saveRecording(record.value, owner);
    const pkg = await publishRecording(record.value, network);
    record.value.status = 'published'; emit('network', pkg.graph); syncMessage.value = `Published version ${pkg.revision}. Mobile devices cache it when online for offline navigation.`; await persist();
  } catch (reason) { error.value = `Publish failed: ${describeError(reason)}. Local draft retained.`; } finally { busy.value = false; }
}
function online() { if (record.value?.syncPending && phase.value === 'review') void sync(); }
function hidden() { if (document.hidden && (active.value || preparing.value)) pause(); }
function pagehide() { if (active.value || preparing.value) pause(); }
function leaving(event: BeforeUnloadEvent) { if (active.value || preparing.value) { pause(); event.preventDefault(); event.returnValue = ''; } }
watch(phase, value => emit('review', value === 'review'));
watch([active, preparing, busy], () => emit('activity', active.value || preparing.value || busy.value));
watch(() => props.map, () => { if (record.value?.status === 'validated') invalidate(); }, { deep: true });
watch(() => props.building?.id, id => { if (record.value && id !== record.value.buildingId && (active.value || preparing.value)) pause(); });
const unsubscribe = session.onCleared(() => { if (active.value || preparing.value) pause(); release(); record.value = null; recovery.value = null; phase.value = 'idle'; resetFeedback(); });
onBeforeRouteLeave(() => { if (busy.value) { error.value = 'Wait for the current save or publication to finish.'; return false; } if ((active.value || preparing.value) && !window.confirm('Pause recording and leave? A local recovery draft will be kept.')) return false; if (active.value || preparing.value) pause(); });
onMounted(async () => {
  timer = setInterval(() => { tick.value = Date.now(); if (active.value && record.value && Math.floor(elapsed.value / 1000) % 5 === 0) void persist(); }, 1000);
  document.addEventListener('visibilitychange', hidden); window.addEventListener('beforeunload', leaving); window.addEventListener('pagehide', pagehide); window.addEventListener('online', online);
  try { const value = owner ? await readRouteDraft(key) : null; if (alive && value) recovery.value = restoreRecording(value); } catch { if (owner) storageError.value = 'Draft recovery unavailable. Check browser storage before recording.'; }
  if (Capacitor.isNativePlatform()) { const listener = await App.addListener('appStateChange', state => { if (!state.isActive && (active.value || preparing.value)) pause(); }); if (!alive) void listener.remove(); else appListener = listener; }
});
onBeforeUnmount(() => { if (active.value || preparing.value) pause(); else void persist(); alive = false; release(); unsubscribe(); clearInterval(timer); void appListener?.remove(); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('beforeunload', leaving); window.removeEventListener('pagehide', pagehide); window.removeEventListener('online', online); });
</script>
<style scoped>
.gps-recorder { background:#fff; border:1px solid #dce5ef; border-radius:14px; padding:20px; margin-bottom:18px; color:#18324e; }header,.review-title,.map-heading { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }.eyebrow { font-size:10px; color:#61758b; letter-spacing:.1em; font-weight:750; }h2 { font-size:22px; margin:6px 0; }h3 { font-size:16px; margin:8px 0; }p { font-size:13px; line-height:1.6; }button { border:1px solid #2563eb; border-radius:9px; background:#2563eb; color:white; font-size:13px; font-weight:650; padding:11px 14px; min-height:46px; cursor:pointer; }button:disabled { opacity:.45; cursor:not-allowed; }.secondary { background:#fff; color:#25496d; border-color:#cdd9e7; }.cancel { background:transparent; color:#a33345; border-color:transparent; }.signal,.state { padding:6px 9px; border-radius:20px; font-size:11px; background:#edf2f7; white-space:nowrap; }.good { color:#0c6b4e; background:#e5f6ed; }.reduced { color:#855000; background:#fff0d2; }.unreliable { color:#a52c36; background:#ffe7e9; }.entrance { padding:12px; background:#f3f7fc; border-radius:9px; }.entrance small { display:block; color:#61758b; margin-top:4px; }.camera-panel { position:relative; min-height:330px; border-radius:12px; overflow:hidden; background:#0c2036; color:white; display:flex; flex-direction:column; justify-content:space-between; }video { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }.camera-top,.camera-direction,.camera-note { position:relative; z-index:1; }.camera-top { display:flex; justify-content:space-between; padding:14px; background:#0b2039a6; font-size:13px; }.camera-direction { display:grid; text-align:center; gap:6px; align-self:center; background:#0b2039d9; border-radius:12px; padding:18px 24px; margin:22px; }.camera-direction b { font-size:40px; font-variant-numeric:tabular-nums; }.camera-direction small { font-size:22px; }.camera-direction span,.camera-note { font-size:11px; }.camera-note { background:#0b2039bf; margin:0; padding:10px; text-align:center; }.metrics { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin:14px 0; }.metrics div { padding:10px; border:1px solid #e2e9f1; border-radius:9px; }.metrics strong,.metrics span { display:block; }.metrics strong { font-size:17px; }.metrics span { color:#61758b; font-size:10px; margin-top:4px; }.location,.gps-message,.helper { color:#61758b; font-size:12px; }.directions { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; margin:12px 0; }.directions button { color:#174d91; background:#edf4ff; border-color:#cadbf5; }.record-actions,.review-actions,.row { display:flex; flex-wrap:wrap; gap:8px; }.record-actions > button { flex:1; }.start-button { width:100%; margin-top:10px; }.start-area p { color:#61758b; font-size:12px; }.error { color:#a32c39; background:#fff0f1; padding:12px; border-radius:8px; font-size:13px; }.notice { background:#fff7e6; color:#775a24; padding:12px; border-radius:8px; }.review { border-top:1px solid #e1e8f1; margin-top:18px; padding-top:16px; }.checks label { display:flex; align-items:flex-start; gap:10px; font-size:12px; line-height:1.6; margin:12px 0; }input[type=checkbox] { width:20px; height:20px; min-height:20px; margin:0; flex:0 0 20px; accent-color:#2563eb; }label { display:block; font-size:12px; margin:10px 0; }select,input[type=number] { display:block; width:100%; box-sizing:border-box; min-height:44px; border:1px solid #cdd9e7; border-radius:8px; padding:8px; margin-top:6px; font-size:14px; background:white; color:#18324e; }.instruction-summary { padding:12px 12px 12px 32px; background:#f4f7fc; border-radius:9px; font-size:13px; line-height:1.9; }.instruction-summary span { color:#61758b; }.signal.inactive { background:#edf2f7; color:#526880; }.review-editor { border:0; padding:0; margin:0; min-width:0; }.turn-list { padding-left:22px; }.turn-list li { display:grid; grid-template-columns:2fr 1fr; gap:12px; }details { margin-top:16px; }summary { cursor:pointer; font-size:13px; font-weight:650; }.map-scroll { overflow:auto; max-height:65vh; border:1px solid #dce5ef; border-radius:10px; }.map-scroll > div { min-width:100%; }.recorded-map { margin-top:20px; }.map-heading { align-items:center; }.recovery { background:#eef5ff; border:1px solid #c9dcfb; border-radius:10px; padding:14px; margin-bottom:16px; }.gps-settings { border-top:1px solid #e1e8f1; padding-top:14px; }button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible { outline:3px solid #93b4ff; outline-offset:2px; }
@media(max-width:600px) { .gps-recorder { padding:14px; }header { flex-direction:column; gap:4px; }h2 { font-size:20px; }.metrics { grid-template-columns:repeat(2,1fr); }.directions button { padding:10px 4px; font-size:12px; }.record-actions { display:grid; grid-template-columns:1fr 1.5fr; }.record-actions .cancel { grid-column:1/-1; }.review-actions { display:grid; grid-template-columns:1fr 1fr; }.review-actions button { padding:10px 6px; font-size:12px; }select,input[type=number] { font-size:16px; } }
</style>
