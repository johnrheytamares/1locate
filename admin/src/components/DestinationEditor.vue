<template>
  <section class="card editor" aria-label="Destination editor">
    <div class="back-bar"><button class="secondary" type="button" :disabled="busy" @click="close">← Back to Destinations</button></div>
    <header class="editor-header">
      <div class="editor-title"><span class="eyebrow">DESTINATION ROUTE</span><h2>{{ destination ? 'Edit route' : 'Add Destination' }}</h2><p>{{ destination?.name || 'Build a route from the entrance to your room.' }}</p><span v-if="building" class="destination-context">{{ building.name }} · {{ floorName }}</span></div>
      <span class="state-pill" :class="{ active: recording }"><span class="state-dot" aria-hidden="true"></span> {{ starting ? 'Preparing' : recording ? 'Recording' : paused ? 'Paused' : 'Draft route' }}</span>
    </header>
    <p class="intro">Choose a room, calibrate once, then walk and mark the turns. Distance is estimated from real detected steps; review it before saving.</p>
    <p v-if="error" class="notice error" role="alert">{{ error }}</p>
    <div class="workspace" :class="{ 'is-recording': recording || paused || starting, 'manual-workspace': !recordingMode }">
    <section v-show="!recording && !paused && !starting" class="setup-panel">
    <h3><span class="section-number">01</span> Prepare your walk</h3>
    <fieldset :disabled="busy || recording || paused || starting">
      <details v-if="!destination"><summary>Advanced: destination ID</summary><label>Destination ID <input v-model="id" maxlength="120" /></label></details>
      <label v-if="!destination">Room
        <select v-model="roomId"><option value="">Choose a room</option><option v-for="room in rooms" :key="room.id" :value="room.id">{{ buildings.find(b => b.id === room.building_id)?.name }} / {{ room.name }} {{ room.room_number }}</option></select>
      </label>
      <div class="entrance-card">
        <svg class="entrance-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>
        <div><span class="eyebrow">STARTING POINT</span><strong>{{ building?.entrance_name || 'Set the building entrance name first' }}</strong><small>{{ building?.name || 'Choose a linked room to get started' }}</small></div>
      </div>
      <label v-if="recordingMode" class="entrance-check" :class="{ confirmed: atEntrance }"><input v-model="atEntrance" type="checkbox" /> <span><strong>I am at this entrance</strong><small>Facing the first corridor, ready to walk.</small></span></label>
      <IndoorStepCalibration v-if="recordingMode" :disabled="recording || paused || starting || busy" :user="session.state.userId || 'local'" @calibrated="calibrated" @activity="calibrating = $event" /><label v-if="recordingMode && availableFloors.length">Starting floor<select v-model="currentFloor" :disabled="recording || starting"><option value="">Choose starting floor</option><option v-for="floor in availableFloors" :key="floor.id" :value="floor.id">{{ floor.name }}</option></select></label><label v-if="recordingMode" class="stride-field"><span>Walking step length</span><span class="unit-input"><input :value="profile?.stride || ''" readonly type="number" min="0.2" max="1.5" step="0.01" inputmode="decimal" /><span aria-hidden="true">m / step</span></span><small>{{ profile ? 'Saved calibration on this device.' : 'Complete a measured calibration walk to enable automatic distance.' }}</small></label>
    </fieldset>
    </section>
    <section v-if="recordingMode" class="recorder-panel">
    <h3><span class="section-number">02</span> Record your route</h3>
    <div v-if="recording || paused || starting" ref="cameraPanel" class="camera-recorder">
      <video ref="video" autoplay muted playsinline aria-label="Live route recording camera" />
      <div class="camera-top">
        <strong>{{ destination?.name || linkedRoom?.name || 'New destination' }}</strong>
        <span>{{ building?.name }} · {{ floorName }}</span>
        <span>{{ starting ? 'Opening camera…' : paused ? 'Paused' : 'Recording' }} · Segment {{ steps.length + 1 }}</span>
      </div>
      <div class="camera-distance"><strong>{{ directionLabel }}</strong><b>{{ Number.isFinite(meters) ? meters.toFixed(2) : '—' }} m</b><span>{{ manual ? 'Manually measured distance' : 'Step-estimated distance' }}</span></div>
      <div class="camera-controls">
        <p v-if="error" role="alert">{{ error }}</p>
        <p v-if="cameraMessage" role="status">{{ cameraMessage }}</p>
        <p aria-live="polite">{{ status }}</p><p class="indoor-metrics">{{ (totalMeters + (Number.isFinite(meters) ? meters : 0)).toFixed(2) }} m total · {{ detectedSteps }} detected steps · {{ segmentSteps }} in this section</p><p class="sensor-status" role="status">{{ sensorStatus }}</p>
        <label class="manual-toggle"><input v-model="manual" type="checkbox" :disabled="starting" @change="changeDistanceMode" /> Enter measured distances manually</label>
        <label v-if="manual">Measured section distance (m) <input v-model.number="meters" type="number" min="0.01" max="500" step="0.01" :disabled="paused || starting" /></label>
        <p>{{ manual ? 'Enter an independently measured distance, then mark the next turn.' : 'Walk normally. Mark each turn when you reach it; distance updates from detected steps.' }}</p>
        <div class="turn-actions">
          <button type="button" :disabled="!recording" @click="mark('straight')">↑ Straight</button>
          <button type="button" :disabled="!recording" @click="mark('left')">← Turn Left</button>
          <button type="button" :disabled="!recording" @click="mark('right')">→ Turn Right</button>
        </div>
        <button v-if="availableFloors.length > 1 && recording" class="secondary" type="button" @click="beginFloorChange">Change floor</button><div v-if="floorChange" class="floor-transition"><p>Step tracking is paused. Use the stairs or elevator, then confirm the actual floor.</p><label v-if="!currentFloor">Starting floor<select v-model="currentFloor" :disabled="recording || starting"><option value="">Choose floor</option><option v-for="floor in availableFloors" :key="floor.id" :value="floor.id">{{ floor.name }}</option></select></label><label>How are you changing floors?<select v-model="transitionType"><option value="upstairs">Go Upstairs</option><option value="downstairs">Go Downstairs</option><option value="elevator">Use Elevator</option></select></label><label>Arriving floor<select v-model="transitionFloor"><option value="">Choose floor</option><option v-for="floor in availableFloors" :key="floor.id" :value="floor.id">{{ floor.name }}</option></select></label><button type="button" @click="confirmFloor">I have arrived at this floor</button></div>
        <div class="record-actions">
          <button class="secondary" type="button" :disabled="starting || floorChange" @click="paused ? start() : pause()">{{ paused ? 'Resume' : 'Pause' }}</button>
          <button type="button" :disabled="starting || floorChange" @click="finish">✓ Finish Route</button>
          <button class="secondary" type="button" @click="cancelRecording">Cancel recording</button>
        </div>
      </div>
    </div>
    <div v-else class="recorder-ready">
      <div class="recorder-explanation"><span class="camera-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M9 5 7 8H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-3l-2-3Z" /><circle cx="12" cy="13" r="3.5" /></svg></span><div><h4>Record as you walk</h4><p>Use the live camera to follow your surroundings. Mark each turn when you reach a corner.</p></div></div>
      <button class="start-recording" type="button" :disabled="!!recordDisabledReason" :aria-describedby="recordDisabledReason ? 'recording-help' : undefined" @click="start"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" /></svg>Start recording</button>
      <p v-if="recordDisabledReason" id="recording-help" class="notice">{{ recordDisabledReason }}</p>
      <p class="record-status" aria-live="polite">{{ status }}</p>
    </div>
    <p class="record-hint">Distances are estimates. Check and correct them before saving.</p>
    </section>
    </div>
    <label v-show="!recording && !paused && !starting" class="recording-choice"><input v-model="recordingMode" type="checkbox" /> Use the automatic camera recorder (manual editing is available below)</label>
    <section v-show="!recording && !paused && !starting" ref="review" class="route-panel" tabindex="-1">
    <div class="route-heading"><h3><span class="section-number">03</span> Review instructions</h3><div class="route-summary"><span>{{ steps.length }} / 50 segments</span><strong>{{ totalMeters.toFixed(2) }} m total</strong></div></div>
    <p v-if="!steps.length" class="route-empty">Record a walk to create instructions automatically, or use Add instruction for measured manual entry.</p>
    <p class="record-hint">Floor changes are confirmed checkpoints. They never count as walking meters.</p>
    <ol v-if="steps.length" class="instruction-preview" aria-label="Indoor route preview"><li v-for="(step,index) in steps" :key="index">{{ instructionLabel(step) }}<span>{{ !step.kind || step.kind === 'walk' ? ` — ${step.distance} m` : '' }}</span></li></ol><button v-if="steps.length > 1" class="secondary" type="button" :disabled="busy || recording || paused" @click="mergeCompatible">Merge compatible straight sections</button>

    <fieldset :disabled="busy || recording || paused || starting">
      <div v-for="(step, index) in steps" :key="index" class="segment">
        <div class="segment-caption"><span>{{ String(index + 1).padStart(2, '0') }}</span><strong>Step {{ index + 1 }}</strong></div>
        <label v-if="!step.kind || step.kind === 'walk'" class="segment-direction">Direction <span class="sr-only">for segment {{ index + 1 }}</span><select v-model="step.direction"><option value="straight">Continue Straight</option><option value="left">Turn Left</option><option value="right">Turn Right</option></select></label>
        <p v-if="step.kind && step.kind !== 'walk'">{{ instructionLabel(step) }} · Confirmed checkpoint</p><label v-if="!step.kind || step.kind === 'walk'" class="segment-distance">Distance <span class="sr-only">for segment {{ index + 1 }} in meters</span><span class="unit-input"><input v-model.number="step.distance" type="number" min="0.01" max="500" step="0.01" inputmode="decimal" @change="step.method = 'manual'; step.calibration = undefined" /><span aria-hidden="true">m</span></span></label>
        <label v-if="!step.kind || step.kind === 'walk'" class="checkpoint-toggle"><input v-model="step.checkpoint" type="checkbox" /> Keep this checkpoint (door / landmark)</label><div class="segment-actions">
          <button type="button" :disabled="index === 0" aria-label="Move segment up" title="Move segment up" @click="move(index, -1)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 12 6-6 6 6M12 6v13" /></svg></button>
          <button type="button" :disabled="index === steps.length - 1" aria-label="Move segment down" title="Move segment down" @click="move(index, 1)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 12 6 6 6-6M12 18V5" /></svg></button>
          <button class="remove-segment" type="button" :aria-label="`Remove segment ${index + 1}`" title="Remove segment" @click="steps.splice(index, 1)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7" /></svg><span class="sr-only">Remove</span></button>
        </div>
      </div>
      <button class="secondary add-segment" type="button" :disabled="steps.length >= 50" @click="steps.push({ direction: 'straight', distance: 0 })"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Add instruction</button>
    </fieldset><label v-if="multiFloor" class="entrance-check"><input v-model="routeChecked" type="checkbox" /><span>I checked the full route, floor transitions and destination on site.</span></label>
    </section>
    <footer v-show="!recording && !paused && !starting" class="editor-footer">
    <p><strong>Save as an inactive draft</strong><span>Verify the route on site before publishing.</span></p>
    <div class="footer-actions">
      <button type="button" :disabled="busy || recording || paused || starting" @click="save">{{ busy ? 'Saving…' : 'Save inactive draft' }}</button>
      <button class="secondary" type="button" :disabled="busy" @click="close">Close</button>
    </div>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import type { Building, DestinationRecord, Floor, Room } from '@/types';
