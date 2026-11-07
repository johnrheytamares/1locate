import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { onMounted } from 'vue';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DESTINATIONS } from '@/data/destinations';
import { clearJourney, getArrival, reviewDestination, wasDestinationReviewed, confirmRoomArrival, markTestJourney } from '@/services/journey.service';
import { selectDestination, clearSelectedDestination, loadSelectedRoute, confirmRouteCheckpoint, currentStepIndex, hasArrived, pauseNavigation } from '@/services/navigation.service';
import { sendFeedback, flushFeedback } from '@/services/feedback.service';
import { fetchDestinations } from '@/services/destination-repository';
const mocks = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), stop: vi.fn(), id: 'registrar' }));
vi.mock('vue-router', async importOriginal => ({ ...(await importOriginal<typeof import('vue-router')>()), useRoute: () => ({ params: { id: mocks.id } }) }));
vi.mock('@ionic/vue', async importOriginal => ({
  ...(await importOriginal<typeof import('@ionic/vue')>()),
  useIonRouter: () => ({ replace: mocks.replace, push: mocks.push }),
  onIonViewWillEnter: (fn: () => void) => onMounted(fn), onIonViewWillLeave: vi.fn(),
}));
vi.mock('@/components/DestinationMapPreview.vue', () => ({ default: { template: '<div data-test="map"/>', methods: { stopLocation: mocks.stop } } }));
import NavigationPreviewPage from '@/views/NavigationPreviewPage.vue';
function fakeInsert(error: { code: string } | null = null) {
  const insert = vi.fn(() => ({ abortSignal: vi.fn(async () => ({ error })) }));
  return { insert, client: { from: vi.fn(() => ({ insert })) } as unknown as SupabaseClient };
}
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value), removeItem: (key: string) => store.delete(key) });
  mocks.stop.mockResolvedValue(undefined); clearJourney(); clearSelectedDestination();
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });
test('direct map entry returns to mandatory destination details', async () => {
  const wrapper = mount(NavigationPreviewPage, { global: { stubs: { IonBackButton: true } } }); await flushPromises();
  expect(mocks.replace).toHaveBeenCalledWith('/destinations/registrar');
  expect(wrapper.find('[data-test="map"]').exists()).toBe(false); wrapper.unmount();
});
test('reviewed destination opens its map and waits for preview GPS cleanup before starting', async () => {
  reviewDestination('registrar'); expect(wasDestinationReviewed('library')).toBe(false);
  let stopped!: () => void; mocks.stop.mockImplementationOnce(() => new Promise<void>(resolve => { stopped = resolve; }));
  const wrapper = mount(NavigationPreviewPage, { global: { stubs: { IonBackButton: true } } }); await flushPromises();
  expect(wrapper.find('[data-test="map"]').exists()).toBe(true);
  await wrapper.find('[data-test="start-navigation"]').trigger('click'); expect(mocks.push).not.toHaveBeenCalled();
  stopped(); await flushPromises(); expect(mocks.push).toHaveBeenCalledWith('/ar-navigation'); wrapper.unmount();
});
test('manual checkpoints advance actual instructions without inventing a compass heading', () => {
  selectDestination('registrar'); let route = loadSelectedRoute()!;
  const paused = pauseNavigation(route); expect(confirmRouteCheckpoint(paused)).toBe(paused);
  route = confirmRouteCheckpoint(route); expect(route.walkedMeters).toBe(3); expect(route.forwardHeading).toBeNull(); expect(currentStepIndex(route)).toBe(1);
  route = confirmRouteCheckpoint(route); route = confirmRouteCheckpoint(route); expect(hasArrived(route)).toBe(true);
  expect(getArrival()).toBeNull(); // Estimated/checkpoint progress alone does not claim room arrival.
  expect(confirmRoomArrival(DESTINATIONS[0])?.evidence).toBe('room-confirmed');
});
test('anonymous ratings are queued offline and retried idempotently without login', async () => {
  const feedback = { id: 'a642c9eb-80fe-47e7-bf27-d10b1e5fdce1', destination_id: 'registrar', destination_name: 'Registrar', rating: 4 };
  expect(await sendFeedback(feedback, null)).toBe('queued');
  const { client, insert } = fakeInsert(); await flushFeedback(client);
  expect(insert).toHaveBeenCalledWith(feedback); insert.mockClear(); await flushFeedback(client); expect(insert).not.toHaveBeenCalled();
});
test('invalid ratings are rejected before calling the API', async () => {
  const { client, insert } = fakeInsert(); await expect(sendFeedback({ id: 'x', destination_id: 'x', destination_name: 'x', rating: 6 }, client)).rejects.toThrow(); expect(insert).not.toHaveBeenCalled();
});
test('a successful campus download preserves its real indoor route for offline relaunch', async () => {
  const row = { id: 'saved-room', name: 'Saved room', building: 'Saved building', type: 'Room', entrance_name: 'Saved entrance', entrance_lat: 13.3881667, entrance_lng: 121.1616944, arrival_radius: 10, indoor_route: [{ id: 1, direction: 'left', distance: 4, mode: 'indoor' }] };
  const client = { from: () => ({ select: () => ({ order: () => ({ abortSignal: async () => ({ data: [row], error: null }) }) }) }) } as unknown as SupabaseClient;
  const live = await fetchDestinations(client); expect(live.source).toBe('supabase');
  const saved = await fetchDestinations(null); expect(saved.source).toBe('cache'); expect(saved.destinations[0].indoorRoute).toEqual(live.destinations[0].indoorRoute); expect(saved.destinations[0].outdoorTarget.latitude).toBe(row.entrance_lat);
});

test('a simulated journey cannot produce room arrival or feedback across a floor-map handoff', () => {
  reviewDestination('registrar'); markTestJourney();
  expect(confirmRoomArrival(DESTINATIONS[0])).toBeNull(); expect(getArrival()).toBeNull();
});
