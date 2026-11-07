import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const hooks = vi.hoisted(() => ({ enter: [] as (() => void)[], leave: [] as (() => void)[], load: vi.fn() }));
vi.mock('@ionic/vue', () => ({
  useIonRouter: () => ({ replace: vi.fn() }),
  IonPage: { template: '<div><slot /></div>' }, IonHeader: { template: '<header><slot /></header>' },
  IonToolbar: { template: '<div><slot /></div>' }, IonButtons: { template: '<div><slot /></div>' },
  IonBackButton: { template: '<span />' }, IonTitle: { template: '<div><slot /></div>' },
  IonContent: { template: '<div><slot /></div>' }, IonButton: { template: '<button :disabled="$attrs.disabled"><slot /></button>' },
  onIonViewWillEnter: (fn: () => void) => hooks.enter.push(fn), onIonViewWillLeave: (fn: () => void) => hooks.leave.push(fn),
}));
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }), onBeforeRouteLeave: vi.fn() }));
vi.mock('@/services/indoor-map.service', () => ({ loadIndoorMaps: hooks.load, signedMapUrl: vi.fn().mockResolvedValue('https://example.test/map.png') }));
import IndoorMapPage from '@/views/IndoorMapPage.vue';

const n = (id: string, kind: string, floor: string, x: number) => ({ id, name: id, kind, floor_id: floor, map_id: floor, x, y: .2, room_id: kind === 'room' ? 'room-id' : null });
const e = (from: string, to: string, kind = 'walk') => ({ id: from+to, from, to, kind, meters: 2, accessible: kind !== 'stairs', enabled: true, bidirectional: true });
beforeEach(() => {
  hooks.enter.length = 0; hooks.leave.length = 0; vi.clearAllMocks();
  hooks.load.mockResolvedValue({
    graphs: [{ building_id: 'b', graph: { nodes: [n('entrance','entrance','ground',.1), n('stairs0','stairs','ground',.5), n('stairs1','stairs','upper',.1), n('Room 201','room','upper',.5)], edges: [e('entrance','stairs0'),e('stairs0','stairs1','stairs'),e('stairs1','Room 201')] } }],
    maps: ['ground','upper'].map(id => ({ id, floor_id: id, storage_path: `${id}/map.png`, width_px: 1000, height_px: 800 })),
    floors: [{ id: 'ground', name: 'Ground Floor', building_id: 'b', level: 1 },{ id: 'upper', name: 'Second Floor', building_id: 'b', level: 2 }], buildings: [{ id: 'b', name: 'Main' }],
  });
});
describe('multi-floor map guidance', () => {
  it('requires entrance and facing confirmation, pauses, and confirms the new floor', async () => {
    const wrapper = mount(IndoorMapPage);
    hooks.enter.forEach(fn => fn()); await flushPromises();
    await wrapper.findAll('select')[1].setValue('entrance');
    await wrapper.findAll('select')[2].setValue('Room 201');
    const click = async (text: string) => { const b = wrapper.findAll('button').find(b => b.text() === text); expect(b, text).toBeDefined(); await b!.trigger('click'); await flushPromises(); };
    await click('Generate route');
    const begin = wrapper.findAll('button').find(b => b.text() === 'Start map guidance')!;
    expect(begin.attributes('disabled')).toBeDefined();
    await wrapper.findAll('input[type=checkbox]')[1].setValue(true); await click('Start map guidance');
    expect(wrapper.text()).toContain('CONNECTION 1 / 3');
    expect(wrapper.findAll('button').some(b => b.text() === 'I reached stairs0')).toBe(false);
    await click('I am facing the path'); await click('I lost my way');
    expect(wrapper.text()).toContain('GUIDANCE PAUSED');
    await click('Resume at same position'); await click('I reached stairs0');
    expect(wrapper.text()).toContain('Take the stairs to Second Floor');
    await click('I am facing the path'); await click('I am at Second Floor landing');
    expect(wrapper.findAll('select').at(-1)!.element.value).toBe('upper');
    await click('I am facing the path'); await click('I reached Room 201');
    expect(wrapper.text()).toContain('You reached Room 201'); wrapper.unmount();
  });
  it('explains unavailable maps without pretending a route exists', async () => {
    hooks.load.mockRejectedValue(new Error('offline'));
    const wrapper = mount(IndoorMapPage); hooks.enter.forEach(fn => fn()); await flushPromises();
    expect(wrapper.text()).toContain('Campus maps could not be loaded');
    expect(wrapper.find('select').exists()).toBe(false); wrapper.unmount();
  });
});