import IndoorStepCalibration from './IndoorStepCalibration.vue';
import { IndoorStepSource, readCalibration } from '../services/indoor-steps';
import { App } from '@capacitor/app';
import { type PluginListenerHandle, Capacitor } from '@capacitor/core';
import type { StrideProfile, IndoorMeasurement } from '../../../shared/indoor-tracking';
import { destinationPayload, validatedRoute, hasFloorTransitions, buildIndoorJourney, mergeStraightSteps, type EditableStep } from '@/lib/route-editor';
import { createDestination, saveDestinationRoute, saveDestinationJourney } from '@/services/campus';
import { describeError } from '@/lib/errors';
import { useSession } from '@/stores/session';

const props = defineProps<{ rooms: Room[]; buildings: Building[]; floors?: Floor[]; destination?: DestinationRecord; initialRoom?: string }>();
const emit = defineEmits<{ saved: [DestinationRecord]; close: [] }>();
const id = ref(props.destination?.id ?? crypto.randomUUID());
const roomId = ref(props.destination?.room_id ?? props.initialRoom ?? '');
const building = computed(() => props.buildings.find(b => b.id === props.rooms.find(r => r.id === roomId.value)?.building_id));
const steps = ref<EditableStep[]>(props.destination?.indoor_journey?.instructions ? props.destination.indoor_journey.instructions.map(s=>({...s})) : (props.destination?.indoor_route ?? []).map(s => ({ ...s, direction: String(s.direction), distance: Number(s.distance) })));
const linkedRoom = computed(() => props.rooms.find(r => r.id === roomId.value));
const floorName = computed(() => props.floors?.find(f => f.id === linkedRoom.value?.floor_id)?.name || 'Floor not specified');
const video = ref<HTMLVideoElement | null>(null);
const cameraPanel = ref<HTMLElement | null>(null);
const review = ref<HTMLElement | null>(null);
const starting = ref(false);
const recordingMode = ref(true);
const manual = ref(false);
const sensorsAvailable = ref(false), calibrating=ref(false);
const profile = ref<StrideProfile|null>(null), segmentSteps=ref(0), detectedSteps=ref(0), sensorStatus=ref('Calibrate before automatic distance tracking.');
const stepSource=new IndoorStepSource();
const currentFloor=ref('');
const floorChange=ref(false), transitionType=ref<'upstairs'|'downstairs'|'elevator'>('upstairs'), transitionFloor=ref(''), routeChecked=ref(false);
const availableFloors=computed(()=>props.floors?.filter(f=>f.building_id===building.value?.id)||[]);
const multiFloor=computed(()=>hasFloorTransitions(steps.value));
let nativeListener:PluginListenerHandle|undefined;let editorAlive=true;
watch(steps,()=>{routeChecked.value=false;},{deep:true});
const cameraMessage = ref('');
const direction = ref('straight');
const directionLabel = computed(() => ({ straight: '↑ Straight', left: '← Left', right: '→ Right' })[direction.value]);
const totalMeters = computed(() => steps.value.reduce((sum, step) => sum + (Number.isFinite(step.distance) ? step.distance : 0), 0));
let stream: MediaStream | null = null;
const original = JSON.stringify({ id: id.value, roomId: roomId.value, steps: steps.value });
const dirty = computed(() => original !== JSON.stringify({ id: id.value, roomId: roomId.value, steps: steps.value }) || meters.value > 0 || recording.value || paused.value || starting.value);
const error = ref('');
const busy = ref(false);
const recording = ref(false);
const paused = ref(false);
const atEntrance = ref(false);
const recordDisabledReason = computed(() => {
  if (calibrating.value) return 'Finish the calibration walk before recording a route.';
  if (busy.value) return 'Wait for the destination to finish saving.';
  if (!roomId.value) return 'Link this destination to a room and save the link before recording. You can still edit its route manually.';
  if (!building.value) return 'The linked room or building could not be found. Check the room link before recording.';
  if (!building.value.entrance_name?.trim()) return 'Open Buildings, edit this room’s building, and save its entrance name before recording.';
  if (!atEntrance.value) return 'Confirm your starting point to enable recording.';
  return '';
});
const stride = ref(0.7);
const meters = ref(0);
const status = ref('Calibrate once, then record automatic step-estimated distances. Manual editing remains available.');

