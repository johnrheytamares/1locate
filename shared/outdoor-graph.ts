import { validateCampusMap, type CampusMap } from './campus-map';
/** Geographic walking network. Coordinates and access must be surveyed before publication. */
export interface Point { latitude: number; longitude: number; }
export interface OutdoorNode extends Point { id: string; name: string; entrance: boolean; }
export interface OutdoorEdge { from: string; to: string; meters: number; open: boolean; accessible: boolean; oneWay: boolean; }
export interface OutdoorGraph { version: 1; verified: boolean; nodes: OutdoorNode[]; edges: OutdoorEdge[]; referenceMap?: CampusMap; }
export const EMPTY_OUTDOOR_GRAPH: OutdoorGraph = { version: 1, verified: false, nodes: [], edges: [] };
const radians = (n: number) => n * Math.PI / 180;
export function validPoint(p: Point): boolean {
  return Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90 && Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180;
}
export function metersBetween(a: Point, b: Point): number {
  const h = Math.sin(radians(b.latitude - a.latitude) / 2) ** 2
    + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(radians(b.longitude - a.longitude) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function parseOutdoorGraph(input: unknown): OutdoorGraph {
  if (!input || typeof input !== 'object') throw new Error('Invalid walking network');
  const graph = input as OutdoorGraph;
  if (graph.version !== 1 || typeof graph.verified !== 'boolean' || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)
    || graph.nodes.length > 2000 || graph.edges.length > 8000) throw new Error('Invalid walking network version or size');
  if (JSON.stringify(graph).length > 2_000_000) throw new Error('Walking network including its image must be under 2 MB.');
  const nodes = new Map<string, OutdoorNode>();
  if (graph.referenceMap) {
    validateCampusMap(graph.referenceMap);
    if (graph.verified && graph.referenceMap.anchors.length !== 3) throw new Error('Calibrate the campus map with three GPS anchors before publishing.');
  }
  for (const node of graph.nodes) {
    if (!node || typeof node.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(node.id) || nodes.has(node.id)
      || typeof node.name !== 'string' || !node.name.trim() || node.name.length > 120
      || !validPoint(node) || typeof node.entrance !== 'boolean') throw new Error('Invalid or duplicate walking node');
    nodes.set(node.id, node);
  }
  for (const edge of graph.edges) {
    if (!edge || !nodes.has(edge.from) || !nodes.has(edge.to) || edge.from === edge.to
      || !Number.isFinite(edge.meters) || edge.meters <= 0 || edge.meters > 10000
      || typeof edge.open !== 'boolean' || typeof edge.accessible !== 'boolean' || typeof edge.oneWay !== 'boolean') throw new Error('Invalid walking connection');
    if (metersBetween(nodes.get(edge.from)!, nodes.get(edge.to)!) > edge.meters * 1.15 + 2) throw new Error('Connection distance is shorter than its geographic endpoints');
  }
  return graph;
}

/** Closest point on a short campus segment, using a local geographic projection. */
export function projectOnSegment(point: Point, a: Point, b: Point) {
  const scale = Math.max(0.01, Math.cos(radians(point.latitude)));
  const dx = (b.longitude - a.longitude) * scale, dy = b.latitude - a.latitude;
  const t = Math.max(0, Math.min(1, ((point.longitude - a.longitude) * scale * dx + (point.latitude - a.latitude) * dy) / (dx * dx + dy * dy || 1)));
  const projected = { latitude: a.latitude + (b.latitude - a.latitude) * t, longitude: a.longitude + (b.longitude - a.longitude) * t };
  return { point: projected, t, distance: metersBetween(point, projected) };
}

/** Dijkstra, seeded at the nearest open path segment. No invented links through walls. */
export function campusWalkingRoute(graph: OutdoorGraph, start: Point, target: Point, stepFree = false) {
  if (!validPoint(start) || !validPoint(target)) throw new Error('Invalid route coordinates');
  if (!graph.verified || !graph.nodes.length) return null;
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const entrance = graph.nodes.filter(n => n.entrance && metersBetween(n, target) <= 8)
    .sort((a, b) => metersBetween(a, target) - metersBetween(b, target))[0];
  if (!entrance) return null; // This entrance is outside configured coverage.
  const edges = graph.edges.filter(e => e.open && (!stepFree || e.accessible));
  const nearest = edges.map(edge => ({ edge, ...projectOnSegment(start, nodes.get(edge.from)!, nodes.get(edge.to)!) }))
    .sort((a, b) => a.distance - b.distance)[0];
  if (!nearest || nearest.distance > 20) throw new Error('Move to a configured campus walkway, then retry. No connecting path has been inferred.');
  const costs = new Map<string, number>();
  const previous = new Map<string, string>();
  costs.set(nearest.edge.to, nearest.edge.meters * (1 - nearest.t));
  if (!nearest.edge.oneWay || nearest.t < 0.001) costs.set(nearest.edge.from, nearest.edge.meters * nearest.t);
  const visited = new Set<string>();
  while (visited.size < nodes.size) {
    let current: string | undefined, best = Infinity;
    for (const [id, cost] of costs) if (!visited.has(id) && cost < best) { current = id; best = cost; }
    if (!current || current === entrance.id) break;
    visited.add(current);
    for (const edge of edges) {
      const next = edge.from === current ? edge.to : !edge.oneWay && edge.to === current ? edge.from : null;
      if (next && best + edge.meters < (costs.get(next) ?? Infinity)) {
        costs.set(next, best + edge.meters); previous.set(next, current);
      }
    }
  }
  const distance = costs.get(entrance.id);
  if (distance == null) throw new Error('No open campus walking route connects to this entrance.');
  const path = [entrance.id];
  while (previous.has(path[0])) path.unshift(previous.get(path[0])!);
  const points = [nearest.point, ...path.map(id => nodes.get(id)!)];
  const segmentDistances = [costs.get(path[0])!, ...path.slice(1).map((id, i) => costs.get(id)! - costs.get(path[i])!)];
  // Keep at least two points for map LineString compatibility, including at the entrance.
  return { coordinates: points.map(p => [p.longitude, p.latitude] as [number, number]), distance,
    duration: distance / 1.2, source: 'campus' as const, approachMeters: nearest.distance, segmentDistances, referenceMap: graph.referenceMap };
}
