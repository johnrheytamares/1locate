import {expect,test} from 'vitest';
import {calibrateStride,parseStrideProfile,StepCounterBaseline,MotionStepDetector,mergeStraightInstructions,parseIndoorJourney,type IndoorInstruction} from '../../shared/indoor-tracking';
const walk=(distance:number,extra:Partial<IndoorInstruction>={}):IndoorInstruction=>({kind:'walk',direction:'straight',distance,...extra});
const arrival:IndoorInstruction={kind:'arrived',direction:'straight',distance:0,checkpoint:true};
const upstairs:IndoorInstruction={kind:'upstairs',direction:'straight',distance:0,checkpoint:true,floorId:'f2',floorName:'2nd floor',level:2};
const arrivedFloor:IndoorInstruction={...upstairs,kind:'arrive-floor'};
const journey=(instructions:IndoorInstruction[])=>({version:2,destinationId:'room',buildingId:'building',floorId:'f2',routeType:'indoor',status:'validated',recordedAt:new Date().toISOString(),instructions});
test('calibration derives a persisted per-step distance only from measured length and actual detected steps',()=>{const p=calibrateStride(6.5,10,'hardware-detector');expect(p.stride).toBe(0.65);expect(parseStrideProfile(JSON.parse(JSON.stringify(p)))).toEqual(p);for(const [distance,steps] of [[10,0],[10,1],[0,10],[100,4],[NaN,10]])expect(()=>calibrateStride(distance,steps,'motion-estimate')).toThrow();expect(()=>parseStrideProfile({...p,stride:5})).toThrow();});
test('counter baseline excludes old steps, ignores a counter reset and takes a fresh baseline after pause',()=>{const b=new StepCounterBaseline();expect(b.update(5432)).toBe(0);expect(b.update(5435)).toBe(3);expect(b.update(2)).toBe(0);expect(b.update(4)).toBe(2);b.reset();expect(b.update(100)).toBe(0);expect(b.update(102)).toBe(2);});
test('motion fallback rejects stationary jitter and credits a complete confirmed streak without silently losing its first steps',()=>{const d=new MotionStepDetector();for(let t=0;t<1000;t+=40)expect(d.sample(0.2,t)).toBe(0);const pulse=(t:number)=>{d.sample(0,t);d.sample(2,t+20);return d.sample(0,t+120);};expect(pulse(1000)).toBe(0);expect(pulse(1600)).toBe(0);expect(pulse(2200)).toBe(0);expect(pulse(2800)).toBe(4);expect(pulse(3400)).toBe(1);d.reset();expect(pulse(5000)).toBe(0);});
test('compatible straight sections merge, but turns, floors, doors and administrator checkpoints remain boundaries',()=>{expect(mergeStraightInstructions([walk(1),walk(2),walk(1),walk(1),walk(1,{direction:'right'})]).map(s=>s.distance)).toEqual([5,1]);expect(mergeStraightInstructions([walk(1),walk(2,{checkpoint:true}),walk(1)])).toHaveLength(3);expect(mergeStraightInstructions([walk(1),upstairs,arrivedFloor,walk(1)])).toHaveLength(4);expect(mergeStraightInstructions([walk(1,{floorId:'a'}),walk(1,{floorId:'b'})])).toHaveLength(2);expect(mergeStraightInstructions([walk(499),walk(2)])).toHaveLength(2);});
test('explicit floor changes are zero-meter checkpoints that need matching floor confirmation',()=>{const value=journey([walk(10),upstairs,arrivedFloor,walk(3,{direction:'right'}),arrival]);expect(parseIndoorJourney(value).instructions.filter(s=>s.kind==='walk').reduce((n,s)=>n+s.distance,0)).toBe(13);expect(()=>parseIndoorJourney(journey([walk(10),{...upstairs,distance:1},arrivedFloor,arrival]))).toThrow('never meters');expect(()=>parseIndoorJourney(journey([walk(10),upstairs,walk(3),arrival]))).toThrow('Confirm');expect(()=>parseIndoorJourney(journey([walk(10),upstairs,{...arrivedFloor,floorId:'other'},arrival]))).toThrow('match');expect(()=>parseIndoorJourney(journey([walk(10),upstairs,arrivedFloor]))).toThrow('arrival checkpoint');});
test('the destination floor must match the final confirmed floor even with no walking after the stairs',()=>{expect(()=>parseIndoorJourney({...journey([upstairs,arrivedFloor,arrival]),floorId:'f3'})).toThrow('destination room floor');});


test('synthetic slow cadence, duplicate samples and pause resets do not invent extra events',async()=>{
 const {WalkingPulseDetector,LinearAccelerationFilter}=await import('../../shared/indoor-tracking');
 const d=new WalkingPulseDetector();let total=0;
 for(let i=0;i<5;i++){const t=i*1400;d.sample(0,t);d.sample(2,t+20);const pulse=d.sample(0,t+120);total+=pulse.steps;expect(d.sample(0,t+120).steps).toBe(0);}
 expect(total).toBe(5);d.reset();expect(d.sample(0,9000).steps).toBe(0);
 const gravity=new LinearAccelerationFilter();for(let i=0;i<750;i++)expect(gravity.sample([0,0,9.81],i*20)).toEqual([0,0,0]);
 expect(()=>parseStrideProfile({...calibrateStride(7,10,'motion-estimate'),stride:NaN})).toThrow();
});