const session = useSession();
const draftKey = `route-draft:${session.state.userId}:${props.destination?.id ?? 'new'}`;
try {
  const raw = sessionStorage.getItem(draftKey) || (()=>{try{return localStorage.getItem(draftKey);}catch{return null;}})();
  if (raw) {
    const draft = JSON.parse(raw);
    if (typeof draft.id === 'string' && typeof draft.roomId === 'string' && Array.isArray(draft.steps)) {
      id.value = draft.id; roomId.value = draft.roomId;if(typeof draft.currentFloor==='string')currentFloor.value=draft.currentFloor;
      steps.value = draft.steps.slice(0, 50).filter((s: EditableStep) => s && typeof s.direction === 'string' && typeof s.distance === 'number');
      status.value = 'Recovered unsaved draft. Check all segments before saving.';
    }
  }
} catch { /* Storage can be unavailable; the editor still works in memory. */ }
function persist() {
  try {
    const pending = meters.value > 0 ? [{kind:'walk', direction: direction.value, distance: meters.value,method:manual.value?'manual':profile.value?.method,...(!manual.value&&profile.value?{calibration:{...profile.value}}:{}),recordedAt:new Date().toISOString()}] : [];
    const draft=JSON.stringify({id:id.value,roomId:roomId.value,currentFloor:currentFloor.value,steps:[...steps.value,...pending]});sessionStorage.setItem(draftKey,draft);try{localStorage.setItem(draftKey,draft);}catch{ /* Session recovery remains available. */ }
  } catch { /* Saving to Supabase remains available. */ }
}

let generation = 0;
let beforeRecording: EditableStep[] = [];
watch([id, roomId, steps, meters], persist, { deep: true });
watch(roomId, () => { atEntrance.value = false; });

