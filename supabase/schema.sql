-- =============================================================================
-- G Clips — Supabase database schema
-- Run this entire file once in the Supabase SQL editor (Project > SQL Editor).
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE where possible.
-- =============================================================================

-- Required for gen_random_uuid()
create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- profiles — one row per user (creator or admin), mirrors auth.users
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'creator' check (role in ('creator', 'admin')),
  avatar_url text,
  payout_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'App-level user profile, extends auth.users with role and payout info.';

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- -----------------------------------------------------------------------------
-- douyin_accounts — the pool of rentable Douyin creator accounts
-- -----------------------------------------------------------------------------
create table if not exists public.douyin_accounts (
  id uuid primary key default gen_random_uuid(),
  account_handle text not null,
  niche text not null check (niche in ('travel', 'lifestyle', 'tech')),
  tier text not null check (tier in ('explorer', 'creator', 'influence')),
  follower_count integer not null default 0,
  status text not null default 'available' check (status in ('available', 'assigned', 'maintenance')),
  assigned_to uuid references public.profiles (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- videos — creator video submissions
-- -----------------------------------------------------------------------------
create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles (id) on delete cascade,
  douyin_account_id uuid references public.douyin_accounts (id) on delete set null,
  title text not null,
  description text,
  storage_path text not null, -- path inside the "videos" Supabase Storage bucket
  cover_url text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'published')),
  reject_reason text,
  views bigint not null default 0,
  likes bigint not null default 0,
  comments bigint not null default 0,
  shares bigint not null default 0,
  estimated_earnings_cny numeric(12, 2) not null default 0,
  settled_earnings_cny numeric(12, 2) not null default 0,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id),
  published_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Keep estimated_earnings_cny in sync with views (simple demo formula: ¥0.0025 / view).
create or replace function public.recalc_estimated_earnings()
returns trigger
language plpgsql
as $$
begin
  new.estimated_earnings_cny := round(new.views * 0.0025, 2);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_videos_recalc_earnings on public.videos;
create trigger trg_videos_recalc_earnings
  before insert or update of views on public.videos
  for each row execute procedure public.recalc_estimated_earnings();

-- -----------------------------------------------------------------------------
-- earnings_ledger — settled (locked-in) earnings, created by admins when they
-- "settle" a video's current estimated earnings into real, withdrawable balance
-- -----------------------------------------------------------------------------
create table if not exists public.earnings_ledger (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles (id) on delete cascade,
  video_id uuid references public.videos (id) on delete set null,
  amount_cny numeric(12, 2) not null,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

-- -----------------------------------------------------------------------------
-- withdrawals — creator payout requests
-- -----------------------------------------------------------------------------
create table if not exists public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles (id) on delete cascade,
  amount_cny numeric(12, 2) not null check (amount_cny > 0),
  method text not null check (method in ('paypal', 'bank_transfer', 'alipay')),
  account_details jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'paid')),
  admin_note text,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references public.profiles (id)
);

-- -----------------------------------------------------------------------------
-- Helper: is_admin() — used inside RLS policies
-- -----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.douyin_accounts enable row level security;
alter table public.videos enable row level security;
alter table public.earnings_ledger enable row level security;
alter table public.withdrawals enable row level security;

-- profiles
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin" on public.profiles
  for update using (auth.uid() = id or public.is_admin());

-- douyin_accounts
drop policy if exists "accounts_select" on public.douyin_accounts;
create policy "accounts_select" on public.douyin_accounts
  for select using (status = 'available' or assigned_to = auth.uid() or public.is_admin());

drop policy if exists "accounts_admin_write" on public.douyin_accounts;
create policy "accounts_admin_write" on public.douyin_accounts
  for all using (public.is_admin()) with check (public.is_admin());

-- videos
drop policy if exists "videos_select_own_or_admin" on public.videos;
create policy "videos_select_own_or_admin" on public.videos
  for select using (creator_id = auth.uid() or public.is_admin());

