import { isValidCoordinate } from '@/services/geo.service';

export interface WalkingRoute {
  coordinates: [number, number][];
  distance: number;
  duration: number;
  /** Measured campus distance for each geometry segment, when available. */
  segmentDistances?: number[];
}

/** FOSSGIS pedestrian profile; never substitute a driving route or a straight line. */
export async function fetchWalkingRoute(
  start: { latitude: number; longitude: number },
  end: { latitude: number; longitude: number },
  signal: AbortSignal,
): Promise<WalkingRoute> {
  if (![start, end].every(p => isValidCoordinate(p.latitude, p.longitude))) throw new Error('Invalid coordinates');
  const coordinates = `${start.longitude},${start.latitude};${end.longitude},${end.latitude}`;
  const response = await fetch(`https://routing.openstreetmap.de/routed-foot/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false&radiuses=50;50`, { signal });
  if (!response.ok) throw new Error('Routing unavailable');
  const data = await response.json();
  const route = data.routes?.[0];
  if (data.code !== 'Ok' || route?.geometry?.type !== 'LineString'
    || !Array.isArray(route.geometry.coordinates) || route.geometry.coordinates.length < 2 || route.geometry.coordinates.length > 10000
    || !route.geometry.coordinates.every((p: unknown) => Array.isArray(p) && p.length === 2 && isValidCoordinate(p[1], p[0]))
    || !Number.isFinite(route.distance) || route.distance < 0
    || !Number.isFinite(route.duration) || route.duration < 0) throw new Error('No walking route');
  return { coordinates: route.geometry.coordinates, distance: route.distance, duration: route.duration };
}
