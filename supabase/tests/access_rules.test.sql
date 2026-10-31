-- Phase 4A access-rule checks.
--
-- Run AFTER all migrations, on a development/branch project (or the local harness).
-- Everything happens inside one transaction and is rolled back at the end.
-- Any failed rule stops the script with an error that starts with "FAIL".
--
-- Fixture users (fake, rolled back):
--   ...a1 Admin, ...e1 Editor, ...b1 signed-in user without a role, ...c1 another user.

begin;

-- Fixtures (as the SQL Editor owner, which bypasses RLS) ---------------------------

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'zz-admin@example.test'),
  ('00000000-0000-4000-8000-0000000000e1', 'zz-editor@example.test'),
  ('00000000-0000-4000-8000-0000000000b1', 'zz-viewer@example.test'),
  ('00000000-0000-4000-8000-0000000000c1', 'zz-other@example.test');

insert into public.user_roles (user_id, role, granted_by) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin', null),
  ('00000000-0000-4000-8000-0000000000e1', 'editor', null);

insert into public.buildings (id, code, name, is_active) values
  ('10000000-0000-4000-8000-000000000001', 'ZZTEST1', 'Test Building A', true),
  ('10000000-0000-4000-8000-000000000002', 'ZZTEST2', 'Test Building B', false);

insert into public.floors (id, building_id, level, name) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 1, 'Test Floor 1'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 1, 'Test Floor 1');

insert into public.rooms (id, building_id, floor_id, name, room_number, type, is_active) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000001', 'Test Room Published', 'T-101', 'office', true),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000001', 'Test Room Draft', 'T-102', 'office', false),
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002',
   '20000000-0000-4000-8000-000000000002', 'Test Room Hidden Building', null, 'office', true);

insert into public.room_images (room_id, storage_path) values
  ('30000000-0000-4000-8000-000000000001',
   '30000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001.jpg'),
  ('30000000-0000-4000-8000-000000000002',
   '30000000-0000-4000-8000-000000000002/40000000-0000-4000-8000-000000000002.jpg');

insert into storage.objects (bucket_id, name) values
  ('room-photos', '30000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001.jpg'),
  ('room-photos', '30000000-0000-4000-8000-000000000002/40000000-0000-4000-8000-000000000002.jpg');

insert into public.destinations (id, name, building, type, entrance_name, indoor_route, sort_order, room_id) values
  ('zz-test-published', 'Legacy Name', 'Legacy Building', 'Office', 'Legacy Entrance',
   '[{"id":1,"direction":"straight","distance":3,"mode":"indoor"}]', 900, '30000000-0000-4000-8000-000000000001'),
  ('zz-test-draft', 'Legacy Draft', 'Legacy Building', 'Office', 'Legacy Entrance',
   '[{"id":1,"direction":"straight","distance":3,"mode":"indoor"}]', 901, '30000000-0000-4000-8000-000000000002'),
  ('zz-test-hidden-building', 'Legacy Hidden', 'Legacy Building', 'Office', 'Legacy Entrance',
   '[{"id":1,"direction":"straight","distance":3,"mode":"indoor"}]', 902, '30000000-0000-4000-8000-000000000003'),
  ('zz-test-legacy', 'Legacy Only', 'Legacy Building', 'Office', 'Legacy Entrance',
   '[{"id":1,"direction":"straight","distance":3,"mode":"indoor"}]', 903, null);

-- Public (anon) ----------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;

do $$
declare
  n integer;
  rec record;
