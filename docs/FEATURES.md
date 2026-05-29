# Features

What BetterYourAds can do, as of the `dev` branch. Grouped by area; one line per feature.

> **Keep this current.** When a large feature lands, add a line here. When a feature is removed from the code, remove its line here too. See the maintenance note in `CLAUDE.md`.

## Core pipeline (URL → ad creative)

- **Extract (Stage 1)** — Playwright headless Chromium reads exact colors, fonts, logos, and text off a live website.
- **Brand (Stage 1)** — OpenRouter LLM turns measured site data into structured brand DNA (identity, value prop, positioning, tone, visual guidelines).
- **Concepts** — text model (`STAGE3_MODEL`) turns brand DNA into 5 strategic ad concepts, one per customer awareness level, with hooks, CTAs, and visual direction.
- **Ad prompt (Stage 2)** — vision model synthesizes brand DNA + optional reference ad / logo / product image / user direction into a structured image-generation prompt.
- **Render (Stage 3)** — KIE GPT-Image backend generates the ad image and persists it to Supabase Storage.
- **Batch generation** — pick multiple concepts, attach per-concept assets, and render them all as a background job with per-item live status.

## Backend API (`apps/backend`, all gated by `requireApprovedUser`)

- `POST /api/extract` — run the extract stage on a website URL.
- `POST /api/brand` — turn measured site data into brand DNA.
- `POST /api/concepts` — generate 5 strategic ad concepts from brand DNA and persist them per brand.
- `POST /api/ad-prompt` — build an image-generation prompt from brand DNA + optional assets.
- `POST /api/render` — render an ad image and save it to storage.
- `POST /api/batch` — start a background batch render of selected concepts (one creative per concept, capped by the daily limit).
- `GET /api/batch/:id` — poll a batch's per-item status and signed image URLs.
- `GET /api/usage` — daily creative usage (admin unlimited; users capped per day, resets at UTC midnight).
- `GET /api/config` — backend config: model names, API readiness, Supabase URLs.
- `GET /api/health` — health check.
- `GET /api/brands` / `GET /api/brand/:id` — list saved brand extractions; fetch one with its measured data + generated ads.
- `GET /api/ads` — list the user's generated ads.
- `GET /api/reference-ads?variant=` — list curated reference ads for a variant (`with_asset` / `no_asset`), each with a signed URL.

## Admin API (`requireApprovedUser` + admin gate)

- `GET /api/admin/users` — list all accounts (email, approval, admin flag, join date, last sign-in).
- `PATCH /api/admin/users/:id/approval` — approve / revoke a user (can't self-modify).
- `DELETE /api/admin/users/:id` — permanently delete an account and its data (can't self-delete).
- `POST /api/admin/reference-ads` / `DELETE /api/admin/reference-ads/:id` — upload / remove a curated reference ad.

## Auth & access control

- **Email + password auth** — sign-in, sign-up, and password reset via Supabase Auth (magic link removed).
- **Approval workflow** — anyone can sign up, but API routes stay locked until an admin approves the account.
- **Admin gate** — admin-only routes restricted to the designated admin account.
- **Daily creative limit** — non-admin users capped at N renders per UTC day; admin uncapped.
- **`AUTH_BYPASS`** — env-gated bypass for local development (temporary scaffolding).

## Web frontend (`apps/web`)

- **SSR app shell** — the web app is server-rendered (Next.js App Router) and hydrates on the client; a hand-rolled stale-while-revalidate client cache makes Home/Library render instantly on revisit instead of a spinner per navigation.
- **Home `/`** — dashboard: user email, saved-brand and ad counts, recent ad thumbnails, quick link to create.
- **Create `/create`** — 4-step workbench: paste URL (extract + brand) → pick from 5 generated concepts (multi-select, capped at the daily limit) → add a reference ad (upload or pick from a curated library that auto-switches on product-asset presence) / logo / optional product per concept → batch-generate with a live results gallery and per-ad downloads.
- **Library `/library`** — grid of generated ads with date, aspect ratio, and resolution.
- **Admin `/admin`** — account table with one-click approve/revoke and type-to-confirm delete.
- **Admin `/admin/reference-ads`** — manage the two curated reference libraries (with-asset / no-asset): upload, label, and delete thumbnails.
- **Brand preset** — workbench can preload a saved brand via `?brandId=<id>`, skipping the extract/brand steps.

## Shared package (`@bya/shared`)

- Zod schemas shared by backend and web: `MeasuredSiteData`, `BrandExtraction`, `AdPrompt`, `RenderOutput`, `ConceptSet` / `AdIdea`, plus library/admin DTOs (`BrandSummary`, `BrandDetail`, `AdSummary`, `AdminUser`, `ReferenceAd`).

## CLI scripts (`apps/backend`, run with `-w @bya/backend`)

- `run:extract`, `run:brand`, `run:ad-prompt`, `run:render` — run a single pipeline stage from the CLI.
- `create-admin` — bootstrap the first admin account (creates auth user, approves, grants admin flag).

## Infrastructure & integrations

- **Supabase** — Auth (JWT), Postgres (`profiles`, `brand_extractions`, `ad_prompts`, `generated_ads`, `ad_concept_sets`, `batch_jobs`, `batch_items`, `reference_ads`) with RLS, and private `ads` + `reference-ads` storage buckets.
- **OpenRouter** — Stage 1 / Stage 2 / Stage 3 (concepts) models, configurable via env.
- **KIE** — image-generation backend for Stage 3.
- **Playwright** — headless Chromium for website extraction.
- **Env-driven config** — backends and models selected via env; `/api/config` reports readiness.
