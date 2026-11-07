import { afterEach, expect, test, vi } from 'vitest';
import { fetchWalkingRoute } from '@/services/walking-route.service';

afterEach(() => vi.unstubAllGlobals());
const start = { latitude: 13.4, longitude: 121.2 };
const end = { latitude: 13.41, longitude: 121.21 };
const signal = () => new AbortController().signal;

test('requests the pedestrian profile and preserves actual road geometry', async () => {
  const coordinates = [[121.2, 13.4], [121.205, 13.402], [121.21, 13.41]];
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 'Ok', routes: [{ geometry: { type: 'LineString', coordinates }, distance: 1500, duration: 1100 }] }) });
  vi.stubGlobal('fetch', fetch);
  expect(await fetchWalkingRoute(start, end, signal())).toEqual({ coordinates, distance: 1500, duration: 1100 });
  expect(fetch.mock.calls[0][0]).toContain('/routed-foot/route/v1/driving/121.2,13.4;121.21,13.41');
  expect(fetch.mock.calls[0][0]).toContain('radiuses=50;50');
});

test.each([
  { code: 'NoRoute' },
  { code: 'Ok', routes: [{ geometry: { type: 'LineString', coordinates: [[999, 999], [121, 13]] }, distance: 1, duration: 1 }] },
])('rejects missing or invalid paths instead of making a straight line', async data => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => data }));
  await expect(fetchWalkingRoute(start, end, signal())).rejects.toThrow('No walking route');
});

test('propagates cancellation and does not request invalid coordinates', async () => {
  const fetch = vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'));
  vi.stubGlobal('fetch', fetch);
  await expect(fetchWalkingRoute({ ...start, latitude: 100 }, end, signal())).rejects.toThrow('Invalid coordinates');
  expect(fetch).not.toHaveBeenCalled();
  await expect(fetchWalkingRoute(start, end, signal())).rejects.toThrow('Aborted');
});