begin
  select count(*) into n from public.buildings where code like 'ZZTEST%';
  if n <> 1 then raise exception 'FAIL anon: expected 1 published building, saw %', n; end if;

  select count(*) into n from public.floors where building_id in (
    '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002');
  if n <> 1 then raise exception 'FAIL anon: expected 1 visible floor, saw %', n; end if;

  select count(*) into n from public.rooms where name like 'Test Room%';
  if n <> 1 then raise exception 'FAIL anon: expected 1 published room, saw %', n; end if;

  select count(*) into n from public.room_images where room_id in (
    '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002');
  if n <> 1 then raise exception 'FAIL anon: expected 1 visible room photo, saw %', n; end if;

  select * into rec from public.navigation_catalog where id = 'zz-test-published';
  if rec.id is null
    or rec.name <> 'Test Room Published'
    or rec.building <> 'Test Building A'
    or rec.floor_name <> 'Test Floor 1'
    or rec.room_number <> 'T-101'
    or jsonb_array_length(rec.room_images) <> 1 then
    raise exception 'FAIL anon: linked catalog row is wrong: %', row_to_json(rec);
  end if;

  select count(*) into n from public.navigation_catalog where id in ('zz-test-draft', 'zz-test-hidden-building');
  if n <> 0 then raise exception 'FAIL anon: catalog shows % hidden destinations', n; end if;

  select count(*) into n from public.navigation_catalog where id = 'zz-test-legacy' and name = 'Legacy Only';
  if n <> 1 then raise exception 'FAIL anon: unlinked legacy destination missing'; end if;

  select count(*) into n from storage.objects where bucket_id = 'room-photos' and name like '30000000-%';
  if n <> 1 then raise exception 'FAIL anon: expected 1 readable photo object, saw %', n; end if;

  begin
    insert into public.buildings (code, name) values ('ZZTEST9', 'Anon Building');
    raise exception 'FAIL anon: inserted a building';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.rooms set name = 'Changed' where id = '30000000-0000-4000-8000-000000000001';
    raise exception 'FAIL anon: updated a room';
  exception when insufficient_privilege then null;
  end;

  begin
    perform 1 from public.user_roles;
    raise exception 'FAIL anon: read user_roles';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into storage.objects (bucket_id, name)
    values ('room-photos', '30000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000009.jpg');
    raise exception 'FAIL anon: uploaded a photo';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- Signed in without a role -------------------------------------------------------

reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  n integer;
begin
  select count(*) into n from public.buildings where code like 'ZZTEST%';
  if n <> 1 then raise exception 'FAIL viewer: expected 1 published building, saw %', n; end if;

  begin
    insert into public.user_roles (user_id, role, granted_by)
    values ('00000000-0000-4000-8000-0000000000b1', 'admin', '00000000-0000-4000-8000-0000000000b1');
    raise exception 'FAIL viewer: granted itself Admin';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.rooms (building_id, name) values ('10000000-0000-4000-8000-000000000001', 'Viewer Room');
    raise exception 'FAIL viewer: inserted a room';
  exception when insufficient_privilege then null;
  end;

  update public.buildings set name = 'Changed' where code = 'ZZTEST1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL viewer: updated % buildings', n; end if;
end;
$$;

-- Editor -----------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  n integer;
begin
  select count(*) into n from public.buildings where code like 'ZZTEST%';
  if n <> 2 then raise exception 'FAIL editor: expected to see 2 buildings, saw %', n; end if;

  select count(*) into n from public.rooms where name like 'Test Room%';
  if n <> 3 then raise exception 'FAIL editor: expected to see 3 rooms, saw %', n; end if;

  insert into public.buildings (code, name) values ('ZZTEST3', 'Editor Building');

  update public.rooms set description = 'Edited by editor' where id = '30000000-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL editor: could not update a draft room'; end if;

  insert into storage.objects (bucket_id, name)
  values ('room-photos', '30000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000003.png');

  begin
    insert into storage.objects (bucket_id, name) values ('room-photos', 'not-a-uuid/photo.jpg');
    raise exception 'FAIL editor: uploaded an invalid object name';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into storage.objects (bucket_id, name)
    values ('room-photos', '39999999-0000-4000-8000-000000000000/40000000-0000-4000-8000-000000000004.jpg');
    raise exception 'FAIL editor: uploaded a photo for a missing room';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.room_images (room_id, storage_path) values (
      '30000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000002/40000000-0000-4000-8000-000000000005.jpg');
    raise exception 'FAIL editor: stored a photo path for a different room';
  exception when check_violation then null;
  end;

  begin
    insert into public.user_roles (user_id, role, granted_by)
    values ('00000000-0000-4000-8000-0000000000b1', 'editor', '00000000-0000-4000-8000-0000000000e1');
    raise exception 'FAIL editor: granted a role';
  exception when insufficient_privilege then null;
  end;

  update public.user_roles set role = 'admin' where user_id = '00000000-0000-4000-8000-0000000000e1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL editor: promoted itself to Admin'; end if;
