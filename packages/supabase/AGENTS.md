# packages/supabase — generated database types

Read the root `AGENTS.md` first.

## Hard rules

- **`src/database.types.ts` is auto-generated. DO NOT hand-edit.** It's reproduced from the live Supabase schema by `pnpm gen:types`. Any hand-edit gets overwritten the next time someone regenerates.
- **Commit the regenerated file** alongside any migration that changed the schema. Don't push a migration without its types update — the apps won't typecheck until they're regenerated.

## Workflow

1. Write a new migration under `supabase/migrations/`.
2. Push the migration to the linked project (e.g., `pnpm exec supabase db push` if you go that route, or apply via the dashboard).
3. From repo root: `pnpm gen:types`. This writes the regenerated types into `src/database.types.ts`.
4. Commit both the migration AND the types update in the same commit.

## What lives here

- `src/database.types.ts` — generated. Untouched by humans.
- `src/index.ts` — hand-written helper types that wrap `database.types.ts`:
  - `Tables<'media_items'>` — row shape (what `.select()` returns)
  - `TablesInsert<'media_items'>` — insert payload shape
  - `TablesUpdate<'media_items'>` — partial-update payload shape
  - `Views<'view_name'>` — view row shape
  - `Enums<'tracking_status'>` — enum value union
  - `Database` — raw export, for `createClient<Database>(...)`

These names match Supabase's own docs/SDK conventions, so guides from supabase.com translate directly.

## Why this lives separately from `@intertaind/types`

`@intertaind/types` is hand-curated **domain types** — the application's mental model of what an entity looks like. `@intertaind/supabase` is generated **schema types** — the raw row shape from Postgres.

These have different update cadences and different ownership. Mixing them in one package creates a refactoring trap when the database evolves faster than the domain layer (or vice versa). Keep them separate.

When it makes sense, domain types in `@intertaind/types` can derive FROM the generated schema types here — but the derivation is explicit and reviewed, not implicit.
