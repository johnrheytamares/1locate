import { describe, expect, test } from 'vitest';
import { acceptFix, createRecording, markTurn, recordedDistance, recordingNetwork, restoreRecording, removeFix, validateRecording } from '../../shared/gps-recording';
import { campusWalkingRoute, metersBetween, parseOutdoorGraph, type OutdoorGraph } from '../../shared/outdoor-graph';
import { alignmentError, type CampusMap } from '../../shared/campus-map';
const start = 100000;
const fix = (meters: number, timestamp = start + meters * 1000, accuracy = 3) => ({ latitude: 0, longitude: meters / 111195, timestamp, accuracy });
function route() { const r = createRecording('test-walk', 'building', 'IT', fix(20), start); [0,5,10,15,20].forEach(m => acceptFix(r, fix(m), fix(m).timestamp)); return r; }
const graph = (): OutdoorGraph => ({ version: 1, verified: false, nodes: [], edges: [] });
const map = (): CampusMap => ({ image: '/images/updated_map.png', anchors: [{ x: 0, y: 0, latitude: 0.001, longitude: -0.001 }, { x: 1, y: 0, latitude: 0.001, longitude: 0.001 }, { x: 0, y: 1, latitude: -0.001, longitude: -0.001 }], checks: [{ x: 0.5, y: 0.5, latitude: 0, longitude: 0 }] });
const checks = { walked: true, overlaps: true, alignment: true };
describe('actual GPS walking recording', () => {
  test('accumulates accepted walking distance and keeps intermediate geometry instead of making every reading a node', () => {
    const r = route(); expect(recordedDistance(r.points)).toBeCloseTo(20, 1);
    const network = recordingNetwork(r, graph()); expect(network.nodes).toHaveLength(2); expect(network.edges).toHaveLength(1); expect(network.edges[0].geometry).toHaveLength(5); expect(network.edges[0].accessible).toBe(false);
    expect(() => parseOutdoorGraph({ ...network, verified: true })).toThrow('validated');
  });
  test('marks left and right at accepted positions, rejects repeated taps and splits only at checkpoints', () => {
    const r = createRecording('turns', 'building', 'IT', fix(20), start);
    [0,5,10].forEach(m => acceptFix(r, fix(m), fix(m).timestamp)); markTurn(r, 'left');
    expect(() => markTurn(r, 'left')).toThrow('next checkpoint');
    [15,20].forEach(m => acceptFix(r, fix(m), fix(m).timestamp)); markTurn(r, 'right');
    const network = recordingNetwork(r, graph()); expect(network.nodes).toHaveLength(3); expect(network.edges[1].instruction).toBe('left');
  });
  test('ignores stationary jitter, duplicate timestamps, poor accuracy, stale readings and implausible jumps', () => {
    const r = createRecording('noise', 'building', 'IT', fix(20), start);
    acceptFix(r, fix(0), start);
    for (let i = 1; i <= 20; i++) expect(acceptFix(r, fix(i % 3, start + i * 1000), start + i * 1000).accepted).toBe(false);
    expect(recordedDistance(r.points)).toBe(0);
    expect(acceptFix(r, fix(50, start + 21000), start + 21000).accepted).toBe(false);
    expect(acceptFix(r, fix(5, start + 22000, 80), start + 22000).accepted).toBe(false);
    expect(acceptFix(r, fix(5, start), start + 99999).accepted).toBe(false);
    expect(acceptFix(r, fix(5, start), start).accepted).toBe(false);
  });
  test('a resumed fix never accumulates the paused displacement and gaps cannot be published', () => {
    const r = route(); const before = recordedDistance(r.points);
    acceptFix(r, fix(200, start + 300000), start + 300000, true);
    expect(recordedDistance(r.points)).toBe(before);
    expect(validateRecording(r, map(), checks).join(' ')).toContain('gap');
  });
  test('resuming at the same position preserves continuity and the next walk adds real movement only', () => {
    const r = route(); acceptFix(r, fix(20, start + 100000), start + 100000, true); acceptFix(r, fix(25, start + 105000), start + 105000);
    expect(recordedDistance(r.points)).toBeCloseTo(25, 1);
    expect(validateRecording(r, map(), checks)).toEqual([]);
  });
  test('rejects long GPS outages rather than silently bridging them', () => {
    const r = route(); acceptFix(r, fix(30, start + 90000), start + 90000);
    expect(r.points.at(-1)?.breakBefore).toBe(true); expect(recordedDistance(r.points)).toBeCloseTo(20, 1);
    expect(validateRecording(r, map(), checks).join(' ')).toContain('outage');
  });
  test('round trips recoverable drafts, validates timestamps and prevents malformed recovered checkpoints', () => {
    const r = route(); expect(restoreRecording(JSON.parse(JSON.stringify(r)))).toEqual(r);
    expect(() => restoreRecording({ ...r, checkpoints: [{ index: 999, direction: 'left' }] })).toThrow('checkpoint');
    expect(() => restoreRecording({ ...r, points: [...r.points, r.points[0]] })).toThrow('GPS point');
  });
  test('removing a point reindexes checkpoints and never erases evidence of a recording gap', () => {
    const r = route(); r.checkpoints.push({ index: 3, direction: 'left' }); r.points[2].breakBefore = true; removeFix(r, 2);
    expect(r.checkpoints[1].index).toBe(2); expect(r.points[2].breakBefore).toBe(true); expect(() => removeFix(r, 0)).toThrow('start');
  });
  test('requires independent map checks, entrance proximity, overlap and on-site review', () => {
    const r = route(); expect(validateRecording(r, map(), checks)).toEqual([]); expect(alignmentError(map())).toBeCloseTo(0);
    expect(validateRecording(r, { ...map(), checks: [] }, checks).join(' ')).toContain('independent');
    const wrong = map(); wrong.checks![0].latitude = 0.01; expect(validateRecording(r, wrong, checks).join(' ')).toContain('alignment error');
    expect(validateRecording({ ...r, entrance: fix(200) }, map(), checks).join(' ')).toContain('8 m');
    expect(validateRecording(r, map(), { walked: false, overlaps: false, alignment: false })).toHaveLength(3);
  });
  test('never proximity-merges shared paths; explicit endpoint reuse is limited and duplicate connections fail', () => {
    const r = route(); const base = graph(); base.nodes.push({ ...fix(0), id: 'shared', name: 'Gate', entrance: false });
    const separate = recordingNetwork(r, base); expect(separate.nodes).toHaveLength(3);
    const shared = recordingNetwork(r, base, 'shared'); expect(shared.nodes).toHaveLength(2); expect(shared.edges[0].from).toBe('shared');
    expect(() => recordingNetwork(r, { ...base, nodes: [{ ...base.nodes[0], longitude: 1 }] }, 'shared')).toThrow('8 m');
    expect(metersBetween(r.entrance, fix(20))).toBe(0);
  });
  test('routes and projects along curved geometry, never its straight endpoint chord', () => {
    const a = { id: 'a', name: 'Start', latitude: 0, longitude: 0, entrance: false }, b = { id: 'b', name: 'Entrance', latitude: 0.001, longitude: 0.001, entrance: true };
    const curved: OutdoorGraph = { version: 1, verified: true, nodes: [a,b], edges: [{ from:'a', to:'b', meters:230, open:true, accessible:false, oneWay:false, geometry:[a,{ latitude:0, longitude:0.001 },b], validation:'validated' }] };
    const result = campusWalkingRoute(parseOutdoorGraph(curved), { latitude:0, longitude:0.0005 }, b)!;
    expect(result.coordinates).toEqual([[0.0005,0],[0.001,0],[0.001,0.001]]); expect(result.distance).toBeCloseTo(172.5); expect(result.segmentDistances.reduce((x,y)=>x+y,0)).toBeCloseTo(result.distance);
  });
});


test('an unconnected saved entrance does not hide the connected recorded endpoint', () => {
  const r=route(); r.status='validated'; const network=recordingNetwork(r, graph());
  network.nodes.unshift({...fix(20),id:'saved-building-entrance',name:'Saved entrance',entrance:true});
  expect(campusWalkingRoute({...network,verified:true},r.points[0],r.entrance)?.distance).toBeCloseTo(20,1);
});
