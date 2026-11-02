/** Coordinates are normalized to the original map image; edge lengths are surveyed meters. */
export interface MapNode {
  id: string;
  floor_id: string;
  map_id: string;
  name: string;
  kind: 'entrance' | 'junction' | 'room' | 'stairs' | 'elevator';
  x: number;
  y: number;
  room_id: string | null;
}
export interface MapEdge {
  id: string;
  from: string;
  to: string;
  kind: 'walk' | 'stairs' | 'elevator';
  meters: number;
  accessible: boolean;
  bidirectional: boolean;
  enabled: boolean;
}
export interface IndoorGraph { nodes: MapNode[]; edges: MapEdge[] }
export interface PathLeg { from: MapNode; to: MapNode; edge: MapEdge }
export interface GraphPath { legs: PathLeg[]; meters: number }
export const emptyGraph = (): IndoorGraph => ({ nodes: [], edges: [] });

export function validateGraph(value: unknown): asserts value is IndoorGraph {
  if (!value || typeof value !== 'object') throw new Error('Invalid graph.');
  const graph = value as IndoorGraph;
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || graph.nodes.length > 1000 || graph.edges.length > 4000) throw new Error('Graph exceeds 1,000 nodes or 4,000 edges.');
  const nodes = new Map<string, MapNode>();
  const rooms = new Set<string>();
  for (const n of graph.nodes) {
    if (!n || typeof n.id !== 'string' || !n.id || n.id.length > 120 || nodes.has(n.id) || typeof n.name !== 'string' || !n.name.trim() || n.name.length > 120 || typeof n.floor_id !== 'string' || !n.floor_id || typeof n.map_id !== 'string' || !n.map_id || !['entrance', 'junction', 'room', 'stairs', 'elevator'].includes(n.kind) || !Number.isFinite(n.x) || !Number.isFinite(n.y) || n.x < 0 || n.x > 1 || n.y < 0 || n.y > 1) throw new Error('Every node needs a unique ID, name, map, floor, type and coordinates within the map.');
    if (n.room_id !== null && (typeof n.room_id !== 'string' || n.kind !== 'room' || rooms.has(n.room_id))) throw new Error('Link each room door once, using a room node.');
    if (n.room_id) rooms.add(n.room_id);
    nodes.set(n.id, n);
  }
  const ids = new Set<string>();
  for (const e of graph.edges) {
    const a = nodes.get(e?.from), b = nodes.get(e?.to);
    if (!e || typeof e.id !== 'string' || !e.id || ids.has(e.id) || !a || !b || a.id === b.id || !Number.isFinite(e.meters) || e.meters <= 0 || e.meters > 10000 || !['walk', 'stairs', 'elevator'].includes(e.kind) || typeof e.accessible !== 'boolean' || typeof e.bidirectional !== 'boolean' || typeof e.enabled !== 'boolean') throw new Error('Every edge needs unique ID, different existing endpoints, valid type, flags and distance above 0 and at most 10,000 m.');
    if (e.kind === 'walk' && (a.floor_id !== b.floor_id || a.map_id !== b.map_id)) throw new Error('Walking edges must stay on the same floor map.');
    if (e.kind !== 'walk' && (a.floor_id === b.floor_id || a.kind !== e.kind || b.kind !== e.kind)) throw new Error('Connect stairs/elevator landings of the same type on different floors.');
    if (e.kind === 'stairs' && e.accessible) throw new Error('Stairs cannot be marked step-free.');
    ids.add(e.id);
  }
}

/** Dijkstra using surveyed edge distances; inaccessible/closed edges are excluded. */
export function shortestPath(graph: IndoorGraph, start: string, goal: string, stepFree = false): GraphPath | null {
  validateGraph(graph);
  const nodes = new Map(graph.nodes.map(n => [n.id, n]));
  if (!nodes.has(start) || !nodes.has(goal)) throw new Error('Choose existing starting and destination nodes.');
  const neighbors = new Map<string, { to: string; edge: MapEdge }[]>();
  for (const e of graph.edges) {
    if (!e.enabled || (stepFree && (!e.accessible || e.kind === 'stairs'))) continue;
    if (!neighbors.has(e.from)) neighbors.set(e.from, []);
    neighbors.get(e.from)!.push({ to: e.to, edge: e });
    if (e.bidirectional) {
      if (!neighbors.has(e.to)) neighbors.set(e.to, []);
      neighbors.get(e.to)!.push({ to: e.from, edge: e });
    }
  }
  const distance = new Map<string, number>([[start, 0]]);
  const previous = new Map<string, { from: string; edge: MapEdge }>();
  const remaining = new Set(nodes.keys());
  while (remaining.size) {
    let current: string | undefined, best = Infinity;
    for (const id of remaining) { const d = distance.get(id) ?? Infinity; if (d < best) { current = id; best = d; } }
    if (!current) break;
    remaining.delete(current);
    if (current === goal) break;
    for (const next of neighbors.get(current) ?? []) {
      if (best + next.edge.meters < (distance.get(next.to) ?? Infinity)) {
        distance.set(next.to, best + next.edge.meters); previous.set(next.to, { from: current, edge: next.edge });
      }
    }
  }
  if (!distance.has(goal)) return null;
  const legs: PathLeg[] = [];
  let current = goal;
  while (current !== start) {
    const p = previous.get(current)!;
    legs.unshift({ from: nodes.get(p.from)!, to: nodes.get(current)!, edge: p.edge }); current = p.from;
  }
  return { legs, meters: distance.get(goal)! };
}

export function legInstruction(leg: PathLeg, floorName: string): string {
  if (leg.edge.kind === 'stairs') return `Take the stairs to ${floorName}. Confirm you are at ${leg.to.name}.`;
  if (leg.edge.kind === 'elevator') return `Take the elevator to ${floorName}. Confirm you are at ${leg.to.name}.`;
  return `Follow the marked corridor for ${Number(leg.edge.meters.toFixed(2))} m to ${leg.to.name}.`;
}

/** Turn angles use the original image dimensions, avoiding distortion on non-square plans. */
export function routeInstruction(path: GraphPath, index: number, floorName: string, width: number, height: number): string {
  const leg = path.legs[index];
  if (!leg) return 'You have reached the destination.';
  const previous = path.legs[index-1];
  if (leg.edge.kind !== 'walk' || !previous || previous.edge.kind !== 'walk' || previous.to.map_id !== leg.from.map_id) return legInstruction(leg, floorName);
  const ax = (previous.to.x-previous.from.x)*width, ay = (previous.to.y-previous.from.y)*height;
  const bx = (leg.to.x-leg.from.x)*width, by = (leg.to.y-leg.from.y)*height;
  const angle = Math.atan2(ax*by-ay*bx,ax*bx+ay*by)*180/Math.PI;
  const turn = Math.abs(angle)<25 ? 'Continue straight' : Math.abs(angle)>150 ? 'Turn back' : angle>0 ? 'Turn right' : 'Turn left';
  return `${turn}, then follow the corridor for ${Number(leg.edge.meters.toFixed(2))} m to ${leg.to.name}.`;
}
