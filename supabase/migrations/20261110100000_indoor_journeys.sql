-- Additive versioned floor instructions. Legacy indoor_route remains unchanged unless a route is explicitly converted.
begin;
alter table public.destinations add column if not exists indoor_journey jsonb;
alter table public.destinations add constraint indoor_journey_object check (indoor_journey is null or (jsonb_typeof(indoor_journey)='object' and octet_length(indoor_journey::text)<=200000));
create or replace function public.check_indoor_journey() returns trigger language plpgsql set search_path='' as $$
declare j jsonb; step jsonb; linked_building uuid; waiting_floor text; floor_level integer; room_floor text; confirmed_floor text; instruction_index integer:=0;
begin
  j:=new.indoor_journey;
  if j is null then return new; end if;
  if j->>'version' is distinct from '2' or j->>'routeType' is distinct from 'indoor' or j->>'destinationId' is distinct from new.id or coalesce(j->>'status','') not in ('draft','validated') or jsonb_typeof(j->'instructions') is distinct from 'array' then raise exception 'Invalid version 2 indoor journey.'; end if;
  if jsonb_array_length(j->'instructions')<1 or jsonb_array_length(j->'instructions')>100 then raise exception 'An indoor journey requires 1–100 instructions.'; end if;
  select r.building_id,r.floor_id::text into linked_building,room_floor from public.rooms r where r.id=new.room_id;
  if linked_building is null or j->>'buildingId' is distinct from linked_building::text then raise exception 'Indoor journey must match the linked room building.'; end if;
  if j->>'floorId' is distinct from room_floor then raise exception 'Journey floor must match the destination room.'; end if;
  for step in select value from jsonb_array_elements(j->'instructions') loop
    instruction_index:=instruction_index+1;
    if jsonb_typeof(step->'distance') is distinct from 'number' then raise exception 'Instruction distance must be a number.'; end if;
    if step->>'kind'='walk' then
      if waiting_floor is not null or coalesce(step->>'direction','') not in ('straight','left','right') or (step->>'distance')::double precision<=0 or (step->>'distance')::double precision>500 then raise exception 'Invalid indoor walking section.'; end if;
    elsif step->>'kind' in ('upstairs','downstairs','elevator','arrive-floor') then
      if (step->>'distance')::double precision<>0 then raise exception 'Floor transitions are not meters.'; end if;
      select f.level into floor_level from public.floors f where f.id::text=step->>'floorId' and f.building_id=linked_building;
      if not found or floor_level is distinct from (step->>'level')::integer then raise exception 'Invalid floor in indoor journey.'; end if;
      if step->>'kind'='arrive-floor' then
        if waiting_floor is distinct from step->>'floorId' then raise exception 'Floor arrival must match the transition.'; end if;confirmed_floor:=waiting_floor;waiting_floor:=null;
      else
        if waiting_floor is not null then raise exception 'Confirm the previous floor first.'; end if;waiting_floor:=step->>'floorId';
      end if;
    elsif step->>'kind'='arrived' then
      if instruction_index<>jsonb_array_length(j->'instructions') then raise exception 'Destination arrival must be last.'; end if;
      if (step->>'distance')::double precision<>0 then raise exception 'Arrival is a checkpoint, not meters.'; end if;
    else raise exception 'Unsupported indoor instruction.';
    end if;
  end loop;
  if waiting_floor is not null or j->'instructions'->-1->>'kind' is distinct from 'arrived' then raise exception 'Journey must finish with confirmed floor and destination checkpoints.'; end if;
  if confirmed_floor is not null and confirmed_floor is distinct from room_floor then raise exception 'Final confirmed floor must match the destination room.'; end if;
  if new.is_active and j->>'status' is distinct from 'validated' then raise exception 'Review and validate the indoor journey before publishing.'; end if;
  -- Older mobile clients cannot accidentally use a flattened route through stairs.
  new.indoor_route:='[]'::jsonb;
  return new;
end;
$$;
create trigger check_indoor_journey before insert or update on public.destinations for each row execute function public.check_indoor_journey();
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
  ) as building_images,
  d.indoor_journey
from public.destinations d
left join public.rooms r on r.id = d.room_id
left join public.buildings b on b.id = r.building_id
left join public.floors f on f.id = r.floor_id
where d.is_active
  and (d.room_id is null or (r.id is not null and r.is_active and b.is_active));

revoke all on public.navigation_catalog from anon, authenticated;
grant select on public.navigation_catalog to anon, authenticated;

commit;
