-- Phase 4A: photo and floor-map storage.
--
-- Buckets are private. The app gets short-lived signed URLs, and only for files that
-- are referenced by published rows (RLS on the image tables decides that).
--
-- Object names: "<parent uuid>/<file uuid>.<jpg|jpeg|png|webp>"
--   building-photos: parent = buildings.id   (max 5 MB)
--   room-photos:     parent = rooms.id       (max 5 MB)
--   floor-maps:      parent = floors.id      (max 10 MB)
-- Size and MIME limits are enforced by the Storage API through the bucket settings below.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('building-photos', 'building-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('room-photos', 'room-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('floor-maps', 'floor-maps', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- True when the object's folder points at an existing parent row for its bucket.
create or replace function public.campus_object_parent_exists(bucket text, object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case bucket
    when 'building-photos' then exists (
      select 1 from public.buildings b where b.id::text = split_part(object_name, '/', 1)
    )
    when 'room-photos' then exists (
      select 1 from public.rooms r where r.id::text = split_part(object_name, '/', 1)
    )
    when 'floor-maps' then exists (
      select 1 from public.floors f where f.id::text = split_part(object_name, '/', 1)
    )
    else false
  end;
$$;

revoke all on function public.campus_object_parent_exists(text, text) from public;
grant execute on function public.campus_object_parent_exists(text, text) to authenticated;

drop policy if exists "Public reads published campus images" on storage.objects;
create policy "Public reads published campus images"
  on storage.objects for select
  to anon, authenticated
  using (
    (bucket_id = 'building-photos'
      and exists (select 1 from public.building_images i where i.storage_path = objects.name))
    or (bucket_id = 'room-photos'
      and exists (select 1 from public.room_images i where i.storage_path = objects.name))
    or (bucket_id = 'floor-maps'
      and exists (select 1 from public.floor_maps m where m.storage_path = objects.name))
  );

drop policy if exists "Content managers read campus images" on storage.objects;
create policy "Content managers read campus images"
  on storage.objects for select
  to authenticated
  using (
    bucket_id in ('building-photos', 'room-photos', 'floor-maps')
    and (select public.is_content_manager())
  );

drop policy if exists "Content managers upload campus images" on storage.objects;
create policy "Content managers upload campus images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id in ('building-photos', 'room-photos', 'floor-maps')
    and (select public.is_content_manager())
    and public.is_uuid_image_path(objects.name)
    and public.campus_object_parent_exists(bucket_id, objects.name)
  );

drop policy if exists "Content managers replace campus images" on storage.objects;
create policy "Content managers replace campus images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id in ('building-photos', 'room-photos', 'floor-maps')
    and (select public.is_content_manager())
  )
  with check (
    bucket_id in ('building-photos', 'room-photos', 'floor-maps')
    and (select public.is_content_manager())
    and public.is_uuid_image_path(objects.name)
    and public.campus_object_parent_exists(bucket_id, objects.name)
  );

drop policy if exists "Content managers delete campus images" on storage.objects;
create policy "Content managers delete campus images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id in ('building-photos', 'room-photos', 'floor-maps')
    and (select public.is_content_manager())
  );
