-- Run AFTER 20261105090000_navigation_feedback.sql on a development/branch project.
-- Everything happens inside one transaction and is rolled back.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'zz-admin@example.test'),
  ('00000000-0000-4000-8000-0000000000e1', 'zz-editor@example.test'),
  ('00000000-0000-4000-8000-0000000000b1', 'zz-viewer@example.test')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role, granted_by) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin', null),
  ('00000000-0000-4000-8000-0000000000e1', 'editor', null)
on conflict (user_id) do nothing;

-- Public (anon) ----------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;

do $$
declare
  n integer;
begin
  insert into public.navigation_feedback (session_id, destination_id, destination_name, rating, comment)
  values ('11111111-1111-4111-8111-111111111111', 'registrar', 'Registrar Office', 5, 'Accurate navigation');

  begin
    insert into public.navigation_feedback (session_id, destination_id, destination_name, rating)
    values (
      '11111111-1111-4111-8111-111111111111',
      'registrar',
      'Registrar Office',
      4
    );
    raise exception 'FAIL anon: duplicate session was accepted';
  exception when unique_violation then null;
  end;

  begin
    insert into public.navigation_feedback (session_id, user_id, destination_name, rating)
    values (
      '22222222-2222-4222-8222-222222222222',
      '00000000-0000-4000-8000-0000000000a1',
      'Library',
      3
    );
    raise exception 'FAIL anon: attributed feedback to another user';
  exception when insufficient_privilege then null;
  when check_violation then null;
  end;

  select count(*) into n from public.navigation_feedback;
  if n <> 0 then raise exception 'FAIL anon: expected not to read feedback, saw %', n; end if;
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
  rec public.navigation_feedback;
begin
  insert into public.navigation_feedback (session_id, user_id, destination_id, destination_name, rating)
  values (
    '33333333-3333-4333-8333-333333333333',
    '00000000-0000-4000-8000-0000000000b1',
    'library',
    'Library',
    2
  );

  select * into rec from public.navigation_feedback
  where session_id = '33333333-3333-4333-8333-333333333333';
  if rec.id is null or rec.rating <> 2 then
    raise exception 'FAIL viewer: could not read own feedback';
  end if;

  select count(*) into n from public.navigation_feedback
  where session_id = '11111111-1111-4111-8111-111111111111';
  if n <> 0 then raise exception 'FAIL viewer: read another user''s anonymous feedback'; end if;

  begin
    insert into public.navigation_feedback (session_id, user_id, destination_name, rating)
    values (
      '44444444-4444-4444-8444-444444444444',
      '00000000-0000-4000-8000-0000000000a1',
      'Cashier',
      5
    );
    raise exception 'FAIL viewer: attributed feedback to another user';
  exception when insufficient_privilege then null;
  end;
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
  select count(*) into n from public.navigation_feedback
  where session_id in (
    '11111111-1111-4111-8111-111111111111',
    '33333333-3333-4333-8333-333333333333'
  );
  if n <> 2 then raise exception 'FAIL editor: expected to read 2 feedback rows, saw %', n; end if;
end;
$$;

rollback;
