/**
 * RecommendationsTab — the "Recs" segment of the shared `ProfileView`. Lists the
 * profile owner's AUTHORED cross-media pairings ("intertains"), newest first —
 * every "if you liked SOURCE, try RECOMMENDED" they've posted. The RN mirror of
 * web's `/u/[username]/recommendations` page + `ProfileRecommendationCard`
 * (apps/web/src/components/recommendations/profile-recommendation-card.tsx).
 *
 * ── Card grammar (web parity) ───────────────────────────────────────────────
 * Unlike the media-detail RecommendationsSection (which shows ONE side — the
 * page's media is the implicit other), the profile card shows BOTH paired
 * media: SOURCE poster → a `Share2` connector glyph → RECOMMENDED poster, with
 * the caption "If you liked {source}, try {recommended}", the relative time, and
 * the author's optional note beneath. The `Share2` glyph is the app's "intertain"
 * verb icon (the same icon web uses between the two covers) — it carries the
 * directional meaning, so no new arrow/terminology is invented.
 *
 * Both posters tap through to the paired media's detail (`/media/<id>`), via a
 * `MediaCard` (`cardMediaFromHomeItem`) rendered as a pure poster —
 * `showMeta={false}` + `showActions={false}` — so it's just cover art + a tap
 * target (no meta row, no quick-actions slider) at a small fixed width.
 *
 * ── Renders inside ProfileView's ScrollView ─────────────────────────────────
 * ProfileView owns the outer vertical `ScrollView`, so this tab is a plain
 * `View` list (no nested vertical scroller, which would fight the parent's
 * scroll). Structure/spacing/empty-state mirror ShelvesTab for consistency.
 *
 * States: pending → spinner; error → a muted line; settled-empty → a muted
 * empty state. Mobile primitives only; icons color via the `color` PROP; design
 * tokens only.
 */
import { ActivityIndicator, Text, View } from "react-native";
import { Share2 } from "lucide-react-native";
import { colors } from "@intertaind/design-system";

import { MediaCard } from "@/components/media/media-card";
import { cardMediaFromHomeItem } from "@/components/media/card-media";
import { timeAgo } from "@/lib/time";
import {
  useProfileRecommendations,
  type ProfileRecommendation,
} from "@/queries/profile";

/** Fixed poster width for the paired covers (small — the pair reads as a unit). */
const POSTER_WIDTH = 72;

export function RecommendationsTab({ userId }: { userId: string }) {
  const recsQuery = useProfileRecommendations(userId);
  const recs = recsQuery.data ?? [];

  if (recsQuery.isPending) {
    return (
      <View className="items-center py-12">
        <ActivityIndicator color={colors["text-muted"]} />
      </View>
    );
  }

  if (recsQuery.error) {
    return (
      <Text className="py-8 text-center text-sm text-text-muted">
        Couldn&apos;t load recommendations.
      </Text>
    );
  }

  if (recs.length === 0) {
    return (
      <Text className="py-12 text-center text-sm text-text-muted">
        No recommendations yet.
      </Text>
    );
  }

  return (
    <View className="gap-5">
      {recs.map((rec) => (
        <PairingCard key={rec.id} rec={rec} />
      ))}
    </View>
  );
}

/**
 * One authored pairing: SOURCE poster → `Share2` connector → RECOMMENDED poster,
 * then the "If you liked {source}, try {recommended}" caption, the relative
 * time, and the optional note. Both posters tap to their media detail. Mirrors
 * web's `ProfileRecommendationCard` (`[source] → [target]` two-cover layout).
 *
 * The hook drops any row missing either media side, so both are present here.
 */
function PairingCard({ rec }: { rec: ProfileRecommendation }) {
  // The hook guarantees both sides are non-null (rows missing either are
  // dropped), but narrow defensively so the render never touches a null.
  const { source, recommended } = rec;
  if (!source || !recommended) return null;

  return (
    <View className="gap-3">
      {/* Two-cover pairing with the intertain glyph between (web parity). */}
      <View className="flex-row items-center gap-3">
        <View style={{ width: POSTER_WIDTH }}>
          <MediaCard
            media={cardMediaFromHomeItem(source)}
            showMeta={false}
            showActions={false}
          />
        </View>

        <Share2
          size={18}
          color={colors["text-muted"]}
          accessibilityLabel="recommends"
        />

        <View style={{ width: POSTER_WIDTH }}>
          <MediaCard
            media={cardMediaFromHomeItem(recommended)}
            showMeta={false}
            showActions={false}
          />
        </View>
      </View>

      {/* Caption — mirrors web's "If you liked {source}, try {target}". */}
      <View className="gap-0.5">
        <Text className="text-xs text-text-muted">
          If you liked{" "}
          <Text className="font-medium text-text-secondary">
            {source.title}
          </Text>
          , try
        </Text>
        <Text
          className="text-base font-semibold text-text-primary"
          numberOfLines={2}
        >
          {recommended.title}
        </Text>
        {rec.created_at ? (
          <Text className="text-xs text-text-muted">
            {timeAgo(rec.created_at)}
          </Text>
        ) : null}
      </View>

      {/* Optional note — the author's "why". */}
      {rec.note ? (
        <Text className="text-sm leading-relaxed text-text-secondary">
          “{rec.note}”
        </Text>
      ) : null}
    </View>
  );
}
