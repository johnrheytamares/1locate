import { navigationType, type DestinationNavigation } from '../../shared/destination-navigation';
import { parseIndoorJourney, type IndoorJourney } from '../../shared/indoor-tracking';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DESTINATIONS } from '@/data/destinations';
import type { DestinationDetails, DestinationImage, DisplayImage, ImageBucket } from '@/models/campus';
import type { Destination, RouteDirection, RouteStep } from '@/models/navigation';
import { isValidCoordinate } from '@/services/geo.service';
import { supabase } from '@/services/supabase';

/**
 * supabase: the navigation_catalog view (Phase 4A migrations applied).
 * supabase-legacy: the original destinations table (migrations not applied yet).
 * local: bundled destinations.
 */
export type DestinationSource = 'supabase' | 'supabase-legacy' | 'local' | 'cache';

export interface DestinationLoadResult {
  destinations: Destination[];
  source: DestinationSource;
  /** True when Supabase is configured but could not provide usable data. */
  failed: boolean;
  /** Why local data was used. Safe to show in debug. */
  reason?: string;
}

const REQUEST_TIMEOUT_MS = 8000;
const SIGNED_URL_SECONDS = 60 * 60;
const MAX_TEXT_LENGTH = 120;
const MAX_FLOOR_NAME_LENGTH = 60;
const MAX_ROOM_NUMBER_LENGTH = 20;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_CAPTION_LENGTH = 200;
const MAX_IMAGES = 12;
const MAX_ROUTE_STEPS = 50;
const MAX_STEP_METERS = 500;
const MAX_ARRIVAL_RADIUS = 100;
const MIN_FLOOR_LEVEL = -5;
const MAX_FLOOR_LEVEL = 200;
const DIRECTIONS: RouteDirection[] = ['straight', 'left', 'right'];
const MISSING_RELATION_CODES = new Set(['PGRST205', '42P01']);

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_PATTERN = new RegExp(`^${UUID}$`);
/** Same rule as public.is_uuid_image_path in the database. */
const IMAGE_PATH_PATTERN = new RegExp(`^${UUID}/${UUID}\\.(jpg|jpeg|png|webp)$`);

const LEGACY_COLUMNS = 'id, name, building, type, entrance_name, entrance_lat, entrance_lng, arrival_radius, indoor_route';
const CATALOG_COLUMNS = `${LEGACY_COLUMNS}, room_id, building_id, floor_name, floor_level, room_number, description, room_images, building_images`;

/** Marks an optional field that was present but invalid. */
const INVALID = Symbol('invalid');

function text(value: unknown, max = MAX_TEXT_LENGTH): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
}

function optionalText(value: unknown, max: number): string | null | typeof INVALID {
  if (value == null) return null;
  if (typeof value !== 'string') return INVALID;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length <= max ? trimmed : INVALID;
}

function optionalUuid(value: unknown): string | null | typeof INVALID {
  if (value == null) return null;
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : INVALID;
}

function optionalFloorLevel(value: unknown): number | null | typeof INVALID {
  if (value == null) return null;
  return Number.isInteger(value) && (value as number) >= MIN_FLOOR_LEVEL && (value as number) <= MAX_FLOOR_LEVEL
    ? (value as number)
    : INVALID;
}

function routeStep(value: unknown, index: number): RouteStep | null {
  if (!value || typeof value !== 'object') return null;
  const step = value as Record<string, unknown>;
  const direction = step.direction as RouteDirection;
  const distance = step.distance;
  if (!DIRECTIONS.includes(direction)) return null;
  if (typeof distance !== 'number' || !Number.isFinite(distance) || distance <= 0 || distance > MAX_STEP_METERS) {
    return null;
  }
  const id = Number.isInteger(step.id) ? (step.id as number) : index + 1;
  return { id, direction, distance, mode: 'indoor' };
}

