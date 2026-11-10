import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Building } from '../src/types';
import type { Position } from '@capacitor/geolocation';
import { createRecording } from '../../shared/gps-recording';
const mocks = vi.hoisted(() => ({ get:vi.fn(), watch:vi.fn(), clear:vi.fn(), read:vi.fn(), write:vi.fn(), save:vi.fn(), publish:vi.fn(), load:vi.fn(), leave:vi.fn(), cleared:vi.fn() }));
vi.mock('@capacitor/geolocation', () => ({ Geolocation: { getCurrentPosition:mocks.get, watchPosition:mocks.watch, clearWatch:mocks.clear } }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform:()=>false } }));
vi.mock('vue-router', () => ({ onBeforeRouteLeave:mocks.leave }));
vi.mock('../src/stores/session', () => ({ useSession:()=>({ state:{userId:'admin'}, canManageContent:{value:true}, isAdmin:{value:true}, onCleared:(callback:()=>void)=>{mocks.cleared.mockImplementation(callback);return ()=>{};} }) }));
vi.mock('../../shared/route-drafts', () => ({ readRouteDraft:mocks.read, writeRouteDraft:mocks.write }));
vi.mock('../src/services/outdoor-recordings', () => ({ saveRecording:mocks.save, publishRecording:mocks.publish, loadPublishedNetwork:mocks.load }));
import GpsRouteRecorder from '../src/components/GpsRouteRecorder.vue';
const building = { id:'b', name:'IT', entrance_name:'IT entrance', entrance_lat:0, entrance_lng:0.0002 } as Building;
let callback: (p:Position|null,error?:unknown)=>void;
const point = (meters:number,time=Date.now()):Position => ({ timestamp:time, coords:{ latitude:0,longitude:meters/111195,accuracy:3,altitude:null,altitudeAccuracy:null,heading:null,speed:null,magneticHeading:undefined,trueHeading:undefined,headingAccuracy:undefined,course:undefined } });
const wrappers:ReturnType<typeof mount>[]=[];
function editor(){const w=mount(GpsRouteRecorder,{props:{building,graph:{version:1,verified:false,nodes:[],edges:[]}}});wrappers.push(w);return w;}
function button(w:ReturnType<typeof editor>,text:string){return w.findAll('button').find(b=>b.text().includes(text))!;}
beforeEach(()=>{vi.clearAllMocks();mocks.read.mockResolvedValue(null);mocks.write.mockResolvedValue(undefined);mocks.clear.mockResolvedValue(undefined);mocks.get.mockResolvedValue(point(0));mocks.watch.mockImplementation(async (_:unknown,cb:typeof callback)=>{callback=cb;return 'gps-watch';});vi.spyOn(window,'confirm').mockReturnValue(true);});
afterEach(()=>{wrappers.splice(0).forEach(w=>w.unmount());vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
test('GPS works without camera, ignores repeated turns, finishes into review and retains a durable draft',async()=>{
 vi.useFakeTimers({toFake:['Date']});
 const w=editor();await flushPromises();await button(w,'Start Recording').trigger('click');await flushPromises();expect(w.text()).toContain('Camera unavailable');
 const t=Date.now();vi.setSystemTime(t+5000);callback(point(5,t+5000));vi.setSystemTime(t+10000);callback(point(10,t+10000));await flushPromises();await button(w,'Turn Left').trigger('click');await button(w,'Turn Left').trigger('click');expect(w.text()).toContain('next checkpoint');
 await button(w,'Finish Route').trigger('click');await flushPromises();expect(w.text()).toContain('Review recorded route');expect(mocks.clear).toHaveBeenCalledWith({id:'gps-watch'});expect(mocks.write).toHaveBeenCalled();expect(mocks.publish).not.toHaveBeenCalled();
});
test('pause ignores callbacks and resume never counts travel while paused',async()=>{
 vi.useFakeTimers({toFake:['Date']});
 const w=editor();await flushPromises();await button(w,'Start Recording').trigger('click');await flushPromises();const t=Date.now();callback(point(5,t+5000));await flushPromises();await button(w,'Pause').trigger('click');callback(point(200,t+10000));await flushPromises();
 expect((mocks.write.mock.calls.at(-1)![1] as {points:unknown[]}).points).toHaveLength(2);
 vi.setSystemTime(t+15000); mocks.get.mockResolvedValue(point(200,t+15000));await button(w,'Resume').trigger('click');await flushPromises();await button(w,'Finish Route').trigger('click');await flushPromises();expect(w.text()).toContain('5.0 m estimated');await button(w,'Validate Route').trigger('click');expect(w.text()).toContain('gap');
});
test('late camera streams and GPS watchers are cleaned after unmount',async()=>{
 let resolveWatch!:(id:string)=>void;mocks.watch.mockImplementationOnce(()=>new Promise<string>(resolve=>{resolveWatch=resolve;}));const w=editor();await flushPromises();await button(w,'Start Recording').trigger('click');await flushPromises();w.unmount();resolveWatch('late-watch');await flushPromises();expect(mocks.clear).toHaveBeenCalledWith({id:'late-watch'});
});
test('backgrounding pauses and permission failures preserve recovery instead of inventing movement',async()=>{
 const w=editor();await flushPromises();mocks.get.mockRejectedValueOnce(new Error('Location disabled'));await button(w,'Start Recording').trigger('click');await flushPromises();expect(w.text()).toContain('Location Services');expect(mocks.write).toHaveBeenCalled();
 await button(w,'Resume').trigger('click');await flushPromises();window.dispatchEvent(new Event('pagehide'));await flushPromises();expect(w.text()).toContain('Paused');expect(mocks.clear).toHaveBeenCalled();
});
test('recovery retains points and offline synchronization failure keeps the local recording',async()=>{
 const r=createRecording('recovered','b','IT',{latitude:0,longitude:0.0002});r.points=[{latitude:0,longitude:0,timestamp:Date.now()-1000,accuracy:3}];r.checkpoints=[{index:0,direction:'straight'}];mocks.read.mockResolvedValueOnce(r);
 const w=editor();await flushPromises();expect(w.text()).toContain('Unfinished walk found');await button(w,'Recover draft').trigger('click');await button(w,'Finish Route').trigger('click');mocks.save.mockRejectedValueOnce(new Error('offline'));await button(w,'Save online').trigger('click');await flushPromises();expect(w.text()).toContain('Local draft kept');expect(mocks.write.mock.calls.at(-1)?.[1].syncPending).toBe(true);
});
test('cancelling requires confirmation and rejecting navigation leaves recording active',async()=>{
 const w=editor();await flushPromises();await button(w,'Start Recording').trigger('click');await flushPromises();vi.mocked(window.confirm).mockReturnValue(false);const leave=mocks.leave.mock.calls.at(-1)![0];expect(leave()).toBe(false);expect(mocks.clear).not.toHaveBeenCalled();await button(w,'Cancel Recording').trigger('click');expect(w.find('.directions').exists()).toBe(true);
});


test('only an explicitly validated route can publish, and publishing emits a versioned checked network',async()=>{
 vi.useFakeTimers({toFake:['Date']});const t=Date.now();
 const w=editor();await w.setProps({map:{image:'/images/updated_map.png',anchors:[{x:0,y:0,latitude:0.001,longitude:-0.001},{x:1,y:0,latitude:0.001,longitude:0.001},{x:0,y:1,latitude:-0.001,longitude:-0.001}],checks:[{x:0.5,y:0.5,latitude:0,longitude:0}]}});await flushPromises();
 await button(w,'Start Recording').trigger('click');await flushPromises();
 for(const meters of [5,10,15,20]){vi.setSystemTime(t+meters*1000);callback(point(meters,t+meters*1000));}
 await button(w,'Finish Route').trigger('click');await flushPromises();expect(button(w,'Publish Route').attributes('disabled')).toBeDefined();
 for(const checkbox of w.findAll('.checks input'))await checkbox.setValue(true);
 await button(w,'Validate Route').trigger('click');await flushPromises();expect(w.text()).toContain('Validated locally');expect(mocks.publish).not.toHaveBeenCalled();
 mocks.load.mockResolvedValueOnce(null);mocks.save.mockResolvedValueOnce(undefined);mocks.publish.mockImplementationOnce(async(_r,g)=>({schemaVersion:1,revision:1,publishedAt:new Date().toISOString(),graph:{...g,verified:true}}));
 await button(w,'Publish Route').trigger('click');await flushPromises();expect(mocks.publish).toHaveBeenCalledOnce();expect(mocks.publish.mock.calls[0][1].edges.every((e:{validation:string})=>e.validation==='validated')).toBe(true);expect(w.emitted('network')).toHaveLength(1);expect(w.text()).toContain('Published version 1');
});

test('camera arriving after cancellation is stopped without accepting more GPS',async()=>{
 let resolveCamera!:(stream:MediaStream)=>void;const stop=vi.fn();vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:()=>new Promise<MediaStream>(resolve=>{resolveCamera=resolve;})}});
 const w=editor();await flushPromises();await button(w,'Start Recording').trigger('click');await flushPromises();await button(w,'Cancel Recording').trigger('click');resolveCamera({getTracks:()=>[{stop}]} as unknown as MediaStream);await flushPromises();expect(stop).toHaveBeenCalledOnce();expect(w.find('.camera-panel').exists()).toBe(false);expect(mocks.clear).toHaveBeenCalledWith({id:'gps-watch'});
});


