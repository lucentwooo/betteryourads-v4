-- Backfill: existing brands.analysis already IS brand JSON; stamp schema_version
-- so tolerant zod parsing treats old rows as v1. Rows that already have it are skipped.
update public.brand_extractions
set analysis = jsonb_set(analysis, '{schema_version}', '1'::jsonb, true)
where analysis is not null
  and not (analysis ? 'schema_version');
