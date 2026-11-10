import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, expect, test, vi } from 'vitest';
vi.mock('../src/services/outdoor-recordings', () => ({ loadPublishedNetwork: vi.fn().mockResolvedValue(null) }));
vi.mock('../src/components/GpsRouteRecorder.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../src/services/campus', () => ({ listBuildings: vi.fn().mockResolvedValue([{ id: 'it', name: 'IT', entrance_name: 'Main', entrance_lat: 0, entrance_lng: 0.001 }]) }));
import OutdoorRoutesView from '../src/views/OutdoorRoutesView.vue';
import CampusMapCanvas from '../../shared/CampusMapCanvas.vue';

const network = { version: 1, verified: true, nodes: [
  { id: 'start', name: 'Test start', latitude: 0, longitude: 0, entrance: false },
  { id: 'entrance', name: 'Test entrance', latitude: 0, longitude: 0.001, entrance: true },
], edges: [{ from: 'start', to: 'entrance', meters: 120, open: true, accessible: true, oneWay: false }] };
afterEach(() => vi.restoreAllMocks());
test('does not invent campus coordinates and refuses unverified exports', async () => {
  const wrapper = mount(OutdoorRoutesView);
  await flushPromises();
  await wrapper.find('[aria-label="Choose building"]').setValue('it');
  await wrapper.findAll('button').find(b => b.text() === 'Add point')!.trigger('click');
  expect((wrapper.findAll('[aria-label="Latitude"]').at(-1)!.element as HTMLInputElement).value).toBe('');
  await wrapper.findAll('button').find(b => b.text() === 'Save draft')!.trigger('click');
  expect(wrapper.text()).toContain('Invalid or duplicate walking node');
  expect(wrapper.find('.review-card').exists()).toBe(false);
  wrapper.unmount();
});
test('imports a network for review and previews its shortest route without publishing', async () => {
  const wrapper = mount(OutdoorRoutesView);
  await flushPromises();
  await wrapper.find('[aria-label="Choose building"]').setValue('it');
  await wrapper.find('textarea').setValue(JSON.stringify(network));
  await wrapper.findAll('button').find(b => b.text() === 'Import route file')!.trigger('click');
  expect(wrapper.text()).toContain('Network imported for review');
  await wrapper.find('[aria-label="Starting node"]').setValue('start');
  await wrapper.find('[aria-label="Destination entrance"]').setValue('entrance');
  await wrapper.findAll('button').find(b => b.text() === 'Test route')!.trigger('click');
  expect(wrapper.text()).toContain('120 m via');
  expect(wrapper.text()).toContain('Draft preview only');
  expect(wrapper.findAll('button').find(b => b.text() === 'Download checked route')!.attributes('disabled')).toBeDefined();
  wrapper.unmount();
});
test('network edits clear survey confirmation', async () => {
  const wrapper = mount(OutdoorRoutesView);
  await flushPromises();
  await wrapper.find('[aria-label="Choose building"]').setValue('it');
  await wrapper.find('textarea').setValue(JSON.stringify(network));
  await wrapper.findAll('button').find(b => b.text() === 'Import route file')!.trigger('click');
  await wrapper.find('[aria-label="Starting node"]').setValue('start');
  await wrapper.find('[aria-label="Destination entrance"]').setValue('entrance');
  await wrapper.findAll('button').find(b => b.text() === 'Review path →')!.trigger('click');
  const confirmation = wrapper.find('.review-card input[type="checkbox"]');
  await confirmation.setValue(true);
  expect((confirmation.element as HTMLInputElement).checked).toBe(true);
  await wrapper.find('[aria-label="Connection meters"]').setValue(130);
  expect((confirmation.element as HTMLInputElement).checked).toBe(false);
  wrapper.unmount();
});

test('places walking nodes on the school image only after GPS calibration', async () => {
  const wrapper = mount(OutdoorRoutesView);
  await flushPromises();
  await wrapper.find('[aria-label="Choose building"]').setValue('it');
  const referenceMap = { image: 'data:image/png;base64,AAAA', anchors: [
    { x: 0.1, y: 0.1, latitude: 1, longitude: 2 },
    { x: 0.9, y: 0.1, latitude: 1, longitude: 2.001 },
    { x: 0.1, y: 0.9, latitude: 0.999, longitude: 2 },
  ] };
  await wrapper.find('textarea').setValue(JSON.stringify({ ...network, referenceMap }));
  await wrapper.findAll('button').find(b => b.text() === 'Import route file')!.trigger('click');
  await wrapper.find('[aria-label="Map editing mode"]').setValue('node');
  wrapper.findComponent(CampusMapCanvas).vm.$emit('point', { x: 0.5, y: 0.5 });
  await wrapper.vm.$nextTick();
  const latitude = wrapper.findAll('[aria-label="Latitude"]')[2].element as HTMLInputElement;
  const longitude = wrapper.findAll('[aria-label="Longitude"]')[2].element as HTMLInputElement;
  expect(Number(latitude.value)).toBeCloseTo(0.9995); expect(Number(longitude.value)).toBeCloseTo(2.0005);
  expect(wrapper.text()).toContain('Point added');
  wrapper.unmount();
});