/** Converts one destinations row into a Destination. Returns null when any field is invalid. */
export function toDestination(row: unknown): Destination | null {
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  const id = text(record.id);
  const name = text(record.name);
  const building = text(record.building);
  const type = text(record.type);
  const entranceName = text(record.entrance_name);
  if (!id || !name || !building || !type || !entranceName) return null;

  const latitude = record.entrance_lat ?? null;
  const longitude = record.entrance_lng ?? null;
  const unsurveyed = latitude === null && longitude === null;
  if (!unsurveyed && !isValidCoordinate(latitude, longitude)) return null;

  const radius = record.arrival_radius;
  if (typeof radius !== 'number' || !Number.isFinite(radius) || radius <= 0 || radius > MAX_ARRIVAL_RADIUS) {
    return null;
  }

  let mode: ReturnType<typeof navigationType>;
  try { mode=navigationType(record.navigation_type); } catch { return null; }
  const config=record.navigation_config as DestinationNavigation|undefined;
  if(record.navigation_type!=null && (!config || config.type!==mode || !/^[a-z0-9_-]{1,80}$/.test(config.locationId)))return null;
  if(record.navigation_type!=null && mode==='hybrid' && config?.checkpoint?.endpointId!==config?.endpointId)return null;
  if(record.navigation_type!=null && mode!=='indoor' && (!config?.endpointId || !config.entrance || !isValidCoordinate(config.entrance.latitude,config.entrance.longitude)))return null;
  if(record.navigation_type!=null && mode!=='outdoor-only' && (!config?.checkpoint?.verified || !config.checkpoint.name?.trim()))return null;
  const rawRoute = record.indoor_route;
  let indoorJourney: IndoorJourney | undefined;
  if(mode!=='outdoor-only' && record.indoor_journey!=null){try{indoorJourney=parseIndoorJourney(record.indoor_journey);if(indoorJourney.destinationId!==id||indoorJourney.status!=='validated'||record.building_id&&indoorJourney.buildingId!==record.building_id)return null;}catch{return null;}}
  if (!Array.isArray(rawRoute) || (!rawRoute.length && !indoorJourney && mode!=='outdoor-only') || rawRoute.length > MAX_ROUTE_STEPS) return null;
  const indoorRoute = rawRoute.map(routeStep);
  if (indoorRoute.some((step) => step == null)) return null;

  return {
    id,
    name,
    building,
    type,
    ...(record.navigation_type!=null?{navigationType:mode,navigationConfig:config}:{}),
    outdoorTarget: {
      ...(config && mode!=='indoor'?{networkId:config.locationId,endpointId:config.endpointId}:{}),
      name: config ? (mode==='indoor' ? config.checkpoint!.name : config.endpointName || entranceName) : entranceName,
      latitude: config && mode!=='indoor' ? config.entrance!.latitude : unsurveyed ? null : (latitude as number),
      longitude: config && mode!=='indoor' ? config.entrance!.longitude : unsurveyed ? null : (longitude as number),
      arrivalRadius: radius,
    },
    indoorRoute: indoorRoute as RouteStep[],
    ...(indoorJourney?{indoorJourney}:{}),
  };
}

/** Keeps well-formed photo references and drops the rest. */
function toImages(value: unknown, bucket: ImageBucket): DestinationImage[] | typeof INVALID {
  if (value == null) return [];
  if (!Array.isArray(value)) return INVALID;
  const images: DestinationImage[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const path = record.storage_path;
    if (typeof path !== 'string' || !IMAGE_PATH_PATTERN.test(path)) continue;
    const caption = optionalText(record.caption, MAX_CAPTION_LENGTH);
    images.push({ bucket, storagePath: path, caption: caption === INVALID ? null : caption });
  }
  return images;
}

/** Converts one navigation_catalog row. Returns null when any field is invalid. */
export function toCatalogDestination(row: unknown): Destination | null {
  const destination = toDestination(row);
  if (!destination) return null;
  const record = row as Record<string, unknown>;

  const roomId = optionalUuid(record.room_id);
  const buildingId = optionalUuid(record.building_id);
  const floorName = optionalText(record.floor_name, MAX_FLOOR_NAME_LENGTH);
  const floorLevel = optionalFloorLevel(record.floor_level);
  const roomNumber = optionalText(record.room_number, MAX_ROOM_NUMBER_LENGTH);
  const description = optionalText(record.description, MAX_DESCRIPTION_LENGTH);
  const roomImages = toImages(record.room_images, 'room-photos');
  const buildingImages = toImages(record.building_images, 'building-photos');
  if (
    roomId === INVALID || buildingId === INVALID || floorName === INVALID || floorLevel === INVALID
    || roomNumber === INVALID || description === INVALID || roomImages === INVALID || buildingImages === INVALID
  ) {
    return null;
  }

  const details: DestinationDetails = {
    roomId,
    buildingId,
    floorName,
    floorLevel,
    roomNumber,
    description,
    images: [...roomImages, ...buildingImages].slice(0, MAX_IMAGES),
  };
  return { ...destination, details };
}

const CATALOG_CACHE = `1locate-catalog-v1:${import.meta.env.VITE_SUPABASE_URL ?? 'local'}`;
function cacheRows(rows: unknown[], catalog: boolean) {
  try { localStorage.setItem(CATALOG_CACHE, JSON.stringify({ rows, catalog })); } catch { /* Storage may be full or unavailable. */ }
}
function local(reason: string, failed: boolean): DestinationLoadResult {
  try {
    const saved = JSON.parse(localStorage.getItem(CATALOG_CACHE) ?? 'null');
    if (saved && Array.isArray(saved.rows) && saved.rows.length <= 5000) {
      const destinations = validated(saved.rows, saved.catalog ? toCatalogDestination : toDestination);
      if (typeof destinations !== 'string') return { destinations, source: 'cache', failed, reason };
    }
  } catch { /* Ignore malformed or inaccessible saved data. */ }
  return { destinations: DESTINATIONS, source: 'local', failed, reason };
}

