import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

vi.mock('@/services/campus', () => ({
  listDestinations: vi.fn().mockResolvedValue([{ id: 'd', name: 'Room 101', building: 'IT', room_id: 'r', is_active: false, indoor_route: [{ direction: 'straight', distance: 5 }] }]),
  listRooms: vi.fn().mockResolvedValue([{ id: 'r', name: 'Room 101', building_id: 'b', is_active: true }]),
  listBuildings: vi.fn().mockResolvedValue([{ id: 'b', name: 'IT', is_active: true }]),
  listFloors: vi.fn().mockResolvedValue([]),
  setDestinationActive: vi.fn(), setDestinationRoom: vi.fn(),
}));
import DestinationsView from '@/views/DestinationsView.vue';

afterEach(() => { document.body.innerHTML = ''; });
describe('destination route workspace', () => {
  it('hides the list while editing and restores search and the content scroll position on return', async () => {
    const content = document.createElement('main'); content.className = 'content'; document.body.append(content);
    const wrapper = mount(DestinationsView, { attachTo: content, global: { stubs: {
      RouterLink: true,
      DestinationEditor: { emits: ['close'], template: '<button data-test="back" @click="$emit(\'close\')">Back to Destinations</button>' },
    } } });
    await flushPromises();
    await wrapper.find('input[type=search]').setValue('101');
    content.scrollTop = 350;
    await wrapper.findAll('button').find(b => b.text() === 'Edit / Record route')!.trigger('click');
    await flushPromises();
    expect(wrapper.find('.destination-table').exists()).toBe(false);
    expect(wrapper.find('.dest-head').isVisible()).toBe(false);
    expect(content.scrollTop).toBe(0);
    await wrapper.find('[data-test=back]').trigger('click'); await flushPromises();
    expect(wrapper.findAll('[data-test=destination-row]')).toHaveLength(1);
    expect((wrapper.find('input[type=search]').element as HTMLInputElement).value).toBe('101');
    expect(content.scrollTop).toBe(350);
    wrapper.unmount();
  });
});
