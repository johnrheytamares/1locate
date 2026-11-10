import {beforeEach,afterEach,expect,test,vi} from 'vitest';
const mocks=vi.hoisted(()=>({start:vi.fn(),stop:vi.fn()}));
vi.mock('@capacitor/core',()=>({Capacitor:{isNativePlatform:()=>true}}));
vi.mock('../../shared/indoor-step-source',()=>({IndoorStepSource:class {start=mocks.start;stop=mocks.stop;}}));
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
test('a denied native step permission offers manual checkpoints without fake progress',async()=>{
 mocks.start.mockRejectedValue(new Error('Physical activity permission denied.'));const step=vi.fn(),walking=useIndoorWalking(()=>null,step);await walking.start();
 expect(walking.enabled.value).toBe(false);expect(walking.message.value).toContain('manual checkpoints');expect(step).not.toHaveBeenCalled();walking.stop();
});
