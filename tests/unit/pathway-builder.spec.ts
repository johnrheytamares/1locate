import { describe, expect, it } from 'vitest';
import { addVerifiedPathway, correctedGeometry, pathwayIssues, type PathwayDraft } from '../../shared/pathway-builder';
import { navigationType } from '../../shared/destination-navigation';
import type { OutdoorGraph } from '../../shared/outdoor-graph';
const a={latitude:13,longitude:121}, b={latitude:13.00002,longitude:121};
const graph:OutdoorGraph={version:1,verified:false,nodes:[{...a,id:'a',name:'Gate',entrance:false},{...b,id:'b',name:'Entrance',entrance:true}],edges:[]};
function path():PathwayDraft{return {id:'path',location:{id:'test',name:'Measured test',environment:'test',bounds:{south:12.99,north:13.01,west:120.99,east:121.01}},map:{mode:'geographic',crs:'EPSG:4326',reviewed:true},from:'a',to:'b',geometry:[a,b],oneWay:true,accessible:false,open:true,evidence:{endpointsConfirmed:true,accessConfirmed:true,geometryConfirmed:true,measuredMeters:2.3,notes:'Measured independently with tape; endpoints and access checked.'}};}
describe('verified pathway builder',()=>{
 it('retains legacy flow and rejects unknown navigation types',()=>{expect(navigationType(undefined)).toBe('hybrid');expect(navigationType('outdoor-only')).toBe('outdoor-only');expect(()=>navigationType('auto')).toThrow();});
 it('accepts an independently measured short path without image calibration',()=>{const p=path();expect(pathwayIssues(p,graph)).toEqual([]);const next=addVerifiedPathway(graph,p);expect(next.edges[0]).toMatchObject({meters:2.3,oneWay:true,accessible:false,validation:'validated'});expect(graph.edges).toEqual([]);expect(next.verified).toBe(false);});
 it('rejects a two-point short path without independent measurement',()=>{const p=path();delete p.evidence.measuredMeters;expect(pathwayIssues(p,graph).join()).toContain('independently measured');});
 it('rejects unverified shortcuts and duplicate connections',()=>{const p=path();p.evidence.accessConfirmed=false;expect(()=>addVerifiedPathway(graph,p)).toThrow();p.evidence.accessConfirmed=true;expect(()=>addVerifiedPathway(addVerifiedPathway(graph,p),p)).toThrow('already exists');});
 it('rejects another location and an uncalibrated image',()=>{const p=path();p.location.bounds.south=13.00001;expect(pathwayIssues(p,graph).join()).toContain('another location');p.location.bounds.south=12.99;p.map={mode:'image',image:{image:'/map.png',anchors:[]}};expect(pathwayIssues(p,graph).join()).toContain('landmarks');});
 it('keeps original GPS evidence and requires an explicit verified correction',()=>{const original=[a,{...b,breakBefore:true}];expect(()=>correctedGeometry(original,[])).toThrow('gap');expect(correctedGeometry(original,[{afterIndex:0,geometry:[a,b],evidence:path().evidence}])).toEqual([a,b]);expect(original[1]).toHaveProperty('breakBefore',true);});
 it('rejects corrections that do not join the original gap endpoints',()=>{expect(()=>correctedGeometry([a,{...b,breakBefore:true}],[{afterIndex:0,geometry:[{latitude:14,longitude:121},b],evidence:path().evidence}])).toThrow('endpoints');});
});
