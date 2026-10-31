-- 1Locate baseline: destinations table (Phase 3).
-- Already applied to the live project on 2026-10-27. Safe to run more than once.
--
-- entrance_lat / entrance_lng stay NULL until the MINSU entrances are surveyed.
-- Do not put guessed coordinates here. NULL makes the app use a clearly labeled TEST target.

create table if not exists public.destinations (
  id text primary key check (char_length(id) between 1 and 120),
  name text not null check (char_length(name) between 1 and 120),
  building text not null check (char_length(building) between 1 and 120),
  type text not null check (char_length(type) between 1 and 120),
  entrance_name text not null check (char_length(entrance_name) between 1 and 120),
  entrance_lat double precision check (entrance_lat between -90 and 90),
  entrance_lng double precision check (entrance_lng between -180 and 180),
  arrival_radius double precision not null default 10 check (arrival_radius > 0 and arrival_radius <= 100),
  indoor_route jsonb not null default '[]'::jsonb check (jsonb_typeof(indoor_route) = 'array'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint entrance_coordinates_pair check ((entrance_lat is null) = (entrance_lng is null))
);

-- Read-only for the app. No insert, update, or delete policies are defined,
-- so the anon key cannot change data.
alter table public.destinations enable row level security;

drop policy if exists "Anyone can read destinations" on public.destinations;
create policy "Anyone can read destinations"
  on public.destinations for select
  to anon, authenticated
  using (true);

insert into public.destinations
  (id, name, building, type, entrance_name, entrance_lat, entrance_lng, arrival_radius, indoor_route, sort_order)
values
  ('registrar', 'Registrar Office', 'Administration Building', 'Office', 'Administration Building Entrance', null, null, 10,
   '[{"id":1,"direction":"straight","distance":3,"mode":"indoor"},
     {"id":2,"direction":"right","distance":2,"mode":"indoor"},
     {"id":3,"direction":"straight","distance":2,"mode":"indoor"}]', 1),
  ('library', 'Library', 'Library Building', 'Library', 'Library Building Entrance', null, null, 10,
   '[{"id":1,"direction":"straight","distance":5,"mode":"indoor"}]', 2),
  ('cashier', 'Cashier', 'Administration Building', 'Office', 'Administration Building Entrance', null, null, 10,
   '[{"id":1,"direction":"straight","distance":3,"mode":"indoor"},
     {"id":2,"direction":"straight","distance":3,"mode":"indoor"}]', 3),
  ('guidance', 'Guidance Office', 'Academic Building', 'Office', 'Academic Building Entrance', null, null, 10,
   '[{"id":1,"direction":"straight","distance":3,"mode":"indoor"},
     {"id":2,"direction":"right","distance":3,"mode":"indoor"}]', 4)
-- Existing rows are never overwritten.
on conflict (id) do nothing;
