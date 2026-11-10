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
  if (Math.abs(checked.stride-p.stride)>1e-6) throw new Error('Invalid calibrated stride.');
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
/** Complete pulses and sustained cadence; credit the first confirmed streak as a batch. */
export class MotionStepDetector {
  private low=false; private pulse:number|null=null; private last=-Infinity; private interval:number|null=null; private streak=0;
  sample(magnitude:number,time:number):number {
    if(!Number.isFinite(magnitude)||!Number.isFinite(time))return 0;
    if(magnitude>8){this.reset();return 0;}
    if(magnitude>=1.4&&this.low&&this.pulse==null){this.pulse=time;this.low=false;}
    if(magnitude>=0.7)return 0;this.low=true;if(this.pulse==null)return 0;
    const duration=time-this.pulse;this.pulse=null;if(duration<60||duration>350){this.reset();return 0;}
    const gap=time-this.last;
    if(gap<350||gap>1100||(this.interval!=null&&Math.abs(gap-this.interval)>this.interval*0.35)){this.streak=1;this.interval=null;}
    else{this.streak++;this.interval=this.interval==null?gap:this.interval*0.7+gap*0.3;}
    this.last=time;return this.streak===4?4:this.streak>4?1:0;
  }
  reset(){this.low=false;this.pulse=null;this.last=-Infinity;this.interval=null;this.streak=0;}
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
