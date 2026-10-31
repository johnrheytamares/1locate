import { computed, ref, type Ref } from 'vue';
import type { Destination } from '@/models/navigation';
import {
  fetchDestinations,
  type DestinationLoadResult,
  type DestinationSource,
} from '@/services/destination-repository';
import { getDestinations, setDestinationCatalog } from '@/services/navigation.service';

export type CatalogStatus = 'loading' | DestinationSource;

const LIVE_SOURCES: DestinationSource[] = ['supabase', 'supabase-legacy'];

/**
 * Destination list shared by the picker and the confirm screen.
 * The label always describes the catalog that navigation will use.
 */
export function createDestinationCatalog(fetcher: () => Promise<DestinationLoadResult> = () => fetchDestinations()) {
  const destinations = ref<Destination[]>(getDestinations());
  const status = ref<CatalogStatus>('loading');
  const failed = ref(false);
  const loading = ref(false);
  let pending: Promise<void> | null = null;

  const isLive = computed(() => status.value !== 'loading' && LIVE_SOURCES.includes(status.value));

  const sourceLabel = computed(() => {
    if (status.value === 'loading') return 'Loading campus data...';
    if (status.value === 'supabase') return 'Live campus data';
    if (status.value === 'supabase-legacy') return 'Live campus data (basic details)';
    return failed.value ? 'Offline data · campus server unavailable' : 'Offline data';
  });

  async function run() {
    loading.value = true;
    try {
      const result = await fetcher();
      if (result.reason) console.warn(`[1Locate] Using bundled destinations: ${result.reason}`);
      // A failed refresh keeps the live catalog that is already in use.
      if (result.source === 'local' && isLive.value) return;
      setDestinationCatalog(result.destinations);
      destinations.value = getDestinations();
      status.value = result.source;
      failed.value = result.failed;
    } finally {
      loading.value = false;
    }
  }

  /** Fetches the catalog. Concurrent calls share one request. */
  function load(): Promise<void> {
    pending ??= run().finally(() => { pending = null; });
    return pending;
  }

  /** Loads once. Used by screens that only need some catalog to be ready. */
  function ensureLoaded(): Promise<void> {
    return status.value === 'loading' ? load() : Promise.resolve();
  }

  return {
    destinations: destinations as Readonly<Ref<Destination[]>>,
    status: status as Readonly<Ref<CatalogStatus>>,
    failed: failed as Readonly<Ref<boolean>>,
    loading: loading as Readonly<Ref<boolean>>,
    isLive,
    sourceLabel,
    load,
    ensureLoaded,
  };
}

export type DestinationCatalog = ReturnType<typeof createDestinationCatalog>;

let shared: DestinationCatalog | null = null;

export function useDestinationCatalog(): DestinationCatalog {
  shared ??= createDestinationCatalog();
  return shared;
}