drop policy if exists "videos_insert_own" on public.videos;
create policy "videos_insert_own" on public.videos
  for insert with check (creator_id = auth.uid());

drop policy if exists "videos_update_own_pending_or_admin" on public.videos;
create policy "videos_update_own_pending_or_admin" on public.videos
  for update using (
    (creator_id = auth.uid() and status = 'pending') or public.is_admin()
  );

drop policy if exists "videos_delete_own_pending_or_admin" on public.videos;
create policy "videos_delete_own_pending_or_admin" on public.videos
  for delete using (
    (creator_id = auth.uid() and status = 'pending') or public.is_admin()
  );

-- earnings_ledger
drop policy if exists "ledger_select_own_or_admin" on public.earnings_ledger;
create policy "ledger_select_own_or_admin" on public.earnings_ledger
  for select using (creator_id = auth.uid() or public.is_admin());

drop policy if exists "ledger_admin_write" on public.earnings_ledger;
create policy "ledger_admin_write" on public.earnings_ledger
  for all using (public.is_admin()) with check (public.is_admin());

-- withdrawals
drop policy if exists "withdrawals_select_own_or_admin" on public.withdrawals;
create policy "withdrawals_select_own_or_admin" on public.withdrawals
  for select using (creator_id = auth.uid() or public.is_admin());

drop policy if exists "withdrawals_insert_own" on public.withdrawals;
create policy "withdrawals_insert_own" on public.withdrawals
  for insert with check (creator_id = auth.uid());

drop policy if exists "withdrawals_admin_update" on public.withdrawals;
create policy "withdrawals_admin_update" on public.withdrawals
  for update using (public.is_admin()) with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- Seed data — sample Douyin account inventory matching the marketing site tiers
-- -----------------------------------------------------------------------------
insert into public.douyin_accounts (account_handle, niche, tier, follower_count, status)
select * from (values
  ('@explorer.trail01', 'travel', 'explorer', 52000, 'available'),
  ('@explorer.trail02', 'travel', 'explorer', 58000, 'available'),
  ('@creator.taste01', 'lifestyle', 'creator', 203000, 'available'),
  ('@creator.taste02', 'lifestyle', 'creator', 215000, 'available'),
  ('@influence.tech01', 'tech', 'influence', 512000, 'available'),
  ('@influence.tech02', 'tech', 'influence', 540000, 'available')
) as seed (account_handle, niche, tier, follower_count, status)
where not exists (select 1 from public.douyin_accounts);

-- =============================================================================
-- Storage bucket setup (manual step required first):
--   1. In Supabase Dashboard > Storage, create a new bucket named "videos".
--      Keep it PRIVATE (do not enable public access).
--   2. After creating the bucket, run the statements below in the SQL editor
--      to allow creators to upload/read only their own files, and admins to
--      read everything. Storage policies live on storage.objects and can only
--      be created once the bucket exists.
-- =============================================================================

-- drop policy if exists "videos_bucket_insert_own" on storage.objects;
-- create policy "videos_bucket_insert_own" on storage.objects
--   for insert with check (
--     bucket_id = 'videos' and (storage.foldername(name))[1] = auth.uid()::text
--   );
--
-- drop policy if exists "videos_bucket_select_own_or_admin" on storage.objects;
-- create policy "videos_bucket_select_own_or_admin" on storage.objects
--   for select using (
--     bucket_id = 'videos' and (
--       (storage.foldername(name))[1] = auth.uid()::text or public.is_admin()
--     )
--   );
--
-- drop policy if exists "videos_bucket_delete_own_or_admin" on storage.objects;
-- create policy "videos_bucket_delete_own_or_admin" on storage.objects
--   for delete using (
--     bucket_id = 'videos' and (
--       (storage.foldername(name))[1] = auth.uid()::text or public.is_admin()
--     )
--   );
