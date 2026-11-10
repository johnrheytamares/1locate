import {mount,flushPromises} from '@vue/test-utils';
import {beforeEach,afterEach,expect,test,vi} from 'vitest';
const mocks=vi.hoisted(()=>({start:vi.fn(),stop:vi.fn()}));
vi.mock('../../src/services/indoor-steps',()=>({IndoorStepSource:class{start=mocks.start;stop=mocks.stop;}}));
import WalkingSensorCheck from '../../src/components/navigation/WalkingSensorCheck.vue';
import {useIndoorWalking} from '../../src/composables/useIndoorWalking';
import {WALKING_VALIDATION_KEY,readWalkingValidation} from '../../src/services/walking-validation';
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();mocks.start.mockResolvedValue('hardware-detector');mocks.stop.mockResolvedValue(undefined);const data=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v),removeItem:(k:string)=>data.delete(k)});});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
async function setup(){const progress=vi.fn(),walking=useIndoorWalking(()=>null,progress,{requireValidation:true});const w=mount(WalkingSensorCheck,{props:{walking}});await w.findAll('input')[1].setValue(20);return {w,progress};}
async function click(w:ReturnType<typeof mount>,text:string){await w.findAll('button').find(b=>b.text()===text)!.trigger('click');await flushPromises();}
test('walk and all stationary checks never add route distance and only then allow saving',async()=>{
 const {w,progress}=await setup();await click(w,'Start measured walk');mocks.start.mock.calls.at(-1)![0](20,'hardware-detector');await click(w,'Finish check');
 for(let i=0;i<3;i++){await click(w,'Start stationary check');await vi.advanceTimersByTimeAsync(15000);await click(w,'Finish check');}
 await click(w,'Save this phone’s calibration');expect(readWalkingValidation('hardware-detector')?.profile.stride).toBe(0.5);expect(progress).not.toHaveBeenCalled();w.unmount();
});
test('a stationary false event fails validation and cannot enable route progress',async()=>{
 const {w,progress}=await setup();await click(w,'Start measured walk');mocks.start.mock.calls.at(-1)![0](20,'hardware-detector');await click(w,'Finish check');
 await click(w,'Start stationary check');mocks.start.mock.calls.at(-1)![0](1,'hardware-detector');await vi.advanceTimersByTimeAsync(15000);await click(w,'Finish check');
 expect(w.text()).toContain('failed the check');expect(localStorage.getItem(WALKING_VALIDATION_KEY)).toBeNull();expect(progress).not.toHaveBeenCalled();w.unmount();
});

test('counter checks wait for delayed stationary events rather than passing at 15 seconds',async()=>{
 mocks.start.mockResolvedValue('hardware-counter');const {w,progress}=await setup();await click(w,'Start measured walk');mocks.start.mock.calls.at(-1)![0](20,'hardware-counter');await click(w,'Finish check');
 await click(w,'Start stationary check');await vi.advanceTimersByTimeAsync(15000);await click(w,'Finish check');expect(w.text()).toContain('wait 10 seconds');
 mocks.start.mock.calls.at(-1)![0](1,'hardware-counter');await vi.advanceTimersByTimeAsync(10000);await click(w,'Finish check');expect(w.text()).toContain('failed the check');expect(progress).not.toHaveBeenCalled();w.unmount();
});
