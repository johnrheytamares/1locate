import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useOutdoorRouting } from '@/composables/useOutdoorRouting';
import { createOutdoorState } from '@/services/outdoor-navigation.service';
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/services/outdoor-route.service', () => ({ fetchOutdoorRoute: mocks.fetch }));
const path = { coordinates: [[0, 0], [0.002, 0], [0.002, 0.002]] as [number, number][], distance: 440, duration: 350, source: 'campus' as const, approachMeters: 0 };
const state = () => ref({ ...createOutdoorState({ name: 'Entrance', latitude: 0.002, longitude: 0.002, arrivalRadius: 10, source: 'surveyed' }),
  location: { latitude: 0, longitude: 0.0001, accuracy: 5, timestamp: Date.now() } });
let unmount: (() => void) | undefined;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-09T00:00:00Z')); mocks.fetch.mockReset(); mocks.fetch.mockResolvedValue(path); });
afterEach(() => { unmount?.(); unmount = undefined; vi.useRealTimers(); });
function session() {
  const gps = state(), active = ref(true), heading = ref<number | null>(90), headingAt = ref(Date.now());
  let routing!: ReturnType<typeof useOutdoorRouting>;
  const wrapper = mount(defineComponent({ setup() { routing = useOutdoorRouting(gps, active, heading, headingAt); return () => null; } }));
  unmount = () => wrapper.unmount();
  return { routing, gps, active, heading, headingAt };
}

test('points along the current walkway and updates the arrow with the phone heading', async () => {
  const { routing, heading, headingAt } = session(); await flushPromises();
  expect(routing.canGuide.value).toBe(true); expect(routing.direction.value).toBe('straight');
  heading.value = 0; headingAt.value = Date.now(); await flushPromises();
  expect(routing.direction.value).toBe('right');
  expect(routing.message.value).toContain('Turn right');
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
});

test('pauses arrows for stale GPS, poor accuracy, rejected fixes, and missing heading', async () => {
  const { routing, gps, heading } = session(); await flushPromises();
  heading.value = null; await flushPromises(); expect(routing.canGuide.value).toBe(false);
  heading.value = 90; gps.value.location.accuracy = 40; await flushPromises(); expect(routing.canGuide.value).toBe(false);
  gps.value.location.accuracy = 5; gps.value.lastRejectReason = 'jump'; await flushPromises(); expect(routing.canGuide.value).toBe(false);
  gps.value.lastRejectReason = null; await vi.advanceTimersByTimeAsync(16000);
  expect(routing.canGuide.value).toBe(false); expect(routing.message.value).toContain('fresh GPS');
});

test('constant compass values remain usable when the sensor supplies fresh timestamps', async () => {
  const { routing, gps, headingAt } = session(); await flushPromises();
  await vi.advanceTimersByTimeAsync(16000);
  gps.value.location = { ...gps.value.location, timestamp: Date.now() }; headingAt.value = Date.now();
  await flushPromises(); expect(routing.canGuide.value).toBe(true);
});

test('reroutes after three spaced accurate off-route fixes, with throttled requests', async () => {
  const { routing, gps } = session(); await flushPromises();
  await vi.advanceTimersByTimeAsync(20000);
  for (let i = 0; i < 3; i++) {
    gps.value.location = { latitude: 0.0007, longitude: 0.0001, accuracy: 5, timestamp: Date.now() };
    await flushPromises(); await vi.advanceTimersByTimeAsync(2000);
  }
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
  expect(routing.canGuide.value).toBe(false);
});

test('does not reroute for a single deviation or inaccurate fixes', async () => {
  const { gps } = session(); await flushPromises(); await vi.advanceTimersByTimeAsync(21000);
  gps.value.location = { latitude: 0.0007, longitude: 0.0001, accuracy: 5, timestamp: Date.now() }; await flushPromises();
  for (let i = 0; i < 4; i++) {
    await vi.advanceTimersByTimeAsync(2000);
    gps.value.location = { ...gps.value.location, accuracy: 50, timestamp: Date.now() }; await flushPromises();
  }
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
});

test('cancels a pending route when guidance stops and ignores its late response', async () => {
  let resolve!: (value: typeof path) => void;
  mocks.fetch.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const { active, routing } = session(); await flushPromises();
  const signal = mocks.fetch.mock.calls[0][2] as AbortSignal;
  active.value = false; await flushPromises(); expect(signal.aborted).toBe(true);
  resolve(path); await flushPromises(); expect(routing.route.value).toBeNull(); expect(routing.canGuide.value).toBe(false);
});

test('routing failure leaves no invented arrow and retry can recover', async () => {
  mocks.fetch.mockRejectedValueOnce(new Error('No open walking route'));
  const { routing } = session(); await flushPromises();
  expect(routing.canGuide.value).toBe(false); expect(routing.message.value).toContain('No open walking route');
  await routing.retry(); await flushPromises(); expect(routing.canGuide.value).toBe(true);
});
