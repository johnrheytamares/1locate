import { metersBetween, type OutdoorGraph, type Point } from './outdoor-graph';
import { insideLocation, validateLocation, type NetworkLocation } from './pathway-builder';
/** Missing values retain the existing outdoor-to-indoor flow; no automatic outdoor conversion. */
export type NavigationType = 'outdoor-only' | 'indoor' | 'hybrid';
export function navigationType(value: unknown): NavigationType {
  if (value == null) return 'hybrid';
  if (value === 'outdoor-only' || value === 'indoor' || value === 'hybrid') return value;
  throw new Error('Choose Outdoor-only, Indoor, or Hybrid navigation.');
}
export interface DestinationNavigation {
  type: NavigationType;
  locationId: string;
  endpointId?: string;
  endpointName?: string;
  entrance?: Point;
  checkpoint?: { name: string; verified: boolean; endpointId?: string };
  indoorRouteValid: boolean;
}
/** Publishing checks are deliberately independent from room/facility labels. */
export function destinationNavigationIssues(config: DestinationNavigation, location: NetworkLocation, graph: OutdoorGraph): string[] {
  const errors:string[]=[];
  try { navigationType(config.type); validateLocation(location); } catch(error) { return [(error as Error).message]; }
  if(config.locationId!==location.id)errors.push('Destination and walking network must belong to the same location.');
  if(location.environment!=='campus')errors.push('Test destinations cannot be published to the official campus catalog.');
  if(config.type!=='outdoor-only'){
    if(!config.indoorRouteValid)errors.push('Add and validate the indoor instructions.');
    if(!config.checkpoint?.verified||!config.checkpoint.name.trim())errors.push('Verify the indoor starting checkpoint.');
  }
  if(config.type!=='indoor'){
    const node=graph.nodes.find(n=>n.id===config.endpointId);
    if(!graph.verified)errors.push('Publish the verified walking network first.');
    if(!node?.entrance||!config.entrance||!insideLocation(config.entrance,location)||!node||!insideLocation(node,location)||metersBetween(node,config.entrance)>.2)errors.push('Choose a verified entrance endpoint matching this destination.');
    if(!graph.edges.some(e=>e.open&&e.validation==='validated'&&(e.to===config.endpointId||(!e.oneWay&&e.from===config.endpointId))))errors.push('The entrance needs a verified, open incoming walking connection.');
    if(config.type==='hybrid'&&config.checkpoint?.endpointId!==config.endpointId)errors.push('The outdoor endpoint must match the indoor starting checkpoint.');
  }
  return errors;
}
