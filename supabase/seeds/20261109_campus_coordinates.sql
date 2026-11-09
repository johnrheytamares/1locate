-- User-provided school coordinates. Manual seed, NOT an automatic migration.
-- Run the WHOLE file in Supabase SQL Editor after the Phase 4A migrations.
-- Creates/updates 14 coordinate labels; new labels and IT Building content are drafts.
-- Existing building publication state and existing indoor routes are retained.
-- Existing IT Building entrance coordinates ARE updated to the supplied entrance.
-- Image 1/2 building assignments are unknown: their points are saved as map labels only.
-- No invented distances, walking edges, floor-map images, or enabled empty routes.
-- This does NOT update the bundled public/campus-walking-network.json in installed APKs.

begin;

-- Fail before any writes if required schema migrations are missing.
do $preflight$
begin
  if to_regclass('public.buildings') is null or to_regclass('public.floors') is null
    or to_regclass('public.rooms') is null or to_regclass('public.map_labels') is null
    or to_regclass('public.destinations') is null then
    raise exception 'Apply the baseline and Phase 4A schema migrations first.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public'
    and table_name = 'destinations' and column_name = 'room_id') then
    raise exception 'Apply 20261030120300_destinations_transition.sql first.';
  end if;
end;
$preflight$;

-- Serialize this short import with other content writes, so repeat runs cannot race.
lock table public.buildings, public.floors, public.rooms, public.destinations, public.map_labels
  in share row exclusive mode;

create temporary table campus_coordinate_seed (
  source_id text primary key, name text not null, kind text not null, image_group text,
  floor_level smallint, floor_name text, latitude double precision not null,
  longitude double precision not null, label_id uuid not null
) on commit drop;

insert into campus_coordinate_seed values
  ('main-entrance', 'Main Entrance', 'campus_entrance', null, null, null, 13.38636111, 121.16330556, '374e281a-2eb3-56c6-8e18-ab4ab0e893a7'::uuid),
  ('itrm-108', 'ITRM_108', 'room', 'image_1', null, null, 13.38788889, 121.16222222, 'b17e6871-eb6a-5fa8-b7fc-c38dabb84312'::uuid),
  ('itrm-107', 'ITRM_107', 'room', 'image_1', null, null, 13.38791667, 121.16222222, 'c2dc5153-edec-5dab-9a87-74ecf0cd8273'::uuid),
  ('itrm-106', 'ITRM_106', 'room', 'image_1', null, null, 13.38797222, 121.16211111, '0c2c0177-54b8-53f0-835d-ad5dcaac5a02'::uuid),
  ('itrm-101', 'ITRM_101', 'room', 'image_2', null, null, 13.38797222, 121.16172222, '9851f48f-9320-5da9-babe-a15717065a56'::uuid),
  ('itrm-102', 'ITRM_102', 'room', 'image_2', null, null, 13.38800000, 121.16175000, '6c58ca0a-2a55-5080-8967-81926dc81abb'::uuid),
  ('faculty-office', 'Faculty Office', 'office', 'image_2', null, null, 13.38808333, 121.16177778, '65fdf981-34fe-5331-aa4b-7269d68285b4'::uuid),
  ('it-building-entrance', 'IT Building Entrance', 'building_entrance', 'image_3', null, null, 13.38822222, 121.16169444, 'f324055a-e344-5291-aec7-b77862c7ff45'::uuid),
  ('itrm-104', 'ITRM_104', 'room', 'image_3', 1, 'Ground Floor', 13.38819444, 121.16172222, '8284ee35-b29c-57c3-821a-c4bd9860c624'::uuid),
  ('csg-office', 'CSG Office', 'office', 'image_3', 1, 'Ground Floor', 13.38819444, 121.16166667, 'cb41ac82-5d54-5486-93de-828971273595'::uuid),
  ('itrm-105', 'ITRM_105', 'room', 'image_3', 1, 'Ground Floor', 13.38822222, 121.16163889, 'ff0f2e3c-fcdf-5d24-bd9b-8ea860c2470c'::uuid),
  ('itrm-202', 'ITRM_202', 'room', 'image_3', 2, 'Second Floor', 13.38819444, 121.16163889, '8594f15f-5b43-53f4-b0cb-fb2dc9759398'::uuid),
  ('itrm-201', 'ITRM-201', 'room', 'image_3', 2, 'Second Floor', 13.38816667, 121.16172222, 'cc3f31fe-b0e6-508d-a3c2-d2c1fd38ff18'::uuid),
  ('it-stairs', 'IT Building Stairs', 'stairs', 'image_3', null, null, 13.38816667, 121.16166667, '445712b5-7525-5038-aba7-4c017dc50735'::uuid);

