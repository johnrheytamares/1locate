<template><section class="publisher">
<header><h2>Publish walking network</h2><p>Review the paths drawn above, then connect destinations to this network.</p></header>
<div class="fields"><label>Location ID<input v-model="location.id" placeholder="campus-calapan" /></label><label>Location name<input v-model="location.name" placeholder="Campus name" /></label><label>Environment<select v-model="location.environment"><option value="test">Test — drafts only</option><option value="campus">Official campus</option></select></label><label>Map reference<select v-model="mode"><option value="image">Calibrated campus image</option><option value="geographic">Geographic / surveyed GPS geometry</option></select></label></div>
<details><summary>Location boundary — surveyed coordinates</summary><div class="fields"><label v-for="key in boundaryKeys" :key="key">{{ key }}<input v-model.number="location.bounds[key]" type="number" step="any" /></label></div><p>Use the actual campus boundary. Do not include home or other test coordinates.</p></details>
<button v-if="graph.edges.some(e=>!e.geometry)" :disabled="busy" @click="confirmStraightSections">Review straight-section geometry</button>
<label class="check"><input v-model="checked" type="checkbox" /> I verified every path, entrance, distance, access restriction and map reference on site.</label>
<label>Verification notes<textarea v-model="notes" placeholder="How were paths and distances checked?" /></label>
<p v-if="revision">Published version {{ revision }} · {{ publishedAt }}</p><p v-if="message" role="status">{{ message }}</p><ul v-if="issues.length"><li v-for="issue in issues" :key="issue">{{ issue }}</li></ul>
<div class="actions"><button :disabled="busy" @click="saveLocal">Save Local Draft</button><button :disabled="busy" @click="run('save')">Save Online</button><button :disabled="busy" @click="validate">Validate Route</button><button :disabled="busy || !validated" @click="run('publish')">Publish Route</button></div><p v-if="!validated">Publish becomes available after successful validation. Any edit requires another review.</p>
<details><summary>Load a published network</summary><button :disabled="busy" @click="load">Refresh networks</button><button v-for="p in packages" :key="p.revision" @click="select(p)">{{ (p.graph as PublishedGraph).location.name }} · v{{ p.revision }}</button><button @click="restoreLocal">Load Local Draft</button></details>
</section></template>
<script setup lang="ts">
import { ref, watch } from 'vue';
import { checkedNetwork, type PublishedGraph } from '../../../shared/network-publication';
import type { OutdoorGraph } from '../../../shared/outdoor-graph';
import type { NetworkLocation } from '../../../shared/pathway-builder';
import type { RoutePackage } from '../../../shared/route-package';
import { publishedNetworks, publishPathwayNetwork, saveNetworkOnline } from '../services/network-publication';
const props=defineProps<{graph:OutdoorGraph}>();const emit=defineEmits<{network:[OutdoorGraph]}>();
const location=ref<NetworkLocation>({id:'',name:'',environment:'test',bounds:{south:0,north:0,west:0,east:0}}),mode=ref<'image'|'geographic'>('image'),notes=ref(''),checked=ref(false),validated=ref(false),busy=ref(false),message=ref(''),issues=ref<string[]>([]),revision=ref(0),publishedAt=ref(''),packages=ref<RoutePackage[]>([]);
const boundaryKeys=['south','north','west','east'] as const;
function candidate():PublishedGraph{return {...JSON.parse(JSON.stringify(props.graph)),location:JSON.parse(JSON.stringify(location.value)),mapReference:mode.value==='image'?{mode:'image',image:props.graph.referenceMap}:{mode:'geographic',crs:'EPSG:4326',reviewed:checked.value},verification:{checked:checked.value,notes:notes.value}};}
watch(()=>JSON.stringify([props.graph,location.value,mode.value,notes.value,checked.value]),()=>{validated.value=false;issues.value=[];});
function confirmStraightSections(){
 if(!window.confirm('Only continue if every section without geometry is a straight, walkable path between its endpoints. Add a node at every corner first. Have you checked these paths on site?'))return;
 const graph:OutdoorGraph=JSON.parse(JSON.stringify(props.graph));
 for(const edge of graph.edges)if(!edge.geometry){const a=graph.nodes.find(n=>n.id===edge.from),b=graph.nodes.find(n=>n.id===edge.to);if(!a||!b){message.value='Choose both endpoints first.';return;}edge.geometry=[{latitude:a.latitude,longitude:a.longitude},{latitude:b.latitude,longitude:b.longitude}];}
 graph.verified=false;checked.value=false;emit('network',graph);message.value='Straight sections added for review. Recheck distances and access before validation.';
}
function validate(){try{checkedNetwork(candidate());validated.value=true;issues.value=[];message.value='Validated. Ready to publish.';}catch(e){validated.value=false;issues.value=[(e as Error).message];}}
function saveLocal(){try{localStorage.setItem('1locate-network-v2-draft',JSON.stringify({graph:candidate(),revision:revision.value}));message.value='Draft saved on this device.';}catch(e){message.value=String(e);}}
function restoreLocal(){try{const raw=localStorage.getItem('1locate-network-v2-draft');if(!raw)throw new Error('No saved draft.');const d=JSON.parse(raw);adopt(d.graph);revision.value=d.revision||0;message.value='Draft restored. Review before publishing.';}catch(e){message.value=String(e);}}
function adopt(g:PublishedGraph){if(!g.location||!g.mapReference)throw new Error('This network needs V2 location setup.');location.value=structuredClone(g.location);mode.value=g.mapReference.mode;notes.value=g.verification?.notes||'';checked.value=false;emit('network',g);}
function select(p:RoutePackage){adopt(p.graph as PublishedGraph);revision.value=p.revision;publishedAt.value=p.publishedAt;}
async function load(){try{packages.value=await publishedNetworks();message.value=packages.value.length?'Select a network to continue editing.':'No V2 network published yet.';}catch(e){message.value=(e as Error).message;}}
async function run(action:'save'|'publish'){busy.value=true;try{if(action==='save'){await saveNetworkOnline(candidate());message.value='Online draft saved; not published.';}else{const p=await publishPathwayNetwork(candidate(),revision.value);revision.value=p.revision;publishedAt.value=p.publishedAt;message.value='Published. Updated mobile apps download this network automatically.';}}catch(e){message.value=(e as Error).message;}finally{busy.value=false;}}
</script><style scoped>.publisher{padding:20px;border:1px solid #dae3ef;border-radius:18px;background:white;color:#12314c;margin:18px 0}.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}label{display:grid;gap:6px;margin:10px 0}input,select,textarea{width:100%;min-width:0;padding:10px;border:1px solid #cbd5e1;border-radius:8px}.check{display:flex;align-items:start;gap:10px}.check input{width:auto;margin-top:4px}.actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}button{min-height:44px;border-radius:9px;padding:8px;background:#1d4ed8;color:white;border:0}button:disabled{opacity:.45}p,li{font-size:14px;line-height:1.5}details{margin-top:12px}details button{margin:6px}textarea{min-height:70px}</style>