interface QueryError {
  code?: string;
  message: string;
}

function isMissingRelation(error: QueryError): boolean {
  return error.code != null && MISSING_RELATION_CODES.has(error.code);
}

async function query(client: SupabaseClient, relation: string, columns: string) {
  const { data, error } = await client
    .from(relation)
    .select(columns)
    .order('sort_order', { ascending: true })
    .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS));
  return { data: (data ?? []) as unknown[], error: error as QueryError | null };
}

function validated(rows: unknown[], map: (row: unknown) => Destination | null): Destination[] | string {
  const destinations = rows.map(map).filter((item): item is Destination => item != null);
  if (destinations.length === 0) return 'No valid destinations in Supabase';
  if (new Set(destinations.map((item) => item.id)).size !== destinations.length) {
    return 'Duplicate destination ids in Supabase';
  }
  return destinations;
}

/**
 * Loads destinations from Supabase. Uses navigation_catalog when it exists, the original
 * destinations table when the Phase 4A migrations are not applied yet, and bundled data
 * when Supabase is offline, misconfigured, or returns nothing usable.
 */
export async function fetchDestinations(client: SupabaseClient | null = supabase): Promise<DestinationLoadResult> {
  if (!client) return local('Supabase is not configured', false);
  try {
    let catalog = await query(client, 'navigation_catalog', `${CATALOG_COLUMNS}, indoor_journey, navigation_type, navigation_config`);
    if(catalog.error && ['42703','PGRST204'].includes(catalog.error.code||''))catalog=await query(client,'navigation_catalog',`${CATALOG_COLUMNS}, indoor_journey`);
    if(catalog.error && ['42703','PGRST204'].includes(catalog.error.code||''))catalog=await query(client,'navigation_catalog',CATALOG_COLUMNS);
    if (!catalog.error) {
      const result = validated(catalog.data, toCatalogDestination);
      if (typeof result !== 'string') cacheRows(catalog.data, true);
      return typeof result === 'string'
        ? local(result, true)
        : { destinations: result, source: 'supabase', failed: false };
    }
    if (!isMissingRelation(catalog.error)) return local(catalog.error.message, true);

    let legacy = await query(client, 'destinations', `${LEGACY_COLUMNS}, indoor_journey, navigation_type, navigation_config`);
    if(legacy.error && ['42703','PGRST204'].includes(legacy.error.code||''))legacy=await query(client,'destinations',`${LEGACY_COLUMNS}, indoor_journey`);
    if(legacy.error && ['42703','PGRST204'].includes(legacy.error.code||''))legacy=await query(client,'destinations',LEGACY_COLUMNS);
    if (legacy.error) return local(legacy.error.message, true);
    const result = validated(legacy.data, toDestination);
    if (typeof result !== 'string') cacheRows(legacy.data, false);
    return typeof result === 'string'
      ? local(result, true)
      : { destinations: result, source: 'supabase-legacy', failed: false };
  } catch (error) {
    return local(error instanceof Error ? error.message : 'Network error', true);
  }
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Image request timed out')), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

/**
 * Creates short-lived URLs for private photos, keeping their order.
 * Photos that cannot be signed are skipped, so the screen falls back to its placeholder.
 */
export async function getDestinationImageUrls(
  images: DestinationImage[],
  client: SupabaseClient | null = supabase,
): Promise<DisplayImage[]> {
  if (!client || images.length === 0) return [];
  const buckets = [...new Set(images.map((image) => image.bucket))];
  const signed = new Map<string, string>();
  await Promise.all(buckets.map(async (bucket) => {
    const paths = images.filter((image) => image.bucket === bucket).map((image) => image.storagePath);
    try {
      const { data, error } = await withTimeout(
        client.storage.from(bucket).createSignedUrls(paths, SIGNED_URL_SECONDS),
        REQUEST_TIMEOUT_MS,
      );
      if (error || !data) return;
      for (const item of data) {
        if (!item.error && item.path && isHttpsUrl(item.signedUrl)) signed.set(`${bucket}/${item.path}`, item.signedUrl);
      }
    } catch {
      // Leave this bucket's photos out; the placeholder covers it.
    }
  }));
  return images.flatMap((image) => {
    const url = signed.get(`${image.bucket}/${image.storagePath}`);
    return url ? [{ url, caption: image.caption }] : [];
  });
}
