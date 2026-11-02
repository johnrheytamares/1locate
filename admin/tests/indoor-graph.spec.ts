import { describe, expect, it } from 'vitest';
import { legInstruction, routeInstruction, shortestPath, validateGraph, type IndoorGraph, type MapNode, type MapEdge } from '../../shared/indoor-graph';

function node(id: string, kind: MapNode['kind'], floor = 'ground', x = 0, y = 0): MapNode { return { id, kind, name: id, floor_id: floor, map_id: floor, x, y, room_id: kind === 'room' ? `room-${id}` : null }; }
function edge(from: string, to: string, kind: MapEdge['kind'] = 'walk', meters = 1, accessible = true): MapEdge { return { id: `${from}-${to}`, from, to, kind, meters, accessible, enabled: true, bidirectional: true }; }
function fixture(): IndoorGraph {
  return {
    nodes: [node('entry','entrance'), node('stairs0','stairs'), node('stairs1','stairs','upper'), node('lift0','elevator'), node('lift1','elevator','upper'), node('room','room','upper')],
    edges: [edge('entry','stairs0'),edge('stairs0','stairs1','stairs',3,false),edge('stairs1','room'),edge('entry','lift0','walk',4),edge('lift0','lift1','elevator',4),edge('lift1','room','walk',4)],
  };
}
describe('indoor graph routing', () => {
  it('finds the shortest standard route across floors', () => {
    const path = shortestPath(fixture(),'entry','room')!;
    expect(path.meters).toBe(5);
    expect(path.legs.map(l => l.edge.kind)).toEqual(['walk','stairs','walk']);
    expect(legInstruction(path.legs[1],'Second Floor')).toContain('stairs to Second Floor');
  });
  it('uses an elevator for step-free routing', () => {
    const path = shortestPath(fixture(),'entry','room',true)!;
    expect(path.meters).toBe(12);
    expect(path.legs[1].edge.kind).toBe('elevator');
    expect(legInstruction(path.legs[1],'Second Floor')).toContain('elevator to Second Floor');
  });
  it('returns no route when every suitable path is closed or inaccessible', () => {
    const g = fixture(); g.edges[4].enabled = false;
    expect(shortestPath(g,'entry','room',true)).toBeNull();
    g.edges[1].enabled = false;
    expect(shortestPath(g,'entry','room')).toBeNull();
  });
  it('respects one-way connections', () => {
    const g = fixture(); g.edges.filter(e => e.from === 'entry').forEach(e => { e.bidirectional = false; });
    expect(shortestPath(g,'room','entry')).toBeNull();
    expect(shortestPath(g,'entry','room')).not.toBeNull();
  });
  it('handles equal endpoints, unknown nodes and cycles', () => {
    expect(shortestPath(fixture(),'entry','entry')).toEqual({ legs: [], meters: 0 });
    expect(() => shortestPath(fixture(),'missing','room')).toThrow();
    const g = fixture(); g.edges.push(edge('stairs0','lift0'));
    expect(shortestPath(g,'entry','room')?.meters).toBe(5);
  });
  it('rejects cross-floor walks, incompatible connectors and accessible stairs', () => {
    for (const mutate of [
      (g: IndoorGraph) => { g.edges[1].kind = 'walk'; },
      (g: IndoorGraph) => { g.edges[1].kind = 'elevator'; },
      (g: IndoorGraph) => { g.edges[1].accessible = true; },
    ]) { const g = fixture(); mutate(g); expect(() => validateGraph(g)).toThrow(); }
  });
  it('rejects duplicate IDs/rooms, dangling edges and invalid geometry or weights', () => {
    for (const mutate of [
      (g: IndoorGraph) => { g.nodes.push({ ...g.nodes[0] }); },
      (g: IndoorGraph) => { g.edges.push({ ...g.edges[0] }); },
      (g: IndoorGraph) => { g.nodes.push({ ...g.nodes[5], id: 'duplicate' }); },
      (g: IndoorGraph) => { g.edges[0].to = 'missing'; },
      (g: IndoorGraph) => { g.nodes[0].x = 1.1; },
      (g: IndoorGraph) => { g.nodes[0].y = NaN; },
      (g: IndoorGraph) => { g.edges[0].meters = -1; },
      (g: IndoorGraph) => { g.edges[0].meters = Infinity; },
    ]) { const g = fixture(); mutate(g); expect(() => validateGraph(g)).toThrow(); }
  });
  it('generates map-relative turns with image aspect ratio', () => {
    const a = node('a','entrance','ground',0,0), b = node('b','junction','ground',.5,0), c = node('c','room','ground',.5,.5);
    const g = { nodes: [a,b,c], edges: [edge('a','b'),edge('b','c')] };
    const path = shortestPath(g,'a','c')!;
    expect(routeInstruction(path,1,'Ground',1000,500)).toMatch(/^Turn right/);
    c.y = 0; c.x = 1;
    expect(routeInstruction(shortestPath(g,'a','c')!,1,'Ground',1000,500)).toMatch(/^Continue straight/);
  });
});
