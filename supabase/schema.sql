create extension if not exists "pgcrypto";

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  company text not null,
  role text not null,
  status text not null default 'applied' check (status in ('applied', 'oa', 'interview', 'rejected', 'accepted')),
  job_description text,
  job_url text,
  analysis jsonb,
  analysis_updated_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.jobs
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.jobs
  add column if not exists status text not null default 'applied'
  check (status in ('applied', 'oa', 'interview', 'rejected', 'accepted'));

create index if not exists idx_jobs_user_id_created_at on public.jobs(user_id, created_at desc);

-- Migrate old global background table if needed.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'user_background' and column_name = 'id'
  ) then
    alter table public.user_background rename to user_background_legacy;
  end if;
exception
  when undefined_table then
    null;
end $$;

create table if not exists public.user_background (
  user_id uuid primary key references auth.users(id) on delete cascade,
  background text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.jobs enable row level security;
alter table public.user_background enable row level security;

-- Remove old permissive policies if they exist.
drop policy if exists "Allow read jobs" on public.jobs;
drop policy if exists "Allow insert jobs" on public.jobs;
drop policy if exists "Allow update jobs" on public.jobs;
drop policy if exists "Allow read user background" on public.user_background;
drop policy if exists "Allow upsert user background" on public.user_background;

-- Per-user RLS policies.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'jobs' and policyname = 'Users can read own jobs'
  ) then
    create policy "Users can read own jobs"
      on public.jobs
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'jobs' and policyname = 'Users can insert own jobs'
  ) then
    create policy "Users can insert own jobs"
      on public.jobs
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'jobs' and policyname = 'Users can update own jobs'
  ) then
    create policy "Users can update own jobs"
      on public.jobs
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'jobs' and policyname = 'Users can delete own jobs'
  ) then
    create policy "Users can delete own jobs"
      on public.jobs
      for delete
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_background' and policyname = 'Users can read own background'
  ) then
    create policy "Users can read own background"
      on public.user_background
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_background' and policyname = 'Users can upsert own background'
  ) then
    create policy "Users can upsert own background"
      on public.user_background
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;
