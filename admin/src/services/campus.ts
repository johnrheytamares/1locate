import type { SupabaseClient } from '@supabase/supabase-js';
import { NoRowsChangedError } from '@/lib/errors';
import { requireClient, supabase } from '@/lib/supabase';
import type { BuildingPayload, FloorPayload, RoomPayload } from '@/lib/validation';
import type { AppRole, Building, DestinationRecord, Floor, Room, UserRoleRecord } from '@/types';

type Client = SupabaseClient | null;

const BUILDING_COLUMNS = 'id, code, name, description, entrance_name, entrance_lat, entrance_lng, arrival_radius, is_active, sort_order, created_at, updated_at';
const FLOOR_COLUMNS = 'id, building_id, level, name, created_at, updated_at';
const ROOM_COLUMNS = 'id, building_id, floor_id, name, room_number, type, description, is_active, sort_order, created_at, updated_at';
const DESTINATION_COLUMNS = 'id, name, building, type, entrance_name, room_id, is_active, sort_order, indoor_route';
const ROLE_COLUMNS = 'user_id, role, granted_by, created_at, updated_at';

interface Result<T> {
  data: T | null;
  error: unknown;
}

async function rows<T>(request: PromiseLike<Result<T[]>>): Promise<T[]> {
  const { data, error } = await request;
  if (error) throw error;
  return data ?? [];
}

/** Updates and deletes blocked by RLS return no rows instead of an error. */
async function changed<T>(request: PromiseLike<Result<T[]>>): Promise<T> {
  const result = await rows(request);
  if (result.length === 0) throw new NoRowsChangedError();
  return result[0];
}

async function count(client: SupabaseClient, table: string, column: string, value: string): Promise<number> {
  const { count: total, error } = await client
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq(column, value);
  if (error) throw error;
  return total ?? 0;
}

// Buildings --------------------------------------------------------------------

export function listBuildings(client: Client = supabase): Promise<Building[]> {
  return rows(requireClient(client).from('buildings').select(BUILDING_COLUMNS)
    .order('sort_order').order('name'));
}

export function createBuilding(payload: BuildingPayload, client: Client = supabase): Promise<Building> {
  return changed(requireClient(client).from('buildings').insert(payload).select(BUILDING_COLUMNS));
}

export function updateBuilding(id: string, payload: Partial<BuildingPayload>, client: Client = supabase): Promise<Building> {
  return changed(requireClient(client).from('buildings').update(payload).eq('id', id).select(BUILDING_COLUMNS));
}

export function deleteBuilding(id: string, client: Client = supabase): Promise<{ id: string }> {
  return changed(requireClient(client).from('buildings').delete().eq('id', id).select('id'));
}

export interface BuildingDependents {
  floors: number;
  rooms: number;
  photos: number;
}

export async function buildingDependents(id: string, client: Client = supabase): Promise<BuildingDependents> {
  const db = requireClient(client);
  const [floors, rooms, photos] = await Promise.all([
    count(db, 'floors', 'building_id', id),
    count(db, 'rooms', 'building_id', id),
    count(db, 'building_images', 'building_id', id),
  ]);
  return { floors, rooms, photos };
}

// Floors -----------------------------------------------------------------------

export function listFloors(client: Client = supabase): Promise<Floor[]> {
  return rows(requireClient(client).from('floors').select(FLOOR_COLUMNS).order('level'));
}

export function createFloor(payload: FloorPayload, client: Client = supabase): Promise<Floor> {
  return changed(requireClient(client).from('floors').insert(payload).select(FLOOR_COLUMNS));
}

export function updateFloor(id: string, payload: FloorPayload, client: Client = supabase): Promise<Floor> {
  return changed(requireClient(client).from('floors').update(payload).eq('id', id).select(FLOOR_COLUMNS));
}

export function deleteFloor(id: string, client: Client = supabase): Promise<{ id: string }> {
  return changed(requireClient(client).from('floors').delete().eq('id', id).select('id'));
}

