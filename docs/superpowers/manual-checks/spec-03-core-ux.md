# Manual checks — Spec #3 (Core UX)

## Schema / migrations
- None.

## Environment variables
- None new.

## Click-through smoke (verify manually)
- **Onboarding** (`/onboarding`): URL → analyzing → goal. The **Back** button returns to the URL
  step with the typed URL retained, on both the analyzing and goal steps. Picking a goal lands on
  `/board/<brandId>`.
- **Cog → sign-out**: the rail footer cog opens a popover with the email + Sign out; closes on
  outside-click / Escape; Sign out works.
- **Start modal**: rail "Make an ad" opens "Which brand?" → pick a saved brand → `/board/<id>`, or
  "Add a new client" → `/onboarding`. Rail "Your brands" lists saved brands → board.
- **Workbench** (`/create`): reached by selecting concepts on a board and pressing Next. Shows one
  asset card per selected concept (ref + logo required, product optional); "Make my ads" runs the
  batch; a toast "Your ads are ready" appears when done. Visiting `/create` directly with no board
  selection shows an empty state linking home.

## Behavior changes to be aware of
- The old in-workbench concept generation and the raw-URL→analyze path are **gone**; concepts now
  come from the board (reached via onboarding or the start modal).
- The old `/api/concepts` route + `ConceptSet`/`AdIdea` types were deleted.

## Not done in this spec (deferred)
- **Library grouping by brand** → Spec #5 (needs ad→brand linkage).
- **Full pixel-perfect legacy restyle** — the app uses the legacy token/class system and is
  structurally faithful, but a detailed visual parity pass was not done; flag if you want it.
- **`react-router-dom` dependency removal** → deferred to Spec #6 (the orphaned `ReferenceAdsAdmin`
  + its test still import it; reference-ads is rebuilt in #6).
