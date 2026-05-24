create extension if not exists pgcrypto;

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null,
  business_type text,
  logo_path text,
  brand_vibe text,
  brand_vibe_note text,
  color_primary text, color_secondary text, color_accent text,
  color_background text, color_text text,
  extraction_json jsonb not null,
  created_at timestamptz not null default now()
);

create table public.concepts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  awareness_stage text,            -- reserved for post-MVP; left null
  name text, headline text, subheadline text, cta text,
  angle text, hook text, proof_point text, visual_metaphor text,
  suggested_layout text, rationale text,
  raw jsonb,
  created_at timestamptz not null default now()
);
create index concepts_brand_idx on public.concepts(brand_id);

create table public.batches (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  inspiration_image_path text,
  status text not null default 'running' check (status in ('running','done','partial')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index batches_brand_idx on public.batches(brand_id, created_at desc);

create table public.creatives (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  concept_id uuid references public.concepts(id) on delete set null,
  status text not null default 'generating' check (status in ('generating','done','failed')),
  state text not null default 'inbox' check (state in ('inbox','kept','dismissed')),
  stage2_prompt jsonb,
  image_path text,
  aspect_ratio text, resolution text,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index creatives_brand_idx on public.creatives(brand_id, state, created_at desc);
create index creatives_batch_idx on public.creatives(batch_id);
