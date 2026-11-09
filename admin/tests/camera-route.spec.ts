import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import type { Building, DestinationRecord, Room } from '@/types';

const mocks = vi.hoisted(() => ({ save: vi.fn(), leave: vi.fn() }));
vi.mock('@/services/campus', () => ({ createDestination: vi.fn(), saveDestinationRoute: mocks.save }));
vi.mock('@/stores/session', () => ({ useSession: () => ({ state: { userId: 'camera-test' }, onCleared: () => () => {} }) }));
vi.mock('vue-router', () => ({ onBeforeRouteLeave: mocks.leave }));
import DestinationEditor from '@/components/DestinationEditor.vue';

const room = { id: 'r', building_id: 'b', name: 'Room' } as Room;
const building = { id: 'b', name: 'IT', entrance_name: 'Main' } as Building;
const destination = { id: 'd', room_id: 'r', name: 'Room', indoor_route: [{ direction: 'straight', distance: 8 }] } as DestinationRecord;
const wrappers: ReturnType<typeof mount>[] = [];
let stop: ReturnType<typeof vi.fn>;
let getUserMedia: ReturnType<typeof vi.fn>;
function editor() {
  const wrapper = mount(DestinationEditor, { props: { rooms: [room], buildings: [building], destination } });
  wrappers.push(wrapper); return wrapper;
}
function button(wrapper: ReturnType<typeof editor>, name: string) {
  return wrapper.findAll('button').find(b => b.text().includes(name))!;
}
async function start(wrapper: ReturnType<typeof editor>) {
  await wrapper.find('.entrance-check input').setValue(true);
  await button(wrapper, 'Start recording').trigger('click'); await flushPromises();
}
async function distance(wrapper: ReturnType<typeof editor>, value: number) {
  if (!(wrapper.find('.manual-toggle input').element as HTMLInputElement).checked) await wrapper.find('.manual-toggle input').setValue(true);
  await wrapper.find('.camera-controls input[type=number]').setValue(value);
}
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  stop = vi.fn();
  const track = { stop, onended: null };
  getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [track], getVideoTracks: () => [track] });
  vi.stubGlobal('navigator', { userAgent: navigator.userAgent, mediaDevices: { getUserMedia } });
});
afterEach(() => { wrappers.splice(0).forEach(w => w.unmount()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('camera route recording', () => {
  it('records relative turns, rejects repeated zero-distance taps, then saves the existing draft schema', async () => {
    const wrapper = editor(); await start(wrapper);
    expect(getUserMedia).toHaveBeenCalledWith({ audio: false, video: { facingMode: { ideal: 'environment' } } });
    expect(wrapper.find('video').element.srcObject).toBeTruthy();
    await distance(wrapper, 6.2); await button(wrapper, 'Turn Left').trigger('click');
    await button(wrapper, 'Turn Right').trigger('click');
    expect(wrapper.findAll('.segment')).toHaveLength(1);
    await distance(wrapper, 1.6); await button(wrapper, 'Turn Right').trigger('click');
    await distance(wrapper, 3.4); await button(wrapper, 'Finish Route').trigger('click'); await flushPromises();
    expect(stop).toHaveBeenCalled();
    expect(wrapper.find('video').exists()).toBe(false);
    expect(wrapper.find('.route-heading').text()).toContain('11.20 m total');
    mocks.save.mockResolvedValue({ ...destination, is_active: false });
    await button(wrapper, 'Save inactive draft').trigger('click'); await flushPromises();
    expect(mocks.save).toHaveBeenCalledWith('d', [
      { id: 1, direction: 'straight', distance: 6.2, mode: 'indoor' },
      { id: 2, direction: 'left', distance: 1.6, mode: 'indoor' },
      { id: 3, direction: 'right', distance: 3.4, mode: 'indoor' },
    ]);
  });
  it('stops and reacquires the camera on pause/resume and restores the old route on cancel', async () => {
    const wrapper = editor(); await start(wrapper); await distance(wrapper, 2);
    await button(wrapper, 'Pause').trigger('click'); expect(stop).toHaveBeenCalledTimes(1);
    await button(wrapper, 'Resume').trigger('click'); await flushPromises();
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(wrapper.find('.camera-distance').text()).toContain('2.00 m');
    await button(wrapper, 'Cancel recording').trigger('click');
    expect(wrapper.findAll('.segment')).toHaveLength(1);
    expect((wrapper.find('.segment input').element as HTMLInputElement).value).toBe('8');
  });
  it('falls back to manual entry after camera denial and no motion support', async () => {
    getUserMedia.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    vi.stubGlobal('DeviceMotionEvent', undefined);
    const wrapper = editor(); await start(wrapper);
    expect(wrapper.text()).toContain('Camera unavailable or permission denied');
    expect(wrapper.find('.camera-controls input[type=number]').exists()).toBe(true);
    await distance(wrapper, 5); await button(wrapper, 'Finish Route').trigger('click');
    expect(wrapper.find('.route-heading').text()).toContain('5.00 m total');
  });
  it('cleans a camera that resolves after the editor is closed', async () => {
    let resolve!: (stream: unknown) => void;
    getUserMedia.mockReturnValue(new Promise(r => { resolve = r; }));
    const wrapper = editor(); await start(wrapper);
    await button(wrapper, 'Back to Destinations').trigger('click');
    resolve({ getTracks: () => [{ stop }] }); await flushPromises();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('close')).toHaveLength(1);
  });
  it('confirms only dirty exits and leaves an active recording intact if navigation is rejected', async () => {
    const wrapper = editor();
    vi.mocked(window.confirm).mockClear();
    await button(wrapper, 'Back to Destinations').trigger('click');
    expect(window.confirm).not.toHaveBeenCalled();
    await start(wrapper);
    vi.mocked(window.confirm).mockReturnValue(false);
    expect(mocks.leave.mock.calls.at(-1)![0]()).toBe(false);
    expect(stop).not.toHaveBeenCalled();
    await button(wrapper, 'Back to Destinations').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
  });
  it('ignores stationary samples and credits only sustained pulses, then releases the camera on unmount', async () => {
    vi.stubGlobal('DeviceMotionEvent', class {});
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const wrapper = editor(); await start(wrapper);
    function sample(magnitude: number, time: number) {
      now = time;
      const event = new Event('devicemotion');
      Object.defineProperty(event, 'acceleration', { value: { x: magnitude, y: 0, z: 0 } });
      window.dispatchEvent(event);
    }
    for (let t = 0; t < 1000; t += 50) sample(0.2, t);
    await flushPromises(); expect(wrapper.find('.camera-distance').text()).toContain('0.00 m');
    for (const t of [1000, 1600, 2200]) { sample(0, t); sample(2, t + 20); sample(0, t + 120); }
    await flushPromises(); expect(wrapper.find('.camera-distance').text()).toContain('0.00 m');
    sample(0, 2800); sample(2, 2820); sample(0, 2920);
    await flushPromises(); expect(wrapper.find('.camera-distance').text()).toContain('0.70 m');
    wrapper.unmount(); expect(stop).toHaveBeenCalledTimes(1);
  });
  it('pauses on backgrounding without losing the active segment', async () => {
    const wrapper = editor(); await start(wrapper); await distance(wrapper, 3);
    window.dispatchEvent(new Event('pagehide')); await flushPromises();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(button(wrapper, 'Resume').exists()).toBe(true);
    expect(wrapper.find('.camera-distance').text()).toContain('3.00 m');
  });
});
