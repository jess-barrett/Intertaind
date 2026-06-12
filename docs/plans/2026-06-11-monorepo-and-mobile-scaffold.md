# Monorepo Conversion + Expo Mobile Scaffold Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use gli-toolkit:executing-plans to implement this plan task-by-task.

**Goal:** Restructure the Intertaind repo into a pnpm + Turborepo monorepo (`apps/web`, `apps/mobile`, shared `packages/`), preserving git history, and scaffold the Expo (React Native) mobile app with Supabase connectivity and a working Trending screen.

**Architecture:** The existing Next.js 16 app moves to `apps/web` via `git mv` (history preserved). Pure domain types and API-normalization code extract into `@intertaind/types` and `@intertaind/media` internal packages (TS-source packages, consumed via `transpilePackages`/Metro — no build step). The new Expo app talks to Supabase directly (RLS enforces security); external-API clients holding server secrets (TMDB/IGDB/Google Books fetchers) stay in `apps/web` and migrate to Supabase Edge Functions in a follow-up plan.

**Tech Stack:** pnpm workspaces, Turborepo, Next.js 16, Expo (latest SDK) + expo-router, NativeWind (Tailwind for RN), `@supabase/supabase-js`, Vitest (packages).

---

## Context for the implementer (zero-context summary)

- Repo: `/Users/jessbarrett/Projects/jess-barrett/intertaind`, branch `main`, clean tree, remote `github.com/jess-barrett/Intertaind`.
- Currently a single Next.js 16 app using **npm** (`package-lock.json`). pnpm is NOT installed yet. Node is v20.15.1.
- `supabase/migrations/` lives at repo root and STAYS at root (shared backend, not web-specific).
- **No test infrastructure exists.** This plan introduces Vitest only for `packages/media`.
- The Supabase table for media is `media_items`. User tracking is `user_media`. Profiles are `profiles`.
- **Secret-holding files (must NOT enter shared packages):** `src/lib/api/tmdb.ts`, `src/lib/api/igdb.ts`, `src/lib/api/google-books.ts`, `src/lib/api/hardcover.ts` use `process.env` server keys. Only their *pure URL-builder functions* move to `packages/media`.
- 78 files import `@/lib/types` — rewritten by sed in Task 6.
- **Next.js 16 warning (from AGENTS.md):** APIs may differ from training data. Before editing web code, read relevant guides in `apps/web/node_modules/next/dist/docs/` (after install, hoisted at root `node_modules/next/dist/docs/`).
- **Prerequisite (ask the human if missing):** no `.env.local` exists in the repo. You need `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` values (Supabase dashboard) for web dev and the mobile `.env` in Task 11.

**Verification model for Phase 1–2:** this is a restructure of an app with no tests, so "tests" are: `pnpm --filter web build` (type-checks all 150 files) plus the Vitest characterization tests added in Task 8. Run the build after every structural change.

---

## Phase 1: Monorepo Conversion

### Task 1: Install pnpm and create the working branch

**Step 1: Enable corepack and activate pnpm**

```bash
corepack enable && corepack prepare pnpm@latest --activate
pnpm --version
```
Expected: a version number (e.g. `10.x.y`). Record it — used in Task 3.

**Step 2: Create the branch**

```bash
cd /Users/jessbarrett/Projects/jess-barrett/intertaind
git checkout -b monorepo-restructure
```

Note: a git worktree is optional here; because this restructure moves every path in the repo, an in-place branch is acceptable.

### Task 2: Move the Next.js app to `apps/web`

**Files:**
- Move: `src/`, `public/`, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `eslint.config.mjs`, `package.json`, `README.md` → `apps/web/`
- Keep at root: `supabase/`, `AGENTS.md`, `CLAUDE.md`, `.gitignore`, `docs/`

**Step 1: Move with git mv (preserves history)**

```bash
mkdir -p apps/web
git mv src public next.config.ts tsconfig.json postcss.config.mjs eslint.config.mjs package.json README.md apps/web/
```

**Step 2: Rename the web package**

In `apps/web/package.json`, change `"name": "intertaind"` → `"name": "web"`. Leave everything else.

**Step 3: Update AGENTS.md**

Append to root `AGENTS.md`:

