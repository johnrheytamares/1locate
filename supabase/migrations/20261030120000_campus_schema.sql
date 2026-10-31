-- Phase 4A: campus content schema.
--
-- Buildings contain floors, floors contain rooms. Photos, map labels, floor maps,
-- and Admin/Editor roles live in their own tables.
--
-- Rules:
--   * Unsurveyed coordinates stay NULL. Never store guessed campus coordinates.
--   * New content is hidden (is_active = false) until an Admin or Editor publishes it.
--   * Structural links use ON DELETE RESTRICT. Deactivate content instead of deleting it.
--     A building cannot be deleted while it still has floors, rooms, or photos.
--     Map labels keep existing with building_id set to NULL.
--   * RLS is enabled here, so these tables stay closed until the access-control migration adds policies.

-- Shared helpers ---------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Storage object names must be "<parent uuid>/<file uuid>.<jpg|jpeg|png|webp>".
create or replace function public.is_uuid_image_path(path text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$', false);
$$;

do $$
begin
  create type public.app_role as enum ('admin', 'editor');
exception
  when duplicate_object then null;
end;
$$;

-- Buildings --------------------------------------------------------------------

create table if not exists public.buildings (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9_-]{0,19}$'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text check (char_length(description) <= 2000),
  entrance_name text check (char_length(btrim(entrance_name)) between 1 and 120),
  entrance_lat double precision check (entrance_lat between -90 and 90),
  entrance_lng double precision check (entrance_lng between -180 and 180),
  arrival_radius double precision not null default 10 check (arrival_radius > 0 and arrival_radius <= 100),
  is_active boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint buildings_entrance_pair check ((entrance_lat is null) = (entrance_lng is null))
);

create index if not exists buildings_active_sort_idx on public.buildings (is_active, sort_order);

-- Floors -----------------------------------------------------------------------

create table if not exists public.floors (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings (id) on delete restrict,
  level smallint not null check (level between -5 and 200),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint floors_building_level_key unique (building_id, level),
  -- Lets rooms check that their floor belongs to the same building.
  constraint floors_id_building_key unique (id, building_id)
);

-- Rooms and offices ------------------------------------------------------------

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings (id) on delete restrict,
  floor_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  room_number text check (char_length(btrim(room_number)) between 1 and 20),
  type text not null default 'office'
    check (type in ('office', 'classroom', 'laboratory', 'facility', 'restroom', 'other')),
  description text check (char_length(description) <= 2000),
  is_active boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rooms_floor_in_building_fkey foreign key (floor_id, building_id)
    references public.floors (id, building_id) on delete restrict
);

create index if not exists rooms_building_idx on public.rooms (building_id);
create index if not exists rooms_floor_idx on public.rooms (floor_id);
create index if not exists rooms_active_sort_idx on public.rooms (is_active, sort_order);
create unique index if not exists rooms_building_room_number_key
  on public.rooms (building_id, lower(btrim(room_number)))
  where room_number is not null;

-- Photos -----------------------------------------------------------------------

create table if not exists public.building_images (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings (id) on delete restrict,
  storage_path text not null unique,
  caption text check (char_length(caption) <= 200),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint building_images_path_check check (
    public.is_uuid_image_path(storage_path)
    and split_part(storage_path, '/', 1) = building_id::text
  )
);

create index if not exists building_images_building_sort_idx on public.building_images (building_id, sort_order);

create table if not exists public.room_images (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete restrict,
  storage_path text not null unique,
  caption text check (char_length(caption) <= 200),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint room_images_path_check check (
    public.is_uuid_image_path(storage_path)
    and split_part(storage_path, '/', 1) = room_id::text
  )
);

create index if not exists room_images_room_sort_idx on public.room_images (room_id, sort_order);

-- Map labels -------------------------------------------------------------------

create table if not exists public.map_labels (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  category text not null default 'landmark'
    check (category in ('building', 'landmark', 'gate', 'parking', 'facility', 'other')),
  -- A label may describe a building. Removing the building keeps the label.
  building_id uuid references public.buildings (id) on delete set null,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  is_active boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint map_labels_coordinate_pair check ((latitude is null) = (longitude is null))
);

create index if not exists map_labels_building_idx on public.map_labels (building_id);
create index if not exists map_labels_active_sort_idx on public.map_labels (is_active, sort_order);

-- Floor maps -------------------------------------------------------------------

create table if not exists public.floor_maps (
  id uuid primary key default gen_random_uuid(),
  floor_id uuid not null references public.floors (id) on delete restrict,
  storage_path text not null unique,
  title text check (char_length(btrim(title)) between 1 and 120),
  width_px integer check (width_px between 1 and 20000),
  height_px integer check (height_px between 1 and 20000),
  meters_per_pixel double precision check (meters_per_pixel > 0 and meters_per_pixel <= 10),
  north_rotation_degrees double precision check (north_rotation_degrees >= 0 and north_rotation_degrees < 360),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint floor_maps_path_check check (
    public.is_uuid_image_path(storage_path)
    and split_part(storage_path, '/', 1) = floor_id::text
  )
);

create index if not exists floor_maps_floor_idx on public.floor_maps (floor_id);
-- Only one published floor map per floor.
create unique index if not exists floor_maps_one_active_per_floor on public.floor_maps (floor_id) where is_active;

-- Roles ------------------------------------------------------------------------

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Timestamps -------------------------------------------------------------------

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'buildings', 'floors', 'rooms', 'building_images', 'room_images', 'map_labels', 'floor_maps', 'user_roles'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name
    );
  end loop;
end;
$$;

-- Closed by default until policies are added ------------------------------------

alter table public.buildings enable row level security;
alter table public.floors enable row level security;
alter table public.rooms enable row level security;
alter table public.building_images enable row level security;
alter table public.room_images enable row level security;
alter table public.map_labels enable row level security;
alter table public.floor_maps enable row level security;
alter table public.user_roles enable row level security;
