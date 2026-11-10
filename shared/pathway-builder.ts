import { alignmentError, type CampusMap } from './campus-map';
import { metersBetween, parseOutdoorGraph, validPoint, type OutdoorGraph, type Point } from './outdoor-graph';

export interface NetworkLocation { id: string; name: string; environment: 'campus' | 'test'; bounds: { south: number; north: number; west: number; east: number } }
export type MapReference = { mode: 'geographic'; crs: 'EPSG:4326'; reviewed: boolean } | { mode: 'image'; image: CampusMap };
export interface PathEvidence {
  endpointsConfirmed: boolean; accessConfirmed: boolean; geometryConfirmed: boolean;
  measuredMeters?: number; notes: string;
}
export interface PathwayDraft {
  id: string; location: NetworkLocation; map: MapReference;
  from: string; to: string; geometry: Point[]; evidence: PathEvidence;
  oneWay: boolean; accessible: boolean; open: boolean;
}
export function insideLocation(point: Point, location: NetworkLocation) {
  const b = location.bounds;
  return validPoint(point) && point.latitude >= b.south && point.latitude <= b.north && point.longitude >= b.west && point.longitude <= b.east;
}
export function validateLocation(location: NetworkLocation) {
  if (!location || !/^[a-z0-9_-]{1,80}$/.test(location.id) || !location.name?.trim() || !['campus','test'].includes(location.environment)) throw new Error('Choose a named campus or test location.');
  const b = location.bounds;
  if (!b || !validPoint({latitude:b.south,longitude:b.west}) || !validPoint({latitude:b.north,longitude:b.east}) || b.south >= b.north || b.west >= b.east) throw new Error('Set surveyed location boundaries.');
}
export function geometryMeters(points: Point[]) { return points.slice(1).reduce((sum,p,i)=>sum+metersBetween(points[i],p),0); }
export function pathwayIssues(path: PathwayDraft, graph: OutdoorGraph): string[] {
  const issues: string[] = [];
  try { validateLocation(path.location); parseOutdoorGraph(graph); } catch(error) { return [(error as Error).message]; }
  const start = graph.nodes.find(n=>n.id===path.from), end = graph.nodes.find(n=>n.id===path.to);
  if (!start || !end || start.id === end.id) issues.push('Select two different existing walking points.');
  if (path.geometry.length < 2 || path.geometry.length > 10000 || path.geometry.some(p=>!insideLocation(p,path.location))) issues.push('Every path point must be inside the selected location.');
  if (start && end && path.geometry.length >= 2 && (metersBetween(start,path.geometry[0]) > .2 || metersBetween(end,path.geometry.at(-1)!) > .2)) issues.push('Path geometry must meet the selected endpoints.');
  if (graph.nodes.some(n=>!insideLocation(n,path.location))) issues.push('This network contains points from another location. Keep test routes separate.');
  if (graph.edges.some(e=>(e.from===path.from&&e.to===path.to)||(!e.oneWay&&e.from===path.to&&e.to===path.from))) issues.push('This connection already exists. Review the existing pathway instead.');
  if (path.map.mode === 'geographic') { if (path.map.crs !== 'EPSG:4326' || !path.map.reviewed) issues.push('Confirm the geographic map and walkway geometry on site.'); }
  else { const error=alignmentError(path.map.image); if(error==null||error>12)issues.push('Align three distributed landmarks and verify an independent point within 12 m.'); }
  const evidence=path.evidence, length=geometryMeters(path.geometry);
  if(!evidence.endpointsConfirmed||!evidence.accessConfirmed||!evidence.geometryConfirmed||!evidence.notes.trim()) issues.push('Confirm endpoints, physical access, geometry, and record your verification notes.');
  if(evidence.measuredMeters!=null&&(!Number.isFinite(evidence.measuredMeters)||evidence.measuredMeters<=0||evidence.measuredMeters>10000||length>evidence.measuredMeters*1.15+2)) issues.push('Measured distance must be positive and consistent with the pathway geometry.');
  if(length<5&&!(evidence.measuredMeters!=null&&evidence.measuredMeters>0&&evidence.measuredMeters<5))issues.push('Short pathways require an independently measured distance below 5 m.');
  if(!Number.isFinite(length)||length<=0)issues.push('The path must have nonzero geographic length.');
  return issues;
}
/** Returns a copy. Neither existing pathways nor the original GPS evidence are modified. */
export function addVerifiedPathway(graph: OutdoorGraph, path: PathwayDraft): OutdoorGraph {
  const issues=pathwayIssues(path,graph);if(issues.length)throw new Error(issues.join(' '));
  const next:OutdoorGraph=JSON.parse(JSON.stringify(graph));
  next.verified=false;
  next.edges.push({from:path.from,to:path.to,meters:path.evidence.measuredMeters??geometryMeters(path.geometry),geometry:structuredClone(path.geometry),open:path.open,accessible:path.accessible,oneWay:path.oneWay,validation:'validated',distanceSource:path.evidence.measuredMeters!=null?'measured':'estimated'});
  return parseOutdoorGraph(next);
}
export interface GapCorrection { afterIndex:number; geometry:Point[]; evidence:PathEvidence }
export function correctedGeometry(original: readonly (Point & {breakBefore?:boolean})[], corrections: GapCorrection[]): Point[] {
  if(original.length<2)throw new Error('Keep at least two original GPS points.');
  const result:Point[]=[{latitude:original[0].latitude,longitude:original[0].longitude}];
  const used=new Set<number>();
  for(let i=1;i<original.length;i++){
    const matches=corrections.filter(c=>c.afterIndex===i-1);
    if(matches.length>1)throw new Error('A gap has duplicate corrections.');
    const correction=matches[0];
    if(original[i].breakBefore&&!correction)throw new Error(`Correct the gap between points ${i} and ${i+1}.`);
    if(correction){
      const e=correction.evidence,g=correction.geometry;
      if(!original[i].breakBefore||!e.endpointsConfirmed||!e.accessConfirmed||!e.geometryConfirmed||!e.notes.trim()||g.length<2||g.some(p=>!validPoint(p))||metersBetween(g[0],original[i-1])>.2||metersBetween(g.at(-1)!,original[i])>.2)throw new Error('Gap correction needs verified geometry joining the original GPS endpoints.');
      result.push(...g.slice(1).map(p=>({...p})));used.add(correction.afterIndex);
    }else result.push({latitude:original[i].latitude,longitude:original[i].longitude});
  }
  if(used.size!==corrections.length)throw new Error('Correction does not match a recorded gap.');
  return result;
}
