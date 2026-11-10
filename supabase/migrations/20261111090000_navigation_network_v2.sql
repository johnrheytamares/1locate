-- Run after the existing outdoor_recordings and indoor_journeys migrations.
-- Additive: existing destinations keep navigation_type NULL and their legacy behavior.
begin;
alter table public.outdoor_route_packages alter column recording_id drop not null;
create table public.outdoor_network_drafts (
 id text primary key check (id ~ '^[a-z0-9_-]{1,80}$'),
 graph jsonb not null check (jsonb_typeof(graph)='object' and octet_length(graph::text)<=2000000),
 updated_at timestamptz not null default now()
);
alter table public.outdoor_network_drafts enable row level security;
revoke all on public.outdoor_network_drafts from anon, authenticated;
grant select,insert,update on public.outdoor_network_drafts to authenticated;
create policy "Managers edit network drafts" on public.outdoor_network_drafts for all to authenticated using ((select public.is_content_manager())) with check ((select public.is_content_manager()));
create trigger outdoor_network_drafts_updated before update on public.outdoor_network_drafts for each row execute function public.set_updated_at();
create function public.walking_meters(a jsonb,b jsonb) returns double precision
language sql immutable set search_path='' as $$
 select 6371000*2*asin(least(1::double precision,sqrt(power(sin(radians(((b->>'latitude')::double precision-(a->>'latitude')::double precision)/2)),2)+cos(radians((a->>'latitude')::double precision))*cos(radians((b->>'latitude')::double precision))*power(sin(radians(((b->>'longitude')::double precision-(a->>'longitude')::double precision)/2)),2))))
$$;
create function public.check_walking_image(map jsonb) returns void language plpgsql set search_path='' as $$
declare a jsonb;b jsonb;c jsonb;q jsonb;anchor jsonb;det double precision;u double precision;v double precision;predicted jsonb;squared double precision:=0;
begin
 if jsonb_typeof(map->'anchors') is distinct from 'array' or jsonb_array_length(map->'anchors')<>3 or jsonb_typeof(map->'checks') is distinct from 'array' or jsonb_array_length(map->'checks') not between 1 and 20 then raise exception 'Image alignment requires three landmarks and independent checks.';end if;
 for q in select value from jsonb_array_elements((map->'anchors')||(map->'checks')) loop
  if jsonb_typeof(q->'x') is distinct from 'number' or jsonb_typeof(q->'y') is distinct from 'number' or jsonb_typeof(q->'latitude') is distinct from 'number' or jsonb_typeof(q->'longitude') is distinct from 'number' or not((q->>'x')::numeric between 0 and 1 and (q->>'y')::numeric between 0 and 1 and (q->>'latitude')::numeric between -90 and 90 and (q->>'longitude')::numeric between -180 and 180) then raise exception 'Invalid map landmark coordinates.';end if;
 end loop;
 a:=map->'anchors'->0;b:=map->'anchors'->1;c:=map->'anchors'->2;
 det:=((b->>'x')::double precision-(a->>'x')::double precision)*((c->>'y')::double precision-(a->>'y')::double precision)-((c->>'x')::double precision-(a->>'x')::double precision)*((b->>'y')::double precision-(a->>'y')::double precision);
 if abs(det)<.001 or abs(((b->>'longitude')::double precision-(a->>'longitude')::double precision)*((c->>'latitude')::double precision-(a->>'latitude')::double precision)-((c->>'longitude')::double precision-(a->>'longitude')::double precision)*((b->>'latitude')::double precision-(a->>'latitude')::double precision))<1e-12 then raise exception 'Use geographically distributed non-collinear landmarks.';end if;
 for q in select value from jsonb_array_elements(map->'checks') loop
  for anchor in select value from jsonb_array_elements(map->'anchors') loop
   if sqrt(power((q->>'x')::double precision-(anchor->>'x')::double precision,2)+power((q->>'y')::double precision-(anchor->>'y')::double precision,2))<.025 then raise exception 'Use an independent check landmark.';end if;
  end loop;
  u:=(((q->>'x')::double precision-(a->>'x')::double precision)*((c->>'y')::double precision-(a->>'y')::double precision)-((q->>'y')::double precision-(a->>'y')::double precision)*((c->>'x')::double precision-(a->>'x')::double precision))/det;
  v:=(((b->>'x')::double precision-(a->>'x')::double precision)*((q->>'y')::double precision-(a->>'y')::double precision)-((b->>'y')::double precision-(a->>'y')::double precision)*((q->>'x')::double precision-(a->>'x')::double precision))/det;
  predicted:=jsonb_build_object('longitude',(a->>'longitude')::double precision+u*((b->>'longitude')::double precision-(a->>'longitude')::double precision)+v*((c->>'longitude')::double precision-(a->>'longitude')::double precision),'latitude',(a->>'latitude')::double precision+u*((b->>'latitude')::double precision-(a->>'latitude')::double precision)+v*((c->>'latitude')::double precision-(a->>'latitude')::double precision));
  squared:=squared+power(public.walking_meters(predicted,q),2);
 end loop;
 if sqrt(squared/jsonb_array_length(map->'checks'))>12 then raise exception 'Independent image alignment error exceeds 12 m.';end if;