```markdown

## Monorepo layout
- `apps/web` — Next.js 16 web app
- `apps/mobile` — Expo (React Native) mobile app
- `packages/types` — shared domain types (`@intertaind/types`)
- `packages/media` — shared external-API types + normalization (`@intertaind/media`)
- `supabase/` — shared database migrations (and, later, Edge Functions)

Run apps from the root: `pnpm dev:web`, `pnpm dev:mobile`.
```

**Step 4: Commit**

```bash
git add -A && git commit -m "chore: move Next.js app to apps/web for monorepo"
```

### Task 3: Create workspace root files

**Files:**
- Create: `package.json` (root), `pnpm-workspace.yaml`, `turbo.json`, `.npmrc`
- Modify: `.gitignore`

**Step 1: Root `package.json`** (replace `<PNPM_VERSION>` with the exact version from Task 1):

```json
{
  "name": "intertaind",
  "private": true,
  "packageManager": "pnpm@<PNPM_VERSION>",
  "scripts": {
    "dev:web": "turbo run dev --filter=web",
    "dev:mobile": "turbo run dev --filter=mobile",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test"
  },
  "devDependencies": {
    "turbo": "^2"
  }
}
```

**Step 2: `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

**Step 3: `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**"]
    },
    "dev": { "cache": false, "persistent": true },
    "lint": {},
    "typecheck": {},
    "test": {}
  }
}
```

**Step 4: `.npmrc`** (hoisted linker — required for reliable Expo/Metro resolution in pnpm monorepos):

```
node-linker=hoisted
```

**Step 5: Update `.gitignore`** — change these root-anchored patterns to match nested apps, and add turbo/expo entries. Replace the lines `/node_modules`, `/.next/`, `/out/`, `/build`, `/coverage` with:

```
node_modules/
.next/
out/
build/
coverage/
.turbo/
.expo/
dist/
```

**Step 6: Commit**

```bash
git add -A && git commit -m "chore: add pnpm workspace + turborepo root config"
```

### Task 4: Switch to pnpm and verify the web app still builds

**Step 1: Remove npm artifacts and install**

```bash
rm -rf node_modules apps/web/node_modules
git rm apps/web/package-lock.json 2>/dev/null || git rm package-lock.json
pnpm install
```
Expected: lockfile `pnpm-lock.yaml` created at root, install succeeds.

**Step 2: Verify build (this is the regression test for the whole move)**

```bash
pnpm --filter web build
```
Expected: `✓ Compiled successfully` and static/dynamic route table. If module-resolution errors appear, fix paths — do NOT loosen tsconfig.

**Step 3: Verify dev server boots**

```bash
pnpm dev:web
```
Expected: serves on `http://localhost:3000`; Ctrl-C after confirming the home page compiles (needs the Supabase env vars — see prerequisite; put them in `apps/web/.env.local`).

**Step 4: Commit**

```bash
git add -A && git commit -m "chore: switch to pnpm, verify web build in monorepo"
```

---

## Phase 2: Shared Packages

### Task 5: Create `@intertaind/types`

**Files:**
- Create: `packages/types/package.json`, `packages/types/tsconfig.json`
- Move: `apps/web/src/lib/types.ts` → `packages/types/src/index.ts`

**Step 1: Scaffold the package**

```bash
mkdir -p packages/types/src
git mv apps/web/src/lib/types.ts packages/types/src/index.ts
```

`packages/types/package.json`:

```json
{
  "name": "@intertaind/types",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5"
  }
}
```

`packages/types/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true
  },
  "include": ["src"]
}
```

**Step 2: Typecheck the package**

```bash
pnpm install && pnpm --filter @intertaind/types typecheck
```
Expected: PASS (the file is pure type declarations with zero imports — verified).

### Task 6: Point web at `@intertaind/types`

**Files:**
- Modify: `apps/web/package.json`, `apps/web/next.config.ts`, ~78 files importing `@/lib/types`

**Step 1: Add the workspace dependency**

```bash
pnpm --filter web add "@intertaind/types@workspace:*"
```

**Step 2: Rewrite imports** (macOS sed):

```bash
grep -rl "@/lib/types" apps/web/src --include="*.ts" --include="*.tsx" | xargs sed -i '' 's|@/lib/types|@intertaind/types|g'
grep -r "@/lib/types" apps/web/src | wc -l
```
Expected: final count `0`.

