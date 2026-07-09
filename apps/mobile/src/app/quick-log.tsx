/**
 * Quick-log — the center "+" action's flow. A ROOT-level modal
 * (`presentation: "modal"` in `src/app/_layout.tsx`), so it overlays the whole
 * app for a focused "I just watched/read/played X" capture WITHOUT first
 * navigating to a media detail screen.
 *
 * Two steps, both inline (no bottom sheets — this is a native modal, and
 * @gorhom sheets misbehave over one, same reason the recommend flow is a modal):
 *   1. SEARCH — `MediaSearchPicker` over the `media-search` Edge Function; tap a
 *      result → `media-upsert` get-or-creates its catalog row (→ media id).
 *   2. LOG — a compact per-type panel: a status (Watched/Read/Played vs the
 *      watchlist) + an optional star rating + a Loved toggle. "Log" writes it
 *      all in ONE `useTrackMediaMutation` call and dismisses the modal.
 *
 * Scope (v1): status + rating + loved only — no progress JSONB (so the
 * read-merge progress landmine can't bite) and no per-type rich fields
 * (watched-on date, seasons, hours). Those live on the full detail screen.
 *
 * Ratings are the two-scale rule: the picker is 0.5–5 STARS; the DB is 1–10, so
 * convert with `starsToRating` at the write boundary. Writes use `mutateAsync`
 * + `router.back()` (the modal dismiss) since the screen unmounts on success.
 */
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Heart, X } from "lucide-react-native";
import { colors } from "@intertaind/design-system";
import {
  starsToRating,
  type MediaType,
  type SearchResult,
  type TrackingStatus,
} from "@intertaind/types";

import { Image } from "@/components/image";
import StarRating from "@/components/star-rating";
import { MediaSearchPicker } from "@/components/media/media-search-picker";
import { MEDIA_TYPE_ICONS, MEDIA_TYPE_ICON_COLOR } from "@/lib/media-type-icons";
import { trackingErrorMessage } from "@/lib/tracking-errors";
import { useMediaUpsertMutation } from "@/queries/media";
import { useTrackMediaMutation } from "@/queries/tracking";

/**
 * Per-type quick-log labels: the "completed" primary (Watched/Read/Played) and
 * the backlog (Watchlist/TBR/Wishlist). Both map to a `TrackingStatus`.
 */
const QUICK_LOG_LABELS: Record<
  MediaType,
  { completed: string; want: string }
> = {
  movie: { completed: "Watched", want: "Watchlist" },
  tv_show: { completed: "Watched", want: "Watchlist" },
  book: { completed: "Read", want: "Want to Read" },
  video_game: { completed: "Played", want: "Wishlist" },
};

/** First 4 digits of an ISO date (mirrors the search picker's `yearFrom`). */
function yearFrom(dateString: string | null): string | null {
  return dateString?.match(/^(\d{4})/)?.[1] ?? null;
}

