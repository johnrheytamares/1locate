import { requireClient } from '@/lib/supabase';
import { photoPath, validateImageFile } from '@/lib/images';
import { validateGraph, type IndoorGraph } from '../../../shared/indoor-graph';

export interface FloorMap {
  id: string; floor_id: string; storage_path: string; title: string | null;
  width_px: number; height_px: number; meters_per_pixel: number | null; is_active: boolean;
}
export async function listFloorMaps(): Promise<FloorMap[]> {
  const { data, error } = await requireClient().from('floor_maps').select('*').order('created_at');
  if (error) throw error;
  return data ?? [];
}
export async function mapUrl(path: string): Promise<string> {
  const { data, error } = await requireClient().storage.from('floor-maps').createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}
export async function uploadFloorMap(floorId: string, file: File): Promise<FloorMap> {
  // Reuse the existing content-signature validator (conservative 5 MB client cap).
  const checked = await validateImageFile(file);
  if (!checked.ok) throw new Error(checked.error);
  const bitmap = await createImageBitmap(file);
  const width = bitmap.width, height = bitmap.height; bitmap.close();
  if (width > 20000 || height > 20000) throw new Error('Map dimensions must be at most 20,000 pixels.');
  const path = photoPath(floorId, checked.extension);
  const db = requireClient();
  const bucket = db.storage.from('floor-maps');
  const upload = await bucket.upload(path, file, { contentType: checked.contentType, upsert: false });
  if (upload.error) throw upload.error;
  const { data, error } = await db.from('floor_maps').insert({ floor_id: floorId, storage_path: path, title: file.name.slice(0, 120), width_px: width, height_px: height, is_active: false }).select().single();
  if (error || !data) {
    const cleanup = await bucket.remove([path]).catch(() => ({ error: true }));
    if (cleanup.error) throw new Error(`Map save failed. Remove leftover floor-maps/${path} from Storage.`);
    throw error ?? new Error('Map was not saved.');
  }
  return data;
}
export async function updateFloorMap(id: string, scale: number, active: boolean): Promise<FloorMap> {
  if (!Number.isFinite(scale) || scale <= 0 || scale > 10) throw new Error('Calibrate map scale above 0 and at most 10 meters/pixel.');
  const { data, error } = await requireClient().from('floor_maps').update({ meters_per_pixel: scale, is_active: active }).eq('id', id).select().single();
  if (error) throw error;
  if (!data) throw new Error('Map was not updated. Check your permissions.');
  return data;
}
export async function loadGraph(buildingId: string, active: boolean): Promise<IndoorGraph | null> {
  const { data, error } = await requireClient().from('indoor_graphs').select('graph').eq('building_id', buildingId).eq('is_active', active).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  validateGraph(data.graph); return data.graph;
}
export async function saveGraph(buildingId: string, graph: IndoorGraph, active: boolean): Promise<void> {
  validateGraph(graph);
  const { data, error } = await requireClient().from('indoor_graphs').upsert({ building_id: buildingId, graph, is_active: active }, { onConflict: 'building_id,is_active' }).select('id').single();
  if (error) throw error;
  if (!data) throw new Error('Graph was not saved. Check your permissions.');
}
export async function unpublishGraph(buildingId: string): Promise<void> {
  const { data, error } = await requireClient().from('indoor_graphs').delete().eq('building_id', buildingId).eq('is_active', true).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('No graph was removed. It may already be unpublished, or your permissions may have changed.');
}
