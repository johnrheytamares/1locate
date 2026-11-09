import { projectOnSegment, metersBetween, type Point } from '../../shared/outdoor-graph';
import { calculateBearing } from './geo.service';
import type { WalkingRoute } from './walking-route.service';

export interface RouteProgress { along: number; remaining: number; offPath: number; bearing: number; segment: number; }
/** Project onto actual path geometry; GPS distance to the entrance is never a walking route. */
export function outdoorRouteProgress(route: WalkingRoute, point: Point, previousAlong = 0): RouteProgress {
  const points = route.coordinates.map(([longitude, latitude]) => ({ latitude, longitude }));
  let total = 0;
  const lengths = points.slice(1).map((p, i) => { const length = metersBetween(points[i], p); total += length; return length; });
  let before = 0;
  const candidates = lengths.map((length, index) => {
    const projection = projectOnSegment(point, points[index], points[index + 1]);
    const along = before + projection.t * length; before += length;
    return { ...projection, along, index };
  });
  // Prefer continuity at intersections; do not jump across a loop from small GPS jitter.
  const closest = candidates.reduce((best, c) => {
    const score = (p: typeof c) => p.distance + Math.min(100, Math.max(0, previousAlong - p.along - 15))
      + Math.min(30, Math.max(0, p.along - previousAlong - 60)) * 0.2;
    return score(c) < score(best) ? c : best;
  });
  const lookAhead = Math.min(total, closest.along + 10);
  let accumulated = 0, aim = points[points.length - 1];
  for (let i = 0; i < lengths.length; i++) {
    if (accumulated + lengths[i] >= lookAhead && lengths[i] > 0) {
      const t = (lookAhead - accumulated) / lengths[i];
      aim = { latitude: points[i].latitude + (points[i + 1].latitude - points[i].latitude) * t,
        longitude: points[i].longitude + (points[i + 1].longitude - points[i].longitude) * t }; break;
    }
    accumulated += lengths[i];
  }
  const bearing = metersBetween(closest.point, aim) > 0.5
    ? calculateBearing(closest.point.latitude, closest.point.longitude, aim.latitude, aim.longitude)
    : calculateBearing(points[closest.index].latitude, points[closest.index].longitude, points[closest.index + 1].latitude, points[closest.index + 1].longitude);
  const measured = route.segmentDistances;
  const remaining = measured && measured.length === lengths.length
    ? measured.slice(closest.index + 1).reduce((sum, meters) => sum + meters, 0) + measured[closest.index] * (1 - closest.t)
    : total ? (1 - closest.along / total) * route.distance : 0;
  return { along: closest.along, remaining,
    offPath: closest.distance, bearing, segment: closest.index };
}
