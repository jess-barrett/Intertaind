# packages/design-system — canonical design tokens

Read the root `AGENTS.md` first.

## Hard rules

- **`src/tokens.cjs` is the single source of truth** for every cross-app design token. Edit this first.
- **`apps/web/src/app/globals.css` mirrors these values** as `:root` CSS variables (Tailwind 4 is CSS-first and can't import a JS object). Web-side edits to the variable values without matching changes in `tokens.cjs` are a drift bug.
- **`src/tokens.test.ts` is the drift guard.** It parses `globals.css`, extracts every `--<token>: <hex>;` line, and asserts byte-for-byte equality with the TS object. Runs as part of `pnpm test` and `pnpm ci`. Failing test = real bug, not a flake.

## Workflow for adding or changing a token

1. Edit `src/tokens.cjs` — add the new key or change the hex.
2. Mirror the same change in `apps/web/src/app/globals.css`:
   - Add a `--token-name: #HEXVALUE;` line inside the `:root` block.
3. Run `pnpm --filter @intertaind/design-system test` — should pass.
4. New tokens are automatically available on mobile (NativeWind picks them up via `apps/mobile/tailwind.config.js` which imports `tokens.cjs`).
5. On web, new tokens are available immediately after globals.css edit — the `@theme inline` block at the bottom of globals.css maps `:root` vars to Tailwind utilities (e.g., `--accent-book` → `bg-accent-book`, `text-accent-book`).

## Naming

Keys are kebab-case Tailwind utility suffixes. `accent-book` → `bg-accent-book` / `text-accent-book` / `border-accent-book` in both apps' className output.

## Why a CJS file and not pure TS

Tailwind's config loader runs in raw Node at build time — it can `require()` CommonJS but can't load TypeScript without a transpile step. Using `.cjs` for the runtime data avoids that machinery. `src/tokens.ts` is a thin TypeScript wrapper for type-aware consumers — it `require()`s from the same `.cjs` so both consumers share one module instance.

## What lives here

- `src/tokens.cjs` — canonical runtime data, CommonJS
- `src/tokens.ts` — TypeScript typed wrapper around `tokens.cjs`
- `src/tokens.test.ts` — drift guard against `apps/web/src/app/globals.css`
- `src/index.ts` — package entry, re-exports from `tokens.ts`

## Future expansion

When the design system grows beyond colors (typography scale, spacing tokens, shadow tokens, radii), add them here under similar dual-source rules. The drift test should grow to cover any new categories that the web globals.css mirrors.