end;$$;
create function public.publish_pathway_network(network jsonb,base_revision bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare loc jsonb; bounds jsonb; node jsonb; edge jsonb; point jsonb; prior_point jsonb; first_node jsonb; last_node jsonb; old public.outdoor_route_packages; package public.outdoor_route_packages; total double precision; distance double precision; reached text[]; next_reached text[]; south double precision; north double precision; west double precision; east double precision;
begin
 if not public.is_admin() then raise exception 'Only administrators can publish walking networks.'; end if;
 perform pg_advisory_xact_lock(10112026);
 loc:=network->'location'; bounds:=loc->'bounds';
 if coalesce(loc->>'id','') !~ '^[a-z0-9_-]{1,80}$' or coalesce(trim(loc->>'name'),'')='' or loc->>'environment' is distinct from 'campus' then raise exception 'Choose an official campus location. Test networks remain drafts.'; end if;
 south:=(bounds->>'south')::double precision;north:=(bounds->>'north')::double precision;west:=(bounds->>'west')::double precision;east:=(bounds->>'east')::double precision;
 if south is null or north is null or west is null or east is null or not(south>=-90 and north<=90 and south<north and west>=-180 and east<=180 and west<east) then raise exception 'Invalid campus boundary.'; end if;
 if network->>'version' is distinct from '1' or network->>'verified' is distinct from 'true' or jsonb_typeof(network->'nodes') is distinct from 'array' or jsonb_typeof(network->'edges') is distinct from 'array' or octet_length(network::text)>2000000 then raise exception 'Invalid walking network.'; end if;
 if jsonb_array_length(network->'nodes') not between 2 and 2000 or jsonb_array_length(network->'edges') not between 1 and 8000 then raise exception 'Connect walking points before publishing.'; end if;
 if network->'verification'->>'checked' is distinct from 'true' or coalesce(trim(network->'verification'->>'notes'),'')='' then raise exception 'Record physical access and distance verification.'; end if;
 if network->'mapReference'->>'mode'='geographic' then
  if network->'mapReference'->>'crs' is distinct from 'EPSG:4326' or network->'mapReference'->>'reviewed' is distinct from 'true' then raise exception 'Verify the geographic reference.'; end if;
 elsif network->'mapReference'->>'mode'='image' then
  if network->'referenceMap' is distinct from network->'mapReference'->'image' then raise exception 'Map reference mismatch.';end if;
  perform public.check_walking_image(network->'referenceMap');
  if jsonb_array_length(coalesce(network->'referenceMap'->'anchors','[]'))<>3 or jsonb_array_length(coalesce(network->'referenceMap'->'checks','[]'))<1 then raise exception 'Image alignment needs three landmarks and an independent check.'; end if;
 else raise exception 'Choose a geographic or calibrated image map reference.';
 end if;
 if (select count(distinct n->>'id') from jsonb_array_elements(network->'nodes') n)<>jsonb_array_length(network->'nodes') then raise exception 'Duplicate walking points.'; end if;
 for node in select value from jsonb_array_elements(network->'nodes') loop
  if coalesce(node->>'id','') !~ '^[a-zA-Z0-9_-]{1,80}$' or coalesce(trim(node->>'name'),'')='' or jsonb_typeof(node->'entrance') is distinct from 'boolean' or jsonb_typeof(node->'latitude') is distinct from 'number' or jsonb_typeof(node->'longitude') is distinct from 'number' then raise exception 'Invalid walking point.'; end if;
  if not((node->>'latitude')::double precision between south and north and (node->>'longitude')::double precision between west and east) then raise exception 'A walking point is outside this campus. Do not mix test data.'; end if;
 end loop;
 if not exists(select 1 from jsonb_array_elements(network->'nodes') n where n->>'entrance'='true') then raise exception 'Add a destination entrance.'; end if;
 if exists(select 1 from jsonb_array_elements(network->'edges') e group by least(e->>'from',e->>'to'),greatest(e->>'from',e->>'to') having count(*)>1) then raise exception 'Duplicate walking connections.'; end if;
 for edge in select value from jsonb_array_elements(network->'edges') loop
  select value into first_node from jsonb_array_elements(network->'nodes') where value->>'id'=edge->>'from';
  select value into last_node from jsonb_array_elements(network->'nodes') where value->>'id'=edge->>'to';
  distance:=(edge->>'meters')::double precision;
  if first_node is null or last_node is null or first_node=last_node or distance is null or not(distance>0 and distance<=10000) or edge->>'validation' is distinct from 'validated' or jsonb_typeof(edge->'open') is distinct from 'boolean' or jsonb_typeof(edge->'accessible') is distinct from 'boolean' or jsonb_typeof(edge->'oneWay') is distinct from 'boolean' then raise exception 'Invalid walking connection.'; end if;
  if distance<5 and edge->>'distanceSource' is distinct from 'measured' then raise exception 'Short paths require independently measured distance.'; end if;
  if jsonb_typeof(edge->'geometry') is distinct from 'array' or jsonb_array_length(edge->'geometry') not between 2 and 10000 then raise exception 'Every pathway needs verified corner geometry.'; end if;
  total:=0;prior_point:=null;
  for point in select value from jsonb_array_elements(edge->'geometry') loop
   if jsonb_typeof(point->'latitude') is distinct from 'number' or jsonb_typeof(point->'longitude') is distinct from 'number' or not((point->>'latitude')::double precision between south and north and (point->>'longitude')::double precision between west and east) then raise exception 'Path geometry is outside this campus.'; end if;
   if prior_point is not null then total:=total+public.walking_meters(prior_point,point);end if;prior_point:=point;
  end loop;
  if total<5 and edge->>'distanceSource' is distinct from 'measured' then raise exception 'Short geometry requires independently measured distance.';end if;
  if total<=0 or total>distance*1.15+2 or public.walking_meters(first_node,edge->'geometry'->0)>.2 or public.walking_meters(last_node,edge->'geometry'->-1)>.2 then raise exception 'Path geometry and measured distance must match the endpoints.'; end if;
 end loop;
 reached:=array[network->'nodes'->0->>'id'];
 loop
  select array_agg(distinct id) into next_reached from (select unnest(reached) id union select e->>'from' from jsonb_array_elements(network->'edges') e where e->>'to'=any(reached) union select e->>'to' from jsonb_array_elements(network->'edges') e where e->>'from'=any(reached)) q;
  exit when cardinality(next_reached)=cardinality(reached);reached:=next_reached;
 end loop;
 if cardinality(reached)<>jsonb_array_length(network->'nodes') then raise exception 'The walking network contains disconnected points.';end if;
 select * into old from public.outdoor_route_packages p where p.graph->'location'->>'id'=loc->>'id' order by p.revision desc limit 1;
 if coalesce(old.revision,0) is distinct from base_revision then raise exception 'A newer network exists. Load it before publishing.';end if;
 if old.revision is not null then
  if exists(select 1 from jsonb_array_elements(old.graph->'nodes') n where not exists(select 1 from jsonb_array_elements(network->'nodes') v where v=n)) or exists(select 1 from jsonb_array_elements(old.graph->'edges') e where not exists(select 1 from jsonb_array_elements(network->'edges') v where v=e)) then raise exception 'Preserve existing published pathways. This release supports additive network updates.'; end if;
 end if;
 insert into public.outdoor_route_packages(published_by,recording_id,graph)values(auth.uid(),null,network) returning * into package;
 return jsonb_build_object('schemaVersion',1,'revision',package.revision,'publishedAt',package.published_at,'graph',package.graph);
end;$$;
revoke all on function public.publish_pathway_network(jsonb,bigint) from public,anon;
grant execute on function public.publish_pathway_network(jsonb,bigint) to authenticated;
alter table public.destinations add column navigation_type text check(navigation_type in ('outdoor-only','indoor','hybrid'));
alter table public.destinations add column navigation_config jsonb check(navigation_config is null or (jsonb_typeof(navigation_config)='object' and octet_length(navigation_config::text)<=10000));
create function public.check_destination_navigation() returns trigger language plpgsql set search_path='' as $$
declare g jsonb; endpoint jsonb; cfg jsonb; step jsonb;
begin
 if new.navigation_type is null then return new;end if;
 cfg:=new.navigation_config;
 if not new.is_active then return new;end if;
 if cfg->>'type' is distinct from new.navigation_type then raise exception 'Save matching navigation settings before publishing.';end if;
 select p.graph into g from public.outdoor_route_packages p where p.graph->'location'->>'id'=cfg->>'locationId' order by p.revision desc limit 1;
 if g is null or g->'location'->>'environment' is distinct from 'campus' then raise exception 'Select a published campus network.';end if;
 if new.navigation_type<>'outdoor-only' then
  if cfg->'checkpoint'->>'verified' is distinct from 'true' or coalesce(trim(cfg->'checkpoint'->>'name'),'')='' then raise exception 'Verify the indoor starting checkpoint.';end if;
  if new.indoor_journey is null then
   if jsonb_typeof(new.indoor_route) is distinct from 'array' or jsonb_array_length(new.indoor_route) not between 1 and 50 then raise exception 'Indoor instructions are required.';end if;
   for step in select value from jsonb_array_elements(new.indoor_route) loop
    if coalesce(step->>'direction','') not in ('straight','left','right') or jsonb_typeof(step->'distance') is distinct from 'number' or not((step->>'distance')::numeric>0 and (step->>'distance')::numeric<=500) then raise exception 'Invalid indoor instruction.';end if;
   end loop;
  elsif new.indoor_journey->>'status' is distinct from 'validated' then raise exception 'Validate the indoor journey first.';end if;
 end if;
 if new.navigation_type<>'indoor' then
  select value into endpoint from jsonb_array_elements(g->'nodes') where value->>'id'=cfg->>'endpointId' and value->>'entrance'='true';
  if endpoint is null or cfg->'entrance'->>'latitude' is null or cfg->'entrance'->>'longitude' is null or public.walking_meters(endpoint,cfg->'entrance')>.2 then raise exception 'Choose a matching published destination endpoint.';end if;
  if not exists(select 1 from jsonb_array_elements(g->'edges') e where e->>'open'='true' and e->>'validation'='validated' and (e->>'to'=cfg->>'endpointId' or(e->>'oneWay'='false' and e->>'from'=cfg->>'endpointId'))) then raise exception 'Endpoint has no verified open incoming path.';end if;
  if new.navigation_type='hybrid' and cfg->'checkpoint'->>'endpointId' is distinct from cfg->>'endpointId' then raise exception 'Indoor start must match the outdoor endpoint.';end if;
 end if;
 return new;
end;$$;
create trigger check_destination_navigation before insert or update on public.destinations for each row execute function public.check_destination_navigation();

create or replace view public.navigation_catalog
with (security_invoker = true)
as
select
  d.id,
  coalesce(r.name, d.name) as name,
  coalesce(r.type, d.type) as type,
  coalesce(b.name, d.building) as building,
  case when d.navigation_type='indoor' then d.navigation_config->'checkpoint'->>'name' when d.navigation_type is not null then coalesce(d.navigation_config->>'endpointName',d.entrance_name) else coalesce(b.entrance_name, d.entrance_name) end as entrance_name,
  case when d.navigation_type is not null and d.navigation_type<>'indoor' then (d.navigation_config->'entrance'->>'latitude')::double precision when b.entrance_lat is not null then b.entrance_lat else d.entrance_lat end as entrance_lat,
  case when d.navigation_type is not null and d.navigation_type<>'indoor' then (d.navigation_config->'entrance'->>'longitude')::double precision when b.entrance_lat is not null then b.entrance_lng else d.entrance_lng end as entrance_lng,
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
  d.indoor_journey,
  d.navigation_type,
  d.navigation_config
from public.destinations d
left join public.rooms r on r.id = d.room_id
left join public.buildings b on b.id = r.building_id
left join public.floors f on f.id = r.floor_id
where d.is_active
  and (d.room_id is null or (r.id is not null and r.is_active and b.is_active));

revoke all on public.navigation_catalog from anon, authenticated;
grant select on public.navigation_catalog to anon, authenticated;

commit;
