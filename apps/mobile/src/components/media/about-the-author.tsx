/**
 * About-the-author block for the media detail screen (book only) — the
 * RN counterpart to web's `AboutTheAuthor` (apps/web/src/components/media/
 * about-the-author.tsx).
 *
 * IMPORTANT DIVERGENCE FROM WEB — no client-side enrichment. Web's
 * `AboutTheAuthor` is an async Server Component that fetches the author's
 * bio + photo + birth/death dates from Open Library server-side (using
 * server secrets / server-only fetch), then renders a rich card. Mobile
 * has no server context here and MUST NOT make client-side external API
 * calls, so this component renders ONLY what already lives in the book's
 * `metadata`.
 *
 * Metadata shape (verified against web + @intertaind/media normalize):
 *   metadata.authors: string[]   // names only — this is ALL that's stored
 * The normalized book record (packages/media/src/normalize.ts) carries
 * `authors: string[]` and nothing else about the author — no bio, no
 * photo, no OLID/dates. So mobile shows just the primary author's NAME
 * block (`metadata.authors[0]`). The `bio` / `photo` branches below are
 * written defensively (rendered IF present in metadata) so that if a
 * future enrichment step ever writes author bio/photo INTO `metadata`,
 * this component surfaces it with no further change — but today those
 * fields are absent and only the name renders.
 *
 * FOLLOW-UP (documented): full author enrichment (bio / photo / birth &
 * death dates) + a dedicated author detail screen is a separate piece of
 * work. Web sources that from Open Library server-side; the mobile
 * equivalent needs a Supabase Edge Function (the deferred search/
 * enrichment endpoint — see apps/mobile/AGENTS.md "Deferred items") so the
 * external call keeps its server secret off-device, plus an `author`
 * route. Out of scope for this task.
 *
 * Per-type gating + graceful empty: renders `null` for any non-book type,
 * when `metadata` is absent, or when there's no author name — so no
 * "About the author" heading is ever shown over nothing (locked design
 * grammar: no empty headings).
 *
 * Visual language mirrors web: dark + neon, a "About the author" section
 * heading over an author row (square photo slot + name). Design tokens
 * only — the fallback icon colors via the `color` prop (react-native-svg)
 * from the `colors` object, never a raw hex.
 */
import { Text, View } from "react-native";
import { User } from "lucide-react-native";
import { colors } from "@intertaind/design-system";
import type { Tables } from "@intertaind/supabase";

import { Image } from "@/components/image";
import { SectionHeading } from "@/components/media/section-heading";
import { asArray } from "@/lib/metadata";

/** Square author-photo slot in pt — web's `w-28` aspect-square analogue. */
const PHOTO_SIZE = 96;

export function AboutTheAuthor({
  mediaType,
  metadata,
}: {
  mediaType: Tables<"media_items">["media_type"];
  metadata: Record<string, unknown> | null;
}) {
  // Per-type gating — author info only applies to books.
  if (mediaType !== "book") return null;
  if (!metadata) return null;

  // Primary author only — web shows just authors[0] ("multi-author books
  // would clutter the column"). authors is names-only (string[]).
  // Untyped JSONB — asArray guards the shape before indexing.
  const authors = asArray<string>(metadata.authors);
  const name = typeof authors[0] === "string" ? authors[0].trim() : undefined;
  // Graceful empty: no author name → render nothing, never a bare heading.
  if (!name) return null;

  // Defensive-only: these are NOT present in today's book metadata (see
  // the file header). The key names `author_photo_url` / `author_bio` are
  // PROVISIONAL — no current contract defines them; they'll surface here
  // only IF a future enrichment step happens to write these exact keys.
  // Today they resolve to null and only the name block renders.
  const rawPhoto = metadata.author_photo_url;
  const photoUrl =
    typeof rawPhoto === "string" && rawPhoto.length > 0 ? rawPhoto : null;
  const rawBio = metadata.author_bio;
  const bio =
    typeof rawBio === "string" && rawBio.trim().length > 0
      ? rawBio.trim()
      : null;

  // Avatar: the full square when we actually have a photo; a compact round
  // placeholder otherwise, so a name-only author (today's common case, until
  // Open Library enrichment lands) reads as an intentional byline row rather
  // than a large empty box.
  const avatarSize = photoUrl ? PHOTO_SIZE : 44;

  return (
    <View className="gap-4">
      <SectionHeading>About the author</SectionHeading>
      <View className="flex-row items-center gap-3">
        <View
          style={{ width: avatarSize, height: avatarSize }}
          className="items-center justify-center overflow-hidden rounded-full border border-surface-border bg-surface-overlay"
        >
          {photoUrl ? (
            <Image
              source={{ uri: photoUrl }}
              className="h-full w-full"
              contentFit="cover"
              accessible
              accessibilityLabel={name}
            />
          ) : (
            <User size={20} color={colors["text-secondary"]} />
          )}
        </View>
        <View className="flex-1 gap-1">
          <Text className="text-sm font-semibold text-text-primary">
            {name}
          </Text>
          {bio ? (
            <Text className="text-sm leading-relaxed text-text-secondary">
              {bio}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}
