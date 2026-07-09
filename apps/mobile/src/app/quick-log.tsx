/**
 * Quick-log — the center "+" action's flow. A ROOT-level modal
 * (`presentation: "modal"` in `src/app/_layout.tsx`), so it overlays the whole
 * app for a focused "I just watched/read/played X" capture WITHOUT first
 * navigating to a media detail screen.
 *
 * Two steps, both inline (no bottom sheets — this is a native modal, and
 * @gorhom sheets misbehave over one):
 *   1. SEARCH — `MediaSearchPicker` over the `media-search` Edge Function; tap a
 *      result → `media-upsert` get-or-creates its catalog row (→ media id).
 *   2. LOG — `QuickLogForm`: the SAME per-type logging as the detail screen's
 *      sheets (book Finished/DNF, game play-status + hours, TV Show/Season/
 *      Episode, movie generic). Each panel assembles a `TrackMediaVars` and
 *      hands it here via `onLog`; we fire ONE `useTrackMediaMutation` and
 *      dismiss.
 *
 * The viewer's existing row (via `useViewerTracking`) is threaded to
 * `QuickLogForm` so a re-log MERGES progress rather than replacing it (the
 * read-merge landmine). Writes use `mutateAsync` + `router.back()` (the modal
 * dismiss) since the screen unmounts on success.
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
import { ArrowLeft, X } from "lucide-react-native";
import { colors } from "@intertaind/design-system";
import type { SearchResult } from "@intertaind/types";

import { Image } from "@/components/image";
import { QuickLogForm } from "@/components/media/quick-log-form";
import { MediaSearchPicker } from "@/components/media/media-search-picker";
import { MEDIA_TYPE_ICONS, MEDIA_TYPE_ICON_COLOR } from "@/lib/media-type-icons";
import { trackingErrorMessage } from "@/lib/tracking-errors";
import { useMediaUpsertMutation, useViewerTracking } from "@/queries/media";
import { useTrackMediaMutation, type TrackMediaVars } from "@/queries/tracking";

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
  const [error, setError] = useState<string | null>(null);

  // The viewer's existing row for the picked item, so a re-log MERGES progress
  // instead of replacing it (empty key before a pick → resolves to null).
  const tracking = useViewerTracking(picked?.id ?? "");

  const dismiss = () => router.back();

  // SEARCH → pick: upsert the search result to a catalog id, then advance.
  async function onPick(result: SearchResult) {
    if (upsert.isPending) return;
    setError(null);
    try {
      const id = await upsert.mutateAsync({ searchResult: result });
      setPicked({ id, result });
    } catch (err) {
      setError(trackingErrorMessage(err, "that title", "quick-log"));
    }
  }

  // LOG → save: one write, then dismiss. mutateAsync so the unmount-on-success
  // can't drop it.
  async function onLog(vars: TrackMediaVars) {
    if (track.isPending) return;
    setError(null);
    try {
      await track.mutateAsync(vars);
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
        <Text
          className="flex-1 text-xl font-bold text-text-primary"
          numberOfLines={1}
        >
          {picked ? `Log ${picked.result.title}` : "Quick log"}
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
          mediaId={picked.id}
          viewerRow={tracking.data ?? null}
          onLog={onLog}
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
 * The log step: the picked title's poster/meta on top, then the per-type
 * `QuickLogForm` (which owns its own fields + Log button).
 */
function LogPanel({
  result,
  mediaId,
  viewerRow,
  onLog,
  saving,
}: {
  result: SearchResult;
  mediaId: string;
  viewerRow: React.ComponentProps<typeof QuickLogForm>["viewerRow"];
  onLog: (vars: TrackMediaVars) => void;
  saving: boolean;
}) {
  const TypeIcon = MEDIA_TYPE_ICONS[result.media_type];
  const year = yearFrom(result.release_date);

  return (
    <ScrollView
      className="flex-1 px-6"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 32 }}
    >
      {/* Picked title. */}
      <View className="mb-6 flex-row gap-4">
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

      <QuickLogForm
        mediaType={result.media_type}
        mediaId={mediaId}
        viewerRow={viewerRow}
        saving={saving}
        onLog={onLog}
      />
    </ScrollView>
  );
}
