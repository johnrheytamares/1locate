import {mount,flushPromises} from '@vue/test-utils';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
const mocks=vi.hoisted(()=>({start:vi.fn(),stop:vi.fn(),save:vi.fn()}));
vi.mock('../src/services/indoor-steps',()=>({IndoorStepSource:class {start=mocks.start;stop=mocks.stop;},saveCalibration:mocks.save}));
import IndoorStepCalibration from '../src/components/IndoorStepCalibration.vue';
beforeEach(()=>{vi.clearAllMocks();mocks.stop.mockResolvedValue(undefined);});
afterEach(()=>vi.useRealTimers());
test('shows the actual hardware sensor, reviews stride and saves a detected-step calibration',async()=>{
 vi.useFakeTimers();mocks.start.mockResolvedValue('hardware-detector');
 const w=mount(IndoorStepCalibration,{props:{user:'test'}});
 await w.findAll('button').find(b=>b.text()==='Start calibration walk')!.trigger('click');await flushPromises();
 expect(w.text()).toContain('Hardware Step Detector');
 vi.advanceTimersByTime(10000);mocks.start.mock.calls[0][0](16,'hardware-detector');await flushPromises();
 await w.findAll('button').find(b=>b.text()==='Finish calibration')!.trigger('click');
 expect(w.text()).toContain('16 detected steps');expect(w.text()).toContain('Plausible stride');
 await w.find('.check input').setValue(true);await w.findAll('button').find(b=>b.text()==='Use calibration')!.trigger('click');
 expect(mocks.save).toHaveBeenCalledWith('test',expect.objectContaining({method:'hardware-detector',steps:16,stride:0.625}));w.unmount();
});
test('labels the motion fallback, rejects an implausible count and provides measured-distance fallback',async()=>{
 mocks.start.mockResolvedValue('motion-estimate');const w=mount(IndoorStepCalibration,{props:{user:'test'}});
 await w.findAll('button').find(b=>b.text()==='Start calibration walk')!.trigger('click');await flushPromises();
 expect(w.text()).toContain('Motion Estimate');mocks.start.mock.calls[0][0](1,'motion-estimate');await flushPromises();
 await w.findAll('button').find(b=>b.text()==='Finish calibration')!.trigger('click');expect(w.text()).toContain('Repeat the measured walk');
 await w.find('.check input').setValue(true);expect(w.findAll('button').find(b=>b.text()==='Use calibration')!.attributes('disabled')).toBeDefined();
 expect(mocks.save).not.toHaveBeenCalled();w.unmount();
});
