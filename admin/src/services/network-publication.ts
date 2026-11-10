import { requireClient } from '../lib/supabase';
import { checkedNetwork, type PublishedGraph } from '../../../shared/network-publication';
import { parseRoutePackage, type RoutePackage } from '../../../shared/route-package';
export async function publishedNetworks():Promise<RoutePackage[]> {
 const {data,error}=await requireClient().from('outdoor_route_packages').select('revision,published_at,graph').order('revision',{ascending:false});
 if(error)throw error;
 const seen=new Set<string>();return (data||[]).flatMap(row=>{try{const p=parseRoutePackage({schemaVersion:1,revision:Number(row.revision),publishedAt:row.published_at,graph:row.graph});const id=(p.graph as PublishedGraph).location?.id;if(!id||seen.has(id))return [];checkedNetwork(p.graph as PublishedGraph);seen.add(id);return [p];}catch{return [];}});
}
export async function publishPathwayNetwork(graph:PublishedGraph, baseRevision:number):Promise<RoutePackage>{
 const network=checkedNetwork(graph);
 const {data,error}=await requireClient().rpc('publish_pathway_network',{network,base_revision:baseRevision});
 if(error)throw error;return parseRoutePackage(data);
}
export async function saveNetworkOnline(graph:PublishedGraph){
 const {error}=await requireClient().from('outdoor_network_drafts').upsert({id:graph.location.id,graph},{onConflict:'id'});if(error)throw error;
}
