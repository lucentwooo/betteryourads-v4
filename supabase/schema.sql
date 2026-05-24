-- ============================================================================
-- BetterYourAds — auth/profiles, brands, ads, and storage.
-- Run once in the Supabase dashboard: SQL Editor → paste → Run.
-- Safe to re-run (idempotent).
-- ============================================================================

-- profiles: one row per auth user; gates app access via `approved`.
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  approved   boolean not null default false,
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles
  for select using (auth.uid() = id);

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- brands: saved website analyses (one per user+website).
create table if not exists public.brands (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text,
  website_url text not null,
  analysis    jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, website_url)
);
alter table public.brands enable row level security;
drop policy if exists "own brands" on public.brands;
create policy "own brands" on public.brands
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ads: generated ad records (image bytes live in Storage; inserted by server).
create table if not exists public.ads (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  brand_id     uuid references public.brands(id) on delete set null,
  website_url  text,
  image_path   text not null,
  prompt       text,
  aspect_ratio text,
  resolution   text,
  created_at   timestamptz not null default now()
);
alter table public.ads enable row level security;
drop policy if exists "own ads read" on public.ads;
create policy "own ads read" on public.ads
  for select using (auth.uid() = user_id);
drop policy if exists "own ads delete" on public.ads;
create policy "own ads delete" on public.ads
  for delete using (auth.uid() = user_id);

-- Storage: private bucket for ad images; users read only their own <uid>/ prefix.
insert into storage.buckets (id, name, public)
values ('ads', 'ads', false)
on conflict (id) do nothing;

drop policy if exists "own ad files read" on storage.objects;
create policy "own ad files read" on storage.objects
  for select using (
    bucket_id = 'ads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
