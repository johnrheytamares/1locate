import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  check: vi.fn(), request: vi.fn(), watch: vi.fn(), clear: vi.fn(), remove: vi.fn(), convert: vi.fn(),
}));
vi.mock('@capacitor/geolocation', () => ({ Geolocation: { watchPosition: mocks.watch, clearWatch: mocks.clear } }));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn(async () => ({ remove: mocks.remove })) } }));
vi.mock('@/services/location.service', () => ({
  checkPermission: mocks.check, requestPermission: mocks.request,
  toLocationError: () => new Error('Location unavailable'), toUserLocation: mocks.convert,
}));
import DestinationMapPreview from '@/components/DestinationMapPreview.vue';
const entrance = { name: 'Library entrance', latitude: null, longitude: null, arrivalRadius: 10 };
beforeEach(() => {
  vi.stubEnv('VITE_MAPTILER_API_KEY', '');
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  mocks.convert.mockReturnValue(null);
  mocks.check.mockResolvedValue({ state: 'granted', precise: true });
  mocks.clear.mockResolvedValue(undefined); mocks.watch.mockResolvedValue('preview-watch');
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
test('shows truthful missing key and entrance states without inventing a pin', async () => {
  const wrapper = mount(DestinationMapPreview, { props: { entrance } });
  await flushPromises();
  expect(wrapper.text()).toContain('Satellite map is not configured');
  expect(wrapper.text()).toContain('Entrance coordinates are not set');
  wrapper.unmount(); await flushPromises();
  expect(mocks.clear).toHaveBeenCalledWith({ id: 'preview-watch' });
});
test('does not start a location watcher when permission is denied', async () => {
  mocks.check.mockResolvedValue({ state: 'denied', precise: false });
  mocks.request.mockResolvedValue({ state: 'denied', precise: false });
  const wrapper = mount(DestinationMapPreview, { props: { entrance } });
  await flushPromises();
  expect(wrapper.text()).toContain('Allow location permission');
  expect(mocks.watch).not.toHaveBeenCalled(); wrapper.unmount();
});
test('clears a watcher that finishes starting after leaving the preview', async () => {
  let resolveWatch!: (id: string) => void;
  mocks.watch.mockImplementationOnce(() => new Promise<string>(resolve => { resolveWatch = resolve; }));
  const wrapper = mount(DestinationMapPreview, { props: { entrance } });
  await flushPromises(); wrapper.unmount(); resolveWatch('late-preview-watch');
  await flushPromises();
  expect(mocks.clear).toHaveBeenCalledWith({ id: 'late-preview-watch' });
});


test('shows the school map as a reference even before walkways or GPS calibration exist', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: 1, verified: false, nodes: [], edges: [], referenceMap: { image: 'data:image/png;base64,AAAA', anchors: [] } }) }));
  const wrapper = mount(DestinationMapPreview, { props: { entrance } });
  await flushPromises();
  expect(wrapper.text()).toContain('School campus map');
  expect(wrapper.text()).toContain('School reference image only');
  expect(wrapper.find('img[alt="Campus infrastructure reference map"]').exists()).toBe(true);
  expect(wrapper.find('.pin.user').exists()).toBe(false);
  expect(wrapper.find('.active-route').exists()).toBe(false);
  wrapper.unmount();
});


test('rejects poor raw GPS without replacing or emitting the last reliable fix', async()=>{
 const wrapper=mount(DestinationMapPreview,{props:{entrance}});await flushPromises();
 const callback=mocks.watch.mock.calls.at(-1)![1];
 const good={latitude:13.3,longitude:121.2,accuracy:4,timestamp:Date.now()};
 mocks.convert.mockReturnValue(good);callback({},null);await flushPromises();
 mocks.convert.mockReturnValue({...good,accuracy:337});callback({},null);await flushPromises();
 expect(wrapper.emitted('location')).toEqual([[good],[null]]);
 expect(wrapper.text()).toContain('Latest GPS accuracy: ±337 m');
 expect(wrapper.text()).toContain('Last accepted GPS accuracy: ±4 m');
 expect(wrapper.text()).toContain('Waiting for a better location fix');wrapper.unmount();
});

test('expires an accepted location without pretending the saved fix is current',async()=>{
 vi.useFakeTimers();
 const wrapper=mount(DestinationMapPreview,{props:{entrance}});await flushPromises();
 const callback=mocks.watch.mock.calls.at(-1)![1];
 mocks.convert.mockReturnValue({latitude:13.3,longitude:121.2,accuracy:4,timestamp:Date.now()});callback({},null);await flushPromises();
 await vi.advanceTimersByTimeAsync(16000);await flushPromises();
 expect(wrapper.text()).toContain('Last reliable location is stale');
 expect(wrapper.emitted('location')?.at(-1)).toEqual([null]);wrapper.unmount();vi.useRealTimers();
});

test('embedded camera map reports poor raw accuracy separately from its accepted location',async()=>{
 const good={latitude:13.3,longitude:121.2,accuracy:4,timestamp:Date.now()};
 const wrapper=mount(DestinationMapPreview,{props:{entrance,fullscreen:true,external:true,liveLocation:good,rawLocation:{...good,accuracy:337}}});await flushPromises();
 expect(wrapper.classes()).toContain('embedded');expect(mocks.watch).not.toHaveBeenCalled();
 expect(wrapper.text()).toContain('Latest GPS accuracy: ±337 m');expect(wrapper.text()).toContain('Last accepted GPS accuracy: ±4 m');wrapper.unmount();
});
