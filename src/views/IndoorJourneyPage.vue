<template>
<ion-page class="indoor-journey-page"><ion-header><ion-toolbar><ion-title>Indoor directions</ion-title><ion-buttons slot="end"><ion-button @click="exit">Exit</ion-button></ion-buttons></ion-toolbar></ion-header><ion-content><section v-if="destination && journey" class="journey-layout"><header><span>INDOOR · CHECKPOINT GUIDANCE</span><h1>{{ destination.name }}</h1><p>{{ destination.building }} · Instruction {{ index + 1 }} of {{ journey.instructions.length }}</p></header><div class="camera-reference"><p>{{ cameraMessage || 'Live camera reference · not ground-anchored AR' }}</p></div><article v-if="instruction"><h2>{{ label }}</h2><template v-if="instruction.kind === 'walk'"><strong>{{ Math.max(0,instruction.distance-walked).toFixed(1) }} m</strong><p>Estimated remaining in this section. Check the hallway and confirm when physically reached.</p><ion-button fill="outline" :disabled="paused" @click="walking.enabled.value ? walking.stop() : walking.start()">{{ walking.enabled.value ? 'Stop step estimates' : 'Enable step estimates' }}</ion-button><p>{{ walking.message.value }}</p></template><p v-else-if="instruction.kind !== 'arrived'">Check the floor sign and your surroundings. The phone cannot determine your indoor floor automatically.</p><ion-button expand="block" :disabled="paused" @click="confirm">{{ instruction.kind === 'arrived' ? 'I am at the destination' : instruction.kind === 'arrive-floor' ? 'I am on this floor' : instruction.kind === 'walk' ? 'I reached this checkpoint' : 'I used these stairs / elevator' }}</ion-button></article><div class="controls"><ion-button fill="outline" @click="togglePause">{{ paused ? 'Resume' : 'Pause' }}</ion-button><ion-button fill="clear" @click="restart">Restart from entrance</ion-button></div><p class="note">Progress follows estimated steps and your confirmed checkpoints. GPS is not indoor positioning.</p><p v-if="error" role="alert">{{ error }}</p></section></ion-content></ion-page>
</template>
<script setup lang="ts">
import { computed,onBeforeUnmount,ref } from 'vue';
import { IonPage,IonHeader,IonToolbar,IonTitle,IonContent,IonButton,IonButtons,onIonViewDidEnter,onIonViewWillLeave,useIonRouter } from '@ionic/vue';
import { useRoute } from 'vue-router';
import { getDestination } from '@/services/navigation.service';
import { hasIndoorJourneyEntrance,clearIndoorJourneyEntrance,confirmRoomArrival } from '@/services/journey.service';
import { startRearPreview,stopRearPreview } from '@/services/camera.service';
import { useIndoorWalking } from '@/composables/useIndoorWalking';
import type { Destination } from '@/models/navigation';
import { parseIndoorJourney,type IndoorJourney } from '../../shared/indoor-tracking';

