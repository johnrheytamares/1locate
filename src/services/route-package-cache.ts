import { supabase } from './supabase';
import { readRouteDraft, writeRouteDraft } from '../../shared/route-drafts';
import { parseRoutePackage, type RoutePackage } from '../../shared/route-package';
import { parseOutdoorGraph, type OutdoorGraph } from '../../shared/outdoor-graph';
const KEY = 'public-outdoor-network-package';
let writes: Promise<void> = Promise.resolve();
let memory: RoutePackage | null = null, refreshedAt = 0;
/** Only validated, immutable published packages enter the offline cache. Drafts are never read here. */
export async function loadOutdoorNetwork(signal: AbortSignal): Promise<OutdoorGraph> {
  if (!memory) { try { const saved = await readRouteDraft(KEY); if (saved) memory = parseRoutePackage(saved); } catch { /* Missing or corrupt browser cache: use remote or bundled data. */ } }
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  if (supabase && navigator.onLine !== false && (!refreshedAt || Date.now() - refreshedAt > 60000)) {
    const controller = new AbortController(), abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, 6000);
    try {
      const { data, error } = await supabase.from('outdoor_route_packages').select('revision,published_at,graph').order('revision', { ascending: false }).limit(1).abortSignal(controller.signal).maybeSingle();
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      if (error) throw error;
      if (data) {
        const next = parseRoutePackage({ schemaVersion: 1, revision: Number(data.revision), publishedAt: data.published_at, graph: data.graph });
        if (!memory || next.revision > memory.revision) { memory = next; try { writes = writes.catch(() => {}).then(() => writeRouteDraft(KEY, next)); await writes; } catch { /* This session still uses the verified package; storage may be unavailable. */ } }
      }
      refreshedAt = Date.now();
    } catch (error) { if (signal.aborted) throw error; /* Retain the last valid package on offline errors, absent migration or malformed response. */ }
    finally { clearTimeout(timeout); signal.removeEventListener('abort', abort); }
  }
  if (memory) return memory.graph;
  const response = await fetch(`${import.meta.env.BASE_URL}campus-walking-network.json`, { signal });
  if (!response.ok) throw new Error('Campus walking network could not load. Retry routing.');
  return parseOutdoorGraph(await response.json());
}