do $seed$
declare
  it_id uuid;
  point record;
  floor_uuid uuid;
  room_uuid uuid;
  label_uuid uuid;
  label_building uuid;
  match_count integer;
  existing_floor uuid;
  floor_aliases text[];
  conflicting_floor_name text;
begin
  -- Match the actual building by name; do not silently create another IT Building.
  select count(*) into match_count from public.buildings
  where regexp_replace(upper(name), '[^A-Z0-9]', '', 'g')
    in ('ITBUILDING', 'ITBLDG', 'INFORMATIONTECHNOLOGYBUILDING');
  if match_count > 1 then
    raise exception 'Multiple IT Building records found. Resolve duplicate buildings before importing.';
  elsif match_count = 1 then
    select id into it_id from public.buildings
    where regexp_replace(upper(name), '[^A-Z0-9]', '', 'g')
      in ('ITBUILDING', 'ITBLDG', 'INFORMATIONTECHNOLOGYBUILDING');
  else
    if exists (select 1 from public.buildings where code = 'IT') then
      raise exception 'Building code IT already belongs to a differently named building. Match it manually before importing.';
    end if;
    insert into public.buildings(code, name, entrance_name, is_active)
    values ('IT', 'IT BUILDING', 'IT Building Entrance', false) returning id into it_id;
  end if;
  update public.buildings set entrance_name = 'IT Building Entrance',
    entrance_lat = 13.38822222, entrance_lng = 121.16169444
  where id = it_id;

  for point in select * from campus_coordinate_seed order by source_id loop
    -- Keep coordinate labels separate from route targets. New labels remain inactive.
    label_building := case when point.image_group = 'image_3' then it_id else null end;
    select count(*) into match_count from public.map_labels
    where id = point.label_id or regexp_replace(upper(name), '[^A-Z0-9]', '', 'g')
      = regexp_replace(upper(point.name), '[^A-Z0-9]', '', 'g');
    if match_count > 1 then
      raise exception 'Multiple map labels match %. Resolve duplicates before importing.', point.name;
    elsif match_count = 1 then
      select id into label_uuid from public.map_labels
      where id = point.label_id or regexp_replace(upper(name), '[^A-Z0-9]', '', 'g')
        = regexp_replace(upper(point.name), '[^A-Z0-9]', '', 'g');
      if exists (select 1 from public.map_labels where id = label_uuid and building_id is not null
        and label_building is not null and building_id <> label_building) then
        raise exception 'Map label % belongs to another building. Review its assignment first.', point.name;
      end if;
      update public.map_labels set latitude = point.latitude, longitude = point.longitude,
        building_id = coalesce(building_id, label_building) where id = label_uuid;
    else
      insert into public.map_labels(id, name, category, building_id, latitude, longitude, is_active)
      values (point.label_id, point.name,
        case point.kind when 'campus_entrance' then 'gate' when 'building_entrance' then 'building'
          when 'stairs' then 'facility' else 'landmark' end,
        label_building, point.latitude, point.longitude, false);
    end if;

    -- Only Image 3 room/building/floor relationships were explicitly confirmed.
    if point.image_group is distinct from 'image_3' or point.kind not in ('room', 'office') then
      continue;
    end if;

    -- Match equivalent labels while preserving the existing floor ID, name and level.
    -- "First Floor" is deliberately not guessed to mean Ground or Second Floor.
    floor_aliases := case point.floor_level
      when 1 then array['GROUNDFLOOR', 'GROUND', 'GF', 'GFLOOR', 'GROUNDLEVEL', 'FLOOR1', 'LEVEL1', '1F', 'F1']
      when 2 then array['SECONDFLOOR', '2NDFLOOR', 'SECONDLEVEL', '2NDLEVEL', 'FLOOR2', 'LEVEL2', '2F', 'F2']
    end;
    select count(*) into match_count from public.floors where building_id = it_id
      and regexp_replace(upper(name), '[^A-Z0-9]', '', 'g') = any(floor_aliases);
    if match_count > 1 then
      raise exception 'Multiple existing floors match %. Review floor IDs before importing.', point.floor_name;
    end if;
    select id into floor_uuid from public.floors where building_id = it_id
      and regexp_replace(upper(name), '[^A-Z0-9]', '', 'g') = any(floor_aliases);
    if floor_uuid is null then
      select name into conflicting_floor_name from public.floors
        where building_id = it_id and level = point.floor_level;
      if found then
        raise exception 'Floor level % is named "%"; cannot safely assume this is %. Run the floor diagnostic query and confirm its meaning.',
          point.floor_level, conflicting_floor_name, point.floor_name;
      end if;
      insert into public.floors(building_id, level, name)
      values (it_id, point.floor_level, point.floor_name) returning id into floor_uuid;
    end if;

    select count(*) into match_count from public.rooms where building_id = it_id and (
      regexp_replace(upper(name), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(point.name), '[^A-Z0-9]', '', 'g')
      or regexp_replace(upper(room_number), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(point.name), '[^A-Z0-9]', '', 'g'));
    if match_count > 1 then raise exception 'Multiple room records match %.', point.name; end if;
    select id, floor_id into room_uuid, existing_floor from public.rooms where building_id = it_id and (
      regexp_replace(upper(name), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(point.name), '[^A-Z0-9]', '', 'g')
      or regexp_replace(upper(room_number), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(point.name), '[^A-Z0-9]', '', 'g'));
    if room_uuid is null then
      insert into public.rooms(building_id, floor_id, name, room_number, type, is_active)
      values (it_id, floor_uuid, point.name, case when point.kind = 'room' then point.name else null end,
        case when point.kind = 'office' then 'office' else 'other' end, false) returning id into room_uuid;
    elsif existing_floor is null then
      update public.rooms set floor_id = floor_uuid where id = room_uuid;
    elsif existing_floor <> floor_uuid then
      raise exception 'Existing room % is assigned to a different floor. Review it before importing.', point.name;
    end if;

    -- Never replace, deactivate, or reset an existing saved destination/indoor route.
    if exists (select 1 from public.destinations where room_id = room_uuid) then continue; end if;
    if exists (select 1 from public.destinations where id = point.source_id
      or regexp_replace(upper(name), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(point.name), '[^A-Z0-9]', '', 'g')) then
      raise notice 'Existing destination for % was preserved. Link it to room % in admin after review.', point.name, room_uuid;
      continue;
    end if;
    insert into public.destinations(id, name, building, type, entrance_name, entrance_lat, entrance_lng,
      room_id, indoor_route, is_active)
    values (point.source_id, point.name, 'IT BUILDING', case when point.kind = 'office' then 'office' else 'other' end,
      'IT Building Entrance', 13.38822222, 121.16169444, room_uuid, '[]'::jsonb, false);
  end loop;
  raise notice 'Imported 14 coordinate labels. Image 1/2 need confirmed building/floor assignments. New destinations remain inactive until routes are configured.';
end;
$seed$;

-- Review all 14 coordinate labels. New labels are inactive; existing publication states are preserved.
select s.source_id, l.name, l.category, l.latitude, l.longitude, l.is_active
from campus_coordinate_seed s join public.map_labels l
  on l.id = s.label_id or regexp_replace(upper(l.name), '[^A-Z0-9]', '', 'g')
    = regexp_replace(upper(s.name), '[^A-Z0-9]', '', 'g')
order by s.source_id;

commit;
