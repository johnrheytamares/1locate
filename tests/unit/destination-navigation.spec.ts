import { describe, expect, it } from 'vitest';
import { destinationNavigationIssues, type DestinationNavigation } from '../../shared/destination-navigation';
import type { OutdoorGraph } from '../../shared/outdoor-graph';
import type { NetworkLocation } from '../../shared/pathway-builder';
const location:NetworkLocation={id:'campus',name:'Surveyed campus',environment:'campus',bounds:{south:12.9,north:13.1,west:120.9,east:121.1}};
const entrance={latitude:13,longitude:121};
const graph:OutdoorGraph={version:1,verified:true,nodes:[{...entrance,id:'door',name:'Door',entrance:true},{latitude:13.0001,longitude:121,id:'gate',name:'Gate',entrance:false}],edges:[{from:'gate',to:'door',meters:12,open:true,accessible:true,oneWay:true,validation:'validated'}]};
const outdoor=():DestinationNavigation=>({type:'outdoor-only',locationId:'campus',endpointId:'door',entrance,indoorRouteValid:false});
describe('destination navigation validation',()=>{
 it('allows outdoor-only destinations without indoor instructions',()=>{expect(destinationNavigationIssues(outdoor(),location,graph)).toEqual([]);});
 it('requires hybrid instructions and matching verified start',()=>{const config={...outdoor(),type:'hybrid' as const};expect(destinationNavigationIssues(config,location,graph).length).toBeGreaterThan(0);expect(destinationNavigationIssues({...config,indoorRouteValid:true,checkpoint:{name:'Door',verified:true,endpointId:'door'}},location,graph)).toEqual([]);});
 it('allows indoor guidance from a checked checkpoint without outdoor graph',()=>{expect(destinationNavigationIssues({type:'indoor',locationId:'campus',indoorRouteValid:true,checkpoint:{name:'Lobby',verified:true}},location,{version:1,verified:false,nodes:[],edges:[]})).toEqual([]);});
 it('rejects test locations and cross-network endpoints',()=>{expect(destinationNavigationIssues(outdoor(),{...location,environment:'test'},graph).join()).toContain('Test destinations');expect(destinationNavigationIssues({...outdoor(),locationId:'other'},location,graph).join()).toContain('same location');});
 it('rejects closed or reversed one-way access',()=>{const edge=graph.edges[0];expect(destinationNavigationIssues(outdoor(),location,{...graph,edges:[{...edge,open:false}]}).join()).toContain('incoming');expect(destinationNavigationIssues(outdoor(),location,{...graph,edges:[{...edge,from:'door',to:'gate'}]}).join()).toContain('incoming');});
});
