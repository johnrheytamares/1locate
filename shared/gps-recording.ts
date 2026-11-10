import { metersBetween, validPoint, parseOutdoorGraph, type Point, type OutdoorGraph, type OutdoorNode, type OutdoorEdge } from './outdoor-graph';
import { gpsToImage, validImagePoint, alignmentError, type CampusMap } from './campus-map';
export type Direction = 'straight' | 'left' | 'right';
export interface Fix extends Point { timestamp: number; accuracy: number; breakBefore?: boolean }
export interface Checkpoint { index: number; direction: Direction }
export interface GpsConfig { goodAccuracy: number; maxAccuracy: number; minMovement: number; maxSpeed: number; maxAge: number; maxInterval: number; maxGap: number; maxAlignmentError: number }
export const DEFAULT_GPS_CONFIG: GpsConfig = { goodAccuracy: 8, maxAccuracy: 20, minMovement: 3, maxSpeed: 3, maxAge: 15000, maxInterval: 20000, maxGap: 30, maxAlignmentError: 12 };
export interface Recording {
  version: 1; id: string; buildingId: string; name: string; entrance: Point; startedAt: number; elapsed: number;
  points: Fix[]; checkpoints: Checkpoint[]; rejected: number; good: number; reduced: number; config: GpsConfig;
  syncPending?: boolean;
  status: 'draft' | 'saved' | 'validated' | 'published';
}
export function createRecording(id: string, buildingId: string, name: string, entrance: Point, now = Date.now(), config = DEFAULT_GPS_CONFIG): Recording {
  if (!validPoint(entrance)) throw new Error('Set the building entrance GPS before recording.');
  return { version: 1, id, buildingId, name, entrance: { ...entrance }, startedAt: now, elapsed: 0, points: [], checkpoints: [], rejected: 0, good: 0, reduced: 0, config: { ...config }, status: 'draft' };
}
export function validConfig(c: GpsConfig) {
  return c && Object.values(DEFAULT_GPS_CONFIG).length === Object.keys(c).length && Object.values(c).every(v => Number.isFinite(v) && v > 0)
    && c.goodAccuracy <= c.maxAccuracy && c.maxAccuracy <= 50 && c.maxSpeed <= 5 && c.minMovement >= 1 && c.maxGap <= 60 && c.maxAlignmentError <= 30;
}
export function restoreRecording(input: unknown): Recording {
  const r = input as Recording;
  if (!r || r.version !== 1 || typeof r.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(r.id) || typeof r.buildingId !== 'string' || typeof r.name !== 'string' || !r.name.trim() || r.name.length > 120 || !validPoint(r.entrance)
    || !validConfig(r.config) || !Array.isArray(r.points) || r.points.length > 10000 || !Array.isArray(r.checkpoints) || !['draft', 'saved', 'validated', 'published'].includes(r.status)
    || ![r.good, r.reduced, r.rejected].every(n => Number.isInteger(n) && n >= 0) || !Number.isFinite(r.elapsed) || r.elapsed < 0 || !Number.isFinite(r.startedAt)) throw new Error('Invalid saved GPS recording.');
  let timestamp = 0;
  for (const p of r.points) { if (!p || !validPoint(p) || !Number.isFinite(p.timestamp) || p.timestamp <= timestamp || !Number.isFinite(p.accuracy) || p.accuracy < 0 || p.accuracy > r.config.maxAccuracy || p.breakBefore != null && typeof p.breakBefore !== 'boolean') throw new Error('Invalid GPS point in saved recording.'); timestamp = p.timestamp; }
  let index = -1;
  for (const c of r.checkpoints) { if (!c || !Number.isInteger(c.index) || c.index <= index || c.index >= r.points.length || !['straight', 'left', 'right'].includes(c.direction)) throw new Error('Invalid saved turn checkpoint.'); index = c.index; }
  return r;
}
export function acceptFix(r: Recording, fix: Fix, now = Date.now(), resuming = false): { accepted: boolean; quality: 'good' | 'reduced' | 'unreliable'; message: string } {
  const c = r.config, last = r.points.at(-1);
  const reject = (message: string) => { r.rejected++; return { accepted: false, quality: 'unreliable' as const, message }; };
  if (!validPoint(fix) || !Number.isFinite(fix.accuracy) || fix.accuracy < 0 || !Number.isFinite(fix.timestamp) || now - fix.timestamp > c.maxAge || fix.timestamp > now + 5000) return reject('Waiting for a fresh GPS reading.');
  if (fix.accuracy > c.maxAccuracy) return reject('Unreliable GPS signal. Move to an open area or pause and retry.');
  if (last && fix.timestamp <= last.timestamp) return reject('Outdated GPS reading ignored.');
  let distance = 0;
  if (last) {
    distance = metersBetween(last, fix);
    const seconds = (fix.timestamp - last.timestamp) / 1000;
    if (!resuming && (distance / seconds > c.maxSpeed || distance > c.maxGap)) return reject('GPS jump ignored. Return to the last point or pause and retry.');
    // A larger uncertainty circle requires more evidence of movement, not extra distance.
    if (!resuming && distance < Math.max(c.minMovement, (last.accuracy + fix.accuracy) * 0.5)) return { accepted: false, quality: fix.accuracy <= c.goodAccuracy ? 'good' : 'reduced', message: 'Holding position. No distance added.' };
  }
  if (r.points.length >= 10000) return reject('Recording limit reached. Finish and review this route.');
  r.points.push({ latitude: fix.latitude, longitude: fix.longitude, timestamp: fix.timestamp, accuracy: fix.accuracy, ...(last && (resuming || fix.timestamp - last.timestamp > c.maxInterval) ? { breakBefore: true } : {}) });
  const quality = fix.accuracy <= c.goodAccuracy ? 'good' : 'reduced'; r[quality]++;
  if (r.points.length === 1) r.checkpoints.push({ index: 0, direction: 'straight' });
  return { accepted: true, quality, message: quality === 'good' ? 'Good GPS signal' : 'Reduced GPS accuracy. Check the recorded path carefully.' };
}
export function recordedDistance(points: Fix[]): number { return points.slice(1).reduce((sum, p, i) => sum + (p.breakBefore ? 0 : metersBetween(points[i], p)), 0); }
export function markTurn(r: Recording, direction: Direction) {
  const index = r.points.length - 1, previous = r.checkpoints.at(-1);
  if (index < 1 || previous && (index <= previous.index || recordedDistance(r.points.slice(previous.index)) < r.config.minMovement)) throw new Error('Walk to the next checkpoint before marking a direction.');
  r.checkpoints.push({ index, direction });
}
export function removeFix(r: Recording, index: number) {
  if (index <= 0 || index >= r.points.length - 1) throw new Error('Keep the start and endpoint. Re-record to replace either endpoint.');
  const removed = r.points[index]; r.points.splice(index, 1);
  if (removed.breakBefore) r.points[index].breakBefore = true;
  r.checkpoints = r.checkpoints.filter(c => c.index !== index).map(c => ({ ...c, index: c.index > index ? c.index - 1 : c.index })); r.good = r.points.filter(p => p.accuracy <= r.config.goodAccuracy).length; r.reduced = r.points.length - r.good; r.status = 'draft';
}
export interface ReviewChecks { walked: boolean; overlaps: boolean; alignment: boolean }
export function validateRecording(r: Recording, map: CampusMap | undefined, checks: ReviewChecks): string[] {
  const errors: string[] = [];
  try { restoreRecording(r); } catch (error) { return [String((error as Error).message)]; }
  if (r.points.length < 3 || recordedDistance(r.points) < 5) errors.push('Record at least three accepted GPS points and 5 m of walking.');
  if (r.points.length && metersBetween(r.points.at(-1)!, r.entrance) > 8) errors.push('Finish within 8 m of the saved building entrance. Its GPS will not be changed.');
  for (let i = 1; i < r.points.length; i++) {
    const a = r.points[i - 1], b = r.points[i], gap = metersBetween(a, b);
    if (b.breakBefore && gap > 2) { errors.push('A pause or GPS outage left a gap. Re-record this section from the last accepted point.'); break; }
    if (!b.breakBefore && (gap > r.config.maxGap || gap / ((b.timestamp - a.timestamp) / 1000) > r.config.maxSpeed)) { errors.push('A path section has an implausible GPS gap. Remove bad points or re-record it.'); break; }
  }
  const error = map ? alignmentError(map) : null;
  if (error == null) errors.push('Align the map with three landmarks and add an independent GPS check point.');
  else if (error > r.config.maxAlignmentError) errors.push(`Map alignment error is ${Math.round(error)} m. Re-align the map before publishing; the overlay is approximate.`);
  if (map?.anchors.length === 3 && r.points.some(p => { const image = gpsToImage(map, p); return !image || !validImagePoint(image); })) errors.push('Some GPS points fall outside the aligned school map. Recheck map alignment.');
  if (!checks.walked) errors.push('Confirm that you walked the full path and checked walls, fences, stairs and crossings.');
  if (!checks.overlaps) errors.push('Review nearby paths and any shared connection before validating.');
  if (!checks.alignment) errors.push('Check the map overlay against the actual campus.');
  return [...new Set(errors)];
}
export function nearbyConnections(r: Recording, graph: OutdoorGraph) {
  return graph.nodes.filter(n => r.points.some(p => metersBetween(n, p) <= 12));
}
/** Checkpoints form graph nodes; every accepted sample remains in edge geometry. No proximity merge. */
export function recordingNetwork(r: Recording, existing: OutdoorGraph, sharedStart = '', sharedEnd = ''): OutdoorGraph {
  if (r.points.length < 2) throw new Error('Record a walking path first.');
  const graph: OutdoorGraph = JSON.parse(JSON.stringify(existing)); graph.verified = false;
  const indexes = [...new Set([0, ...r.checkpoints.map(c => c.index), r.points.length - 1])].sort((a, b) => a - b);
  const nodes = indexes.map((index, i) => {
    const shared = i === 0 ? sharedStart : i === indexes.length - 1 ? sharedEnd : '';
    if (shared) { const node = graph.nodes.find(n => n.id === shared); if (!node || metersBetween(node, r.points[index]) > 8 || i === indexes.length - 1 && (!node.entrance || metersBetween(node, r.entrance) > 8)) throw new Error('A shared endpoint must be within 8 m and checked on site.'); return node; }
    const node: OutdoorNode = { ...r.points[index], id: `${r.id}-${i}`, name: i === 0 ? `${r.name} start` : i === indexes.length - 1 ? `${r.name} entrance` : `Checkpoint ${i}`, entrance: i === indexes.length - 1 };
    if (graph.nodes.some(n => n.id === node.id)) throw new Error('This recording is already in the network.');
    node.name = node.name.slice(0, 120); graph.nodes.push(node); return node;
  });
  for (let i = 1; i < nodes.length; i++) {
    if (nodes[i - 1].id === nodes[i].id) throw new Error('Start and end cannot reuse the same pathway point.');
    const samples = r.points.slice(indexes[i - 1], indexes[i] + 1);
    const geometry: Point[] = samples.map(p => ({ latitude: p.latitude, longitude: p.longitude }));
    geometry[0] = { latitude: nodes[i - 1].latitude, longitude: nodes[i - 1].longitude }; geometry[geometry.length - 1] = { latitude: nodes[i].latitude, longitude: nodes[i].longitude };
    const edge: OutdoorEdge = { from: nodes[i - 1].id, to: nodes[i].id, meters: geometry.slice(1).reduce((sum, p, j) => sum + metersBetween(geometry[j], p), 0), open: true, oneWay: false, accessible: false, distanceSource: 'gps', geometry, recordingId: r.id, instruction: r.checkpoints.find(c => c.index === indexes[i - 1])?.direction || 'straight', validation: r.status === 'validated' || r.status === 'published' ? 'validated' : 'draft', quality: { worstAccuracy: Math.max(...samples.map(p => p.accuracy)), accepted: samples.length } };
    if (edge.meters <= 0) throw new Error('A recorded section has no movement.');
    if (graph.edges.some(e => e.from === edge.from && e.to === edge.to || !e.oneWay && e.from === edge.to && e.to === edge.from)) throw new Error('These endpoints already share a path. Reuse the existing section instead of adding a duplicate.');
    graph.edges.push(edge);
  }
  return parseOutdoorGraph(graph);
}
