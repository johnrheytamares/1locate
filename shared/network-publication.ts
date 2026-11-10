import { parseOutdoorGraph, type OutdoorGraph } from './outdoor-graph';
import { insideLocation, validateLocation, geometryMeters, type NetworkLocation, type MapReference } from './pathway-builder';
import { alignmentError } from './campus-map';
export interface PublishedGraph extends OutdoorGraph { location: NetworkLocation; mapReference: MapReference; verification: { checked: boolean; notes: string } }
export function checkedNetwork(input: PublishedGraph): PublishedGraph {
  validateLocation(input.location);
  if(input.location.environment !== 'campus') throw new Error('Test locations remain drafts and cannot be published.');
  if(!input.verification?.checked || !input.verification.notes.trim()) throw new Error('Confirm physical access, endpoints and distances, and add verification notes.');
  if(!input.nodes.length || !input.edges.length || !input.nodes.some(n=>n.entrance)) throw new Error('Connect walking points to a destination entrance first.');
  if(input.mapReference?.mode==='image') { const error=alignmentError(input.mapReference.image); if(error==null || error>12) throw new Error('Check image alignment using three landmarks and an independent point within 12 m.'); }
  else if(input.mapReference?.mode!=='geographic' || input.mapReference.crs!=='EPSG:4326' || !input.mapReference.reviewed) throw new Error('Verify the geographic map reference.');
  const graph:PublishedGraph=JSON.parse(JSON.stringify(input));
  if(graph.mapReference.mode==='geographic') delete graph.referenceMap;
  else graph.referenceMap=graph.mapReference.image;
  if(graph.nodes.some(n=>!insideLocation(n,graph.location)) || graph.edges.some(e=>e.geometry?.some(p=>!insideLocation(p,graph.location)))) throw new Error('All network points must belong to the selected location.');
  const seen=new Set<string>();
  for(const edge of graph.edges){
    const key=[edge.from,edge.to].sort().join('|');
    if(seen.has(key)) throw new Error('Review duplicate connections before publishing.'); seen.add(key);
    if(!edge.geometry || edge.geometry.length<2) throw new Error('Each pathway needs verified geometry, including every corner.');
    if((edge.meters<5 || geometryMeters(edge.geometry)<5) && edge.distanceSource!=='measured') throw new Error('Short pathways need an independently measured distance.');
    edge.validation='validated';
  }
  // All nodes must share a physical network; direction and closure remain routing restrictions.
  const reached=new Set([graph.nodes[0].id]); let changed=true;
  while(changed){ changed=false; for(const edge of graph.edges) if(reached.has(edge.from)||reached.has(edge.to)){const size=reached.size;reached.add(edge.from);reached.add(edge.to);changed ||= size!==reached.size;} }
  if(reached.size!==graph.nodes.length)throw new Error('Connect or remove isolated walking points before publishing.');
  graph.verified=true;parseOutdoorGraph(graph);return graph;
}
