import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import type { Building, Room } from '../src/types';

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));
vi.mock('@/services/campus', () => ({ createDestination: mocks.create, saveDestinationRoute: mocks.update }));
vi.mock('@/stores/session', () => ({ useSession: () => ({ state: { userId: 'test' }, onCleared: () => () => {} }) }));
vi.mock('vue-router', () => ({ onBeforeRouteLeave: vi.fn() }));
import DestinationEditor from '../src/components/DestinationEditor.vue';

const room = { id: 'room', building_id: 'building', name: 'Library', type: 'facility', sort_order: 0 } as Room;
const building = { id: 'building', name: 'Main', entrance_name: 'Main Entrance', entrance_lat: null, entrance_lng: null, arrival_radius: 10 } as Building;
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); });
afterEach(() => { vi.useRealTimers(); });

describe('destination editor', () => {
  it('validates before saving and retains the draft after a request fails', async () => {
    const wrapper = mount(DestinationEditor, { props: { rooms: [room], buildings: [building], initialRoom: 'room' } });
    const button = (text: string) => wrapper.findAll('button').find(b => b.text() === text)!;
    await button('Save inactive draft').trigger('click');
    expect(mocks.create).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('1–50');
    await button('Add segment').trigger('click');
    mocks.create.mockRejectedValue({ code: '23505' });
    await button('Save inactive draft').trigger('click'); await flushPromises();
    expect(wrapper.emitted('saved')).toBeUndefined();
    expect(wrapper.findAll('.segment')).toHaveLength(1);
    mocks.create.mockResolvedValue({ id: 'new', is_active: false });
    await button('Save inactive draft').trigger('click'); await flushPromises();
    expect(mocks.create.mock.calls[1][0]).toMatchObject({ room_id: 'room', is_active: false, indoor_route: [{ direction: 'straight', distance: 1, mode: 'indoor', id: 1 }] });
    expect(wrapper.emitted('saved')).toHaveLength(1);
    wrapper.unmount();
  });
  it('stops recording when sensors produce no usable samples and cleans listeners', async () => {
    vi.useFakeTimers();
    const remove = vi.spyOn(window, 'removeEventListener');
    const wrapper = mount(DestinationEditor, { props: { rooms: [room], buildings: [building], initialRoom: 'room' } });
    await wrapper.find('input[type=checkbox]').setValue(true);
    await wrapper.findAll('button').find(b => b.text() === 'Start recording')!.trigger('click');
    await flushPromises();
    await vi.advanceTimersByTimeAsync(4000);
    expect(wrapper.text()).toMatch(/No usable motion samples|Motion sensors unavailable/);
    wrapper.unmount();
    expect(remove.mock.calls.some(args => args[0] === 'devicemotion')).toBe(true);
    remove.mockRestore();
  });
});
