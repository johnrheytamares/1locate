-- Phase 4A: access control.
--
--   Public (anon or signed-in without a role): read published content only.
--   Editor: manage campus content and photos.
--   Admin:  Editor permissions plus managing other users' roles.
--
-- Nobody can change their own role, so nobody can grant themselves Admin.
-- The first Admin is created from the SQL Editor (see docs/database-phase-4a.md).

-- Role helpers -----------------------------------------------------------------
-- SECURITY DEFINER so policies can read user_roles without recursive RLS checks.
-- They only ever report the caller's own role.

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.user_roles where user_id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() = 'admin', false);
$$;

create or replace function public.is_content_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() in ('admin', 'editor'), false);
$$;

revoke all on function public.current_app_role() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.is_content_manager() from public;
grant execute on function public.current_app_role() to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_content_manager() to anon, authenticated;

-- Table privileges -------------------------------------------------------------
-- RLS decides row access. These revokes are a second layer: anon can never write,
-- and TRUNCATE (which RLS does not cover) is removed from client roles.

revoke insert, update, delete, truncate on
  public.buildings, public.floors, public.rooms, public.building_images,
  public.room_images, public.map_labels, public.floor_maps
from anon;

revoke truncate on
  public.buildings, public.floors, public.rooms, public.building_images,
  public.room_images, public.map_labels, public.floor_maps
from authenticated;

revoke all on public.user_roles from anon;
revoke truncate on public.user_roles from authenticated;

-- Buildings --------------------------------------------------------------------

drop policy if exists "Public reads published buildings" on public.buildings;
create policy "Public reads published buildings"
  on public.buildings for select
  to anon, authenticated
  using (is_active or (select public.is_content_manager()));

drop policy if exists "Content managers manage buildings" on public.buildings;
create policy "Content managers manage buildings"
  on public.buildings for all
  to authenticated
  using ((select public.is_content_manager()))
  with check ((select public.is_content_manager()));

-- Floors -----------------------------------------------------------------------

drop policy if exists "Public reads floors of published buildings" on public.floors;
create policy "Public reads floors of published buildings"
  on public.floors for select
  to anon, authenticated
  using (
    exists (select 1 from public.buildings b where b.id = floors.building_id and b.is_active)
    or (select public.is_content_manager())
  );

drop policy if exists "Content managers manage floors" on public.floors;
create policy "Content managers manage floors"
  on public.floors for all
  to authenticated
  using ((select public.is_content_manager()))
  with check ((select public.is_content_manager()));

-- Rooms ------------------------------------------------------------------------

drop policy if exists "Public reads published rooms" on public.rooms;
create policy "Public reads published rooms"
  on public.rooms for select
  to anon, authenticated
  using (
    (is_active and exists (select 1 from public.buildings b where b.id = rooms.building_id and b.is_active))
    or (select public.is_content_manager())
  );

drop policy if exists "Content managers manage rooms" on public.rooms;
create policy "Content managers manage rooms"
  on public.rooms for all
  to authenticated
  using ((select public.is_content_manager()))
  with check ((select public.is_content_manager()));

-- Building photos --------------------------------------------------------------

drop policy if exists "Public reads photos of published buildings" on public.building_images;
create policy "Public reads photos of published buildings"
  on public.building_images for select
  to anon, authenticated
  using (
    exists (select 1 from public.buildings b where b.id = building_images.building_id and b.is_active)
    or (select public.is_content_manager())
  );

drop policy if exists "Content managers manage building photos" on public.building_images;
create policy "Content managers manage building photos"
  on public.building_images for all
  to authenticated
  using ((select public.is_content_manager()))
  with check ((select public.is_content_manager()));

-- Room photos ------------------------------------------------------------------

drop policy if exists "Public reads photos of published rooms" on public.room_images;
create policy "Public reads photos of published rooms"
  on public.room_images for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.rooms r
      join public.buildings b on b.id = r.building_id
      where r.id = room_images.room_id and r.is_active and b.is_active
    )
    or (select public.is_content_manager())
  );

drop policy if exists "Content managers manage room photos" on public.room_images;
create policy "Content managers manage room photos"
  on public.room_images for all
  to authenticated
  using ((select public.is_content_manager()))
  with check ((select public.is_content_manager()));

-- Map labels -------------------------------------------------------------------

drop policy if exists "Public reads published map labels" on public.map_labels;
create policy "Public reads published map labels"
  on public.map_labels for select
  to anon, authenticated
  using (
    (
      is_active
      and (
        building_id is null
        or exists (select 1 from public.buildings b where b.id = map_labels.building_id and b.is_active)
      )
    )
    or (select public.is_content_manager())
  );

drop policy if exists "Content managers manage map labels" on public.map_labels;
create policy "Content managers manage map labels"
  on public.map_labels for all
  to authenticated
  using ((select public.is_content_manager()))
  with check ((select public.is_content_manager()));

-- Floor maps -------------------------------------------------------------------

drop policy if exists "Public reads published floor maps" on public.floor_maps;
create policy "Public reads published floor maps"
  on public.floor_maps for select
  to anon, authenticated
  using (
    (
      is_active
      and exists (
        select 1
        from public.floors f
        join public.buildings b on b.id = f.building_id
        where f.id = floor_maps.floor_id and b.is_active
      )
    )
    or (select public.is_content_manager())
  );

drop policy if exists "Content managers manage floor maps" on public.floor_maps;
create policy "Content managers manage floor maps"
  on public.floor_maps for all
  to authenticated
  using ((select public.is_content_manager()))
  with check ((select public.is_content_manager()));

-- User roles -------------------------------------------------------------------

drop policy if exists "Users read their own role and Admins read all" on public.user_roles;
create policy "Users read their own role and Admins read all"
  on public.user_roles for select
  to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "Admins grant roles to other users" on public.user_roles;
create policy "Admins grant roles to other users"
  on public.user_roles for insert
  to authenticated
  with check (
    (select public.is_admin())
    and user_id <> (select auth.uid())
    and granted_by = (select auth.uid())
  );

drop policy if exists "Admins change other users' roles" on public.user_roles;
create policy "Admins change other users' roles"
  on public.user_roles for update
  to authenticated
  using ((select public.is_admin()) and user_id <> (select auth.uid()))
  with check ((select public.is_admin()) and user_id <> (select auth.uid()));

drop policy if exists "Admins remove other users' roles" on public.user_roles;
create policy "Admins remove other users' roles"
  on public.user_roles for delete
  to authenticated
  using ((select public.is_admin()) and user_id <> (select auth.uid()));
