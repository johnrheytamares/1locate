-- Additive migration. Never overwrites buildings, destinations or existing routes.
begin;
create table if not exists public.outdoor_recordings (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete restrict,
  building_id uuid not null references public.buildings(id) on delete restrict,
  status text not null default 'saved' check (status in ('saved','validated','published')),
  recording jsonb not null check (jsonb_typeof(recording) = 'object' and octet_length(recording::text) <= 2000000),
  updated_at timestamptz not null default now(),
  constraint recording_identity check (recording->>'id' = id::text and recording->>'buildingId' = building_id::text and recording->>'status' = status)
);
create table if not exists public.outdoor_route_packages (
  revision bigint generated always as identity primary key,
  published_at timestamptz not null default now(),
  published_by uuid not null references auth.users(id) on delete restrict,
  recording_id uuid not null references public.outdoor_recordings(id) on delete restrict,
  graph jsonb not null check (jsonb_typeof(graph) = 'object' and octet_length(graph::text) <= 2000000)
);
create trigger outdoor_recordings_updated_at before update on public.outdoor_recordings for each row execute function public.set_updated_at();
alter table public.outdoor_recordings enable row level security;
alter table public.outdoor_route_packages enable row level security;
revoke all on public.outdoor_recordings from anon;
revoke all on public.outdoor_recordings from authenticated;
grant select, insert, update on public.outdoor_recordings to authenticated;
grant select on public.outdoor_route_packages to anon, authenticated;
revoke insert, update, delete, truncate on public.outdoor_route_packages from anon, authenticated;
create policy "Managers read their own recordings" on public.outdoor_recordings for select to authenticated using (owner_id = auth.uid() and (select public.is_content_manager()));
create policy "Managers save their own recordings" on public.outdoor_recordings for insert to authenticated with check (owner_id = auth.uid() and status in ('saved','validated') and (select public.is_content_manager()));
create policy "Managers edit unpublished recordings" on public.outdoor_recordings for update to authenticated using (owner_id = auth.uid() and status <> 'published' and (select public.is_content_manager())) with check (owner_id = auth.uid() and status in ('saved','validated') and (select public.is_content_manager()));
create policy "Public reads published route packages" on public.outdoor_route_packages for select to anon, authenticated using (true);
create or replace function public.publish_outdoor_network(recording_id uuid, network jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  source public.outdoor_recordings;
  building public.buildings;
  package public.outdoor_route_packages;
  edge jsonb;
begin
  if not public.is_admin() then raise exception 'Only an administrator can publish a walking network.'; end if;
  -- Serialize publishers; the immutable package is always a complete network snapshot.
  perform pg_advisory_xact_lock(10112026);
  select * into source from public.outdoor_recordings where id = recording_id and owner_id = auth.uid() for update;
  if not found or source.status <> 'validated' then raise exception 'Save and validate this recording first.'; end if;
  select * into building from public.buildings where id = source.building_id;
  if building.entrance_lat is null or building.entrance_lng is null or building.entrance_lat <> (source.recording->'entrance'->>'latitude')::double precision or building.entrance_lng <> (source.recording->'entrance'->>'longitude')::double precision then raise exception 'The saved building entrance changed. Review the recording again.'; end if;
  if network->>'version' is distinct from '1' or network->>'verified' is distinct from 'true' or jsonb_typeof(network->'nodes') is distinct from 'array' or jsonb_typeof(network->'edges') is distinct from 'array' or jsonb_array_length(network->'edges') = 0 or octet_length(network::text) > 2000000 then raise exception 'Invalid verified network.'; end if;
  if jsonb_array_length(coalesce(network->'referenceMap'->'anchors','[]'::jsonb)) <> 3 or jsonb_array_length(coalesce(network->'referenceMap'->'checks','[]'::jsonb)) < 1 then raise exception 'Independent map alignment checks are required.'; end if;
  if not exists (select 1 from jsonb_array_elements(network->'edges') e where e->>'recordingId' = recording_id::text) then raise exception 'Recording is missing from the package.'; end if;
  for edge in select value from jsonb_array_elements(network->'edges') loop
    if (edge->>'meters')::double precision <= 0 or not exists(select 1 from jsonb_array_elements(network->'nodes') n where n->>'id' = edge->>'from') or not exists(select 1 from jsonb_array_elements(network->'nodes') n where n->>'id' = edge->>'to') then raise exception 'Invalid or disconnected edge.'; end if;
    if edge ? 'recordingId' and (edge->>'validation' is distinct from 'validated' or not exists(select 1 from public.outdoor_recordings r where r.id::text = edge->>'recordingId' and r.status in ('validated','published'))) then raise exception 'An included recording is not validated.'; end if;
  end loop;
  -- A stale editor must not erase or alter routes published by another admin.
  if exists(select 1 from public.outdoor_route_packages) and exists (
    select 1 from jsonb_array_elements((select p.graph from public.outdoor_route_packages p order by revision desc limit 1)->'edges') old_edge
    where not exists(select 1 from jsonb_array_elements(network->'edges') new_edge where new_edge = old_edge)
  ) then raise exception 'The published network changed. Load the latest network and review again.'; end if;
  insert into public.outdoor_route_packages(published_by, recording_id, graph) values(auth.uid(), source.id, network) returning * into package;
  update public.outdoor_recordings set status = 'published', recording = jsonb_set(recording, '{status}', '"published"'), updated_at = now() where id = source.id;
  return jsonb_build_object('schemaVersion',1,'revision',package.revision,'publishedAt',package.published_at,'graph',package.graph);
end;
$$;
revoke all on function public.publish_outdoor_network(uuid,jsonb) from public, anon;
grant execute on function public.publish_outdoor_network(uuid,jsonb) to authenticated;
commit;
