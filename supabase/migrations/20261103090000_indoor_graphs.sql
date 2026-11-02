-- Phase 4C. Apply AFTER all Phase 4A migrations. No live execution is implied.
-- One draft and one published snapshot per building; drafts are never public.
create table if not exists public.indoor_graphs (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete restrict,
  is_active boolean not null default false,
  graph jsonb not null default '{"nodes":[],"edges":[]}',
  updated_at timestamptz not null default now(),
  unique(building_id, is_active)
);

create or replace function public.validate_indoor_graph()
returns trigger language plpgsql set search_path = '' as $$
declare n jsonb; e jsonb; a jsonb; b jsonb; nodes jsonb; edges jsonb;
begin
  if pg_column_size(new.graph) > 2097152 then raise exception 'Graph exceeds 2 MB'; end if;
  nodes := new.graph->'nodes'; edges := new.graph->'edges';
  if jsonb_typeof(nodes) is distinct from 'array' or jsonb_typeof(edges) is distinct from 'array' then
    raise exception 'Graph requires nodes and edges arrays';
  end if;
  if jsonb_array_length(nodes)>1000 or jsonb_array_length(edges)>4000 then raise exception 'Graph too large'; end if;
  if (select count(*) from jsonb_array_elements(nodes)) <> (select count(distinct x->>'id') from jsonb_array_elements(nodes) x)
    or (select count(*) from jsonb_array_elements(edges)) <> (select count(distinct x->>'id') from jsonb_array_elements(edges) x)
    then raise exception 'Duplicate or missing graph IDs'; end if;
  if (select count(*) from jsonb_array_elements(nodes) x where x->>'room_id' is not null)
    <> (select count(distinct x->>'room_id') from jsonb_array_elements(nodes) x where x->>'room_id' is not null)
    then raise exception 'Room linked more than once'; end if;
  for n in select * from jsonb_array_elements(nodes) loop
    if coalesce(length(btrim(n->>'id')),0) not between 1 and 120 or coalesce(length(btrim(n->>'name')),0) not between 1 and 120
      or coalesce(n->>'kind','') not in ('entrance','junction','room','stairs','elevator')
      or jsonb_typeof(n->'x') is distinct from 'number' or jsonb_typeof(n->'y') is distinct from 'number'
      then raise exception 'Invalid node'; end if;
    if (n->>'x')::numeric not between 0 and 1 or (n->>'y')::numeric not between 0 and 1 then raise exception 'Node outside map'; end if;
    if not exists(select 1 from public.floor_maps m join public.floors f on f.id=m.floor_id
      where m.id=(n->>'map_id')::uuid and f.id=(n->>'floor_id')::uuid and f.building_id=new.building_id
      and (not new.is_active or (m.is_active and m.meters_per_pixel is not null))) then raise exception 'Node map/floor must belong to building and be calibrated and published before graph publication'; end if;
    if n->>'room_id' is not null and (n->>'kind'<>'room' or not exists(select 1 from public.rooms r
      where r.id=(n->>'room_id')::uuid and r.building_id=new.building_id and r.floor_id=(n->>'floor_id')::uuid
      and (not new.is_active or r.is_active))) then raise exception 'Room must belong to the node floor and be published before graph publication'; end if;
  end loop;
  for e in select * from jsonb_array_elements(edges) loop
    a := null; b := null;
    select x into a from jsonb_array_elements(nodes) x where x->>'id'=e->>'from';
    select x into b from jsonb_array_elements(nodes) x where x->>'id'=e->>'to';
    if a is null or b is null or e->>'from'=e->>'to' or coalesce(length(e->>'id'),0) not between 1 and 120
      or coalesce(e->>'kind','') not in ('walk','stairs','elevator') or jsonb_typeof(e->'meters') is distinct from 'number'
      or jsonb_typeof(e->'accessible') is distinct from 'boolean' or jsonb_typeof(e->'bidirectional') is distinct from 'boolean'
      or jsonb_typeof(e->'enabled') is distinct from 'boolean' then raise exception 'Invalid edge'; end if;
    if (e->>'meters')::numeric<=0 or (e->>'meters')::numeric>10000 then raise exception 'Invalid edge distance'; end if;
    if e->>'kind'='walk' and (a->>'floor_id'<>b->>'floor_id' or a->>'map_id'<>b->>'map_id') then raise exception 'Walk edges must stay on same floor map'; end if;
    if e->>'kind'<>'walk' and (a->>'floor_id'=b->>'floor_id' or a->>'kind'<>e->>'kind' or b->>'kind'<>e->>'kind') then raise exception 'Invalid floor connector'; end if;
    if e->>'kind'='stairs' and (e->>'accessible')::boolean then raise exception 'Stairs are not step-free'; end if;
  end loop;
  if new.is_active and (jsonb_array_length(nodes)=0 or jsonb_array_length(edges)=0
    or not exists(select 1 from jsonb_array_elements(nodes) x where x->>'kind'='entrance')
    or not exists(select 1 from jsonb_array_elements(nodes) x where x->>'kind'='room' and x->>'room_id' is not null)
    or not exists(select 1 from public.buildings where id=new.building_id and is_active)) then
    raise exception 'Publish building and provide entrance nodes and edges first'; end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists validate_indoor_graph on public.indoor_graphs;
create trigger validate_indoor_graph before insert or update on public.indoor_graphs
  for each row execute function public.validate_indoor_graph();
alter table public.indoor_graphs enable row level security;
revoke all on public.indoor_graphs from anon, authenticated;
grant select on public.indoor_graphs to anon;
grant select, insert, update, delete on public.indoor_graphs to authenticated;
drop policy if exists "Public reads published indoor graphs" on public.indoor_graphs;
create policy "Public reads published indoor graphs" on public.indoor_graphs for select to anon, authenticated
using (is_active and exists(select 1 from public.buildings b where b.id=building_id and b.is_active)
  and not exists (
    select 1 from jsonb_array_elements(graph->'nodes') n
    where not exists(select 1 from public.floor_maps m join public.floors f on f.id=m.floor_id
      where m.id=(n->>'map_id')::uuid and m.is_active and f.id=(n->>'floor_id')::uuid and f.building_id=indoor_graphs.building_id)
    or (n->>'room_id' is not null and not exists(select 1 from public.rooms r
      where r.id=(n->>'room_id')::uuid and r.is_active and r.floor_id=(n->>'floor_id')::uuid and r.building_id=indoor_graphs.building_id))
  ));
drop policy if exists "Managers manage indoor graphs" on public.indoor_graphs;
create policy "Managers manage indoor graphs" on public.indoor_graphs for all to authenticated
using ((select public.is_content_manager())) with check ((select public.is_content_manager()));

-- Prevent changes that would invalidate map coordinates in saved snapshots.
create or replace function public.protect_graph_map()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.indoor_graphs g, jsonb_array_elements(g.graph->'nodes') n
    where n->>'map_id'=old.id::text) then
    if tg_op='DELETE' then raise exception 'Map is referenced by an indoor graph'; end if;
    if new.floor_id is distinct from old.floor_id or new.storage_path is distinct from old.storage_path
      or new.width_px is distinct from old.width_px or new.height_px is distinct from old.height_px
      then raise exception 'Create a new map instead of replacing a graph map'; end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists protect_graph_map on public.floor_maps;
create trigger protect_graph_map before delete or update on public.floor_maps for each row execute function public.protect_graph_map();
