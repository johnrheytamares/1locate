<template><section class="nav-settings"><h3>How will students reach this destination?</h3>
<label>Navigation type<select :value="modelValue?.type || ''" :disabled="disabled" @change="setType(($event.target as HTMLSelectElement).value)"><option value="">Existing entrance + indoor flow</option><option value="outdoor-only">Outdoor-only — directly accessible</option><option value="indoor">Indoor — start at a checkpoint</option><option value="hybrid">Hybrid — outdoor, then indoor</option></select></label>
<template v-if="modelValue"><label>Published campus network<select :value="modelValue.locationId" :disabled="disabled" @change="chooseNetwork(($event.target as HTMLSelectElement).value)"><option value="">Choose network</option><option v-for="p in packages" :key="p.revision" :value="(p.graph as PublishedGraph).location.id">{{ (p.graph as PublishedGraph).location.name }} · v{{ p.revision }}</option></select></label><button type="button" :disabled="disabled" @click="load">Refresh published networks</button>
<label v-if="modelValue.type!=='indoor'">Destination entrance<select :value="modelValue.endpointId || ''" :disabled="disabled" @change="chooseEndpoint(($event.target as HTMLSelectElement).value)"><option value="">Choose verified endpoint</option><option v-for="node in network?.nodes.filter(n=>n.entrance)||[]" :key="node.id" :value="node.id">{{ node.name }}</option></select></label>
<p v-if="modelValue.entrance">Entrance GPS: {{ modelValue.entrance.latitude }}, {{ modelValue.entrance.longitude }}. Taken from the published endpoint.</p>
<template v-if="modelValue.type!=='outdoor-only'"><label>Indoor starting checkpoint<input :value="modelValue.checkpoint?.name || ''" :disabled="disabled" @input="checkpointName(($event.target as HTMLInputElement).value)" /></label><label class="check"><input type="checkbox" :checked="modelValue.checkpoint?.verified" :disabled="disabled" @change="verify(($event.target as HTMLInputElement).checked)" /> {{ modelValue.type==='hybrid'?'I checked that the indoor instructions start at this outdoor entrance.':'I verified this indoor starting checkpoint and its instructions.' }}</label></template>
<p v-else>Students follow the outdoor path and confirm arrival. Indoor recording is not required.</p><ul v-if="issues.length"><li v-for="issue in issues" :key="issue">{{ issue }}</li></ul><p v-else>Navigation configuration is ready for on-site review and publishing.</p>
</template><p v-if="error" role="alert">{{ error }}</p></section></template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { destinationNavigationIssues, navigationType, type DestinationNavigation } from '../../../shared/destination-navigation';
import type { PublishedGraph } from '../../../shared/network-publication';
import type { RoutePackage } from '../../../shared/route-package';
import { publishedNetworks } from '../services/network-publication';
const props=defineProps<{modelValue:DestinationNavigation|null;indoorValid:boolean;disabled?:boolean}>();const emit=defineEmits<{'update:modelValue':[DestinationNavigation|null]}>();
const packages=ref<RoutePackage[]>([]),error=ref('');
const network=computed(()=>packages.value.find(p=>(p.graph as PublishedGraph).location.id===props.modelValue?.locationId)?.graph as PublishedGraph|undefined);
const issues=computed(()=>!props.modelValue?[]:!network.value?['Choose a published campus network.']:destinationNavigationIssues({...props.modelValue,indoorRouteValid:props.indoorValid},network.value.location,network.value));
function update(patch:Partial<DestinationNavigation>){if(props.modelValue)emit('update:modelValue',{...props.modelValue,...patch});}
function setType(value:string){if(!value){emit('update:modelValue',null);return;}emit('update:modelValue',{...props.modelValue,type:navigationType(value),locationId:props.modelValue?.locationId||'',indoorRouteValid:props.indoorValid,checkpoint:{name:props.modelValue?.checkpoint?.name||'',verified:false}});void load();}
function chooseNetwork(locationId:string){update({locationId,endpointId:undefined,endpointName:undefined,entrance:undefined,checkpoint:{name:'',verified:false}});}
function chooseEndpoint(endpointId:string){const node=network.value?.nodes.find(n=>n.id===endpointId);update({endpointId,endpointName:node?.name,entrance:node?{latitude:node.latitude,longitude:node.longitude}:undefined,checkpoint:{name:node?.name||'',verified:false,endpointId}});}
function checkpointName(name:string){update({checkpoint:{...props.modelValue?.checkpoint,name,verified:false}});}
function verify(verified:boolean){update({checkpoint:{name:props.modelValue?.checkpoint?.name||'',endpointId:props.modelValue?.endpointId,verified}});}
async function load(){try{packages.value=await publishedNetworks();error.value='';}catch(e){error.value=(e as Error).message;}}
watch(()=>!!props.modelValue,value=>{if(value)void load();},{immediate:true});
</script><style scoped>.nav-settings{padding:16px;background:#f4f8ff;border:1px solid #d8e4f3;border-radius:12px;margin:16px 0}label{display:grid;gap:6px;margin:10px 0}input,select{min-width:0;width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px}.check{display:flex;align-items:start;gap:10px}.check input{width:auto}p,li{font-size:14px;line-height:1.5}button{min-height:44px}</style>
