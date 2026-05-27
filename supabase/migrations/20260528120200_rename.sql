-- Rename: Postgres preserves data, FKs, indexes, and RLS policies across a table
-- rename. We only update the table names and the policy names for clarity.
alter table public.brands rename to brand_extractions;
alter table public.ads    rename to generated_ads;

alter policy "own brands"    on public.brand_extractions rename to "own brand_extractions";
alter policy "own ads read"  on public.generated_ads     rename to "own generated_ads read";
alter policy "own ads delete" on public.generated_ads    rename to "own generated_ads delete";
