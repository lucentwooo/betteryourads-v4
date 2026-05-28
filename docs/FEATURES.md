# Features

What BetterYourAds can do, as of the `dev` branch. Grouped by area; one line per feature.

> **Keep this current.** When a large feature lands, add a line here. When a feature is removed from the code, remove its line here too. See the maintenance note in `CLAUDE.md`.

## Core pipeline (URL → ad creative)

- **Extract (Stage 1)** — Playwright headless Chromium reads exact colors, fonts, logos, and text off a live website.
- **Brand (Stage 1)** — OpenRouter LLM turns measured site data into structured brand DNA (identity, value prop, positioning, tone, visual guidelines).
- **Ad prompt (Stage 2)** — vision model synthesizes brand DNA + optional reference ad / logo / product image / user direction into a structured image-generation prompt.
- **Render (Stage 3)** — KIE GPT-Image backend generates the ad image and persists it to Supabase Storage.

## Backend API (`apps/backend`, all gated by `requireApprovedUser`)

- `POST /api/extract` — run the extract stage on a website URL.
- `POST /api/brand` — turn measured site data into brand DNA.
- `POST /api/ad-prompt` — build an image-generation prompt from brand DNA + optional assets.
- `POST /api/render` — render an ad image and save it to storage.
- `GET /api/usage` — daily creative usage (admin unlimited; users capped per day, resets at UTC midnight).
- `GET /api/config` — backend config: model names, API readiness, Supabase URLs.
- `GET /api/health` — health check.
- `GET /api/brands` / `GET /api/brand/:id` — list saved brand extractions; fetch one with its measured data + generated ads.
- `GET /api/ads` — list the user's generated ads.

## Admin API (`requireApprovedUser` + admin gate)

- `GET /api/admin/users` — list all accounts (email, approval, admin flag, join date, last sign-in).
- `PATCH /api/admin/users/:id/approval` — approve / revoke a user (can't self-modify).
- `DELETE /api/admin/users/:id` — permanently delete an account and its data (can't self-delete).

## Auth & access control

- **Email + password auth** — sign-in, sign-up, and password reset via Supabase Auth (magic link removed).
- **Approval workflow** — anyone can sign up, but API routes stay locked until an admin approves the account.
- **Admin gate** — admin-only routes restricted to the designated admin account.
- **Daily creative limit** — non-admin users capped at N renders per UTC day; admin uncapped.
- **`AUTH_BYPASS`** — env-gated bypass for local development (temporary scaffolding).

## Web frontend (`apps/web`)

- **Home `/`** — dashboard: user email, saved-brand and ad counts, recent ad thumbnails, quick link to create.
- **Create `/create`** — 3-step workbench: paste URL (extract + brand) → upload reference ad / logo / optional product image → generate (ad-prompt + render) with download link.
- **Library `/library`** — grid of generated ads with date, aspect ratio, and resolution.
- **Admin `/admin`** — account table with one-click approve/revoke and type-to-confirm delete.
- **Brand preset** — workbench can preload a saved brand via `?brandId=<id>`, skipping the extract/brand steps.

## Shared package (`@bya/shared`)

- Zod schemas shared by backend and web: `MeasuredSiteData`, `BrandExtraction`, `AdPrompt`, `RenderOutput`, plus library/admin DTOs (`BrandSummary`, `BrandDetail`, `AdSummary`, `AdminUser`).

## CLI scripts (`apps/backend`, run with `-w @bya/backend`)

- `run:extract`, `run:brand`, `run:ad-prompt`, `run:render` — run a single pipeline stage from the CLI.
- `create-admin` — bootstrap the first admin account (creates auth user, approves, grants admin flag).

## Infrastructure & integrations

- **Supabase** — Auth (JWT), Postgres (`profiles`, `brand_extractions`, `ad_prompts`, `generated_ads`) with RLS, and a private `ads` storage bucket.
- **OpenRouter** — Stage 1 / Stage 2 models, configurable via env.
- **KIE** — image-generation backend for Stage 3.
- **Playwright** — headless Chromium for website extraction.
- **Env-driven config** — backends and models selected via env; `/api/config` reports readiness.
