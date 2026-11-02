<template>
  <section class="card editor" aria-label="Destination editor">
    <header class="editor-header">
      <div><span class="eyebrow">DESTINATION ROUTE</span><h2>{{ destination ? 'Edit route' : 'Add Destination' }}</h2><p>{{ destination?.name || 'Build a route from the entrance to your room.' }}</p></div>
      <span class="state-pill" :class="{ active: recording }"><span aria-hidden="true">●</span> {{ recording ? 'Recording' : paused ? 'Paused' : 'Draft route' }}</span>
    </header>
    <p class="intro">Start at the named building entrance. Each direction is relative to the previous segment. Same-floor routes only.</p>
    <p v-if="error" class="notice error" role="alert">{{ error }}</p>
    <div class="workspace">
    <section class="setup-panel">
    <h3><span class="section-number">01</span> Prepare your walk</h3>
    <fieldset :disabled="busy || recording">
      <label v-if="!destination">Destination ID <input v-model="id" maxlength="120" /></label>
      <label v-if="!destination">Room
        <select v-model="roomId"><option value="">Choose a room</option><option v-for="room in rooms" :key="room.id" :value="room.id">{{ buildings.find(b => b.id === room.building_id)?.name }} / {{ room.name }} {{ room.room_number }}</option></select>
      </label>
      <div class="entrance-card"><span class="eyebrow">STARTING POINT</span><strong>{{ building?.entrance_name || 'Set the building entrance name first' }}</strong><small>{{ building?.name || 'Choose a linked room to get started' }}</small></div>
      <label class="entrance-check"><input v-model="atEntrance" type="checkbox" /> <span>I am at this entrance and facing the first corridor.</span></label>
      <label class="stride-field">Calibrated meters per walking step <input v-model.number="stride" type="number" min="0.2" max="1.5" step="0.01" /><small>Use your measured walking step length.</small></label>
    </fieldset>
    </section>
    <section class="recorder-panel">
    <h3><span class="section-number">02</span> Record your route</h3>
    <div class="distance-display"><strong>{{ meters.toFixed(2) }}<span> m</span></strong><span>Current segment · estimated distance</span></div>
    <div class="record-actions">
      <button v-if="!recording" type="button" :disabled="!!recordDisabledReason" :aria-describedby="recordDisabledReason ? 'recording-help' : undefined" @click="start">{{ paused ? 'Resume recording' : 'Start recording' }}</button>
      <template v-else>
        <button class="secondary" type="button" @click="pause">Pause</button>
        <button type="button" @click="finish">Finish recording</button>
      </template>
      <button v-if="paused" type="button" @click="finish">Finish recording</button>
      <button v-if="recording || paused" class="cancel-recording" type="button" @click="cancelRecording">Cancel recording</button>
    </div>
    <p v-if="!recording && recordDisabledReason" id="recording-help" class="notice">{{ recordDisabledReason }}</p>
    <p class="record-status" aria-live="polite">{{ status }} {{ headingChange === null ? '' : `Heading change: ${headingChange}° (estimate)` }}</p>
    <div v-if="recording" class="turn-actions">
      <button type="button" @click="mark('straight')">Checkpoint</button>
      <button type="button" @click="mark('left')">Turn left</button>
      <button type="button" @click="mark('right')">Turn right</button>
    </div>
    <p class="record-hint">Keep your phone steady and mark each turn at the corner. Review estimated distances before saving.</p>
    </section>
    </div>
    <section class="route-panel">
    <div class="route-heading"><h3><span class="section-number">03</span> Review route segments</h3><span>{{ steps.length }} / 50 segments</span></div>
    <p v-if="!steps.length" class="route-empty">Your route starts here. Record a walk or add segments manually.</p>
    <fieldset :disabled="busy || recording || paused">
      <div v-for="(step, index) in steps" :key="index" class="segment">
        <label>Segment {{ index + 1 }} direction <select v-model="step.direction"><option>straight</option><option>left</option><option>right</option></select></label>
        <label>Meters <input v-model.number="step.distance" type="number" min="0.01" max="500" step="0.01" /></label>
        <button type="button" :disabled="index === 0" aria-label="Move segment up" @click="move(index, -1)">↑</button>
        <button type="button" :disabled="index === steps.length - 1" aria-label="Move segment down" @click="move(index, 1)">↓</button>
        <button class="remove-segment" type="button" @click="steps.splice(index, 1)">Remove</button>
      </div>
      <button class="secondary add-segment" type="button" :disabled="steps.length >= 50" @click="steps.push({ direction: 'straight', distance: 1 })">Add segment</button>
    </fieldset>
    </section>
    <footer class="editor-footer">
    <p><strong>Saved as a draft</strong><span>Verify the route on site before publishing.</span></p>
    <div class="footer-actions">
      <button type="button" :disabled="busy || recording || paused" @click="save">{{ busy ? 'Saving…' : 'Save inactive draft' }}</button>
      <button class="secondary" type="button" :disabled="busy" @click="close">Close</button>
    </div>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import type { Building, DestinationRecord, Room } from '@/types';
