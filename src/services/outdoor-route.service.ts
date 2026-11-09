import type { CampusMap } from '../../shared/campus-map';
import { campusWalkingRoute, parseOutdoorGraph, type Point } from '../../shared/outdoor-graph';
import { fetchWalkingRoute, type WalkingRoute } from './walking-route.service';
import { calculateDistance } from './geo.service';

export interface OutdoorWalkingRoute extends WalkingRoute {
  source: 'campus' | 'osm';
  referenceMap?: CampusMap;
  approachMeters: number;
}

/** The bundled network is optional. An invalid configured network fails closed. */
export async function fetchOutdoorRoute(start: Point, end: Point, signal: AbortSignal): Promise<OutdoorWalkingRoute> {
  const response = await fetch(`${import.meta.env.BASE_URL}campus-walking-network.json`, { signal });
  if (!response.ok) throw new Error('Campus walking network could not load. Retry routing.');
  const graph = parseOutdoorGraph(await response.json());
  const campus = campusWalkingRoute(graph, start, end);
  if (campus) return campus;
  const route = await fetchWalkingRoute(start, end, signal);
  const first = route.coordinates[0], last = route.coordinates[route.coordinates.length - 1];
  const approachMeters = calculateDistance(start.latitude, start.longitude, first[1], first[0]);
  if (approachMeters > 20 || calculateDistance(end.latitude, end.longitude, last[1], last[0]) > 20) {
    throw new Error('Mapped walking path does not reach your location or the entrance. No connection has been inferred.');
  }
  return { ...route, source: 'osm', approachMeters };
}