function instructionLabel(step:EditableStep){return step.kind&&step.kind!=='walk'?({upstairs:'Go Upstairs',downstairs:'Go Downstairs',elevator:'Use Elevator','arrive-floor':'Arrive at Floor',arrived:'Arrived at Destination'}[step.kind]||step.kind)+(step.floorName?` — ${step.floorName}`:''):({straight:'Continue Straight',left:'Turn Left, then walk',right:'Turn Right, then walk'}[step.direction]||step.direction);}
onMounted(()=>{for(const method of ['hardware-detector','hardware-counter','motion-estimate'] as IndoorMeasurement[]){const saved=readCalibration(session.state.userId||'local',method);if(saved){profile.value=saved;stride.value=saved.stride;break;}}});
function calibrated(value:StrideProfile){profile.value=value;stride.value=value.stride;manual.value=false;status.value='Calibration ready. Start from the entrance.';}
async function enableSteps(request:number){
  try{
    const method=await stepSource.start((count,method)=>{
      if(request!==generation||!recording.value||manual.value||!profile.value||profile.value.method!==method)return;
      if(!Number.isInteger(count)||count<=0||count>100){pause();error.value='Unexpected step batch. Check the sensor and retry.';return;}
      detectedSteps.value+=count;segmentSteps.value+=count;meters.value=Math.round((meters.value+count*profile.value.stride)*100)/100;
      if(meters.value>500){pause();error.value='This section reached the 500 m limit. Review before continuing.';}
    },message=>{if(request!==generation)return;if(message==='paused'){pause();return;}sensorStatus.value=message;if(message.startsWith('No usable')){manual.value=true;sensorsAvailable.value=false;void stepSource.stop();status.value=message;}});
    if(request!==generation){await stepSource.stop();return;}
    const saved=profile.value?.method===method?profile.value:readCalibration(session.state.userId||'local',method);
    if(!saved){manual.value=true;sensorsAvailable.value=false;await stepSource.stop();sensorStatus.value='Calibration required for automatic distance.';status.value='No usable motion samples or calibration profile yet. Calibrate on this phone, or use measured manual distances.';return;}
    profile.value=saved;stride.value=saved.stride;sensorsAvailable.value=true;status.value='Automatic tracking active. Walk normally and mark each turn.';
  }catch(err){if(request!==generation)return;await stepSource.stop();manual.value=true;sensorsAvailable.value=false;sensorStatus.value='Automatic step tracking unavailable.';status.value=err instanceof Error?err.message:describeError(err);}
}
function stopCamera() {
  stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
  stream = null;
  if (video.value) video.value.srcObject = null;
}
function stop() {
  generation++;
  void stepSource.stop();
  stopCamera();
  recording.value = false;
  starting.value = false;
}
function changeDistanceMode(){if(manual.value){void stepSource.stop();sensorStatus.value='Manual distance entry';status.value='Enter independently measured meters for each section.';}else if(recording.value){void enableSteps(generation);}}
async function start() {
  if (starting.value || recordDisabledReason.value) return;
  error.value = '';
  if (!Number.isFinite(stride.value) || stride.value < 0.2 || stride.value > 1.5) { error.value = 'Calibrate a step length between 0.2 and 1.5 meters.'; return; }
  const resuming = paused.value;
  if (!resuming && steps.value.length && !window.confirm('Start a new recording? It replaces the route in this editor. Cancel recording restores it.')) return;
  if (!resuming) {
    beforeRecording = steps.value.map(s => ({ ...s }));
    steps.value = []; meters.value = 0; segmentSteps.value=0;detectedSteps.value=0;direction.value = 'straight';routeChecked.value=false;
  }
  const request = ++generation;
  starting.value = true;
  void nextTick(() => cameraPanel.value?.scrollIntoView?.({ block: 'start' }));
  cameraMessage.value = '';
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Use HTTPS or localhost and a browser with camera support. Manual recording remains available.');
    const opened = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } });
    if (request !== generation) { opened.getTracks().forEach(t => t.stop()); return; }
    stream = opened;
    await nextTick();
    if (video.value) { video.value.srcObject = opened; await video.value.play(); }
    if (request !== generation) return;
    opened.getVideoTracks().forEach(track => { track.onended = () => { if (recording.value) pause(); cameraMessage.value = 'Camera disconnected. Resume to retry, or finish and review manually.'; }; });
  } catch {
    if (request !== generation) return;
    stopCamera();
    cameraMessage.value = 'Camera unavailable or permission denied. Check camera permission and HTTPS/localhost. You can continue recording instructions manually.';
  }
  if(request!==generation)return;
  paused.value=false;starting.value=false;recording.value=true;
  if(manual.value){status.value='Manual distance entry. Automatic steps are not being recorded.';sensorStatus.value='Manual distance entry';}
  else await enableSteps(request);
}
function pause() { stop(); paused.value = true; status.value = 'Paused. Return to the same position and facing before resuming.'; }
function finalizeSegment(){
  if(!Number.isFinite(meters.value)||meters.value<=0||meters.value>500){error.value='Walk a section first, or enter a measured distance above 0 and at most 500 meters.';return false;}
  if(steps.value.length>=50){error.value='Maximum 50 recorded instructions. Review the route.';return false;}
  const floor=availableFloors.value.find(f=>f.id===currentFloor.value);
  const measurement=manual.value?'manual':profile.value?.method;
  steps.value.push({kind:'walk',direction:direction.value,distance:meters.value,...(floor?{floorId:floor.id,floorName:floor.name,level:floor.level}:{}),...(measurement?{method:measurement}:{}),...(!manual.value&&profile.value?{calibration:{...profile.value}}:{}),recordedAt:new Date().toISOString()});
  meters.value=0;segmentSteps.value=0;error.value='';return true;
}
function mark(next:string){
  if(!recording.value&&!paused.value)return false;
  if(next==='straight'&&direction.value==='straight'){status.value='Continue straight. Distance tracking stays in the same section.';return true;}
  if(!finalizeSegment())return false;direction.value=next;status.value='Previous section recorded. Continue walking in the selected direction.';return true;
}
function beginFloorChange(){if(!recording.value)return;if(meters.value>0&&!finalizeSegment())return;pause();floorChange.value=true;}
async function confirmFloor(){const floor=availableFloors.value.find(f=>f.id===transitionFloor.value);if(!floor){error.value='Choose the actual floor before confirming.';return;}
  const previous=availableFloors.value.find(f=>f.id===currentFloor.value);if(!previous){error.value='Choose the starting floor before recording a floor change.';return;}if(previous.id===floor.id||(transitionType.value==='upstairs'&&floor.level<=previous.level)||(transitionType.value==='downstairs'&&floor.level>=previous.level)){error.value='Choose a floor that matches the selected transition.';return;}
  const base={direction:'straight',distance:0,checkpoint:true,floorId:floor.id,floorName:floor.name,level:floor.level,recordedAt:new Date().toISOString()};
  steps.value.push({...base,kind:transitionType.value},{...base,kind:'arrive-floor'});floorChange.value=false;currentFloor.value=floor.id;direction.value='straight';await start();
}
function mergeCompatible(){steps.value=mergeStraightSteps(steps.value);routeChecked.value=false;}
async function finish() {
  if (meters.value !== 0 && !finalizeSegment()) return;
  stop(); paused.value = false;
  steps.value=mergeStraightSteps(steps.value);floorChange.value=false;cameraMessage.value='';status.value = 'Recording finished. Review estimated distances and directions before saving.';
  await nextTick(); review.value?.focus(); review.value?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
}
function cancelRecording() {
  if (!window.confirm('Cancel this recording and restore the previous editor route?')) return;
  stop(); paused.value = false; meters.value = 0;segmentSteps.value=0;detectedSteps.value=0;floorChange.value=false;cameraMessage.value='';error.value=''; steps.value = beforeRecording.map(s => ({ ...s })); status.value = 'Recording cancelled; previous editor route restored.';
}
function move(index: number, delta: number) { const target = index + delta; [steps.value[index], steps.value[target]] = [steps.value[target], steps.value[index]]; }
function close() { if (busy.value || (dirty.value && !window.confirm('Leave with unsaved changes? A draft is kept in this tab for recovery.'))) return; stop(); persist(); emit('close'); }
async function save() {
  if (busy.value || recording.value || paused.value || starting.value) return;
  busy.value = true; error.value = '';
  try {
    let saved: DestinationRecord;
    if (props.destination) saved = multiFloor.value ? await saveDestinationJourney(props.destination.id,buildIndoorJourney(id.value,building.value!.id,linkedRoom.value?.floor_id||null,steps.value,routeChecked.value)) : await saveDestinationRoute(props.destination.id, validatedRoute(steps.value));
    else {
      const room = props.rooms.find(r => r.id === roomId.value);
      if (!room || !building.value) throw new Error('Choose a room with a building.');
      const payload=destinationPayload(id.value,room,building.value,steps.value);if(payload.indoor_journey)payload.indoor_journey=buildIndoorJourney(id.value,building.value.id,room.floor_id,steps.value,routeChecked.value);saved = await createDestination(payload);
    }

    try { sessionStorage.removeItem(draftKey);try{localStorage.removeItem(draftKey);}catch{ /* Local draft storage may be unavailable. */ } } catch { /* Storage may be disabled. */ }
    emit('saved', saved);
  } catch (err) { error.value = err instanceof Error ? err.message : describeError(err); }
  finally { busy.value = false; }
}
function visibility() { if (document.hidden && (recording.value || starting.value)) pause(); }
function pagehide() { if (recording.value || starting.value) pause(); }
function leaving(event: BeforeUnloadEvent) { if (dirty.value) { event.preventDefault(); event.returnValue = ''; } }
onBeforeRouteLeave(() => { if (busy.value || (dirty.value && !window.confirm('Leave with unsaved changes? A draft is kept in this tab.'))) return false; stop(); persist(); return true; });
const unsubscribe = session.onCleared(() => { stop(); try { sessionStorage.removeItem(draftKey);try{localStorage.removeItem(draftKey);}catch{ /* Local draft storage may be unavailable. */ } } catch { /* Storage may be disabled. */ } emit('close'); });
document.addEventListener('visibilitychange', visibility);
window.addEventListener('pagehide', pagehide);
window.addEventListener('beforeunload', leaving);
if(Capacitor.isNativePlatform())void App.addListener('appStateChange',state=>{if(!state.isActive&&(recording.value||starting.value))pause();}).then(listener=>{if(editorAlive)nativeListener=listener;else void listener.remove();});
onBeforeUnmount(() => { editorAlive=false;stop();void nativeListener?.remove(); unsubscribe(); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', pagehide); window.removeEventListener('beforeunload', leaving); });
</script>

<style scoped>
.indoor-metrics { font-variant-numeric:tabular-nums; }.floor-transition { padding:12px; background:#ffffff10; border:1px solid #ffffff30; border-radius:9px; }.checkpoint-toggle { display:flex; align-items:center; gap:8px; }.checkpoint-toggle input { width:20px; min-height:20px; margin:0; }.instruction-preview { padding:14px 14px 14px 36px; background:#f3f7ff; border-radius:10px; color:#29496e; font-size:14px; line-height:1.8; }
.workspace.manual-workspace { grid-template-columns: 1fr; }
.recording-choice { margin: 0 28px 20px; display: flex; align-items: center; gap: 10px; }
.recording-choice input { width: 20px; min-height: 20px; margin: 0; }
summary { cursor: pointer; color: #526880; font-size: 13px; }
.editor { --editor-border: #e0e7f0; --editor-muted: #61758b; padding: 0; margin: 0 auto 24px; max-width: 1240px; color: #172f4d; background: #fff; border: 1px solid var(--editor-border); border-radius: 16px; overflow: clip; box-shadow: 0 4px 20px #142e4c06; }
.editor *, .editor *::before, .editor *::after { box-sizing: border-box; }
.back-bar { padding: 18px 28px 0; }
.editor .back-bar button { min-height: 36px; padding: 6px 0; background: transparent; border: 0; color: #536b86; font-size: 13px; }
.editor .back-bar button:hover:not(:disabled) { color: #1d4ed8; background: transparent; }
.editor-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 18px 28px 22px; border-bottom: 1px solid var(--editor-border); }
.eyebrow { display: block; font-size: 10px; font-weight: 750; letter-spacing: .1em; color: #61758b; line-height: 1.5; }
.editor-title { min-width: 0; }
.editor-title h2 { margin: 5px 0 9px; color: #102c4e; font-size: 28px; line-height: 1.2; letter-spacing: -.7px; }
.editor-title p { margin: 0; color: #29496e; font-size: 14px; font-weight: 650; overflow-wrap: anywhere; }
.destination-context { display: block; margin-top: 5px; color: var(--editor-muted); font-size: 12px; line-height: 1.5; }
.state-pill { display: inline-flex; align-items: center; flex-shrink: 0; gap: 7px; margin-top: 4px; white-space: nowrap; border: 1px solid #dce5f0; background: #f8fafc; color: #536983; padding: 7px 11px; border-radius: 999px; font-size: 11px; font-weight: 650; line-height: 1.5; }
.state-dot { width: 6px; height: 6px; border-radius: 50%; background: #8295ab; }
.state-pill.active { color: #086447; background: #eefaf4; border-color: #c1e6d1; }
.state-pill.active .state-dot { background: #13835b; }
.intro { margin: 0; padding: 18px 28px 0; color: var(--editor-muted); font-size: 13px; line-height: 1.65; }
.editor > .notice { margin: 16px 28px; }
.workspace { display: grid; grid-template-columns: minmax(280px, 1fr) minmax(0, 1.12fr); gap: 20px; padding: 20px 28px 26px; }
.setup-panel, .recorder-panel { min-width: 0; padding: 20px; border: 1px solid var(--editor-border); border-radius: 12px; background: #fff; }
.recorder-panel { display: flex; flex-direction: column; background: #f8faff; }
h3 { display: flex; align-items: center; gap: 10px; margin: 0 0 18px; color: #173655; font-size: 15px; font-weight: 700; line-height: 1.4; letter-spacing: -.15px; }
.section-number { display: inline-grid; flex: 0 0 27px; place-items: center; width: 27px; height: 27px; border-radius: 8px; background: #edf3ff; color: #2563eb; font-size: 11px; font-weight: 750; }
fieldset { min-width: 0; border: 0; padding: 0; margin: 0; }
label { display: block; margin: 12px 0; color: #526880; font-size: 12px; font-weight: 600; line-height: 1.5; }
label input, label select { display: block; width: 100%; min-width: 0; min-height: 44px; margin-top: 6px; padding: 10px 12px; border: 1px solid #d4deea; border-radius: 8px; color: #1b3552; background: #fff; font-size: 14px; font-weight: 500; box-shadow: 0 1px 2px #15314f03; }
.editor input:focus-visible, .editor select:focus-visible, .editor button:focus-visible { outline: 2px solid #2563eb; outline-offset: 3px; }
.entrance-card { display: flex; align-items: flex-start; gap: 12px; padding: 14px; border-radius: 9px; background: #f3f6fa; }
.entrance-icon { flex: 0 0 20px; width: 20px; height: 24px; margin-top: 2px; color: #416b9c; }
.entrance-card > div { min-width: 0; display: grid; gap: 3px; }
.entrance-card strong { color: #193c63; font-size: 15px; line-height: 1.5; overflow-wrap: anywhere; }
.entrance-card small { color: var(--editor-muted); font-size: 11px; line-height: 1.5; }
.entrance-check { display: flex; gap: 11px; align-items: flex-start; margin: 14px 0 18px; padding: 12px; border: 1px solid var(--editor-border); border-radius: 9px; cursor: pointer; transition: border-color .15s, background-color .15s; }
.entrance-check.confirmed { border-color: #b9cef8; background: #f4f8ff; }
.entrance-check input[type=checkbox] { flex: 0 0 20px; width: 20px; height: 20px; min-height: 20px; padding: 0; margin: 1px 0 0; accent-color: #2563eb; box-shadow: none; }
.entrance-check strong { display: block; font-size: 13px; font-weight: 650; color: #29496a; }
.entrance-check small { display: block; margin-top: 2px; color: var(--editor-muted); font-size: 11px; font-weight: 400; }
.stride-field { display: grid; grid-template-columns: minmax(0, 1fr) 152px; align-items: center; gap: 7px 12px; margin: 0; }
.stride-field > small { grid-column: 1 / -1; color: var(--editor-muted); font-size: 11px; line-height: 1.5; font-weight: 400; }
.unit-input { display: flex; align-items: center; width: 100%; min-width: 0; min-height: 44px; margin-top: 6px; border: 1px solid #d4deea; border-radius: 8px; background: white; overflow: hidden; }
.unit-input:focus-within { outline: 2px solid #2563eb; outline-offset: 2px; }
.unit-input input { min-width: 0; width: 100%; min-height: 42px; margin: 0; border: 0; padding: 10px 12px; box-shadow: none; border-radius: 0; appearance: textfield; -moz-appearance: textfield; }
.unit-input input::-webkit-inner-spin-button, .unit-input input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
.editor .unit-input input:focus-visible { outline: none; }
.unit-input > span { flex: 0 0 auto; padding-right: 12px; color: #687b92; font-size: 12px; font-weight: 500; white-space: nowrap; }
.stride-field .unit-input { margin: 0; }
.recorder-ready { flex: 1; display: flex; flex-direction: column; align-items: stretch; }
.recorder-explanation { display: flex; gap: 14px; margin: 5px 0 22px; }
.camera-icon { display: grid; place-items: center; flex: 0 0 44px; width: 44px; height: 44px; border: 1px solid #dce7f9; border-radius: 12px; background: #edf3ff; color: #2b62b3; }
.camera-icon svg { width: 23px; height: 23px; }
.recorder-explanation h4 { margin: 0 0 6px; font-size: 15px; color: #1e4168; font-weight: 650; }
.recorder-explanation p { max-width: 44ch; margin: 0; font-size: 13px; line-height: 1.7; color: #60758d; }
.editor button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 44px; padding: 10px 16px; border-radius: 8px; font-size: 13px; font-weight: 650; line-height: 1.3; cursor: pointer; }
.editor button svg { width: 18px; height: 18px; flex: 0 0 auto; }
.editor button:disabled { cursor: not-allowed; }
.editor .start-recording { width: 100%; margin-top: auto; min-height: 46px; }
.recorder-ready .notice { margin: 10px 0 0; padding: 0; border: 0; border-radius: 0; background: none; color: #61758b; font-size: 12px; line-height: 1.6; }
.record-status { margin: 12px 0 0; font-size: 11px; color: #61758b; line-height: 1.6; }
.record-hint { padding-top: 12px; margin: 12px 0 0; border-top: 1px solid #e1e8f2; color: #6b7e92; font-size: 11px; line-height: 1.6; }
.route-panel { margin: 0 28px; padding: 24px 0; border-top: 1px solid var(--editor-border); }
.route-heading { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 18px; }
.route-heading h3 { margin: 0; }
.route-summary { display: flex; align-items: center; gap: 12px; font-size: 12px; line-height: 1.5; }
.route-summary > span { color: #6a7e94; white-space: nowrap; }
.route-summary > strong { padding: 5px 10px; border: 1px solid #dce6f5; border-radius: 6px; background: #f5f8fd; color: #2c527f; font-size: 12px; font-weight: 650; white-space: nowrap; font-variant-numeric: tabular-nums; }
.route-empty { padding: 24px 16px; border: 1px dashed #cdd9e7; border-radius: 9px; background: #fafcff; color: var(--editor-muted); font-size: 13px; line-height: 1.6; text-align: center; }
.segment { display: grid; grid-template-columns: 118px minmax(0, 1fr) minmax(90px, 160px) auto; align-items: center; gap: 16px; margin-bottom: 10px; padding: 14px 16px; border: 1px solid var(--editor-border); border-radius: 10px; background: #fff; }
.segment-caption { display: flex; align-items: center; gap: 9px; min-width: 0; }
.segment-caption > span { display: grid; place-items: center; flex: 0 0 28px; height: 28px; border-radius: 7px; background: #f0f4f9; color: #60748d; font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; }
.segment-caption > strong { color: #304e6e; font-size: 12px; font-weight: 650; white-space: nowrap; }
.segment label { min-width: 0; margin: 0; font-size: 12px; }
.segment-actions { display: flex; justify-content: flex-end; gap: 5px; align-self: end; }
.editor .segment-actions button { min-height: 44px; width: 40px; padding: 8px; border: 1px solid #dce5ef; background: #fff; color: #59738f; }
.editor .segment-actions button:disabled { opacity: .35; }
.editor .segment-actions button:hover:not(:disabled) { background: #f1f6fd; border-color: #adc5e5; color: #2058a2; }
.editor .segment-actions .remove-segment { color: #b6505b; border-color: transparent; }
.editor .segment-actions .remove-segment:hover:not(:disabled) { color: #ad3542; border-color: #f2d0d5; background: #fff4f5; }
.editor .add-segment { margin-top: 4px; background: #f8faff; border: 1px solid #d4e1f4; color: #255b9f; }
.editor-footer { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 20px 28px; border-top: 1px solid var(--editor-border); border-radius: 0 0 16px 16px; background: #f8fafc; }
.editor-footer p { display: grid; gap: 5px; margin: 0; color: #304e6f; font-size: 12px; line-height: 1.5; }
.editor-footer p strong { font-weight: 650; }
.editor-footer p span { color: #687d94; font-size: 11px; }
.footer-actions { display: flex; flex-direction: row-reverse; gap: 10px; flex: 0 0 auto; }
.footer-actions .secondary { min-width: 84px; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.workspace.is-recording { grid-template-columns: minmax(0, 1fr); }
.is-recording .recorder-panel { max-width: 850px; width: 100%; justify-self: center; padding: 0; border: 0; background: none; }
.is-recording .recorder-panel > h3, .is-recording .record-hint { display: none; }
.camera-recorder { position: relative; display: flex; flex-direction: column; justify-content: space-between; min-height: min(680px, calc(100dvh - 100px)); border-radius: 12px; overflow: hidden; background: #102237; color: white; }
.camera-recorder video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.camera-top, .camera-distance, .camera-controls { position: relative; z-index: 1; padding: 16px; }
.camera-top { display: grid; gap: 5px; background: linear-gradient(#071a30ee, #071a3080); font-size: 13px; line-height: 1.5; }
.camera-top > strong { font-size: 16px; }
.camera-top > span { color: #d6e1ef; font-size: 12px; }
.camera-distance { display: grid; gap: 6px; justify-items: center; margin: 24px auto; padding: 14px 24px; background: #071a30cf; border: 1px solid #ffffff25; border-radius: 12px; }
.camera-distance b { font-size: 36px; font-variant-numeric: tabular-nums; line-height: 1.2; }
.camera-distance span { font-size: 12px; color: #d6e1ef; }
.camera-controls { background: #071a30eb; }
.camera-controls p { margin: 0 0 10px; font-size: 12px; line-height: 1.6; }
.camera-controls label { color: #e2ebf6; }
.manual-toggle { display: flex; gap: 9px; align-items: center; font-size: 12px; }
.manual-toggle input { flex: 0 0 20px; width: 20px; height: 20px; min-height: 20px; margin: 0; accent-color: #2563eb; }
.camera-controls input[type=number] { width: 100%; background: white; color: #16304d; }
.turn-actions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 10px; }
.editor .turn-actions button { min-height: 50px; padding: 10px 6px; background: #f7faff; border: 1px solid #c6d7ed; color: #174d91; }
.record-actions { display: grid; grid-template-columns: 1fr 1.5fr 1fr; gap: 8px; }
.editor .record-actions button { min-height: 46px; padding: 10px 8px; font-size: 12px; }
@media (max-width: 1100px) {
  .workspace { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }
  .stride-field { grid-template-columns: 1fr; }
  .stride-field .unit-input { max-width: 180px; }
  .segment { grid-template-columns: 96px minmax(0, 1fr) 112px auto; gap: 10px; padding: 14px 12px; }
  .segment-caption { gap: 6px; }
  .segment-caption > span { flex-basis: 24px; height: 24px; }
  .segment-caption > strong { font-size: 11px; }
}
@media (max-width: 760px) {
  .back-bar { padding: 12px 20px 0; }
  .editor-header { padding: 12px 20px 18px; }
  .editor-title h2 { font-size: 25px; }
  .intro { padding: 16px 20px 0; }
  .workspace { grid-template-columns: 1fr; padding: 18px 20px 22px; gap: 14px; }
  .stride-field { grid-template-columns: minmax(0, 1fr) 148px; }
  .route-panel { margin: 0 20px; padding: 20px 0; }
  .route-heading { align-items: flex-start; flex-direction: column; gap: 12px; }
  .route-summary { width: 100%; justify-content: space-between; padding-left: 37px; }
  .segment { grid-template-columns: minmax(0, 1fr) 110px; gap: 12px; padding: 12px; }
  .segment-caption { grid-column: 1; grid-row: 1; }
  .segment-caption > span { flex-basis: 26px; height: 26px; }
  .segment-caption > strong { font-size: 12px; }
  .segment-actions { grid-column: 2; grid-row: 1; gap: 0; }
  .editor .segment-actions button { flex: 0 0 44px; width: 44px; min-height: 44px; padding: 10px; border: 0; }
  .segment-direction { grid-column: 1; grid-row: 2; }
  .segment-distance { grid-column: 2; grid-row: 2; }
  .editor-footer { padding: 18px 20px; align-items: stretch; flex-direction: column; gap: 14px; }
  .footer-actions { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.7fr); gap: 10px; }
  .footer-actions > button:first-child { grid-column: 2; grid-row: 1; }
  .footer-actions > button:last-child { grid-column: 1; grid-row: 1; }
  label input, label select { font-size: 16px; }
}
@media (max-width: 480px) {
  .editor { border-radius: 12px; margin-bottom: 12px; }
  .back-bar { padding: 10px 14px 0; }
  .editor .back-bar button { font-size: 12px; }
  .editor-header { padding: 10px 14px 16px; gap: 10px; }
  .editor-title h2 { font-size: 23px; }
  .editor-title p { font-size: 13px; }
  .destination-context { font-size: 11px; }
  .state-pill { padding: 5px 8px; font-size: 11px; gap: 5px; }
  .intro { padding: 14px 14px 0; font-size: 12px; }
  .editor > .notice { margin: 12px 14px; }
  .workspace { padding: 14px 14px 20px; gap: 12px; }
  .setup-panel, .recorder-panel { padding: 14px; border-radius: 10px; }
  h3 { font-size: 14px; margin-bottom: 14px; gap: 8px; }
  .section-number { flex-basis: 25px; width: 25px; height: 25px; border-radius: 7px; font-size: 10px; }
  .entrance-card { padding: 12px; gap: 10px; }
  .entrance-check { margin: 12px 0 14px; padding: 11px; }
  .stride-field { grid-template-columns: minmax(0, 1fr) 132px; gap: 6px 10px; }
  .stride-field > span:first-child { font-size: 11px; }
  .recorder-explanation { gap: 10px; margin: 0 0 16px; }
  .camera-icon { flex-basis: 36px; width: 36px; height: 36px; border-radius: 9px; }
  .camera-icon svg { width: 20px; height: 20px; }
  .recorder-explanation h4 { font-size: 14px; }
  .recorder-explanation p { font-size: 12px; line-height: 1.65; }
  .route-panel { margin: 0 14px; padding: 18px 0; }
  .route-heading { gap: 10px; margin-bottom: 12px; }
  .route-summary { padding-left: 33px; font-size: 11px; gap: 8px; }
  .route-summary > strong { font-size: 11px; padding: 4px 8px; }
  .segment { grid-template-columns: minmax(0, 1fr) 108px; gap: 9px 10px; background: #fbfcfe; }
  .segment select, .segment .unit-input { background: #fff; }
  .segment-caption > strong { font-size: 11px; }
  .segment-caption { gap: 7px; }
  .editor .add-segment { width: 100%; border-style: dashed; }
  .editor-footer { padding: 16px 14px max(16px, env(safe-area-inset-bottom)); border-radius: 0 0 12px 12px; }
  .editor-footer p strong { font-size: 12px; }
  .footer-actions { gap: 8px; }
  .editor .footer-actions button { min-height: 46px; font-size: 12px; padding: 10px; }
  .camera-recorder { border-radius: 10px; min-height: min(640px, calc(100dvh - 90px)); }
  .camera-top, .camera-controls { padding: 12px; }
  .camera-distance { margin: 18px auto; }
  .editor .turn-actions button { font-size: 12px; }
  .record-actions { grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr); }
  .record-actions > button:last-child { grid-column: 1 / -1; min-height: 36px; }
}
@media (prefers-reduced-motion: reduce) { .entrance-check { transition: none; } }
@media (max-width: 360px) { .segment-caption > span { display: none; } }
</style>
