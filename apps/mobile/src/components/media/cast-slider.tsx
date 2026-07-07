/**
 * Cast card row for the media detail screen (movie / TV) — the RN mirror
 * of web's `MediaCastSection` (apps/web/src/components/media/
 * media-info-sections.tsx). A horizontal, scrollable row of cast cards
 * (poster-shaped profile image + name + character) read from
 * `metadata.cast`.
 *
 * `CastRow` renders JUST the horizontal card list — no "Cast" heading, no
 * gating. Cast is presented as the FIRST (default) tab of the info tab
 * strip (`info-sections.tsx`), which owns the "Cast" label + the
 * show-only-when-present gating. Callers pass an already-extracted cast
 * array (movie/TV only; empty for other types).
 *
 * Metadata shape (verified against web `media-info-sections.tsx`):
 *   metadata.cast: { tmdb_id?: number; name: string; character: string;
 *                    profile_path: string | null }[]
 * The profile image URL is built with `tmdbImageUrl(profile_path, "w185")`
 * — the SAME construction web uses (@intertaind/media). A missing
 * `profile_path` (or a null URL) falls back to a lucide `User` glyph on
 * the raised card, matching web's fallback.
 *
 * Each card links to the person screen (`/person/{tmdb_id}`) — mirroring
 * web — when the cast entry carries a `tmdb_id`. Entries WITHOUT one (older
 * metadata) render as plain, non-tappable `View`s: there's no person route
 * to push to without an id.
 *
 * Visual language mirrors web + the detail screen: dark + neon, sharp
 * corners, hairline `surface-border`, 2:3 profile art. Design tokens
 * only — the fallback icon colors via the `color` prop (react-native-svg)
 * from the `colors` object, never a raw hex.
 */
import { FlatList, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { User } from "lucide-react-native";
import { tmdbImageUrl } from "@intertaind/media";
import { colors } from "@intertaind/design-system";

import { Image } from "@/components/image";

/**
 * One cast entry as stored in `metadata.cast`. Field names mirror web's
 * `CastMember` interface exactly (media-info-sections.tsx) — do not
 * rename. `tmdb_id` is optional (used by M4's person route) and
 * `profile_path` is nullable (→ fallback glyph). Exported so the info tab
 * strip can type the cast array it extracts.
 */
export interface CastMember {
  tmdb_id?: number;
  name: string;
  character: string;
  profile_path: string | null;
}

/** Card width in pt — a compact 2:3 profile card. Deliberately smaller
 *  than web's `w-24` (96pt) so the cast row takes less vertical/horizontal
 *  space on a phone; more faces fit per screen. */
const CARD_WIDTH = 72;

/**
 * The horizontal cast card row. Rendered inside the info tab strip's
 * "Cast" tab (see file header) — the caller gates on presence, so this
 * just maps the cards. Renders `null` for an empty array as a cheap guard.
 */
export function CastRow({ cast }: { cast: CastMember[] }) {
  if (cast.length === 0) return null;

  return (
    <FlatList
      horizontal
      data={cast}
      showsHorizontalScrollIndicator={false}
      // Best-effort key: cast entries aren't guaranteed a unique id, so
      // fall back to the row index. Safe only because this list is static
      // (never reordered/filtered) — an index key would risk reconciliation
      // bugs in a mutable list.
      keyExtractor={(c, i) => `${c.name}-${c.character}-${c.tmdb_id ?? i}`}
      // 12pt gap between cards. The list inherits the info strip's horizontal
      // padding (the parent content column's `px-4`), so the first card
      // aligns with the surrounding content rather than bleeding to the edge.
      contentContainerStyle={{ gap: 12 }}
      renderItem={({ item }) => <CastCard member={item} />}
    />
  );
}

/**
 * A single cast card. Tappable → the person screen when the entry has a
 * `tmdb_id`; otherwise a plain non-tappable `View` (no id → nowhere to
 * route). Both branches share `CardBody` so they can't drift.
 */
function CastCard({ member }: { member: CastMember }) {
  const router = useRouter();

  // No tmdb_id → non-tappable plain View (nothing to link to).
  if (member.tmdb_id == null) {
    return (
      <View style={{ width: CARD_WIDTH }}>
        <CardBody member={member} />
      </View>
    );
  }

  const tmdbId = member.tmdb_id;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${member.name}`}
      className="active:opacity-70"
      style={{ width: CARD_WIDTH }}
      onPress={() => router.push(`/person/${tmdbId}`)}
    >
      <CardBody member={member} />
    </Pressable>
  );
}

/** The card's inner content — shared by the tappable + non-tappable shells. */
function CardBody({ member }: { member: CastMember }) {
  const profileUrl = tmdbImageUrl(member.profile_path, "w185");
  return (
    <>
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
            <User size={20} color={colors["text-muted"]} />
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
    </>
  );
}
