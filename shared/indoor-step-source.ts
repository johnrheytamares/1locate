import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { stepMethodLabel, LinearAccelerationFilter, MotionStepDetector, StepCounterBaseline, type IndoorMeasurement } from './indoor-tracking';
export interface StepSensorSample { session:string; steps?:number; magnitude?:number; motionTime?:number; timestamp:number;method?:IndoorMeasurement }
export interface StepApi {
  capabilities():Promise<{detector:boolean;counter:boolean;motion:boolean}>;
  start(options:{session:string;allowMotionFallback:boolean}):Promise<{method:IndoorMeasurement}>;
  stop(options:{session:string}):Promise<void>;
  addListener(name:'sample'|'state',listener:(sample:StepSensorSample&{state?:string})=>void):Promise<PluginListenerHandle>;
}
let cachedNative:StepApi|undefined;
function nativeApi(){return cachedNative??=registerPlugin<StepApi>('IndoorSteps');}
/** Each run owns its listeners and baseline; stopped/paused movement can never leak into a new run. */
export class IndoorStepSource {
  constructor(private platform:{isNative:()=>boolean;api:StepApi}={isNative:()=>Capacitor.isNativePlatform(),api:nativeApi()}){}
  private generation=0; private handles:PluginListenerHandle[]=[]; private browser:((event:DeviceMotionEvent)=>void)|null=null; private session=''; private timeout:ReturnType<typeof setTimeout>|undefined;private dataTimeout:ReturnType<typeof setTimeout>|undefined;
  async stop(){this.generation++;clearTimeout(this.timeout);clearTimeout(this.dataTimeout);if(this.browser)window.removeEventListener('devicemotion',this.browser);this.browser=null;const handles=this.handles;this.handles=[];const session=this.session;this.session='';await Promise.all(handles.map(h=>h.remove().catch(()=>{})));if(session){await this.platform.api.stop({session}).catch(()=>{});}}
  async start(onSteps:(steps:number,method:IndoorMeasurement)=>void,onStatus:(message:string)=>void,onSample?:(sample:StepSensorSample)=>void):Promise<IndoorMeasurement>{
    await this.stop();const run=++this.generation,detector=new MotionStepDetector(),baseline=new StepCounterBaseline();baseline.update(0);let samples=0,counterReady=false;
    const alive=()=>run===this.generation;const gravity=new LinearAccelerationFilter();let lastStepAt=Date.now();
    const warnIfIdle=()=>{clearTimeout(this.timeout);this.timeout=setTimeout(()=>{if(alive())onStatus(Date.now()-lastStepAt>=15000?"No walking steps detected. Walk normally; do not shake the phone. Retry calibration or use measured distances.":"Waiting for walking steps.");},15000);};
    warnIfIdle();
    if(this.platform.isNative()){
      const session=crypto.randomUUID();this.session=session;
      const capabilities=await this.platform.api.capabilities();if(!alive())throw new Error('Step tracking cancelled.');
      if(!capabilities.detector&&!capabilities.counter&&!capabilities.motion){clearTimeout(this.timeout);throw new Error('No usable motion samples: this device has no supported step or motion sensor.');}
      const handle=await this.platform.api.addListener('sample',sample=>{if(!alive()||sample.session!==session)return;samples++;onSample?.(sample);if(sample.steps!=null){if(!capabilities.detector&&sample.steps===0){counterReady=true;onStatus('Hardware counter baseline ready. You can begin walking.');}const delta=baseline.update(sample.steps);if(delta>0){lastStepAt=Date.now();warnIfIdle();onStatus(`${stepMethodLabel(capabilities.detector?'hardware-detector':'hardware-counter')} detecting steps.`);onSteps(delta,capabilities.detector?'hardware-detector':'hardware-counter');}}else if(sample.magnitude!=null){const count=detector.sample(sample.magnitude,sample.motionTime??performance.now());if(count){lastStepAt=Date.now();warnIfIdle();onStatus('Motion Estimate: walking rhythm detected. Verify the count on this phone.');onSteps(count,'motion-estimate');}}});
      if(!alive()){await handle.remove();throw new Error('Step tracking cancelled.');}this.handles.push(handle);
      const state=await this.platform.api.addListener('state',sample=>{if(alive()&&sample.state==='paused')onStatus('paused');});if(!alive()){await state.remove();throw new Error('Step tracking cancelled.');}this.handles.push(state);
      const result=await this.platform.api.start({session,allowMotionFallback:true});if(!alive()){await this.platform.api.stop({session});throw new Error('Step tracking cancelled.');}
      onStatus(result.method==='motion-estimate'?'Motion estimate: validate the step count during calibration.':result.method==='hardware-counter'?counterReady?'Hardware counter baseline ready. You can begin walking.':'Waiting for the hardware counter baseline. Stand still until ready; updates may arrive in batches.':'Hardware step detector active.');return result.method;
    }
    const api=window.DeviceMotionEvent as (typeof DeviceMotionEvent&{requestPermission?:()=>Promise<string>})|undefined;
    if(!api)throw new Error('Motion sensors unavailable. Use measured manual distances.');
    const granted=api.requestPermission?await api.requestPermission():'granted';if(!alive())throw new Error('Step tracking cancelled.');if(granted!=='granted')throw new Error('Motion permission denied. Use manual distances or retry permission.');
    this.browser=event=>{if(!alive())return;const raw=event.acceleration;const withGravity=event.accelerationIncludingGravity;const t=performance.now();const linear=raw?.x!=null&&raw.y!=null&&raw.z!=null?[raw.x,raw.y,raw.z]:withGravity?.x!=null&&withGravity.y!=null&&withGravity.z!=null?gravity.sample([withGravity.x,withGravity.y,withGravity.z],t):null;if(!linear||!linear.every(Number.isFinite))return;samples++;onSample?.({session:'browser',timestamp:Date.now(),motionTime:t,magnitude:Math.hypot(...linear),method:'motion-estimate'});const rotation=event.rotationRate;if(rotation&&[rotation.alpha,rotation.beta,rotation.gamma].some(v=>v!=null&&Math.abs(v)>60)){detector.reset();return;}const count=detector.sample(Math.hypot(...linear),t);if(count){lastStepAt=Date.now();warnIfIdle();onStatus('Motion Estimate: walking rhythm detected. Verify the count on this phone.');onSteps(count,'motion-estimate');}};
    window.addEventListener('devicemotion',this.browser);
    this.dataTimeout=setTimeout(()=>{if(alive()&&!samples)onStatus('No usable motion samples. Retry on a supported phone or use measured manual distances.');},4000);
    onStatus('Motion estimate: calibrate on this phone and check the detected steps.');return 'motion-estimate';
  }
}
