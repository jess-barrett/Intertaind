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
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { Trash2 } from "lucide-react-native";
import type { MediaType } from "@intertaind/types";
import { colors } from "@intertaind/design-system";

import {
  RecommendationPairing,
  type PairMedia,
} from "@/components/activity/recommendation-pairing";
import { timeAgo } from "@/lib/time";
import {
  useProfileRecommendations,
  type ProfileRecommendation,
} from "@/queries/profile";
import { useDeleteRecommendationMutation } from "@/queries/recommendations";

export function RecommendationsTab({
  userId,
  isOwner,
}: {
  userId: string;
  /** The viewer owns this profile → show delete on each pairing. */
  isOwner: boolean;
}) {
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
        <PairingCard key={rec.id} rec={rec} ownerId={userId} canDelete={isOwner} />
      ))}
    </View>
  );
}

/**
 * One authored pairing, rendered with the shared `RecommendationPairing` (the
 * same layout the You + Friends feeds use): SOURCE → intertain glyph → TARGET
 * posters, the "If you liked {source}, try {recommended}" caption to their
 * right, the relative time, and the optional note beneath. Both posters + titles
 * tap to their media detail. Owner-only delete rides in the pairing's top-right
 * `trailing` slot.
 *
 * The hook drops any row missing either media side, so both are present here.
 */
function PairingCard({
  rec,
  ownerId,
  canDelete,
}: {
  rec: ProfileRecommendation;
  ownerId: string;
  canDelete: boolean;
}) {
  const deleteRec = useDeleteRecommendationMutation();
  // The hook guarantees both sides are non-null (rows missing either are
  // dropped), but narrow defensively so the render never touches a null.
  const { source, recommended } = rec;
  if (!source || !recommended) return null;

  function confirmDelete() {
    if (!source || !recommended) return;
    Alert.alert("Delete pairing?", "This removes your recommendation.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          deleteRec.mutate({
            id: rec.id,
            sourceMediaId: source.id,
            recommendedMediaId: recommended.id,
            ownerId,
          }),
      },
    ]);
  }

  const sourceMedia: PairMedia = {
    id: source.id,
    title: source.title,
    cover: source.cover_image_url,
    mediaType: source.media_type as MediaType | null,
  };
  const targetMedia: PairMedia = {
    id: recommended.id,
    title: recommended.title,
    cover: recommended.cover_image_url,
    mediaType: recommended.media_type as MediaType | null,
  };

  return (
    <View className={deleteRec.isPending ? "opacity-50" : ""}>
      <RecommendationPairing
        source={sourceMedia}
        target={targetMedia}
        note={rec.note}
        timeLabel={rec.created_at ? timeAgo(rec.created_at) : null}
        trailing={
          canDelete ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete pairing"
              disabled={deleteRec.isPending}
              hitSlop={8}
              className="rounded-sm p-2 active:opacity-60"
              onPress={confirmDelete}
            >
              <Trash2 size={18} color={colors["text-muted"]} />
            </Pressable>
          ) : null
        }
      />
    </View>
  );
}