**Step 3: Transpile workspace packages in Next** — `apps/web/next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@intertaind/types", "@intertaind/media"],
};

export default nextConfig;
```

(Confirm `transpilePackages` is still the Next 16 option name in `node_modules/next/dist/docs/` per AGENTS.md.)

**Step 4: Verify**

```bash
pnpm --filter web build
```
Expected: builds clean.

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: extract @intertaind/types shared package"
```

### Task 7: Create `@intertaind/media` (external-API types + pure normalization)

**Files:**
- Create: `packages/media/package.json`, `packages/media/tsconfig.json`, `packages/media/src/index.ts`, `packages/media/src/images.ts`
- Move: `apps/web/src/lib/api/types.ts` → `packages/media/src/types.ts`; `apps/web/src/lib/api/normalize.ts` → `packages/media/src/normalize.ts`
- Modify: `apps/web/src/lib/api/tmdb.ts`, `igdb.ts`, `google-books.ts`, `openlibrary.ts`, and the 5 web files importing `lib/api/normalize|types` (`src/app/entity/[type]/[id]/page.tsx`, `src/app/actions/media.ts`, `src/app/api/search/route.ts`, `src/app/debug/books/page.tsx`, `src/components/media/filmography-list.tsx`)

**Step 1: Scaffold** — copy `package.json`/`tsconfig.json` from `packages/types` pattern, name `@intertaind/media`, plus dependency `"@intertaind/types": "workspace:*"`.

**Step 2: Move the pure modules**

```bash
mkdir -p packages/media/src
git mv apps/web/src/lib/api/types.ts packages/media/src/types.ts
git mv apps/web/src/lib/api/normalize.ts packages/media/src/normalize.ts
```

**Step 3: Create `packages/media/src/images.ts`** — move these functions VERBATIM out of the web client files (cut from source, paste here; they are pure URL builders, no env access):
- `tmdbImageUrl` from `apps/web/src/lib/api/tmdb.ts` (line ~126)
- `bookCoverUrl` from `apps/web/src/lib/api/google-books.ts` (line ~466) — it takes `GoogleBooksVolume`; import that from `./types`
- `igdbImageUrl` from `apps/web/src/lib/api/igdb.ts` (line ~94)

Verify purity after the move:

```bash
grep -n "process.env" packages/media/src/*.ts
```
Expected: no output.

**Step 4: Move `OLBookSearchDoc`** — cut the `OLBookSearchDoc` interface (line ~302 of `apps/web/src/lib/api/openlibrary.ts`) into `packages/media/src/types.ts`; in `openlibrary.ts` replace it with `import type { OLBookSearchDoc } from "@intertaind/media";` plus a re-export if other web files import it from there (check: `grep -rn "OLBookSearchDoc" apps/web/src`).

**Step 5: Fix `packages/media/src/normalize.ts` imports** — change the header to:

```ts
import type { SearchResult } from "@intertaind/types";
import type {
  TMDBMovie,
  TMDBTVShow,
  GoogleBooksVolume,
  IGDBGame,
  OLBookSearchDoc,
} from "./types";
import { tmdbImageUrl, bookCoverUrl, igdbImageUrl } from "./images";
```

**Step 6: `packages/media/src/index.ts`**

```ts
export * from "./types";
export * from "./normalize";
export * from "./images";
```

**Step 7: Rewire web** — in the web client files, import the moved URL builders from `@intertaind/media` (and delete any now-duplicate local definitions); rewrite the 5 importing files:

```bash
pnpm --filter web add "@intertaind/media@workspace:*"
grep -rl "lib/api/normalize\|lib/api/types" apps/web/src --include="*.ts*" | xargs sed -i '' -e 's|@/lib/api/normalize|@intertaind/media|g' -e 's|@/lib/api/types|@intertaind/media|g'
```
Then hand-check the 4 client files (`tmdb.ts`, `igdb.ts`, `google-books.ts`, `openlibrary.ts`) compile — they previously exported the moved functions; keep `export { tmdbImageUrl } from "@intertaind/media";`-style re-exports ONLY if other web files still import them from the old location (check with grep; prefer updating the importers).

**Step 8: Verify + commit**

```bash
pnpm --filter web build && pnpm --filter @intertaind/media typecheck
git add -A && git commit -m "feat: extract @intertaind/media package (API types, normalize, image URLs)"
```

### Task 8: Characterization tests for `@intertaind/media` (Vitest)

**Files:**
- Create: `packages/media/src/normalize.test.ts`
- Modify: `packages/media/package.json`

**Step 1: Add Vitest**

```bash
pnpm --filter @intertaind/media add -D vitest
```
Add to `packages/media/package.json` scripts: `"test": "vitest run"`.

**Step 2: Write the failing-then-passing characterization test.** Start from this skeleton, then READ `normalize.ts` and extend with one test per normalizer (`normalizeTMDBTVShow`, `normalizeGoogleBooksVolume`, `normalizeIGDBGame`, the OpenLibrary one) asserting the fields each actually maps — these document current behavior, so assert what the code DOES:

```ts
import { describe, expect, it } from "vitest";
import { normalizeTMDBMovie } from "./normalize";
import type { TMDBMovie } from "./types";

describe("normalizeTMDBMovie", () => {
  const raw: TMDBMovie = {
    id: 603,
    title: "The Matrix",
    overview: "A hacker learns the truth.",
    poster_path: "/poster.jpg",
    backdrop_path: "/backdrop.jpg",
    release_date: "1999-03-31",
    genre_ids: [28, 878],
  } as TMDBMovie; // cast: fill any further required fields from the real type

  it("maps core fields and builds TMDB image URLs", () => {
    const result = normalizeTMDBMovie(raw);
    expect(result.media_type).toBe("movie");
    expect(result.title).toBe("The Matrix");
    expect(result.cover_image_url).toBe("https://image.tmdb.org/t/p/w500/poster.jpg");
    expect(result.backdrop_url).toBe("https://image.tmdb.org/t/p/original/backdrop.jpg");
    expect(result.release_date).toBe("1999-03-31");
  });

  it("nulls empty descriptions", () => {
    expect(normalizeTMDBMovie({ ...raw, overview: "" }).description).toBeNull();
  });

  it("nulls cover when poster_path is null", () => {
    expect(normalizeTMDBMovie({ ...raw, poster_path: null }).cover_image_url).toBeNull();
  });
});
```

**Step 3: Run**

```bash
pnpm --filter @intertaind/media test
```
Expected: all tests PASS (fix the test, not the code, on mismatch — these pin existing behavior).

**Step 4: Commit**

```bash
git add -A && git commit -m "test: characterization tests for media normalization"
```

---

## Phase 3: Expo Mobile Scaffold

### Task 9: Scaffold the Expo app

**Step 1: Create the app (latest SDK, default template includes expo-router + TypeScript)**

```bash
cd /Users/jessbarrett/Projects/jess-barrett/intertaind
pnpm create expo-app@latest apps/mobile --template default
```

**Step 2: Make it a workspace member** — in `apps/mobile/package.json` set `"name": "mobile"`. Delete any nested `.git`/lockfile the generator created (`rm -rf apps/mobile/.git apps/mobile/package-lock.json apps/mobile/pnpm-lock.yaml`). Then:

```bash
pnpm install
```

**Step 3: Verify Metro boots in the monorepo** (modern Expo auto-detects monorepo roots; if module resolution fails, consult Expo's "Work with monorepos" guide before hand-rolling metro config):

```bash
pnpm --filter mobile exec expo start
```
Expected: QR code + Metro waiting. Press `i` for iOS simulator if available; confirm the template screen renders. Ctrl-C.

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: scaffold Expo mobile app (apps/mobile)"
```

### Task 10: Supabase client for mobile

**Files:**
- Create: `apps/mobile/lib/supabase.ts`, `apps/mobile/.env`

**Step 1: Install deps (expo install picks SDK-compatible versions)**

```bash
pnpm --filter mobile add @supabase/supabase-js
pnpm --filter mobile exec npx expo install @react-native-async-storage/async-storage react-native-url-polyfill
```

**Step 2: `apps/mobile/.env`** (values from the human / Supabase dashboard; `.env*` is already gitignored):

```
EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

**Step 3: `apps/mobile/lib/supabase.ts`**

```ts
import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
```

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: mobile Supabase client with AsyncStorage session persistence"
```

### Task 11: NativeWind (Tailwind styling parity with web)

**Step 1: Install per current NativeWind docs** (check latest setup — versions move):

```bash
pnpm --filter mobile exec npx expo install nativewind tailwindcss react-native-reanimated react-native-safe-area-context
```

**Step 2: Configure** — follow the official NativeWind + Expo Router setup (tailwind.config.js `content` covering `app/**` and `components/**`, `global.css` with the tailwind directives imported in the root `_layout.tsx`, babel preset, `withNativeWind` metro wrapper). Verify by setting `className="text-red-500"` on the template screen text and seeing red text.

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: NativeWind styling for mobile"
```

### Task 12: Trending screen (proves Supabase + shared types end-to-end)

**Files:**
- Modify: `apps/mobile/package.json` (add `"@intertaind/types": "workspace:*"`), the index route screen (template puts it at `app/(tabs)/index.tsx`)

**Step 1: Add the shared types dep**

```bash
pnpm --filter mobile add "@intertaind/types@workspace:*"
```

**Step 2: Replace the index screen**

```tsx
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, Text, View } from "react-native";
import type { MediaItem } from "@intertaind/types";
import { supabase } from "@/lib/supabase";

type TrendingItem = Pick<
  MediaItem,
  "id" | "title" | "cover_image_url" | "media_type" | "avg_rating"
>;

export default function TrendingScreen() {
  const [items, setItems] = useState<TrendingItem[] | null>(null);

  useEffect(() => {
    supabase
      .from("media_items")
      .select("id, title, cover_image_url, media_type, avg_rating")
      .order("tracking_count", { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (error) console.error(error);
        setItems((data as TrendingItem[]) ?? []);
      });
  }, []);

  if (!items) return <ActivityIndicator className="flex-1" />;

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      className="flex-1 bg-neutral-950"
      renderItem={({ item }) => (
        <View className="flex-row items-center gap-3 px-4 py-2">
          {item.cover_image_url && (
            <Image
              source={{ uri: item.cover_image_url }}
              className="h-20 w-14 rounded"
            />
          )}
          <View className="flex-1">
            <Text className="text-base font-semibold text-white">{item.title}</Text>
            <Text className="text-sm text-neutral-400">
              {item.media_type} · {item.avg_rating ?? "—"}
            </Text>
          </View>
        </View>
      )}
    />
  );
}
```

(If the `@/` alias isn't configured in the template's tsconfig, use a relative import for `lib/supabase`. Adjust the `Pick` fields if `MediaItem` names differ — check `packages/types/src/index.ts`.)

**Step 3: Verify on simulator**

```bash
pnpm --filter mobile exec expo start
```
Expected: Trending list renders real `media_items` rows with covers. This proves: monorepo resolution of `@intertaind/types` through Metro, Supabase anon read under RLS, NativeWind classes.

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: mobile trending screen via Supabase + shared types"
```

### Task 13: Typecheck wiring + final verification

**Step 1: Add typecheck scripts** — in `apps/web/package.json` and `apps/mobile/package.json` add `"typecheck": "tsc --noEmit"`.

**Step 2: Full pipeline**

```bash
pnpm typecheck && pnpm build && pnpm --filter @intertaind/media test
```
Expected: all green.

**Step 3: Commit and stop for review**

```bash
git add -A && git commit -m "chore: monorepo typecheck wiring"
```

Do NOT merge to `main` without the human reviewing the running web app (`pnpm dev:web` — click through home, a media page, a profile) and the mobile Trending screen. Use gli-toolkit:finishing-a-development-branch for merge/PR.

---

## Phase 4 (DEFERRED — follow-up plan): External-API layer → Supabase Edge Functions

Not in scope here; recorded so the architecture intent isn't lost:

- Port search + metadata enrichment (`apps/web/src/app/api/search/route.ts`, TMDB/IGDB/Google Books/OpenLibrary/Wikidata clients) to Supabase Edge Functions under `supabase/functions/`, with secrets in Supabase config — IGDB's Twitch OAuth token flow is the forcing function (mobile can never hold that secret).
- Both web and mobile then consume the same functions; web's API routes become thin wrappers or are deleted.
- The pure types/normalization they need already live in `@intertaind/media` after this plan — Edge Functions (Deno) can import them via relative path or npm specifier; decide in that plan.
- Trigger: when mobile needs search/ingestion (next mobile milestone).
