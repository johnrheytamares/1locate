import { supabase } from './supabase';
import { validateGraph, type IndoorGraph } from '../../shared/indoor-graph';

export interface PublishedMap { id: string; floor_id: string; storage_path: string; width_px: number; height_px: number }
export interface PublishedBuildingGraph { building_id: string; graph: IndoorGraph }
export async function loadIndoorMaps() {
  if (!supabase) throw new Error('Campus maps need a configured campus connection.');
  const [graphs, maps, floors, buildings] = await Promise.all([
    supabase.from('indoor_graphs').select('building_id,graph').eq('is_active', true),
    supabase.from('floor_maps').select('id,floor_id,storage_path,width_px,height_px').eq('is_active', true),
    supabase.from('floors').select('id,building_id,name,level'),
    supabase.from('buildings').select('id,name').eq('is_active', true),
  ]);
  for (const result of [graphs,maps,floors,buildings]) if (result.error) throw result.error;
  const valid: PublishedBuildingGraph[] = [];
  const visibleMaps = maps.data ?? [];
  for (const row of graphs.data ?? []) {
    try {
      validateGraph(row.graph);
      if (row.graph.nodes.some(n => !visibleMaps.some(m => m.id === n.map_id && m.floor_id === n.floor_id))) continue;
      valid.push(row as PublishedBuildingGraph);
    } catch { /* Invalid or unpublished map references must never be used for navigation. */ }
  }
  return { graphs: valid, maps: visibleMaps as PublishedMap[], floors: floors.data ?? [], buildings: buildings.data ?? [] };
}
export async function signedMapUrl(path: string): Promise<string> {
  if (!supabase) throw new Error('Campus connection is unavailable.');
  const { data, error } = await supabase.storage.from('floor-maps').createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}
