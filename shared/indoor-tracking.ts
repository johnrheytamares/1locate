export type IndoorMeasurement = 'hardware-detector' | 'hardware-counter' | 'motion-estimate' | 'manual' | 'mixed';
export interface StrideProfile { version: 1; method: IndoorMeasurement; distance: number; steps: number; stride: number; calibratedAt: string }
export function calibrateStride(distance: number, steps: number, method: IndoorMeasurement, now = new Date().toISOString()): StrideProfile {
  const stride = distance / steps;
  if (!Number.isFinite(distance) || distance < 1 || distance > 1000 || !Number.isInteger(steps) || steps < 4 || !Number.isFinite(stride) || stride < 0.2 || stride > 1.5 || !['hardware-detector','hardware-counter','motion-estimate'].includes(method)) throw new Error('Calibration needs a measured distance, at least 4 detected steps and a stride between 0.2 and 1.5 m. Retry the walk if the count looks wrong.');
  return { version: 1, method, distance, steps, stride, calibratedAt: now };
}
export function parseStrideProfile(value: unknown): StrideProfile {
  const p = value as StrideProfile;
  if (!p || p.version !== 1 || !Number.isFinite(Date.parse(p.calibratedAt))) throw new Error('Invalid calibration profile.');
  const checked = calibrateStride(p.distance,p.steps,p.method,p.calibratedAt);
  if (!Number.isFinite(p.stride) || Math.abs(checked.stride-p.stride)>1e-6) throw new Error('Invalid calibrated stride.');
  return checked;
}
export class StepCounterBaseline {
  private previous: number | null = null;
  reset() { this.previous = null; }
  update(total: number): number {
    if (!Number.isFinite(total) || total < 0) return 0;
    if (this.previous == null || total < this.previous) { this.previous = total; return 0; }
    const delta = Math.floor(total-this.previous); this.previous=total; return delta;
  }
}
export const STREAK_TO_CONFIRM=4;
export function stepMethodLabel(method:IndoorMeasurement|null):string {
 return method==='hardware-detector'?'Hardware Step Detector':method==='hardware-counter'?'Hardware Step Counter':method==='motion-estimate'?'Motion Estimate':'Sensor Unavailable';
}
export interface StepSample {
  /** Steps to credit now: all confirmed strides of a new streak, then one per stride. */
  steps: number;
  /** A complete acceleration pulse was seen on this sample. */
  candidate: boolean;
  /** Why the pulse did not count yet, or null. */
  reason: string | null;
}

const QUIET: StepSample = Object.freeze({ steps: 0, candidate: false, reason: null });

/** Conservative walking heuristic: complete pulses plus four consistent strides.
 * Pulses that do not form that rhythm never count, so a brief phone adjustment cannot add distance.
 * Repeated rhythmic shaking can still resemble walking without an independent position source.
 */
export class WalkingPulseDetector {
  private low = false;
  private pulseStart: number | null = null;
  private last = -Infinity;
  private interval: number | null = null;
  private streak = 0;
  private sampleAt = -Infinity;
  sample(magnitude: number, time: number): StepSample {
    if (!Number.isFinite(magnitude) || !Number.isFinite(time)) return { steps: 0, candidate: false, reason: 'invalid motion sample' };
    if(time<=this.sampleAt)return QUIET;
    this.sampleAt=time;
    if (magnitude > 8) {
      this.reset();
      return { steps: 0, candidate: false, reason: 'jolt over 8 m/s²' };
    }
    if (magnitude >= 1.4 && this.low && this.pulseStart == null) {
      this.pulseStart = time;
      this.low = false;
    }
    if (magnitude >= 0.7) return QUIET;
    this.low = true;
    if (this.pulseStart == null) return QUIET;
    const duration = time - this.pulseStart;
    this.pulseStart = null;
    if (duration < 60 || duration > 350) {
      this.reset();
      return { steps: 0, candidate: true, reason: `pulse lasted ${Math.round(duration)} ms (needs 60–350 ms)` };
    }
    const gap = time - this.last;
    let reason: string | null = null;
    if (!Number.isFinite(gap)) {
      this.restartStreak();
    } else if (gap < 350 || gap > 1600) {
      reason = `step gap ${Math.round(gap)} ms (needs 350–1600 ms)`;
      this.restartStreak();
    } else if (this.interval != null && Math.abs(gap - this.interval) > this.interval * 0.35) {
      reason = `irregular rhythm (${Math.round(gap)} ms vs ${Math.round(this.interval)} ms)`;
      this.restartStreak();
    } else {
      this.streak += 1;
      this.interval = this.interval == null ? gap : this.interval * 0.7 + gap * 0.3;
    }
    this.last = time;
    if (this.streak === STREAK_TO_CONFIRM) return { steps: STREAK_TO_CONFIRM, candidate: true, reason: null };
    if (this.streak > STREAK_TO_CONFIRM) return { steps: 1, candidate: true, reason: null };
    return { steps: 0, candidate: true, reason: reason ?? `confirming rhythm (${this.streak}/${STREAK_TO_CONFIRM})` };
  }
  private restartStreak() {
    this.streak = 1;
    this.interval = null;
  }
  reset() {
    this.low = false;
    this.pulseStart = null;
    this.last = -Infinity;
    this.interval = null;
    this.streak = 0;
    this.sampleAt = -Infinity;
  }
}

