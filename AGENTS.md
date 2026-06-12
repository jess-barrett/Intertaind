<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Monorepo layout
- `apps/web` — Next.js 16 web app
- `apps/mobile` — Expo (React Native) mobile app
- `packages/types` — shared domain types (`@intertaind/types`)
- `packages/media` — shared external-API types + normalization (`@intertaind/media`)
- `supabase/` — shared database migrations (and, later, Edge Functions)

Run apps from the root: `pnpm dev:web`, `pnpm dev:mobile`.
