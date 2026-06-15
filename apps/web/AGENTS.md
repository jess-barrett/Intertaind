# apps/web — Next.js 16 conventions

Read the root `AGENTS.md` first. Notes here are web-specific only.

## Next.js 16 specifics

- The CLAUDE.md warning is load-bearing: **APIs differ from training data**. When touching a Next-specific surface (params/cookies as Promises, after(), Server Actions, middleware, etc.), confirm against `node_modules/next/dist/docs/` before assuming.
- `proxy.ts` (formerly `middleware.ts` in older Next versions) refreshes Supabase auth on every request via `supabase.auth.getUser()`. Don't add a second auth refresh anywhere else.

## Server-action workflow

- Server actions auto-revalidate the calling route's Router Cache. **Default to not adding `router.refresh()` after an awaited server action** (see root AGENTS.md for the full rule).
- Read-only data fetchers used inside `useTransition` still count as server actions and still trigger revalidation. Use them sparingly in render loops.
- For server-side cache invalidation across routes, use `revalidatePath` / `revalidateTag` inside the action — not client-side refresh.

## Book search architecture (high-investment, don't undo without reading)

OpenLibrary is the **primary** search source; Google Books is a fallback. The decision was made because GB is edition-centric (one row per reissue → "Movie Tie-In" outranks the original) while OL is work-centric (one row per actual book). The full design is documented inline in `apps/web/src/app/api/search/route.ts` and the resolution pipeline in `apps/web/src/app/actions/media.ts`. Key invariants:

- Search results emit `external_ids: { openlibrary_work_id, isbn_13 }`. Enrichment later backfills `google_books_id` via ISBN.
- `resolveOLWorkToBook` is a **3-path resolver** (SR-ISBN → edition-ISBN → canonical title+author search). Each candidate runs through three gates (`gbVolumeMatchesAuthor`, `gbVolumeIsBundle`, `gbVolumeIsStub`). Skipping a gate has historically caused user-visible bugs (wrong cover, bundle description, wrong book entirely).
- OL cover contamination is real (multiple works share a `cover_i`). The search route detects this and nulls the lower-popularity victim's cover.
- If you find yourself patching a specific book's behavior — STOP. Find the general property; see the principled-fixes memory note.

## Activity feed gotcha

`activity_log.activity_type` is a Postgres ENUM (NOT free-text). Adding a new activity type means adding the enum value via migration BEFORE the server action that writes it. Pattern: see `supabase/migrations/010_activity_type_check.sql`, `016`, `027`. Skipping the enum bump fails the insert silently (the action's best-effort insert swallows the error) — symptom is "activity rows never appear".

## Patterns to follow

- Server data fetching: server components do the fetch directly. Server actions for mutations. Avoid client-side fetching of server data unless it's interactive (search, autocomplete).
- DB types: import row/insert/update shapes from `@intertaind/supabase` (`Tables<'media_items'>`, etc.). Use `@intertaind/types` only for hand-curated domain views.
- Component conventions: file-per-component in `src/components/`, kebab-case file names, default-exported main component, named-exported helpers/types. No barrel exports.
- Don't add comments that say "what" the code does — well-named identifiers already do that. Comments earn their keep by explaining "why" (the hidden constraint, the surprising decision).
