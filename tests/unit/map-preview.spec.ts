import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  check: vi.fn(), request: vi.fn(), watch: vi.fn(), clear: vi.fn(), remove: vi.fn(),
}));
vi.mock('@capacitor/geolocation', () => ({ Geolocation: { watchPosition: mocks.watch, clearWatch: mocks.clear } }));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn(async () => ({ remove: mocks.remove })) } }));
vi.mock('@/services/location.service', () => ({
  checkPermission: mocks.check, requestPermission: mocks.request,
  toLocationError: () => new Error('Location unavailable'), toUserLocation: () => null,
}));
import DestinationMapPreview from '@/components/DestinationMapPreview.vue';
const entrance = { name: 'Library entrance', latitude: null, longitude: null, arrivalRadius: 10 };
beforeEach(() => {
  vi.stubEnv('VITE_MAPTILER_API_KEY', '');
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  mocks.check.mockResolvedValue({ state: 'granted', precise: true });
  mocks.clear.mockResolvedValue(undefined); mocks.watch.mockResolvedValue('preview-watch');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
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
