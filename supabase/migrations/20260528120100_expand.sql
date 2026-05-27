-- Expand: additive columns only (safe on populated tables).
alter table public.brands add column if not exists measured_site_data jsonb;
alter table public.ads   add column if not exists performance        jsonb;
