-- Run as database owner AFTER the Phase 4C migration, preferably on a test project.
-- Creates only transaction-local fixtures and rolls everything back.
begin;
create temporary table graph_test_ids (building uuid, floor0 uuid, floor1 uuid, map0 uuid, map1 uuid, room uuid);
insert into graph_test_ids values (gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid());
grant select on graph_test_ids to anon;

do $$
declare t record; g jsonb; bad jsonb;
begin
  select * into t from graph_test_ids;
  insert into public.buildings(id,code,name,is_active) values(t.building,'ZZGRAPH_'||substr(replace(t.building::text,'-',''),1,8),'Graph test',true);
  insert into public.floors(id,building_id,level,name) values(t.floor0,t.building,1,'Ground'),(t.floor1,t.building,2,'Upper');
  insert into public.rooms(id,building_id,floor_id,name,type,is_active) values(t.room,t.building,t.floor1,'Test room','office',true);
  insert into public.floor_maps(id,floor_id,storage_path,width_px,height_px,meters_per_pixel,is_active) values
    (t.map0,t.floor0,t.floor0::text||'/'||gen_random_uuid()::text||'.png',1000,800,.01,true),
    (t.map1,t.floor1,t.floor1::text||'/'||gen_random_uuid()::text||'.png',1000,800,.01,true);
  g := jsonb_build_object('nodes',jsonb_build_array(
    jsonb_build_object('id','entry','name','Entrance','kind','entrance','floor_id',t.floor0,'map_id',t.map0,'x',.1,'y',.1,'room_id',null),
    jsonb_build_object('id','stairs0','name','Lower stairs','kind','stairs','floor_id',t.floor0,'map_id',t.map0,'x',.5,'y',.1,'room_id',null),
    jsonb_build_object('id','stairs1','name','Upper stairs','kind','stairs','floor_id',t.floor1,'map_id',t.map1,'x',.1,'y',.1,'room_id',null),
    jsonb_build_object('id','room','name','Test room','kind','room','floor_id',t.floor1,'map_id',t.map1,'x',.5,'y',.1,'room_id',t.room)
  ),'edges',jsonb_build_array(
    jsonb_build_object('id','a','from','entry','to','stairs0','kind','walk','meters',4,'accessible',true,'bidirectional',true,'enabled',true),
    jsonb_build_object('id','b','from','stairs0','to','stairs1','kind','stairs','meters',5,'accessible',false,'bidirectional',true,'enabled',true),
    jsonb_build_object('id','c','from','stairs1','to','room','kind','walk','meters',4,'accessible',true,'bidirectional',true,'enabled',true)
  ));
  insert into public.indoor_graphs(building_id,graph,is_active) values(t.building,g,false),(t.building,g,true);
  bad := jsonb_set(g,'{edges,1,kind}','"walk"');
  begin
    update public.indoor_graphs set graph=bad where building_id=t.building and not is_active;
    raise exception 'FAIL: cross-floor walk was accepted';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  bad := jsonb_set(g,'{edges,1,accessible}','true');
  begin
    update public.indoor_graphs set graph=bad where building_id=t.building and not is_active;
    raise exception 'FAIL: accessible stairs were accepted';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    delete from public.floor_maps where id=t.map0;
    raise exception 'FAIL: referenced map was deleted';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;

set local role anon;
do $$
begin
  if (select count(*) from public.indoor_graphs where building_id=(select building from graph_test_ids))<>1 then raise exception 'FAIL: anonymous reader must see published snapshot only'; end if;
  begin
    delete from public.indoor_graphs where building_id=(select building from graph_test_ids);
    raise exception 'FAIL: anonymous graph write succeeded';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.rooms set is_active=false where id=(select room from graph_test_ids);
set local role anon;
do $$ begin
  if exists(select 1 from public.indoor_graphs where building_id=(select building from graph_test_ids)) then raise exception 'FAIL: graph with unpublished room is public'; end if;
end $$;
reset role;
rollback;
