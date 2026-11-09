import type { Point } from './outdoor-graph';
export interface ImagePoint { x: number; y: number; }
export interface MapAnchor extends Point, ImagePoint {}
export interface CampusMap { image: string; anchors: MapAnchor[]; }
export function validImagePoint(p: ImagePoint) { return Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1; }
export function validateCampusMap(input: unknown): CampusMap {
  if (!input || typeof input !== 'object') throw new Error('Invalid campus reference map');
  const map = input as CampusMap;
  if (typeof map.image !== 'string' || map.image.length > 1_400_000
    || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(map.image)
    || !Array.isArray(map.anchors) || map.anchors.length > 3) throw new Error('Use a PNG, JPEG or WebP campus map up to 1 MB.');
  for (const a of map.anchors) if (!a || !validImagePoint(a) || !Number.isFinite(a.latitude) || Math.abs(a.latitude) > 90
    || !Number.isFinite(a.longitude) || Math.abs(a.longitude) > 180) throw new Error('Invalid campus map anchor');
  if (map.anchors.length === 3) {
    if (Math.abs(determinant(map.anchors, 'x', 'y')) < 0.001 || Math.abs(determinant(map.anchors, 'longitude', 'latitude')) < 1e-12) {
      throw new Error('Choose three distinct, widely spaced map anchors that are not on one line.');
    }
  }
  return map;
}
function determinant(points: MapAnchor[], x: keyof MapAnchor, y: keyof MapAnchor) {
  const [a, b, c] = points;
  return (b[x] - a[x]) * (c[y] - a[y]) - (c[x] - a[x]) * (b[y] - a[y]);
}
function transform(map: CampusMap, point: { a: number; b: number }, inverse = false) {
  if (map.anchors.length !== 3) return null;
  const [origin, next, last] = map.anchors;
  const x = inverse ? 'longitude' : 'x', y = inverse ? 'latitude' : 'y';
  const det = determinant(map.anchors, x, y);
  if (Math.abs(det) < (inverse ? 1e-12 : 0.001)) return null;
  const u = ((point.a - origin[x]) * (last[y] - origin[y]) - (point.b - origin[y]) * (last[x] - origin[x])) / det;
  const v = ((next[x] - origin[x]) * (point.b - origin[y]) - (next[y] - origin[y]) * (point.a - origin[x])) / det;
  const toX = inverse ? 'x' : 'longitude', toY = inverse ? 'y' : 'latitude';
  return { a: origin[toX] + u * (next[toX] - origin[toX]) + v * (last[toX] - origin[toX]),
    b: origin[toY] + u * (next[toY] - origin[toY]) + v * (last[toY] - origin[toY]) };
}
/** Affine registration from three verified control points; no coordinates are read from pixels. */
export function imageToGps(map: CampusMap, point: ImagePoint): Point | null {
  const result = transform(map, { a: point.x, b: point.y });
  if (!result || !Number.isFinite(result.a) || !Number.isFinite(result.b) || Math.abs(result.b) > 90 || Math.abs(result.a) > 180) return null;
  return { latitude: result.b, longitude: result.a };
}
export function gpsToImage(map: CampusMap, point: Point): ImagePoint | null {
  const result = transform(map, { a: point.longitude, b: point.latitude }, true);
  return result ? { x: result.a, y: result.b } : null;
}
