import { mount } from '@vue/test-utils';
import { afterEach, expect, test, vi } from 'vitest';
import OutdoorRoutesView from '../src/views/OutdoorRoutesView.vue';
import CampusMapCanvas from '../../shared/CampusMapCanvas.vue';

const network = { version: 1, verified: true, nodes: [
  { id: 'start', name: 'Test start', latitude: 0, longitude: 0, entrance: false },
  { id: 'entrance', name: 'Test entrance', latitude: 0, longitude: 0.001, entrance: true },
], edges: [{ from: 'start', to: 'entrance', meters: 120, open: true, accessible: true, oneWay: false }] };
afterEach(() => vi.restoreAllMocks());
test('does not invent campus coordinates and refuses unverified exports', async () => {
  const wrapper = mount(OutdoorRoutesView);
  await wrapper.findAll('button').find(b => b.text() === 'Add node')!.trigger('click');
  expect((wrapper.find('[aria-label="Latitude"]').element as HTMLInputElement).value).toBe('');
  await wrapper.findAll('button').find(b => b.text() === 'Export verified network')!.trigger('click');
  expect(wrapper.text()).toContain('Invalid or duplicate walking node');
  wrapper.unmount();
});
test('imports a network for review and previews its shortest route without publishing', async () => {
  const wrapper = mount(OutdoorRoutesView);
  await wrapper.find('textarea').setValue(JSON.stringify(network));
  await wrapper.findAll('button').find(b => b.text() === 'Import JSON below')!.trigger('click');
  expect(wrapper.text()).toContain('Network imported for review');
  await wrapper.find('[aria-label="Starting node"]').setValue('start');
  await wrapper.find('[aria-label="Destination entrance"]').setValue('entrance');
  await wrapper.findAll('button').find(b => b.text() === 'Preview Dijkstra route')!.trigger('click');
  expect(wrapper.text()).toContain('120 m via');
  expect(wrapper.text()).toContain('Draft preview only');
  await wrapper.findAll('button').find(b => b.text() === 'Export verified network')!.trigger('click');
  expect(wrapper.text()).toContain('Survey the network and confirm verification before export');
  wrapper.unmount();
});
test('network edits clear survey confirmation', async () => {
  const wrapper = mount(OutdoorRoutesView);
  await wrapper.find('textarea').setValue(JSON.stringify(network));
  await wrapper.findAll('button').find(b => b.text() === 'Import JSON below')!.trigger('click');
  const confirmation = wrapper.find('p label input[type="checkbox"]');
  await confirmation.setValue(true);
  expect((confirmation.element as HTMLInputElement).checked).toBe(true);
  await wrapper.find('[aria-label="Connection meters"]').setValue(130);
  expect((confirmation.element as HTMLInputElement).checked).toBe(false);
  wrapper.unmount();
});

test('places walking nodes on the school image only after GPS calibration', async () => {
  const wrapper = mount(OutdoorRoutesView);
  const referenceMap = { image: 'data:image/png;base64,AAAA', anchors: [
    { x: 0.1, y: 0.1, latitude: 1, longitude: 2 },
    { x: 0.9, y: 0.1, latitude: 1, longitude: 2.001 },
    { x: 0.1, y: 0.9, latitude: 0.999, longitude: 2 },
  ] };
  await wrapper.find('textarea').setValue(JSON.stringify({ ...network, referenceMap }));
  await wrapper.findAll('button').find(b => b.text() === 'Import JSON below')!.trigger('click');
  await wrapper.find('[aria-label="Map editing mode"]').setValue('node');
  wrapper.findComponent(CampusMapCanvas).vm.$emit('point', { x: 0.5, y: 0.5 });
  await wrapper.vm.$nextTick();
  const latitude = wrapper.findAll('[aria-label="Latitude"]')[2].element as HTMLInputElement;
  const longitude = wrapper.findAll('[aria-label="Longitude"]')[2].element as HTMLInputElement;
  expect(Number(latitude.value)).toBeCloseTo(0.9995); expect(Number(longitude.value)).toBeCloseTo(2.0005);
  expect(wrapper.text()).toContain('Node placed');
  wrapper.unmount();
});

test('does not create a GPS node by clicking an uncalibrated school map', async () => {
  const wrapper = mount(OutdoorRoutesView);
  await wrapper.find('textarea').setValue(JSON.stringify({ ...network, verified: false, referenceMap: { image: 'data:image/png;base64,AAAA', anchors: [] } }));
  await wrapper.findAll('button').find(b => b.text() === 'Import JSON below')!.trigger('click');
  await wrapper.find('[aria-label="Map editing mode"]').setValue('node');
  wrapper.findComponent(CampusMapCanvas).vm.$emit('point', { x: 0.5, y: 0.5 });
  await wrapper.vm.$nextTick();
  expect(wrapper.findAll('[aria-label="Latitude"]')).toHaveLength(2);
  expect(wrapper.text()).toContain('Add three valid GPS calibration anchors first');
  wrapper.unmount();
});
