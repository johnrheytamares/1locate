import { loadOutdoorNetwork } from './route-package-cache';
import type { CampusMap } from '../../shared/campus-map';
import { campusWalkingRoute, type Point } from '../../shared/outdoor-graph';
import { fetchWalkingRoute, type WalkingRoute } from './walking-route.service';
import { calculateDistance } from './geo.service';

export interface OutdoorWalkingRoute extends WalkingRoute {
  source: 'campus' | 'osm';
  referenceMap?: CampusMap;
  approachMeters: number;
  instructions?: { index: number; direction: 'straight' | 'left' | 'right' }[];
}

/** The bundled network is optional. An invalid configured network fails closed. */
export async function fetchOutdoorRoute(start: Point, end: Point & {networkId?:string;endpointId?:string}, signal: AbortSignal): Promise<OutdoorWalkingRoute> {
  let graph = await loadOutdoorNetwork(signal,end.networkId);
  if(end.networkId){
    const endpoint=graph.nodes.find(n=>n.id===end.endpointId&&n.entrance);
    if(!endpoint || calculateDistance(endpoint.latitude,endpoint.longitude,end.latitude,end.longitude)>.2)throw new Error('The published endpoint changed. Refresh destination details before navigating.');
    graph={...graph,nodes:graph.nodes.map(n=>({...n,entrance:n.id===end.endpointId}))};
  }
  const campus = campusWalkingRoute(graph, start, end);
  if (campus) return campus;
  if(end.networkId)throw new Error('No verified walking connection reaches this destination.');
  const route = await fetchWalkingRoute(start, end, signal);
  const first = route.coordinates[0], last = route.coordinates[route.coordinates.length - 1];
  const approachMeters = calculateDistance(start.latitude, start.longitude, first[1], first[0]);
  if (approachMeters > 20 || calculateDistance(end.latitude, end.longitude, last[1], last[0]) > 20) {
    throw new Error('Mapped walking path does not reach your location or the entrance. No connection has been inferred.');
  }
  return { ...route, source: 'osm', approachMeters };
}
