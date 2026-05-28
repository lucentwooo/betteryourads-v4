-- Concept sets (one per brand) + batch jobs/items for multi-concept generation.
-- Asset images are NOT stored (held in the worker's memory); rows track status + links.

create table if not exists public.ad_concept_sets (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  brand_extraction_id uuid not null references public.brand_extractions(id) on delete cascade,
  concept_set         jsonb not null,
  model               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, brand_extraction_id)
);
alter table public.ad_concept_sets enable row level security;
drop policy if exists "own ad_concept_sets" on public.ad_concept_sets;
create policy "own ad_concept_sets" on public.ad_concept_sets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.batch_jobs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  brand_extraction_id uuid references public.brand_extractions(id) on delete set null,
  status              text not null check (status in ('queued','running','done','error')),
  total               int not null,
  created_at          timestamptz not null default now()
);
alter table public.batch_jobs enable row level security;
drop policy if exists "own batch_jobs" on public.batch_jobs;
create policy "own batch_jobs" on public.batch_jobs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.batch_items (
  id              uuid primary key default gen_random_uuid(),
  batch_id        uuid not null references public.batch_jobs(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  idea_number     int,
  idea_name       text,
  status          text not null check (status in ('queued','running','done','error')),
  generated_ad_id uuid references public.generated_ads(id) on delete set null,
  error           text,
  created_at      timestamptz not null default now()
);
alter table public.batch_items enable row level security;
drop policy if exists "own batch_items" on public.batch_items;
create policy "own batch_items" on public.batch_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists batch_items_batch_id_idx on public.batch_items(batch_id);
