-- Phase 4A: backward-compatible transition for public.destinations.
--
-- Nothing is dropped and no existing row is changed.
--
-- public.rooms describes WHAT a place is (name, type, floor, photos).
-- public.destinations keeps HOW to reach it for now: the entrance GPS target and the
-- fixed indoor route in the existing JSON format. A destination can optionally point at
-- a room. Future navigation nodes (path graph, A*) will replace the fixed route later
-- and are not part of this migration.

alter table public.destinations
  add column if not exists room_id uuid references public.rooms (id) on delete set null;

alter table public.destinations
  add column if not exists is_active boolean not null default true;

alter table public.destinations
  add column if not exists updated_at timestamptz not null default now();

-- One fixed route per room.
create unique index if not exists destinations_room_id_key
  on public.destinations (room_id)
  where room_id is not null;

drop trigger if exists set_updated_at on public.destinations;
create trigger set_updated_at
  before update on public.destinations
  for each row execute function public.set_updated_at();

-- Access: public reads active rows, Admins and Editors manage routes.

revoke insert, update, delete, truncate on public.destinations from anon;
revoke truncate on public.destinations from authenticated;

drop policy if exists "Anyone can read destinations" on public.destinations;
drop policy if exists "Public reads active destinations" on public.destinations;
create policy "Public reads active destinations"
  on public.destinations for select
  to anon, authenticated
  using (is_active or (select public.is_content_manager()));

drop policy if exists "Content managers manage destinations" on public.destinations;
create policy "Content managers manage destinations"
  on public.destinations for all
  to authenticated
  using ((select public.is_content_manager()))
  with check ((select public.is_content_manager()));

-- Catalog read by the mobile app ------------------------------------------------
-- security_invoker makes the caller's RLS apply to every joined table.
-- A destination linked to a room is listed only while that room and its building are
-- published. Linked room and building details take priority over the legacy columns.
-- Building entrance coordinates are used only when the building has surveyed values.

create or replace view public.navigation_catalog
with (security_invoker = true)
as
select
  d.id,
  coalesce(r.name, d.name) as name,
  coalesce(r.type, d.type) as type,
  coalesce(b.name, d.building) as building,
  coalesce(b.entrance_name, d.entrance_name) as entrance_name,
  case when b.entrance_lat is not null then b.entrance_lat else d.entrance_lat end as entrance_lat,
  case when b.entrance_lat is not null then b.entrance_lng else d.entrance_lng end as entrance_lng,
  coalesce(b.arrival_radius, d.arrival_radius) as arrival_radius,
  d.indoor_route,
  d.sort_order,
  r.id as room_id,
  b.id as building_id,
  f.name as floor_name,
  f.level as floor_level,
  r.room_number,
  r.description,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object('storage_path', ri.storage_path, 'caption', ri.caption)
        order by ri.sort_order, ri.created_at
      )
      from public.room_images ri
      where ri.room_id = r.id
    ),
    '[]'::jsonb
  ) as room_images,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object('storage_path', bi.storage_path, 'caption', bi.caption)
        order by bi.sort_order, bi.created_at
      )
      from public.building_images bi
      where bi.building_id = b.id
    ),
    '[]'::jsonb
  ) as building_images
from public.destinations d
left join public.rooms r on r.id = d.room_id
left join public.buildings b on b.id = r.building_id
left join public.floors f on f.id = r.floor_id
where d.is_active
  and (d.room_id is null or (r.id is not null and r.is_active and b.is_active));

revoke all on public.navigation_catalog from anon, authenticated;
grant select on public.navigation_catalog to anon, authenticated;