export class MotionStepDetector {
 private detector=new WalkingPulseDetector();
 sample(magnitude:number,time:number){return this.detector.sample(magnitude,time).steps;}
 reset(){this.detector.reset();}
}
/** Time-based gravity filter, initialized from the first actual sample (no startup gravity spike). */
export class LinearAccelerationFilter {
 private gravity:number[]|null=null;private time=0;
 sample(values:number[],time:number):number[]|null {
  if(values.length!==3||!values.every(Number.isFinite)||!Number.isFinite(time))return null;
  if(!this.gravity){this.gravity=[...values];this.time=time;return [0,0,0];}
  const dt=time-this.time;if(dt<=0)return null;
  const k=dt/(500+dt);this.time=time;
  this.gravity=this.gravity.map((g,i)=>g+k*(values[i]-g));
  return values.map((v,i)=>v-this.gravity![i]);
 }
}
export type FloorAction = 'upstairs'|'downstairs'|'elevator'|'arrive-floor'|'arrived';
export interface IndoorInstruction { kind:'walk'|FloorAction; direction:'straight'|'left'|'right'; distance:number; checkpoint?:boolean; floorId?:string; floorName?:string; level?:number; method?:IndoorMeasurement; calibration?:StrideProfile; recordedAt?:string }
export interface IndoorJourney { version:2; destinationId:string; buildingId:string; floorId:string|null; routeType:'indoor'; status:'draft'|'validated'; recordedAt:string; instructions:IndoorInstruction[] }
export function parseIndoorJourney(input:unknown):IndoorJourney {
  const j=input as IndoorJourney;
  if(!j||j.version!==2||typeof j.destinationId!=='string'||!j.destinationId||typeof j.buildingId!=='string'||!j.buildingId||(j.floorId!==null&&typeof j.floorId!=='string')||j.routeType!=='indoor'||!['draft','validated'].includes(j.status)||!Number.isFinite(Date.parse(j.recordedAt))||!Array.isArray(j.instructions)||!j.instructions.length||j.instructions.length>100)throw new Error('Invalid indoor journey.');
  let waitingFloor:string|null=null;
  j.instructions.forEach((s,i)=>{
    if(!s||!['walk','upstairs','downstairs','elevator','arrive-floor','arrived'].includes(s.kind))throw new Error(`Instruction ${i+1}: choose a supported instruction.`);
    if(s.kind==='walk'){
      if(waitingFloor)throw new Error('Confirm arrival at the new floor before adding walking instructions.');
      if(!['straight','left','right'].includes(s.direction)||!Number.isFinite(s.distance)||s.distance<=0||s.distance>500)throw new Error('Walking instructions need a direction and 0–500 m of measured or estimated walking.');
    }else{
      if(s.distance!==0)throw new Error('Floor changes are checkpoints, never meters.');
      if(s.kind!=='arrived'&&(typeof s.floorId!=='string'||!s.floorId||typeof s.floorName!=='string'||!s.floorName||!Number.isInteger(s.level)))throw new Error('Choose the actual floor for this checkpoint.');
      if(['upstairs','downstairs','elevator'].includes(s.kind)){if(waitingFloor)throw new Error('Confirm the previous floor transition first.');waitingFloor=s.floorId!;}
      if(s.kind==='arrive-floor'){if(waitingFloor!==s.floorId)throw new Error('Floor arrival must match its preceding transition.');waitingFloor=null;}
      if(s.kind==='arrived'&&i!==j.instructions.length-1)throw new Error('Destination arrival must be the last instruction.');
    }
    if(s.calibration)parseStrideProfile(s.calibration);
  });
  const finalFloor=j.instructions.filter(s=>s.kind==='arrive-floor').at(-1)?.floorId;if(finalFloor&&j.floorId&&finalFloor!==j.floorId)throw new Error('The final floor must match the destination room floor.');
  if(waitingFloor)throw new Error('Add a confirmed arrival at the new floor.');
  if(j.instructions.at(-1)?.kind!=='arrived')throw new Error('Add an arrival checkpoint at the destination.');
  return j;
}
export function compatibleStraight(a:IndoorInstruction,b:IndoorInstruction){return a.kind==='walk'&&b.kind==='walk'&&a.direction==='straight'&&b.direction==='straight'&&a.floorId===b.floorId&&!a.checkpoint&&!b.checkpoint&&a.distance+b.distance<=500;}
export function mergeStraightInstructions(steps:IndoorInstruction[]):IndoorInstruction[]{
  const merged:IndoorInstruction[]=[];
  for(const source of steps){const s={...source},last=merged.at(-1);if(last&&compatibleStraight(last,s)){last.distance=Math.round((last.distance+s.distance)*100)/100;if(last.method!==s.method)last.method='mixed';if(JSON.stringify(last.calibration)!==JSON.stringify(s.calibration))delete last.calibration;}else merged.push(s);}return merged;
}
