import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { MotionStepDetector, StepCounterBaseline, parseStrideProfile, type IndoorMeasurement, type StrideProfile } from '../../../shared/indoor-tracking';
interface Sample { session:string; steps?:number; magnitude?:number; motionTime?:number; timestamp:number }
interface StepApi {
  capabilities():Promise<{detector:boolean;counter:boolean;motion:boolean}>;
  start(options:{session:string;allowMotionFallback:boolean}):Promise<{method:IndoorMeasurement}>;
  stop(options:{session:string}):Promise<void>;
  addListener(name:'sample'|'state',listener:(sample:Sample&{state?:string})=>void):Promise<PluginListenerHandle>;
}
const native=registerPlugin<StepApi>('IndoorSteps');
export function readCalibration(user:string,method:IndoorMeasurement):StrideProfile|null{
  try{const raw=localStorage.getItem(`1locate:stride:${user}:${method}`);return raw?parseStrideProfile(JSON.parse(raw)):null;}catch{return null;}
}
export function saveCalibration(user:string,profile:StrideProfile){localStorage.setItem(`1locate:stride:${user}:${profile.method}`,JSON.stringify(parseStrideProfile(profile)));}
/** Each run owns its listeners and baseline; stopped/paused movement can never leak into a new run. */
export class IndoorStepSource {
  private generation=0; private handles:PluginListenerHandle[]=[]; private browser:((event:DeviceMotionEvent)=>void)|null=null; private session=''; private timeout:ReturnType<typeof setTimeout>|undefined;
  async stop(){this.generation++;clearTimeout(this.timeout);if(this.browser)window.removeEventListener('devicemotion',this.browser);this.browser=null;const handles=this.handles;this.handles=[];await Promise.all(handles.map(h=>h.remove().catch(()=>{})));if(this.session){const session=this.session;this.session='';await native.stop({session}).catch(()=>{});}}
  async start(onSteps:(steps:number,method:IndoorMeasurement)=>void,onStatus:(message:string)=>void):Promise<IndoorMeasurement>{
    await this.stop();const run=++this.generation,detector=new MotionStepDetector(),baseline=new StepCounterBaseline();baseline.update(0);let samples=0,counterReady=false;
    const alive=()=>run===this.generation;
    if(Capacitor.isNativePlatform()){
      const session=crypto.randomUUID();this.session=session;
      const capabilities=await native.capabilities();if(!alive())throw new Error('Step tracking cancelled.');
      if(!capabilities.detector&&!capabilities.counter&&!capabilities.motion)throw new Error('No usable motion samples: this device has no supported step or motion sensor.');
      const handle=await native.addListener('sample',sample=>{if(!alive()||sample.session!==session)return;samples++;if(sample.steps!=null){if(!capabilities.detector&&sample.steps===0){counterReady=true;onStatus('Hardware counter baseline ready. You can begin walking.');}const delta=baseline.update(sample.steps);if(delta>0)onSteps(delta,capabilities.detector?'hardware-detector':'hardware-counter');}else if(sample.magnitude!=null){const count=detector.sample(sample.magnitude,sample.motionTime??performance.now());if(count)onSteps(count,'motion-estimate');}});
      if(!alive()){await handle.remove();throw new Error('Step tracking cancelled.');}this.handles.push(handle);
      const state=await native.addListener('state',sample=>{if(alive()&&sample.state==='paused')onStatus('paused');});if(!alive()){await state.remove();throw new Error('Step tracking cancelled.');}this.handles.push(state);
      const result=await native.start({session,allowMotionFallback:true});if(!alive()){await native.stop({session});throw new Error('Step tracking cancelled.');}
      onStatus(result.method==='motion-estimate'?'Motion estimate: validate the step count during calibration.':result.method==='hardware-counter'?counterReady?'Hardware counter baseline ready. You can begin walking.':'Waiting for the hardware counter baseline. Stand still until ready; updates may arrive in batches.':'Hardware step detector active.');return result.method;
    }
    const api=window.DeviceMotionEvent as (typeof DeviceMotionEvent&{requestPermission?:()=>Promise<string>})|undefined;
    if(!api)throw new Error('Motion sensors unavailable. Use measured manual distances.');
    const granted=api.requestPermission?await api.requestPermission():'granted';if(!alive())throw new Error('Step tracking cancelled.');if(granted!=='granted')throw new Error('Motion permission denied. Use manual distances or retry permission.');
    this.browser=event=>{if(!alive())return;const a=event.acceleration;if(a?.x==null||a.y==null||a.z==null||![a.x,a.y,a.z].every(Number.isFinite))return;samples++;const rotation=event.rotationRate;if(rotation&&[rotation.alpha,rotation.beta,rotation.gamma].some(v=>v!=null&&Math.abs(v)>60)){detector.reset();return;}const count=detector.sample(Math.hypot(a.x,a.y,a.z),performance.now());if(count)onSteps(count,'motion-estimate');};
    window.addEventListener('devicemotion',this.browser);
    this.timeout=setTimeout(()=>{if(alive()&&!samples)onStatus('No usable motion samples. Retry on a supported phone or use measured manual distances.');},4000);
    onStatus('Motion estimate: calibrate on this phone and check the detected steps.');return 'motion-estimate';
  }
}
