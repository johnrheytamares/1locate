<template>
<section class="calibration"><h4>Calibrate walking distance</h4><p>Measure a straight path (for example 10 m). Start at one end, keep the phone in the same position you use for recording, then walk to the other end.</p><label>Measured path length (m)<input v-model.number="distance" type="number" min="1" max="1000" step="0.1" :disabled="running || disabled" /></label><strong v-if="running || count">{{ count }} detected steps</strong><p role="status">{{ message }}</p><label v-if="!running && count" class="check"><input v-model="confirmed" type="checkbox" /> The detected step count matches my walk.</label><div><button v-if="!running" type="button" :disabled="disabled" @click="start">Start calibration walk</button><button v-else type="button" @click="finish">Finish calibration</button><button v-if="!running && count" type="button" :disabled="!confirmed || disabled" @click="save">Use calibration</button><button v-if="running" type="button" @click="cancel">Cancel</button></div><p v-if="profile">Saved: {{ profile.stride.toFixed(2) }} m per step · {{ profile.method }}</p></section>
</template>
<script setup lang="ts">
import { onBeforeUnmount,ref,watch } from 'vue';
import { IndoorStepSource,saveCalibration } from '../services/indoor-steps';
import { calibrateStride,type StrideProfile,type IndoorMeasurement } from '../../../shared/indoor-tracking';
const props=defineProps<{user:string;disabled?:boolean}>();const emit=defineEmits<{calibrated:[StrideProfile];activity:[boolean]}>();
const source=new IndoorStepSource(),distance=ref(10),count=ref(0),running=ref(false),message=ref(''),confirmed=ref(false),profile=ref<StrideProfile|null>(null);let method:IndoorMeasurement='motion-estimate',alive=true;
watch(running,value=>emit('activity',value));
async function start(){if(running.value||props.disabled)return;count.value=0;confirmed.value=false;running.value=true;try{method=await source.start(steps=>{if(running.value)count.value+=steps;},status=>{if(status==='paused'){cancel();message.value='Calibration paused by the app. Repeat the measured walk.';}else message.value=status;});if(!alive)await source.stop();}catch(error){running.value=false;await source.stop();message.value=(error as Error).message;}}
function finish(){running.value=false;void source.stop();message.value='Check the count before using this calibration.';}
function cancel(){running.value=false;void source.stop();count.value=0;}
function save(){try{if(!confirmed.value||props.disabled)return;const value=calibrateStride(distance.value,count.value,method);profile.value=value;try{saveCalibration(props.user,value);message.value='Calibration saved on this device.';}catch{message.value='Calibration is available this session only; browser storage could not save it.';}emit('calibrated',value);}catch(error){message.value=(error as Error).message;}}
function hidden(){if(document.hidden&&running.value){cancel();message.value='Calibration interrupted. Repeat the measured walk.';}}
document.addEventListener('visibilitychange',hidden);onBeforeUnmount(()=>{alive=false;running.value=false;void source.stop();document.removeEventListener('visibilitychange',hidden);});
</script>
<style scoped>
.calibration{background:#f3f7fc;border:1px solid #dce5ef;border-radius:10px;padding:14px;margin:14px 0;}h4{margin:0 0 8px;}p,label{font-size:12px;line-height:1.6;}button{min-height:44px;padding:10px;border:1px solid #cadaee;border-radius:8px;background:white;color:#174d91;margin:5px 5px 0 0;cursor:pointer;}input[type=number]{display:block;min-height:44px;padding:8px;border:1px solid #cadaee;border-radius:8px;width:100%;box-sizing:border-box;}.check{display:flex;gap:8px;align-items:flex-start;}input[type=checkbox]{width:20px;height:20px;}
</style>