import { destinationPayload, validatedRoute, WalkingPeaks, type EditableStep } from '@/lib/route-editor';
import { createDestination, saveDestinationRoute } from '@/services/campus';
import { describeError } from '@/lib/errors';
import { useSession } from '@/stores/session';

const props = defineProps<{ rooms: Room[]; buildings: Building[]; destination?: DestinationRecord; initialRoom?: string }>();
const emit = defineEmits<{ saved: [DestinationRecord]; close: [] }>();
const id = ref(props.destination?.id ?? crypto.randomUUID());
const roomId = ref(props.destination?.room_id ?? props.initialRoom ?? '');
const building = computed(() => props.buildings.find(b => b.id === props.rooms.find(r => r.id === roomId.value)?.building_id));
const steps = ref<EditableStep[]>((props.destination?.indoor_route ?? []).map(s => ({ direction: String(s.direction), distance: Number(s.distance) })));
const error = ref('');
const busy = ref(false);
const recording = ref(false);
const paused = ref(false);
const atEntrance = ref(false);
const recordDisabledReason = computed(() => {
  if (busy.value) return 'Wait for the destination to finish saving.';
  if (!roomId.value) return 'Link this destination to a room and save the link before recording. You can still edit its route manually.';
  if (!building.value) return 'The linked room or building could not be found. Check the room link before recording.';
  if (!building.value.entrance_name?.trim()) return 'Open Buildings, edit this room’s building, and save its entrance name before recording.';
  if (!atEntrance.value) return 'At the named entrance, face the first corridor and check “I am at this entrance and facing the first corridor” to enable recording.';
  return '';
});
const stride = ref(0.7);
const meters = ref(0);
const status = ref('Manual entry is available without sensors.');
const headingChange = ref<number | null>(null);
let initialAlpha: number | null = null;
const session = useSession();
const draftKey = `route-draft:${session.state.userId}:${props.destination?.id ?? 'new'}`;
try {
  const raw = sessionStorage.getItem(draftKey);
  if (raw) {
    const draft = JSON.parse(raw);
    if (typeof draft.id === 'string' && typeof draft.roomId === 'string' && Array.isArray(draft.steps)) {
      id.value = draft.id; roomId.value = draft.roomId;
      steps.value = draft.steps.slice(0, 50).filter((s: EditableStep) => s && typeof s.direction === 'string' && typeof s.distance === 'number');
      status.value = 'Recovered unsaved draft. Check all segments before saving.';
    }
  }
} catch { /* Storage can be unavailable; the editor still works in memory. */ }
function persist() {
  try {
    const pending = meters.value > 0 ? [{ direction, distance: meters.value }] : [];
    sessionStorage.setItem(draftKey, JSON.stringify({ id: id.value, roomId: roomId.value, steps: [...steps.value, ...pending] }));
  } catch { /* Saving to Supabase remains available. */ }
}
let direction = 'straight';
let peaks = new WalkingPeaks();
let sensorTimer: ReturnType<typeof setTimeout> | undefined;
let samples = 0;
let generation = 0;
let beforeRecording: EditableStep[] = [];
watch([id, roomId, steps, meters], persist, { deep: true });
watch(roomId, () => { atEntrance.value = false; });