export interface FloorDependents {
  rooms: number;
  floorMaps: number;
}

export async function floorDependents(id: string, client: Client = supabase): Promise<FloorDependents> {
  const db = requireClient(client);
  const [rooms, floorMaps] = await Promise.all([
    count(db, 'rooms', 'floor_id', id),
    count(db, 'floor_maps', 'floor_id', id),
  ]);
  return { rooms, floorMaps };
}

// Rooms ------------------------------------------------------------------------

export function listRooms(client: Client = supabase): Promise<Room[]> {
  return rows(requireClient(client).from('rooms').select(ROOM_COLUMNS).order('sort_order').order('name'));
}

export function createRoom(payload: RoomPayload, client: Client = supabase): Promise<Room> {
  return changed(requireClient(client).from('rooms').insert(payload).select(ROOM_COLUMNS));
}

export function updateRoom(id: string, payload: Partial<RoomPayload>, client: Client = supabase): Promise<Room> {
  return changed(requireClient(client).from('rooms').update(payload).eq('id', id).select(ROOM_COLUMNS));
}

export function deleteRoom(id: string, client: Client = supabase): Promise<{ id: string }> {
  return changed(requireClient(client).from('rooms').delete().eq('id', id).select('id'));
}

export interface RoomDependents {
  photos: number;
  /** Destinations that will be unlinked (room_id set to NULL) when the room is deleted. */
  destinations: string[];
}

export async function roomDependents(id: string, client: Client = supabase): Promise<RoomDependents> {
  const db = requireClient(client);
  const [photos, linked] = await Promise.all([
    count(db, 'room_images', 'room_id', id),
    rows<{ name: string }>(db.from('destinations').select('name').eq('room_id', id)),
  ]);
  return { photos, destinations: linked.map((item) => item.name) };
}

// Destinations -----------------------------------------------------------------

export function listDestinations(client: Client = supabase): Promise<DestinationRecord[]> {
  return rows(requireClient(client).from('destinations').select(DESTINATION_COLUMNS).order('sort_order'));
}

/** Links a destination to a room, or unlinks it with null. The fixed route is never touched. */
export function setDestinationRoom(id: string, roomId: string | null, client: Client = supabase): Promise<DestinationRecord> {
  return changed(requireClient(client).from('destinations').update({ room_id: roomId }).eq('id', id).select(DESTINATION_COLUMNS));
}

export function setDestinationActive(id: string, active: boolean, client: Client = supabase): Promise<DestinationRecord> {
  return changed(requireClient(client).from('destinations').update({ is_active: active }).eq('id', id).select(DESTINATION_COLUMNS));
}

// Roles ------------------------------------------------------------------------

export async function getOwnRole(userId: string, client: Client = supabase): Promise<AppRole | null> {
  const { data, error } = await requireClient(client)
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  const role = (data as { role?: unknown } | null)?.role;
  return role === 'admin' || role === 'editor' ? role : null;
}

export function listRoles(client: Client = supabase): Promise<UserRoleRecord[]> {
  return rows(requireClient(client).from('user_roles').select(ROLE_COLUMNS).order('created_at'));
}

export function grantRole(userId: string, role: AppRole, grantedBy: string, client: Client = supabase): Promise<UserRoleRecord> {
  return changed(requireClient(client).from('user_roles')
    .insert({ user_id: userId, role, granted_by: grantedBy }).select(ROLE_COLUMNS));
}

export function changeRole(userId: string, role: AppRole, grantedBy: string, client: Client = supabase): Promise<UserRoleRecord> {
  return changed(requireClient(client).from('user_roles')
    .update({ role, granted_by: grantedBy }).eq('user_id', userId).select(ROLE_COLUMNS));
}

export function removeRole(userId: string, client: Client = supabase): Promise<{ user_id: string }> {
  return changed(requireClient(client).from('user_roles').delete().eq('user_id', userId).select('user_id'));
}
