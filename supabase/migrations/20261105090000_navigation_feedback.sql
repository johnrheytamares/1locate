-- Navigation arrival feedback. Apply AFTER Phase 4A access-control helpers.
-- The mobile app submits with the anon key (no login). Admins/editors read rows
-- from the Admin Dashboard. Ordinary users cannot read other people's feedback.

create table if not exists public.navigation_feedback (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique,
  user_id uuid references auth.users(id) on delete set null,
  destination_id text check (destination_id is null or char_length(destination_id) between 1 and 120),
  destination_name text not null check (char_length(destination_name) between 1 and 120),
  rating integer not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists navigation_feedback_created_at_idx
  on public.navigation_feedback (created_at desc);

create index if not exists navigation_feedback_rating_idx
  on public.navigation_feedback (rating);

alter table public.navigation_feedback enable row level security;

revoke all on public.navigation_feedback from anon, authenticated;
grant insert on public.navigation_feedback to anon, authenticated;
grant select on public.navigation_feedback to authenticated;

drop policy if exists "Anyone can submit navigation feedback" on public.navigation_feedback;
create policy "Anyone can submit navigation feedback"
  on public.navigation_feedback for insert
  to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));

drop policy if exists "Users read own feedback and managers read all" on public.navigation_feedback;
create policy "Users read own feedback and managers read all"
  on public.navigation_feedback for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_content_manager())
  );