function motion(event: DeviceMotionEvent) {
  const a = event.acceleration;
  if (a?.x == null || a.y == null || a.z == null) return;
  samples++;
  if (peaks.sample(Math.hypot(a.x, a.y, a.z), performance.now())) meters.value = Math.round((meters.value + stride.value) * 100) / 100;
}
function orientation(event: DeviceOrientationEvent) {
  if (event.alpha === null || !Number.isFinite(event.alpha)) return;
  if (initialAlpha === null) initialAlpha = event.alpha;
  headingChange.value = Math.round(((initialAlpha - event.alpha + 540) % 360) - 180);
}
function stop() {
  generation++;
  clearTimeout(sensorTimer);
  window.removeEventListener('devicemotion', motion);
  window.removeEventListener('deviceorientation', orientation);
  recording.value = false;
}
async function start() {
  error.value = '';
  if (!atEntrance.value || !building.value?.entrance_name) return;
  if (!Number.isFinite(stride.value) || stride.value < 0.2 || stride.value > 1.5) { error.value = 'Calibrate a step length between 0.2 and 1.5 meters.'; return; }
  const request = ++generation;
  try {
    if (!('DeviceMotionEvent' in window)) throw new Error('Motion sensors unavailable. Enter the route manually.');
    const api = DeviceMotionEvent as typeof DeviceMotionEvent & { requestPermission?: () => Promise<string> };
    if (api.requestPermission && await api.requestPermission() !== 'granted') throw new Error('Motion permission denied. Manual entry is available.');
    const orientationApi = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> };
    if (orientationApi?.requestPermission) await orientationApi.requestPermission();
    if (request !== generation) return;
    if (!paused.value) {
      beforeRecording = steps.value.map(s => ({ ...s }));
      steps.value = []; meters.value = 0; direction = 'straight';
    }
    paused.value = false; recording.value = true; samples = 0; peaks = new WalkingPeaks();
    window.addEventListener('devicemotion', motion);
    initialAlpha = null; headingChange.value = null;
    window.addEventListener('deviceorientation', orientation);
    status.value = 'Recording estimated steps. Mark turns at each corner.';
    sensorTimer = setTimeout(() => {
      if (!samples) { pause(); status.value = 'No usable motion samples. Check device support or finish and enter distances manually.'; }
    }, 4000);
  } catch (err) { error.value = err instanceof Error ? err.message : 'Cannot start sensors.'; }
}
function pause() { stop(); paused.value = true; status.value = 'Paused. Return to the same position and facing before resuming.'; }
function mark(next: string) {
  if (meters.value <= 0) { error.value = 'Walk a segment first, or finish and enter it manually.'; return false; }
  if (steps.value.length >= 50) { pause(); error.value = 'Maximum 50 segments. Review the route.'; return false; }
  steps.value.push({ direction, distance: meters.value }); meters.value = 0; direction = next; error.value = ''; return true;
}
function finish() { if (meters.value > 0 && !mark('straight')) return; stop(); paused.value = false; status.value = 'Review directions and measured distances before saving.'; }
function cancelRecording() { stop(); paused.value = false; meters.value = 0; steps.value = beforeRecording.map(s => ({ ...s })); status.value = 'Recording cancelled; previous editor route restored.'; }
function move(index: number, delta: number) { const target = index + delta; [steps.value[index], steps.value[target]] = [steps.value[target], steps.value[index]]; }
function close() { if (!window.confirm('Close this editor? An unsaved draft is kept in this tab for recovery.')) return; stop(); persist(); emit('close'); }
async function save() {
  busy.value = true; error.value = '';
  try {
    let saved: DestinationRecord;
    if (props.destination) saved = await saveDestinationRoute(props.destination.id, validatedRoute(steps.value));
    else {
      const room = props.rooms.find(r => r.id === roomId.value);
      if (!room || !building.value) throw new Error('Choose a room with a building.');
      saved = await createDestination(destinationPayload(id.value, room, building.value, steps.value));
    }
    try { sessionStorage.removeItem(draftKey); } catch { /* Storage may be disabled. */ }
    emit('saved', saved);
  } catch (err) { error.value = err instanceof Error ? err.message : describeError(err); }
  finally { busy.value = false; }
}
function visibility() { if (document.hidden && recording.value) pause(); }
function leaving(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = ''; }
onBeforeRouteLeave(() => { stop(); persist(); return !busy.value && window.confirm('Leave the route editor? An unsaved draft is kept in this tab.'); });
const unsubscribe = session.onCleared(() => { stop(); try { sessionStorage.removeItem(draftKey); } catch { /* Storage may be disabled. */ } emit('close'); });
document.addEventListener('visibilitychange', visibility);
window.addEventListener('pagehide', pause);
window.addEventListener('beforeunload', leaving);
onBeforeUnmount(() => { stop(); unsubscribe(); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', pause); window.removeEventListener('beforeunload', leaving); });
</script>

<style scoped>
.editor { padding: 0; margin: 16px 0 24px; overflow: hidden; border: 1px solid #dce5f0; color: #16304d; }
.editor-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 24px 28px; background: #f7faff; border-bottom: 1px solid #e4ebf4; }
.eyebrow { display: block; font-size: 10px; font-weight: 800; letter-spacing: .12em; color: #58718e; }
.editor-header h2 { margin: 6px 0; font-size: 24px; letter-spacing: -.6px; }
.editor-header p { margin: 0; color: #687e95; font-size: 13px; }
.state-pill { display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; border: 1px solid #d8e4f3; background: white; color: #546c87; padding: 7px 12px; border-radius: 999px; font-size: 12px; font-weight: 700; }
.state-pill.active { color: #067647; background: #ecfdf3; border-color: #a6eac6; }
.intro { margin: 0; padding: 16px 28px 0; font-size: 13px; color: #687e95; }
.editor > .notice { margin: 16px 28px; }
.workspace { display: grid; grid-template-columns: minmax(240px, .85fr) minmax(0, 1.15fr); gap: 22px; padding: 22px 28px; }
.setup-panel, .recorder-panel { min-width: 0; border: 1px solid #e0e8f2; border-radius: 14px; padding: 20px; }
.recorder-panel { background: #f8fbff; }
h3 { display: flex; align-items: center; gap: 9px; margin: 0 0 18px; font-size: 14px; font-weight: 750; }
.section-number { display: inline-grid; place-items: center; width: 26px; height: 26px; border-radius: 8px; background: #e8f0ff; color: #2563eb; font-size: 11px; }
fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
label { display: block; margin: 12px 0; font-size: 12px; font-weight: 600; color: #526880; }
label input, label select { margin-top: 7px; min-height: 42px; font-size: 14px; }
.entrance-card { display: grid; gap: 7px; padding: 14px; background: #f1f6fc; border-radius: 10px; }
.entrance-card strong { font-size: 15px; }
.entrance-card small, .stride-field small { color: #70849a; font-size: 11px; }
.entrance-check { display: flex; gap: 10px; align-items: flex-start; padding: 12px 0; line-height: 1.6; }
.entrance-check input[type=checkbox] { flex: 0 0 18px; width: 18px; height: 18px; min-height: 0; margin: 1px 0 0; accent-color: #2563eb; }
.stride-field { margin: 0; }
.stride-field input { max-width: 160px; display: block; }
.stride-field small { display: block; margin-top: 6px; }
.distance-display { display: grid; justify-items: center; gap: 5px; padding: 12px 0 22px; }
.distance-display > strong { font-size: 48px; font-variant-numeric: tabular-nums; line-height: 1.1; letter-spacing: -2px; color: #153d73; }
.distance-display strong span { font-size: 20px; letter-spacing: 0; font-weight: 500; color: #8196af; }
.distance-display > span { font-size: 11px; color: #70849a; }
.record-actions, .footer-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.editor button { min-height: 40px; font-size: 12px; padding: 9px 15px; border-radius: 9px; }
.record-actions .cancel-recording { flex-basis: 100%; background: transparent; border-color: transparent; color: #8c5661; min-height: 30px; padding: 4px; }
.record-status { font-size: 12px; color: #4a6685; line-height: 1.6; text-align: center; margin: 14px 0; }
.record-hint { color: #7b8ca0; font-size: 11px; line-height: 1.6; margin: 14px 0 0; }
.turn-actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.turn-actions button { background: #fff; border: 1px solid #cadbf0; color: #205da8; padding: 12px 6px; }
.route-panel { margin: 0 28px 24px; border-top: 1px solid #e4ebf4; padding-top: 22px; }
.route-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
.route-heading h3 { margin: 0; }
.route-heading > span { font-size: 11px; color: #7b8ca0; }
.route-empty { padding: 22px 16px; border: 1px dashed #cedcec; border-radius: 10px; text-align: center; font-size: 12px; color: #7b8ca0; background: #fafcff; }
.segment { display: flex; flex-wrap: wrap; align-items: end; gap: 8px; padding: 12px; margin-bottom: 8px; background: #f7faff; border: 1px solid #e4ebf4; border-radius: 10px; }
.segment label { flex: 1 1 130px; margin: 0; }
.segment button { background: #fff; border: 1px solid #dce5f0; color: #526880; }
.segment .remove-segment { color: #a84254; }
.add-segment { margin-top: 8px; }
.editor-footer { border-top: 1px solid #e4ebf4; background: #f8faff; padding: 18px 28px; display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.editor-footer p { display: grid; gap: 4px; margin: 0; font-size: 12px; }
.editor-footer p span { font-size: 11px; color: #7b8ca0; }
.footer-actions { flex-direction: row-reverse; }
@media (max-width: 900px) {
  .workspace { grid-template-columns: 1fr; padding: 16px; gap: 14px; }
  .editor-header { padding: 20px 16px; }
  .intro { padding: 14px 16px 0; }
  .route-panel { margin: 0 16px 18px; }
  .editor-footer { padding: 16px; flex-direction: column; align-items: stretch; }
  .footer-actions { justify-content: stretch; }
  .footer-actions button { flex: 1; }
  .setup-panel, .recorder-panel { padding: 16px; }
}
@media (max-width: 440px) {
  .editor-header { align-items: flex-start; }
  .editor-header h2 { font-size: 21px; }
  .state-pill { font-size: 10px; padding: 6px 8px; }
  .route-heading { align-items: flex-start; }
  .route-heading > span { white-space: nowrap; }
}
</style>
