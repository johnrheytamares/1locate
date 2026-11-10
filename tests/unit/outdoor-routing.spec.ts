import { describe, expect, test, vi, afterEach } from 'vitest';
vi.mock('@/services/supabase', () => ({ supabase: null }));
import { campusWalkingRoute, parseOutdoorGraph, type OutdoorGraph } from '../../shared/outdoor-graph';
import { outdoorRouteProgress } from '@/services/outdoor-progress.service';
import { fetchOutdoorRoute } from '@/services/outdoor-route.service';

// Synthetic test coordinates only. These are not shipped as campus data.
const a = { id: 'a', name: 'Start', latitude: 0, longitude: 0, entrance: false };
const b = { ...a, id: 'b', name: 'Bend', longitude: 0.001 };
const c = { ...b, id: 'c', name: 'Entrance', latitude: 0.001, entrance: true };
const edge = (from: string, to: string, meters = 120) => ({ from, to, meters, open: true, accessible: true, oneWay: false });
const graph = (): OutdoorGraph => ({ version: 1, verified: true, nodes: [a, b, c], edges: [edge('a', 'b'), edge('b', 'c'), edge('a', 'c', 500)] });
afterEach(() => vi.unstubAllGlobals());

describe('campus Dijkstra walking network', () => {
  test('chooses the shortest connected walkways instead of the direct expensive edge', () => {
    const result = campusWalkingRoute(parseOutdoorGraph(graph()), a, c)!;
    expect(result.source).toBe('campus'); expect(result.distance).toBe(240);
    expect(result.coordinates).toEqual([[0, 0], [0.001, 0], [0.001, 0.001]]);
  });
  test('uses the alternate path when a connection is closed', () => {
    const network = graph(); network.edges[1].open = false;
    expect(campusWalkingRoute(network, a, c)?.distance).toBe(500);
  });
  test('does not invent a path through disconnected or closed connections', () => {
    const network = graph(); network.edges = [edge('a', 'b')];
    expect(() => campusWalkingRoute(network, a, c)).toThrow('No open campus');
  });
  test('honors one-way edges and step-free exclusions', () => {
    const network = graph(); network.edges = [edge('a', 'b'), { ...edge('b', 'c'), oneWay: true }];
    network.nodes[0] = { ...a, entrance: true };
    expect(() => campusWalkingRoute(network, c, a)).toThrow('No open campus');
    network.edges[1].oneWay = false; network.edges[1].accessible = false;
    expect(() => campusWalkingRoute(network, a, c, true)).toThrow('No open campus');
  });
  test('joins a path midway without walking back to its first node', () => {
    expect(campusWalkingRoute(graph(), { ...a, longitude: 0.0005 }, c)?.distance).toBeCloseTo(180);
  });
  test('does not route an unverified network or invent coverage', () => {
    expect(campusWalkingRoute({ ...graph(), verified: false }, a, c)).toBeNull();
    expect(campusWalkingRoute(graph(), a, { ...c, latitude: 1 })).toBeNull();
    expect(() => campusWalkingRoute(graph(), { latitude: 1, longitude: 1 }, c)).toThrow('configured campus walkway');
  });
  test('rejects duplicate IDs, dangling edges, invalid coordinates and impossible distances', () => {
    expect(() => parseOutdoorGraph({ ...graph(), nodes: [a, a] })).toThrow();
    expect(() => parseOutdoorGraph({ ...graph(), edges: [edge('a', 'missing')] })).toThrow();
    expect(() => parseOutdoorGraph({ ...graph(), nodes: [{ ...a, latitude: 91 }] })).toThrow();
    expect(() => parseOutdoorGraph({ ...graph(), edges: [edge('a', 'b', 1)] })).toThrow();
  });
});

test('route progress follows the bent path rather than the entrance bearing', () => {
  const route = { coordinates: [[0, 0], [0.001, 0], [0.001, 0.001]] as [number, number][], distance: 240, duration: 200 };
  const first = outdoorRouteProgress(route, { latitude: 0, longitude: 0.0005 });
  expect(first.bearing).toBeCloseTo(90); expect(first.remaining).toBeCloseTo(180); expect(first.offPath).toBeCloseTo(0);
  const next = outdoorRouteProgress(route, { latitude: 0.0005, longitude: 0.001 }, first.along);
  expect(next.bearing).toBeCloseTo(0); expect(next.remaining).toBeCloseTo(60);
  expect(outdoorRouteProgress(route, { latitude: 0.0005, longitude: 0.0005 }).offPath).toBeGreaterThan(50);
});

test('configured campus routes use local Dijkstra without an external route request', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => graph() }); vi.stubGlobal('fetch', fetch);
  expect((await fetchOutdoorRoute(a, c, new AbortController().signal)).source).toBe('campus');
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('an unconfigured network falls back only to actual pedestrian geometry', async () => {
  const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ version: 1, verified: false, nodes: [], edges: [] }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ code: 'Ok', routes: [{ geometry: { type: 'LineString', coordinates: [[0, 0], [0.001, 0], [0.001, 0.001]] }, distance: 240, duration: 200 }] }) });
  vi.stubGlobal('fetch', fetch);
  expect((await fetchOutdoorRoute(a, c, new AbortController().signal)).source).toBe('osm');
  expect(fetch.mock.calls[1][0]).toContain('routed-foot');
});

test('invalid configured networks and closed routes fail without bypassing to public routing', async () => {
  const network = graph(); network.edges = [edge('a', 'b')];
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => network }); vi.stubGlobal('fetch', fetch);
  await expect(fetchOutdoorRoute(a, c, new AbortController().signal)).rejects.toThrow('No open campus');
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('rejects a public route whose endpoint misses the saved entrance', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ version: 1, verified: false, nodes: [], edges: [] }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ code: 'Ok', routes: [{ geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, distance: 200000, duration: 100000 }] }) }));
  await expect(fetchOutdoorRoute(a, c, new AbortController().signal)).rejects.toThrow('does not reach');
});


test('remaining campus meters follow surveyed edge lengths independently of geometry', () => {
  const route = { coordinates: [[0, 0], [0.001, 0], [0.001, 0.001]] as [number, number][], distance: 620, duration: 500, segmentDistances: [120, 500] };
  expect(outdoorRouteProgress(route, { latitude: 0, longitude: 0.0005 }).remaining).toBeCloseTo(560);
  expect(outdoorRouteProgress(route, { latitude: 0.0005, longitude: 0.001 }, 120).remaining).toBeCloseTo(250);
});
