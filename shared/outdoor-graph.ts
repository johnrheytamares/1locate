import { validateCampusMap, type CampusMap } from './campus-map';
/** Geographic walking network. Coordinates and access must be surveyed before publication. */
export interface Point { latitude: number; longitude: number; }
export interface OutdoorNode extends Point { id: string; name: string; entrance: boolean; }
export interface OutdoorEdge { from: string; to: string; meters: number; open: boolean; accessible: boolean; oneWay: boolean; distanceSource?: 'estimated' | 'measured' | 'gps'; geometry?: Point[]; recordingId?: string; instruction?: 'straight' | 'left' | 'right'; validation?: 'draft' | 'validated'; quality?: { worstAccuracy: number; accepted: number }; }
export interface OutdoorGraph { version: 1; verified: boolean; nodes: OutdoorNode[]; edges: OutdoorEdge[]; referenceMap?: CampusMap; }
export const EMPTY_OUTDOOR_GRAPH: OutdoorGraph = { version: 1, verified: false, nodes: [], edges: [] };
const radians = (n: number) => n * Math.PI / 180;
export function validPoint(p: Point): boolean {
  return !!p && Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90 && Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180;
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
    if (edge.distanceSource != null && !['estimated', 'measured', 'gps'].includes(edge.distanceSource)) throw new Error('Invalid distance source');
    if (edge.instruction != null && !['straight', 'left', 'right'].includes(edge.instruction)) throw new Error('Invalid route instruction');
    if (edge.validation != null && !['draft', 'validated'].includes(edge.validation)) throw new Error('Invalid route validation');
    if (graph.verified && edge.validation === 'draft') throw new Error('Recorded paths must be validated before publishing.');
    if (edge.geometry != null) {
      if (!Array.isArray(edge.geometry) || edge.geometry.length < 2 || edge.geometry.length > 10000 || edge.geometry.some(p => !p || !validPoint(p))) throw new Error('Invalid recorded path geometry');
      if (metersBetween(edge.geometry[0], nodes.get(edge.from)!) > 0.2 || metersBetween(edge.geometry[edge.geometry.length - 1], nodes.get(edge.to)!) > 0.2) throw new Error('Recorded geometry must meet its graph endpoints');
      const length = edge.geometry.slice(1).reduce((sum, p, i) => sum + metersBetween(edge.geometry![i], p), 0);
      if (length > edge.meters * 1.15 + 2) throw new Error('Distance is shorter than the recorded path');
    }
    if (edge.recordingId != null && (typeof edge.recordingId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(edge.recordingId))) throw new Error('Invalid recording reference');
    if (edge.quality != null && (!Number.isFinite(edge.quality.worstAccuracy) || edge.quality.worstAccuracy < 0 || !Number.isInteger(edge.quality.accepted) || edge.quality.accepted < 2)) throw new Error('Invalid GPS quality metadata');
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

/** Dijkstra over graph checkpoints, with projection and progress on full recorded curves. */
export function campusWalkingRoute(graph: OutdoorGraph, start: Point, target: Point, stepFree = false) {
  if (!validPoint(start) || !validPoint(target)) throw new Error('Invalid route coordinates');
  if (!graph.verified || !graph.nodes.length) return null;
  const nodes = new Map(graph.nodes.map(n => [n.id, n]));
  const usableEdges = graph.edges.filter(e => e.open && e.validation !== 'draft' && (!stepFree || e.accessible));
  const entrance = graph.nodes.filter(n => n.entrance && metersBetween(n, target) <= 8 && usableEdges.some(e => e.from === n.id || e.to === n.id)).sort((a, b) => metersBetween(a, target) - metersBetween(b, target))[0];
  if (!entrance) { if (graph.nodes.some(n => n.entrance && metersBetween(n, target) <= 8)) throw new Error('No open campus walking route connects to this entrance.'); return null; }
  const edges = usableEdges;
  const shape = (e: OutdoorEdge): Point[] => e.geometry || [nodes.get(e.from)!, nodes.get(e.to)!];
  const lengths = (p: Point[]) => p.slice(1).map((x, i) => metersBetween(p[i], x));
  const candidates = edges.flatMap(edge => {
    const geometry = shape(edge), parts = lengths(geometry), total = parts.reduce((a, b) => a + b, 0); let before = 0;
    return parts.map((length, index) => {
      const projection = projectOnSegment(start, geometry[index], geometry[index + 1]);
      const fraction = total ? (before + projection.t * length) / total : 0; before += length;
      return { edge, geometry, index, fraction, ...projection };
    });
  }).sort((a, b) => a.distance - b.distance);
  const nearest = candidates[0];
  if (!nearest || nearest.distance > 20) throw new Error('Move to a configured campus walkway, then retry. No connecting path has been inferred.');
  const costs = new Map<string, number>(), previous = new Map<string, { from: string; edge: OutdoorEdge; reverse: boolean }>();
  costs.set(nearest.edge.to, nearest.edge.meters * (1 - nearest.fraction));
  if (!nearest.edge.oneWay || nearest.fraction < 0.001) costs.set(nearest.edge.from, nearest.edge.meters * nearest.fraction);
  const visited = new Set<string>();
  while (visited.size < nodes.size) {
    let current: string | undefined, best = Infinity;
    for (const [id, cost] of costs) if (!visited.has(id) && cost < best) { current = id; best = cost; }
    if (!current || current === entrance.id) break;
    visited.add(current);
    for (const edge of edges) {
      const reverse = edge.to === current, next = edge.from === current ? edge.to : !edge.oneWay && reverse ? edge.from : null;
      if (next && best + edge.meters < (costs.get(next) ?? Infinity)) { costs.set(next, best + edge.meters); previous.set(next, { from: current, edge, reverse }); }
    }
  }
  const distance = costs.get(entrance.id);
  if (distance == null) throw new Error('No open campus walking route connects to this entrance.');
  const path: { edge: OutdoorEdge; reverse: boolean }[] = []; let root = entrance.id;
  while (previous.has(root)) { const link = previous.get(root)!; path.unshift(link); root = link.from; }
  const towardsFrom = root === nearest.edge.from;
  const points: Point[] = [nearest.point];
  const segmentDistances: number[] = [];
  const instructions: { index: number; direction: 'straight' | 'left' | 'right' }[] = [];
  function append(part: Point[], measured: number, instruction?: OutdoorEdge['instruction']) {
    const all = [points[points.length - 1], ...part], sizes = lengths(all), total = sizes.reduce((a, b) => a + b, 0);
    if (instruction) instructions.push({ index: points.length - 1, direction: instruction });
    part.forEach((p, i) => { points.push(p); segmentDistances.push(total ? measured * sizes[i] / total : measured / part.length); });
  }
  append(towardsFrom ? nearest.geometry.slice(0, nearest.index + 1).reverse() : nearest.geometry.slice(nearest.index + 1), costs.get(root)!, !towardsFrom && nearest.fraction < 0.01 ? nearest.edge.instruction : undefined);
  for (const link of path) {
    const geometry = link.reverse ? [...shape(link.edge)].reverse() : shape(link.edge);
    // A reversed left/right instruction is not necessarily a surveyed instruction in that direction.
    append(geometry.slice(1), link.edge.meters, link.reverse ? undefined : link.edge.instruction);
  }
  return { coordinates: points.map(p => [p.longitude, p.latitude] as [number, number]), distance, duration: distance / 1.2,
    source: 'campus' as const, approachMeters: nearest.distance, segmentDistances, referenceMap: graph.referenceMap, instructions };
}