test('does not create a GPS node by clicking an uncalibrated school map', async () => {
  const wrapper = mount(OutdoorRoutesView);
  await flushPromises();
  await wrapper.find('[aria-label="Choose building"]').setValue('it');
  await wrapper.find('textarea').setValue(JSON.stringify({ ...network, verified: false, referenceMap: { image: 'data:image/png;base64,AAAA', anchors: [] } }));
  await wrapper.findAll('button').find(b => b.text() === 'Import route file')!.trigger('click');
  await wrapper.find('[aria-label="Map editing mode"]').setValue('node');
  wrapper.findComponent(CampusMapCanvas).vm.$emit('point', { x: 0.5, y: 0.5 });
  await wrapper.vm.$nextTick();
  expect(wrapper.findAll('[aria-label="Latitude"]')).toHaveLength(2);
  expect(wrapper.text()).toContain('Add three valid GPS calibration anchors first');
  wrapper.unmount();
});


test('visual connection estimates distance and preserves a manual override when GPS changes', async () => {
  const wrapper = mount(OutdoorRoutesView);
  await flushPromises();
  await wrapper.find('[aria-label="Choose building"]').setValue('it');
  await wrapper.find('textarea').setValue(JSON.stringify({ ...network, edges: [] }));
  await wrapper.findAll('button').find(b => b.text() === 'Import route file')!.trigger('click');
  await wrapper.find('[aria-label="Connect Test start"]').trigger('click');
  await wrapper.find('[aria-label="Connect Test entrance"]').trigger('click');
  const meters = wrapper.find('[aria-label="Connection meters"]');
  expect(Number((meters.element as HTMLInputElement).value)).toBeCloseTo(111.2, 1);
  expect(wrapper.text()).toContain('Estimated distance');
  await wrapper.findAll('[aria-label="Longitude"]')[1].setValue(0.002);
  expect(Number((meters.element as HTMLInputElement).value)).toBeCloseTo(222.4, 1);
  await meters.setValue(300);
  await wrapper.findAll('[aria-label="Longitude"]')[1].setValue(0.0021);
  expect(Number((meters.element as HTMLInputElement).value)).toBe(300);
  expect(wrapper.text()).toContain('Manually entered distance');
  await wrapper.findAll('button').find(b => b.text() === 'Use GPS estimate')!.trigger('click');
  expect(Number((meters.element as HTMLInputElement).value)).toBeCloseTo(233.5, 1);
  await wrapper.find('[aria-label="Connect Test start"]').trigger('click');
  await wrapper.find('[aria-label="Connect Test entrance"]').trigger('click');
  expect(wrapper.findAll('[aria-label="Connection meters"]')).toHaveLength(1);
  wrapper.unmount();
});

test('building selection reuses the saved entrance and does not duplicate it', async () => {
  const wrapper = mount(OutdoorRoutesView);
  await flushPromises();
  await wrapper.find('[aria-label="Choose building"]').setValue('it');
  await flushPromises();
  await wrapper.find('[aria-label="Choose building"]').setValue('it');
  expect(wrapper.findAll('[aria-label="Latitude"]')).toHaveLength(1);
  expect(Number((wrapper.find('[aria-label="Longitude"]').element as HTMLInputElement).value)).toBe(0.001);
  await wrapper.find('[aria-label="Choose building"]').setValue('');
  await wrapper.find('[aria-label="Choose building"]').setValue('it');
  expect(wrapper.findAll('[aria-label="Latitude"]')).toHaveLength(1);
  wrapper.unmount();
});

test('changing points clears a stale route preview', async () => {
  const wrapper = mount(OutdoorRoutesView);
  await flushPromises();
  await wrapper.find('[aria-label="Choose building"]').setValue('it');
  await wrapper.find('textarea').setValue(JSON.stringify(network));
  await wrapper.findAll('button').find(b => b.text() === 'Import route file')!.trigger('click');
  await wrapper.find('[aria-label="Starting node"]').setValue('start');
  await wrapper.find('[aria-label="Destination entrance"]').setValue('entrance');
  await wrapper.findAll('button').find(b => b.text() === 'Test route')!.trigger('click');
  expect(wrapper.text()).toContain('120 m via');
  await wrapper.find('[aria-label="Connection meters"]').setValue(130);
  expect(wrapper.text()).not.toContain('120 m via');
  wrapper.unmount();
});


test('drawing connects consecutive map taps automatically and Undo restores the previous path', async () => {
  const wrapper = mount(OutdoorRoutesView);
  await flushPromises();
  await wrapper.find('[aria-label="Choose building"]').setValue('it');
  const referenceMap = { image: '/images/updated_map.png', anchors: [
    { x: 0.1, y: 0.1, latitude: 0, longitude: 0 },
    { x: 0.9, y: 0.1, latitude: 0, longitude: 0.001 },
    { x: 0.1, y: 0.9, latitude: -0.001, longitude: 0 },
  ] };
  await wrapper.find('textarea').setValue(JSON.stringify({ ...network, edges: [], referenceMap }));
  await wrapper.findAll('button').find(b => b.text() === 'Import route file')!.trigger('click');
  const canvas = wrapper.findComponent(CampusMapCanvas);
  canvas.vm.$emit('point', { x: 0.2, y: 0.2 }); await wrapper.vm.$nextTick();
  canvas.vm.$emit('point', { x: 0.3, y: 0.2 }); await wrapper.vm.$nextTick();
  expect(wrapper.findAll('[aria-label="Connection meters"]')).toHaveLength(1);
  expect(wrapper.findAll('[aria-label="Latitude"]')).toHaveLength(4);
  await wrapper.findAll('button').find(b => b.text() === '↶ Undo')!.trigger('click');
  expect(wrapper.findAll('[aria-label="Connection meters"]')).toHaveLength(0);
  expect(wrapper.findAll('[aria-label="Latitude"]')).toHaveLength(3);
  wrapper.unmount();
});
