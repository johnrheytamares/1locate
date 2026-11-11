import {beforeEach,afterEach,expect,test,vi} from 'vitest';
const mocks=vi.hoisted(()=>({start:vi.fn(),stop:vi.fn()}));
vi.mock('@capacitor/core',()=>({Capacitor:{isNativePlatform:()=>true}}));
vi.mock('../../src/services/indoor-steps',()=>({IndoorStepSource:class {start=mocks.start;stop=mocks.stop;}}));
import {useIndoorWalking} from '../../src/composables/useIndoorWalking';
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('localStorage',{getItem:()=>null,setItem:vi.fn()});mocks.stop.mockResolvedValue(undefined);mocks.start.mockResolvedValue('hardware-detector');});
afterEach(()=>vi.unstubAllGlobals());
test('student hardware steps need no browser motion or admin stride and stop immediately on pause',async()=>{
 const accepted=vi.fn();let blocked:string|null=null;const walking=useIndoorWalking(()=>blocked,accepted,{diagnostics:true});
 walking.calibrate(10,20);await walking.start();expect(walking.message.value).toContain('Hardware Step Detector');
 const event=mocks.start.mock.calls[0][0];event(2,'hardware-detector');expect(accepted).toHaveBeenLastCalledWith(1);
 blocked='confirm turn';event(3,'hardware-detector');expect(accepted).toHaveBeenCalledTimes(1);
 walking.stop();event(4,'hardware-detector');expect(accepted).toHaveBeenCalledTimes(1);
 blocked=null;await walking.start();mocks.start.mock.calls[1][0](1,'hardware-detector');expect(accepted).toHaveBeenLastCalledWith(0.5);walking.stop();
});
test('a denied native step permission offers manual steps without fake progress',async()=>{
 mocks.start.mockRejectedValue(new Error('Physical activity permission denied.'));const step=vi.fn(),walking=useIndoorWalking(()=>null,step);await walking.start();
 expect(walking.enabled.value).toBe(false);expect(walking.message.value).toContain('manual steps');expect(step).not.toHaveBeenCalled();walking.stop();
});


test('unverified hardware events are diagnostic only and never reduce route distance',async()=>{
 const step=vi.fn(),walking=useIndoorWalking(()=>null,step,{requireValidation:true});await walking.start();
 mocks.start.mock.calls[0][0](12,'hardware-detector');expect(step).not.toHaveBeenCalled();expect(walking.detectedSteps.value).toBe(12);expect(walking.creditedSteps.value).toBe(0);expect(walking.validationRequired.value).toBe(true);walking.stop();
});
test('only a matching sensor with independently checked walking and zero stationary events can credit steps',async()=>{
 const value={version:1,profile:{version:1,method:'hardware-detector',distance:10,steps:20,stride:0.5,calibratedAt:new Date().toISOString()},independentSteps:20,checks:['standing','rotating','shaking'].map(activity=>({activity,durationMs:15000,steps:0}))};
 vi.stubGlobal('localStorage',{getItem:(key:string)=>key==='1locate.walking-validation.v1'?JSON.stringify(value):null,removeItem:vi.fn()});
 const step=vi.fn(),walking=useIndoorWalking(()=>null,step,{requireValidation:true});await walking.start();mocks.start.mock.calls[0][0](2,'hardware-detector');expect(step).toHaveBeenLastCalledWith(1);
 mocks.start.mock.calls[0][0](2,'motion-estimate');expect(step).toHaveBeenCalledTimes(1);walking.reportUnreliable();mocks.start.mock.calls[0][0](2,'hardware-detector');expect(step).toHaveBeenCalledTimes(1);
});