export default function QuickLogScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const upsert = useMediaUpsertMutation();
  const track = useTrackMediaMutation();

  // The picked title (its resolved catalog id + the search row for display).
  // null → the SEARCH step; set → the LOG step.
  const [picked, setPicked] = useState<{ id: string; result: SearchResult } | null>(
    null,
  );
  // Log-panel state (reset on each pick).
  const [status, setStatus] = useState<TrackingStatus>("completed");
  const [stars, setStars] = useState<number | null>(null);
  const [loved, setLoved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dismiss = () => router.back();

  // SEARCH → pick: upsert the search result to a catalog id, then advance to
  // the log step. Reset the log panel for the new pick.
  async function onPick(result: SearchResult) {
    if (upsert.isPending) return;
    setError(null);
    try {
      const id = await upsert.mutateAsync({ searchResult: result });
      setStatus("completed");
      setStars(null);
      setLoved(false);
      setPicked({ id, result });
    } catch (err) {
      setError(trackingErrorMessage(err, "that title", "quick-log"));
    }
  }

  // LOG → save: one write sets status (+ rating/loved when present), then the
  // modal dismisses. mutateAsync so the unmount-on-success can't drop it.
  async function onSave() {
    if (!picked || track.isPending) return;
    setError(null);
    try {
      await track.mutateAsync({
        mediaId: picked.id,
        status,
        rating: stars != null ? starsToRating(stars) : undefined,
        is_favorite: loved,
      });
      dismiss();
    } catch (err) {
      setError(trackingErrorMessage(err, "your log", "quick-log"));
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-surface-default"
      style={{ paddingTop: insets.top + 12 }}
    >
      {/* Header — back (log step only) + title + close. */}
      <View className="mb-4 flex-row items-center gap-3 px-6">
        {picked ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to search"
            hitSlop={8}
            className="active:opacity-60"
            onPress={() => setPicked(null)}
          >
            <ArrowLeft size={22} color={colors["text-primary"]} />
          </Pressable>
        ) : null}
        <Text className="flex-1 text-xl font-bold text-text-primary">
          {picked ? "Log it" : "Quick log"}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}
          className="h-9 w-9 items-center justify-center rounded-full active:opacity-70"
          style={{ backgroundColor: colors["surface-overlay"] }}
          onPress={dismiss}
        >
          <X size={20} color={colors["text-primary"]} />
        </Pressable>
      </View>

      {error ? (
        <Text className="mb-2 px-6 text-sm text-accent-movie">{error}</Text>
      ) : null}

      {picked ? (
        <LogPanel
          result={picked.result}
          status={status}
          onStatus={setStatus}
          stars={stars}
          onStars={setStars}
          loved={loved}
          onLoved={() => setLoved((v) => !v)}
          onSave={onSave}
          saving={track.isPending}
        />
      ) : (
        // flex-1 so the picker's FlatList gets a bounded, scrollable height.
        <View className="flex-1 px-6">
          <MediaSearchPicker onPick={onPick} />
          {upsert.isPending ? (
            <View className="absolute inset-0 items-center justify-center bg-surface-default/60">
              <ActivityIndicator color={colors["text-primary"]} />
            </View>
          ) : null}
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

/**
 * The per-type log panel: the picked title's poster/meta, a status choice
 * (completed vs backlog), an optional star rating, a Loved toggle, and Log.
 */
function LogPanel({
  result,
  status,
  onStatus,
  stars,
  onStars,
  loved,
  onLoved,
  onSave,
  saving,
}: {
  result: SearchResult;
  status: TrackingStatus;
  onStatus: (s: TrackingStatus) => void;
  stars: number | null;
  onStars: (s: number | null) => void;
  loved: boolean;
  onLoved: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const labels = QUICK_LOG_LABELS[result.media_type];
  const TypeIcon = MEDIA_TYPE_ICONS[result.media_type];
  const year = yearFrom(result.release_date);

  return (
    <ScrollView
      className="flex-1 px-6"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 32 }}
    >
      {/* Picked title. */}
      <View className="flex-row gap-4">
        {result.cover_image_url ? (
          <Image
            source={{ uri: result.cover_image_url }}
            className="aspect-[2/3] w-20 rounded-sm border border-surface-border bg-surface-overlay"
            contentFit="cover"
            accessible={false}
          />
        ) : (
          <View className="aspect-[2/3] w-20 items-center justify-center rounded-sm border border-surface-border bg-surface-overlay">
            <TypeIcon size={22} color={colors["text-muted"]} />
          </View>
        )}
        <View className="min-w-0 flex-1 justify-center gap-1">
          <Text className="text-lg font-bold text-text-primary" numberOfLines={2}>
            {result.title}
          </Text>
          <View className="flex-row items-center gap-1.5">
            <TypeIcon
              size={13}
              color={MEDIA_TYPE_ICON_COLOR[result.media_type]}
            />
            {year ? (
              <Text className="text-sm text-text-muted">{year}</Text>
            ) : null}
          </View>
        </View>
      </View>

      {/* Status — completed (primary) vs the backlog. */}
      <Text className="mb-2 mt-6 text-xs font-medium uppercase tracking-wider text-text-muted">
        Status
      </Text>
      <View className="flex-row gap-2">
        <StatusChip
          label={labels.completed}
          active={status === "completed"}
          onPress={() => onStatus("completed")}
        />
        <StatusChip
          label={labels.want}
          active={status === "want"}
          onPress={() => onStatus("want")}
        />
      </View>

      {/* Rating (optional). */}
      <Text className="mb-2 mt-6 text-xs font-medium uppercase tracking-wider text-text-muted">
        Rating
      </Text>
      <StarRating value={stars} onChange={onStars} size={28} starsOnly />

      {/* Loved. */}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: loved }}
        accessibilityLabel={loved ? "Remove from Loved" : "Mark as Loved"}
        className="mt-6 flex-row items-center gap-2 active:opacity-70"
        onPress={onLoved}
      >
        <Heart
          size={22}
          color={colors["accent-movie"]}
          fill={loved ? colors["accent-movie"] : "none"}
        />
        <Text className="text-sm text-text-primary">Loved</Text>
      </Pressable>

      {/* Log. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Log"
        disabled={saving}
        className={`mt-8 items-center rounded-sm bg-brand py-3 active:opacity-80 ${
          saving ? "opacity-60" : ""
        }`}
        onPress={onSave}
      >
        {saving ? (
          <ActivityIndicator color={colors["text-primary"]} />
        ) : (
          <Text className="text-base font-semibold text-text-primary">Log</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

/** A selectable status chip — brand fill when active. */
function StatusChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      className={`rounded-sm px-4 py-2 active:opacity-70 ${
        active ? "bg-brand" : "border border-surface-border"
      }`}
      onPress={onPress}
    >
      <Text
        className={`text-sm font-medium ${
          active ? "text-text-primary" : "text-text-muted"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
