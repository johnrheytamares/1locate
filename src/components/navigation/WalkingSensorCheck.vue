<template>
<details class="sensor-check"><summary>Walking sensor &amp; calibration</summary>
<p>Sensor: <strong>{{ stepMethodLabel(activeMethod || walking.sensorMethod.value) }}</strong> · {{ walking.trackingState.value }}</p>
<p>{{ walking.rawEvents.value }} raw events · {{ walking.detectedSteps.value }} detected · {{ walking.creditedSteps.value }} credited · {{ walking.estimatedMeters.value.toFixed(1) }} m estimated</p>
<p role="status">{{ message || walking.message.value }}</p>
<p>Steps cannot prove that you moved or followed the correct hallway. If shaking changes the count, switch to manual step entry.</p>
<button type="button" @click="unreliable">Disable automatic estimates</button>
<p>Check this phone on a measured path. Calibration does not advance your route. Return to the route entrance afterward.</p>
<label>Measured walking distance (m)<input v-model.number="distance" type="number" min="5" max="100" :disabled="running || stage !== 0" /></label>
<label>Independently counted walking steps<input v-model.number="independent" type="number" min="8" step="1" :disabled="running" /></label>
<p><strong>{{ stages[stage] || 'Checks complete' }}</strong> · {{ count }} detected test steps</p>
<p v-if="stage > 0 && stage < 4">Stay in the same place for at least 15 seconds. No test steps are added to navigation. For a step counter, stop the activity after 15 seconds and hold still for 10 more seconds to collect delayed events.</p>
<div class="check-actions"><button v-if="!running && stage < 4" type="button" @click="start">Start {{ stage === 0 ? 'measured walk' : 'stationary check' }}</button><button v-if="running" type="button" @click="finish">Finish check</button><button v-if="!running && stage === 4" type="button" @click="save">Save this phone’s calibration</button><button type="button" @click="reset">Reset check</button></div>
</details>
</template>
<script setup lang="ts">
import {onBeforeUnmount,ref} from 'vue';
import {IndoorStepSource} from '@/services/indoor-steps';
import {calibrateStride,stepMethodLabel,type IndoorMeasurement} from '../../../shared/indoor-tracking';
import {validateWalkingCheck,WALKING_VALIDATION_KEY,type WalkingValidation} from '@/services/walking-validation';
import type {useIndoorWalking} from '@/composables/useIndoorWalking';
const props=defineProps<{walking:ReturnType<typeof useIndoorWalking>}>();
const activeMethod=ref<IndoorMeasurement|null>(null);
const source=new IndoorStepSource(),distance=ref(10),independent=ref(0),stage=ref(0),count=ref(0),running=ref(false),message=ref('');
const stages=['Walk normally: count your steps independently','Stand still without moving the phone','Rotate the phone while standing still','Shake the phone while standing still'];
let started=0,run=0,method:IndoorMeasurement|null=null,walkingSteps=0;let checks:WalkingValidation['checks']=[];
function unreliable(){run++;running.value=false;void source.stop();props.walking.reportUnreliable();message.value='Checkpoint navigation selected. No sensor events are credited as distance.';}
function reset(){unreliable();stage.value=0;count.value=0;checks=[];method=null;walkingSteps=0;}
async function start(){
 if(running.value)return;
 if(stage.value===0&&(!Number.isFinite(distance.value)||distance.value<5||distance.value>100)){message.value='Enter a measured path (5–100 m). Count your actual steps independently during the walk and enter them after finishing.';return;}
 props.walking.stop();const request=++run;running.value=true;count.value=0;started=Date.now();message.value='Starting sensor. For a counter, wait for the baseline-ready message before walking.';
 try{
  const active=await source.start((steps,activeMethod)=>{if(request!==run||!running.value)return;if(method&&method!==activeMethod){reset();message.value='Sensor changed. Repeat all checks.';return;}count.value+=steps;},status=>{if(request!==run)return;if(status==='paused'){reset();message.value='Check interrupted. Repeat all checks.';}else message.value=status;});
  if(request!==run)return;if(method&&active!==method){reset();message.value='Sensor changed. Repeat all checks.';return;}method=active;activeMethod.value=active;started=Date.now();
 }catch(error){if(request===run){running.value=false;void source.stop();message.value=(error as Error).message;}}
}
function finish(){
 if(!running.value)return;
 const durationMs=Date.now()-started;
 if(stage.value>0&&durationMs<(method==='hardware-counter'?25000:15000)){message.value='Complete 15 seconds of stationary activity; for a counter also wait 10 seconds without moving for delayed events. The timer never generates steps.';return;}
 run++;running.value=false;void source.stop();
 if(!method){message.value='Sensor did not start. Repeat this check.';return;}
 if(stage.value===0){
  try{calibrateStride(distance.value,count.value,method);if(count.value<8||(independent.value>0&&Math.abs(count.value-independent.value)>Math.max(1,independent.value*0.1)))throw new Error('Detected steps do not match the independently counted walk. Do not shake the phone. Use checkpoints or retry.');walkingSteps=count.value;}catch(error){message.value=(error as Error).message;return;}
 }else{if(count.value!==0){props.walking.reportUnreliable();stage.value=0;checks=[];walkingSteps=0;message.value='Sensor credited steps while stationary. This phone failed the check. Use manual checkpoints.';return;}checks.push({activity:stage.value===1?'standing':stage.value===2?'rotating':'shaking',durationMs,steps:count.value});}
 stage.value++;message.value=stage.value===4?'All checks recorded. Review and save; this still does not prove indoor positioning.':'Next: '+stages[stage.value];
}
function save(){try{if(!method||stage.value!==4)return;const value=validateWalkingCheck({version:1,profile:calibrateStride(distance.value,walkingSteps,method),independentSteps:independent.value,checks});localStorage.setItem(WALKING_VALIDATION_KEY,JSON.stringify(value));props.walking.stop();message.value='Saved only on this phone for this sensor. Return to the entrance and restart guidance to use estimated steps. Repeat the check if the holding position changes.';}catch(error){message.value=(error as Error).message;}}
function hidden(){if(document.hidden&&running.value){reset();message.value='App backgrounded. Repeat all checks.';}}
document.addEventListener('visibilitychange',hidden);onBeforeUnmount(()=>{run++;void source.stop();document.removeEventListener('visibilitychange',hidden);});
</script>
<style scoped>
.sensor-check{margin:10px 0;border:1px solid #d5e1ed;border-radius:10px;padding:10px;color:#35516a;font-size:12px;}.sensor-check summary{cursor:pointer;min-height:28px;font-weight:600;}p{line-height:1.5;}label{display:block;margin:8px 0;}input{display:block;width:100%;padding:8px;min-height:40px;border:1px solid #cad8e7;border-radius:8px;background:white;color:#18334c;}.check-actions{display:flex;flex-wrap:wrap;gap:6px;}button{min-height:44px;border:1px solid #bed0e6;border-radius:8px;padding:8px;color:#18538a;background:#f3f8ff;}
</style>