const route=useRoute(),router=useIonRouter(),destination=ref<Destination|null>(null),journey=ref<IndoorJourney|null>(null),index=ref(0),walked=ref(0),paused=ref(false),error=ref(''),cameraMessage=ref(''),open=ref(false);let cameraGeneration=0;
const instruction=computed(()=>journey.value?.instructions[index.value]);
const walking=useIndoorWalking(()=>!open.value||paused.value||instruction.value?.kind!=='walk'||walked.value>=instruction.value.distance?'Confirm the current checkpoint before walking.':null,meters=>{if(instruction.value?.kind==='walk'&&!paused.value)walked.value=Math.min(instruction.value.distance,walked.value+meters);});
const label=computed(()=>{const s=instruction.value;if(!s)return '';if(s.kind==='walk')return s.direction==='left'?'Turn left, then walk':s.direction==='right'?'Turn right, then walk':'Continue straight';return ({upstairs:'Go Upstairs',downstairs:'Go Downstairs',elevator:'Use Elevator','arrive-floor':'Arrive at Floor',arrived:'Arrived at Destination'}[s.kind])+(s.floorName?` — ${s.floorName}`:'');});
async function camera(){const request=++cameraGeneration;try{await startRearPreview();if(request!==cameraGeneration||!open.value){await stopRearPreview();return;}document.documentElement.classList.add('indoor-journey-camera');cameraMessage.value='';}catch(reason){if(request===cameraGeneration)cameraMessage.value=(reason as Error).message;}}
function beginTracking() {
  if (
    open.value &&
    !paused.value &&
    instruction.value?.kind === 'walk'
  ) {
    void walking.start();
  }
}
function stop(){cameraGeneration++;walking.stop();document.documentElement.classList.remove('indoor-journey-camera');void stopRearPreview();}
function confirm() {
  if (paused.value || !instruction.value) return;

  if (instruction.value.kind === 'arrived') {
    if (
      destination.value &&
      confirmRoomArrival(destination.value)
    ) {
      stop();
      void router.replace('/arrival');
    }
    return;
  }

  walking.stop();
  index.value++;
  walked.value = 0;

  // Automatically track the next walking segment.
  beginTracking();
}

function togglePause() {
  paused.value = !paused.value;

  if (paused.value) {
    stop();
    return;
  }

  void camera();
  beginTracking();
}

function restart(){if(!window.confirm('Return physically to the building entrance and start the outdoor/entrance confirmation again?'))return;stop();void router.replace('/ar-navigation');}
function exit(){stop();void router.replace('/destinations');}
function hidden(){if(document.hidden&&open.value){paused.value=true;stop();}}
onIonViewDidEnter(()=>{const id=String(route.params.id||'');if(!hasIndoorJourneyEntrance(id)){void router.replace(`/destinations/${encodeURIComponent(id)}`);return;}const selected=getDestination(id);try{if(!selected?.indoorJourney)throw new Error('This destination has no supported indoor journey.');const parsed=parseIndoorJourney(selected.indoorJourney);if(parsed.status!=='validated')throw new Error('This indoor journey is not published.');destination.value=selected;journey.value=parsed;index.value=0;walked.value=0;paused.value=false;open.value=true;void camera(); beginTracking();}catch(reason){error.value=(reason as Error).message;void router.replace('/destinations');}});
onIonViewWillLeave(()=>{open.value=false;clearIndoorJourneyEntrance();stop();});document.addEventListener('visibilitychange',hidden);onBeforeUnmount(()=>{open.value=false;stop();document.removeEventListener('visibilitychange',hidden);});
</script>
<style scoped>
.journey-layout{max-width:650px;margin:auto;padding:18px;display:grid;gap:14px;}header,article,.note{background:#ffffffed;border:1px solid #dce5ef;border-radius:12px;padding:16px;color:#18324e;}header span{font-size:10px;color:#61758b;letter-spacing:.1em;}h1{font-size:22px;margin:6px 0;}h2{font-size:24px;margin:0 0 14px;}p{font-size:13px;line-height:1.6;}article strong{font-size:36px;}.camera-reference{height:210px;border:1px solid #cdd9e7;border-radius:12px;display:flex;align-items:flex-end;background:#10223722;}.camera-reference p{padding:10px;background:#102237d9;color:white;margin:0;width:100%;border-radius:0 0 12px 12px;}.controls{display:flex;justify-content:space-between;background:#ffffffed;border-radius:9px;}.note{font-size:12px;color:#61758b;}
</style>

<style>
html.indoor-journey-camera,html.indoor-journey-camera body,html.indoor-journey-camera ion-app,html.indoor-journey-camera ion-router-outlet,html.indoor-journey-camera .indoor-journey-page,html.indoor-journey-camera .indoor-journey-page ion-content{background:transparent!important;--background:transparent!important;}
</style>
