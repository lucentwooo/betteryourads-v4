-- ============================================================================
-- BetterYourAds — auth/profiles, brand extractions, ad prompts, generated ads,
-- and storage. Reflects the current schema the TypeScript backend expects.
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

-- brand_extractions: saved Stage-1 website analyses (one per user+website).
create table if not exists public.brand_extractions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name               text,
  website_url        text not null,
  analysis           jsonb,
  measured_site_data jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, website_url)
);
alter table public.brand_extractions enable row level security;
drop policy if exists "own brand_extractions" on public.brand_extractions;
create policy "own brand_extractions" on public.brand_extractions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ad_prompts: structured Stage-2 output, linked to its brand extraction.
create table if not exists public.ad_prompts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  brand_extraction_id uuid references public.brand_extractions(id) on delete set null,
  variant             text not null check (variant in ('no_asset', 'w_asset')),
  ad_prompt_json      jsonb not null,
  user_direction      jsonb,
  model               text,
  created_at          timestamptz not null default now()
);
alter table public.ad_prompts enable row level security;
drop policy if exists "own ad_prompts" on public.ad_prompts;
create policy "own ad_prompts" on public.ad_prompts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- generated_ads: Stage-3 ad records (image bytes live in Storage; inserted by server).
create table if not exists public.generated_ads (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  ad_prompt_id uuid references public.ad_prompts(id) on delete set null,
  website_url  text,
  image_path   text not null,
  prompt       text,
  aspect_ratio text,
  resolution   text,
  performance  jsonb,
  created_at   timestamptz not null default now()
);
alter table public.generated_ads enable row level security;
drop policy if exists "own generated_ads read" on public.generated_ads;
create policy "own generated_ads read" on public.generated_ads
  for select using (auth.uid() = user_id);
drop policy if exists "own generated_ads delete" on public.generated_ads;
create policy "own generated_ads delete" on public.generated_ads
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

-- brand_assets: legacy user-uploaded product / UI / mockup images, saved per brand.
-- The active web app currently sends assets inline, but the admin deletion flow still
-- cleans this bucket for installs that used the earlier upload path.
create table if not exists public.brand_assets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  brand_id   uuid not null references public.brand_extractions(id) on delete cascade,
  image_path text not null,
  kind       text not null default 'product',
  label      text,
  created_at timestamptz not null default now()
);
alter table public.brand_assets enable row level security;
drop policy if exists "own brand_assets" on public.brand_assets;
create policy "own brand_assets" on public.brand_assets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('brand-assets', 'brand-assets', false)
on conflict (id) do nothing;

drop policy if exists "own brand-asset files read" on storage.objects;
create policy "own brand-asset files read" on storage.objects
  for select to authenticated using (
    bucket_id = 'brand-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "own brand-asset files write" on storage.objects;
create policy "own brand-asset files write" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'brand-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "own brand-asset files delete" on storage.objects;
create policy "own brand-asset files delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'brand-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