test('finished recordings keep their review status even after GPS ages and do not show a paused message',async()=>{
 vi.useFakeTimers({toFake:['Date']});const w=editor();await flushPromises();await button(w,'Start Recording').trigger('click');await flushPromises();await button(w,'Finish Route').trigger('click');await flushPromises();vi.setSystemTime(Date.now()+60000);await w.vm.$forceUpdate();
 expect(w.find('.signal').text()).toBe('Recording finished');expect(w.find('.gps-message').text()).toContain('Recording finished');expect(w.text()).not.toContain('Paused. No distance');expect(w.text()).toContain('Last GPS accuracy');expect(w.text()).toContain('Total estimated distance');
});

test('cancel resets previous GPS readings, warnings and checkpoint feedback before the next start',async()=>{
 const w=editor();await flushPromises();await button(w,'Start Recording').trigger('click');await flushPromises();await button(w,'Turn Right').trigger('click');expect(w.find('.checkpoint-message').exists()).toBe(true);await button(w,'Cancel Recording').trigger('click');await flushPromises();expect(w.find('.signal').text()).toBe('Not recording');expect(w.find('.location').exists()).toBe(false);expect(w.find('.checkpoint-message').exists()).toBe(false);expect(w.text()).not.toContain('Camera unavailable');expect(w.text()).not.toContain('Holding position');expect(w.text()).toContain('GPS will start when you begin recording.');
});

