-- Rename: Postgres preserves data, FKs, and indexes across a table rename. RLS policy
-- rows are preserved too, but we drop+recreate them under clearer names (ALTER POLICY
-- ... RENAME TO is Postgres 16+ only; drop+create works on every version and is idempotent).
alter table public.brands rename to brand_extractions;
alter table public.ads    rename to generated_ads;

drop policy if exists "own brands" on public.brand_extractions;
create policy "own brand_extractions" on public.brand_extractions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own ads read" on public.generated_ads;
create policy "own generated_ads read" on public.generated_ads
  for select using (auth.uid() = user_id);

drop policy if exists "own ads delete" on public.generated_ads;
create policy "own generated_ads delete" on public.generated_ads
  for delete using (auth.uid() = user_id);
