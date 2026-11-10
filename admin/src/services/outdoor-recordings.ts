import { requireClient } from '../lib/supabase';
import type { Recording } from '../../../shared/gps-recording';
import { parseRoutePackage, type RoutePackage } from '../../../shared/route-package';
import { parseOutdoorGraph, type OutdoorGraph } from '../../../shared/outdoor-graph';
export async function saveRecording(recording: Recording, userId: string) {
  const client = requireClient();
  const value = { ...recording, syncPending: false, status: recording.status === 'validated' ? 'validated' : 'saved' };
  const { error } = await client.from('outdoor_recordings').upsert({ id: recording.id, owner_id: userId, building_id: recording.buildingId, status: value.status, recording: value }, { onConflict: 'id' });
  if (error) throw error;
}
export async function publishRecording(recording: Recording, graph: OutdoorGraph): Promise<RoutePackage> {
  const validated = parseOutdoorGraph({ ...graph, verified: true });
  const { data, error } = await requireClient().rpc('publish_outdoor_network', { recording_id: recording.id, network: validated });
  if (error) throw error;
  return parseRoutePackage(data);
}
export async function loadPublishedNetwork(): Promise<OutdoorGraph | null> {
  const { data, error } = await requireClient().from('outdoor_route_packages').select('revision,published_at,graph').order('revision', { ascending: false }).limit(1).abortSignal(AbortSignal.timeout(6000)).maybeSingle();
  if (error) throw error;
  return data ? parseRoutePackage({ schemaVersion: 1, revision: Number(data.revision), publishedAt: data.published_at, graph: data.graph }).graph : null;
}