test('fresh stationary fixes allow a turn at an existing movement point without adding distance',async()=>{
 vi.useFakeTimers({toFake:['Date']});const w=editor();await flushPromises();await button(w,'Start Recording').trigger('click');await flushPromises();const t=Date.now();vi.setSystemTime(t+10000);callback(point(10));await flushPromises();vi.setSystemTime(t+30000);callback(point(10));await flushPromises();
 await button(w,'Turn Left').trigger('click');await flushPromises();expect(w.find('.checkpoint-message').exists()).toBe(false);const draft=mocks.write.mock.calls.at(-1)![1];expect(draft.points).toHaveLength(2);expect(draft.checkpoints).toHaveLength(2);expect(draft.checkpoints[1]).toMatchObject({index:1,direction:'left'});expect(w.find('.camera-direction').text()).toContain('10.0');
 await button(w,'Turn Left').trigger('click');expect(w.text()).toContain('next checkpoint');
});

test('a fresh but unreliable reading cannot authorize a checkpoint',async()=>{
 vi.useFakeTimers({toFake:['Date']});const w=editor();await flushPromises();await button(w,'Start Recording').trigger('click');await flushPromises();vi.setSystemTime(Date.now()+10000);callback(point(10));await flushPromises();const bad=point(10);bad.coords.accuracy=90;callback(bad);await button(w,'Turn Right').trigger('click');expect(w.text()).toContain('fresh reliable GPS');expect(mocks.write.mock.calls.at(-1)![1].checkpoints).toHaveLength(1);
});

test('off-map recordings show their separate GPS trace and never overlay the school map',async()=>{
 const r=createRecording('outside','b','IT',{latitude:1,longitude:1});r.points=[{latitude:1,longitude:1,timestamp:Date.now()-1000,accuracy:3}];r.checkpoints=[{index:0,direction:'straight'}];mocks.read.mockResolvedValueOnce(r);
 const w=editor();await w.setProps({map:{image:'/images/updated_map.png',anchors:[{x:0,y:0,latitude:0.001,longitude:-0.001},{x:1,y:0,latitude:0.001,longitude:0.001},{x:0,y:1,latitude:-0.001,longitude:-0.001}],checks:[{x:0.5,y:0.5,latitude:0,longitude:0}]}});await flushPromises();await button(w,'Recover draft').trigger('click');await button(w,'Finish Route').trigger('click');expect(w.text()).toContain('outside the aligned school map');expect(w.find('[aria-label="Recorded GPS path diagram"]').exists()).toBe(true);expect(w.find('.recorded-map .campus-image').exists()).toBe(false);
});
