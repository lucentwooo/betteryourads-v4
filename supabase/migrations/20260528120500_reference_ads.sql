-- Curated reference-ad libraries. Two variants: references built around a product asset, and
-- references that don't use one. Rows are written only by the admin endpoints via the
-- service-role key, and read back through the service-role client, so RLS is left with no
-- policies (service role bypasses RLS; anon/auth clients get no direct access).
create table if not exists public.reference_ads (
  id           uuid primary key default gen_random_uuid(),
  variant      text not null check (variant in ('with_asset', 'no_asset')),
  label        text,
  storage_path text not null,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
alter table public.reference_ads enable row level security;

-- Private bucket for the reference images (idempotent).
insert into storage.buckets (id, name, public)
values ('reference-ads', 'reference-ads', false)
on conflict (id) do nothing;
