-- New table for the structured Stage-2 output, plus a link column on generated_ads.
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

alter table public.generated_ads
  add column if not exists ad_prompt_id uuid references public.ad_prompts(id) on delete set null;