end;
$$;

-- Admin ------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  n integer;
begin
  select count(*) into n from public.user_roles where user_id::text like '00000000-0000-4000-8000-0000000000%';
  if n <> 2 then raise exception 'FAIL admin: expected to see 2 roles, saw %', n; end if;

  insert into public.user_roles (user_id, role, granted_by)
  values ('00000000-0000-4000-8000-0000000000b1', 'editor', '00000000-0000-4000-8000-0000000000a1');

  update public.user_roles set role = 'admin' where user_id = '00000000-0000-4000-8000-0000000000b1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL admin: could not change another user''s role'; end if;

  update public.user_roles set role = 'editor' where user_id = '00000000-0000-4000-8000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL admin: changed its own role'; end if;

  delete from public.user_roles where user_id = '00000000-0000-4000-8000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL admin: removed its own role'; end if;

  begin
    insert into public.user_roles (user_id, role, granted_by)
    values ('00000000-0000-4000-8000-0000000000c1', 'admin', '00000000-0000-4000-8000-0000000000e1');
    raise exception 'FAIL admin: recorded a role grant under another user''s name';
  exception when insufficient_privilege then null;
  end;

  delete from public.user_roles where user_id = '00000000-0000-4000-8000-0000000000e1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL admin: could not remove the Editor role'; end if;

  insert into public.rooms (building_id, name) values ('10000000-0000-4000-8000-000000000001', 'Admin Room');
end;
$$;

-- Data integrity (as owner) --------------------------------------------------------

reset role;

do $$
declare
  n integer;
begin
  begin
    delete from public.buildings where id = '10000000-0000-4000-8000-000000000001';
    raise exception 'FAIL integrity: deleted a building that still has floors and rooms';
  exception when restrict_violation or foreign_key_violation then null;
  end;

  begin
    delete from public.rooms where id = '30000000-0000-4000-8000-000000000001';
    raise exception 'FAIL integrity: deleted a room that still has photos';
  exception when restrict_violation or foreign_key_violation then null;
  end;

  delete from public.rooms where id = '30000000-0000-4000-8000-000000000003';
  select count(*) into n from public.destinations where id = 'zz-test-hidden-building' and room_id is null;
  if n <> 1 then raise exception 'FAIL integrity: destination route was lost when its room was deleted'; end if;

  begin
    insert into public.buildings (code, name, entrance_lat) values ('ZZTEST4', 'Half Coordinate', 13.4);
    raise exception 'FAIL integrity: stored a latitude without a longitude';
  exception when check_violation then null;
  end;

  begin
    insert into public.buildings (code, name, entrance_lat, entrance_lng) values ('ZZTEST5', 'Bad Coordinate', 95, 121);
    raise exception 'FAIL integrity: stored an impossible latitude';
  exception when check_violation then null;
  end;

  begin
    insert into public.rooms (building_id, floor_id, name) values (
      '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'Wrong Floor');
    raise exception 'FAIL integrity: room used a floor from another building';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.rooms (building_id, name, room_number)
    values ('10000000-0000-4000-8000-000000000001', 'Duplicate Number', 't-101');
    raise exception 'FAIL integrity: duplicate room number in one building';
  exception when unique_violation then null;
  end;

  insert into public.floor_maps (floor_id, storage_path, is_active) values (
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001/50000000-0000-4000-8000-000000000001.png', true);
  begin
    insert into public.floor_maps (floor_id, storage_path, is_active) values (
      '20000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001/50000000-0000-4000-8000-000000000002.png', true);
    raise exception 'FAIL integrity: two published floor maps on one floor';
  exception when unique_violation then null;
  end;
end;
$$;

rollback;

select 'ALL ACCESS TESTS PASSED' as result;
