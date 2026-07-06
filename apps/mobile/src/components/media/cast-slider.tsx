/**
 * Cast slider for the media detail screen (movie / TV only) — the RN
 * mirror of web's `MediaCastSection` (apps/web/src/components/media/
 * media-info-sections.tsx). A horizontal row of cast cards (poster-shaped
 * profile image + name + character) read from `metadata.cast`.
 *
 * Metadata shape (verified against web `media-info-sections.tsx`):
 *   metadata.cast: { tmdb_id?: number; name: string; character: string;
 *                    profile_path: string | null }[]
 * The profile image URL is built with `tmdbImageUrl(profile_path, "w185")`
 * — the SAME construction web uses (@intertaind/media). A missing
 * `profile_path` (or a null URL) falls back to a lucide `User` glyph on
 * the raised card, matching web's fallback.
 *
 * Per-type gating + graceful empty: renders `null` for anything that
 * isn't a movie or TV show, when `metadata` is absent, or when `cast` is
 * empty — so no "Cast" heading is ever shown over nothing (the locked
 * design grammar: no empty headings).
 *
 * TODO(M4): cast members are NON-TAPPABLE for now. Web links each card to
 * `/person/{tmdb_id}`, but a `person` detail screen doesn't exist in the
 * mobile app yet (M4). Once that route lands, wrap the card in a
 * `Pressable` that `router.push`es to the person screen (keyed on
 * `tmdb_id`, which web already carries in the metadata). Until then the
 * cards are plain `View`s with no press affordance.
 *
 * Visual language mirrors web + the detail screen: dark + neon, sharp
 * corners, hairline `surface-border`, 2:3 profile art. Design tokens
 * only — the fallback icon colors via the `color` prop (react-native-svg)
 * from the `colors` object, never a raw hex.
 */
import { FlatList, Text, View } from "react-native";
import { User } from "lucide-react-native";
import { tmdbImageUrl } from "@intertaind/media";
import { colors } from "@intertaind/design-system";
import type { Tables } from "@intertaind/supabase";

import { Image } from "@/components/image";
import { SectionHeading } from "@/components/media/section-heading";
import { asArray } from "@/lib/metadata";

/**
 * One cast entry as stored in `metadata.cast`. Field names mirror web's
 * `CastMember` interface exactly (media-info-sections.tsx) — do not
 * rename. `tmdb_id` is optional (used by M4's person route) and
 * `profile_path` is nullable (→ fallback glyph).
 */
interface CastMember {
  tmdb_id?: number;
  name: string;
  character: string;
  profile_path: string | null;
}

/** Card width in pt — a compact 2:3 profile card, web's `w-24` analogue. */
const CARD_WIDTH = 96;

export function CastSlider({
  mediaType,
  metadata,
}: {
  mediaType: Tables<"media_items">["media_type"];
  metadata: Record<string, unknown> | null;
}) {
  // Per-type gating — cast only exists for screen media (mirrors web).
  if (mediaType !== "movie" && mediaType !== "tv_show") return null;
  if (!metadata) return null;

  // Untyped JSONB — asArray guards against a non-array shape.
  const cast = asArray<CastMember>(metadata.cast);
  // Graceful empty: no cast → render nothing, never an empty heading.
  if (cast.length === 0) return null;

  return (
    <View className="gap-4">
      <SectionHeading>Cast</SectionHeading>
      <FlatList
        horizontal
        data={cast}
        showsHorizontalScrollIndicator={false}
        // Best-effort key: cast entries aren't guaranteed a unique id, so
        // fall back to the row index. Safe only because this list is static
        // (never reordered/filtered) — an index key would risk reconciliation
        // bugs in a mutable list.
        keyExtractor={(c, i) => `${c.name}-${c.character}-${c.tmdb_id ?? i}`}
        // 12pt gap between cards. The list inherits the screen's horizontal
        // padding (the parent content column's `px-4`), so the first card
        // aligns with the surrounding text rather than bleeding to the edge.
        contentContainerStyle={{ gap: 12 }}
        renderItem={({ item }) => <CastCard member={item} />}
      />
    </View>
  );
}

/**
 * A single non-tappable cast card. NON-TAPPABLE by design — see the
 * TODO(M4) in the file header: person links wait on a person screen.
 */
function CastCard({ member }: { member: CastMember }) {
  const profileUrl = tmdbImageUrl(member.profile_path, "w185");
  return (
    <View style={{ width: CARD_WIDTH }}>
      <View className="aspect-[2/3] w-full overflow-hidden rounded-sm border border-surface-border bg-surface-overlay">
        {profileUrl ? (
          <Image
            source={{ uri: profileUrl }}
            className="h-full w-full"
            contentFit="cover"
            accessible
            accessibilityLabel={member.name}
          />
        ) : (
          // No profile image — a muted lucide User glyph on the raised
          // card, mirroring web's fallback.
          <View className="h-full w-full items-center justify-center">
            <User size={24} color={colors["text-muted"]} />
          </View>
        )}
      </View>
      <Text
        className="mt-1.5 text-xs font-medium text-text-primary"
        numberOfLines={1}
      >
        {member.name}
      </Text>
      {member.character ? (
        <Text className="text-xs text-text-muted" numberOfLines={1}>
          {member.character}
        </Text>
      ) : null}
    </View>
  );
}
