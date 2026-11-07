-- Optional anonymous navigation ratings. Existing campus/auth tables are unchanged.
begin;
create table if not exists public.navigation_feedback (
  id uuid primary key,
  destination_id text not null check (char_length(destination_id) between 1 and 120),
  destination_name text not null check (char_length(destination_name) between 1 and 120),
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now()
);
alter table public.navigation_feedback enable row level security;
revoke all on public.navigation_feedback from anon, authenticated;
grant insert (id, destination_id, destination_name, rating) on public.navigation_feedback to anon, authenticated;
grant select on public.navigation_feedback to authenticated;
drop policy if exists navigation_feedback_submit on public.navigation_feedback;
create policy navigation_feedback_submit on public.navigation_feedback for insert to anon, authenticated with check (true);
drop policy if exists navigation_feedback_read on public.navigation_feedback;
create policy navigation_feedback_read on public.navigation_feedback for select to authenticated using ((select public.is_content_manager()));
create index if not exists navigation_feedback_created_at_idx on public.navigation_feedback (created_at desc);
commit;
