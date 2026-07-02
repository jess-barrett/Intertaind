/**
 * Tracking panel for the media detail screen — the write-side UI over
 * the mutations in `@/queries/tracking` (M2: unified controls for all
 * media types; type-specific flows arrive in M4).
 *
 * Composition (each control → its hook):
 *   - Status chips (5 statuses) → `useTrackMediaMutation` — web parity:
 *     web's panel calls `trackMedia` for status changes, never
 *     `updateTrackingStatus`, so re-tracking recomputes
 *     started_at/completed_at. Optimistic → stays enabled while
 *     pending. Tapping the already-active status is a DELIBERATE
 *     divergence from web: web treats that tap as untrack-and-delete
 *     (web media-card-actions.tsx ~269–287 — removeTracking deletes
 *     the row, and the rating/review go with it); mobile no-ops and
 *     routes ALL destruction through the confirmed Remove button
 *     (fat-finger safety on touch). Intentional divergence — a future
 *     parity pass must not "fix" it in either direction.
 *   - StarRating → `useRateMediaMutation`, converting display stars →
 *     1–10 DB scale with `starsToRating` at this boundary (two-scale
 *     rule in @intertaind/types rating.ts). Clear = null, never 0.
 *     Optimistic → stays enabled.
 *   - Review row → `useReviewMediaMutation`. Collapsed row shows the
 *     saved review (or "Add a review"); expands to a multiline
 *     TextInput with Save/Cancel. NON-optimistic, so Save shows
 *     "Saving…" and disables; the editor stays open on failure so the
 *     draft isn't lost.
 *   - Heart ("Loved") → `useToggleFavoriteMutation`. DISABLED while
 *     pending: the server flip reads the DB value, so a double-tap
 *     race could land as flip-flip = no-op while the UI says otherwise.
 *   - Remove → confirm via Alert.alert → `useRemoveTrackingMutation`.
 *     Rendered only with a REAL row id (see sentinel below). While the
 *     delete is in flight, EVERY panel write is disabled — see the
 *     `removing` flag in the component.
 *
 * Sentinel guard: optimistic rows for untracked items carry
 * `id: OPTIMISTIC_ID`, which must never reach a byId mutation. Every
 * byId param funnels through `safeId` (undefined while optimistic →
 * rate/review/favorite fall back to their lazy lookup path; Remove is
 * hidden until the settle-refetch delivers the real id).
 *
 * Errors: mutations reject with raw Supabase/network errors; those are
 * never rendered. `trackingErrorMessage` maps them to two friendly
 * strings (network vs everything else), `console.warn`s the raw error,
 * and the panel shows the mapped line inline with a Dismiss affordance.
 * Optimistic mutations also roll back their cache write on failure, so
 * the controls snap back on their own.
 */
import { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors } from "@intertaind/design-system";
import {
  ratingToStars,
  starsToRating,
  type TrackingStatus,
} from "@intertaind/types";
import type { Tables } from "@intertaind/supabase";

import StarRating from "@/components/star-rating";
import type { MediaDetailItem } from "@/queries/media";
import {
  OPTIMISTIC_ID,
  useRateMediaMutation,
  useRemoveTrackingMutation,
  useReviewMediaMutation,
  useToggleFavoriteMutation,
  useTrackMediaMutation,
} from "@/queries/tracking";

const STATUS_OPTIONS: { status: TrackingStatus; label: string }[] = [
  { status: "want", label: "Want" },
  { status: "in_progress", label: "In progress" },
  { status: "completed", label: "Completed" },
  { status: "dropped", label: "Dropped" },
  { status: "on_hold", label: "On hold" },
];

/**
 * Map a mutation rejection to a user-facing string. NEVER render the
 * raw error message — Supabase/fetch errors leak internals ("JWT
 * expired", PostgREST codes). The raw error goes to console.warn for
 * debugging.
 */
function trackingErrorMessage(err: unknown): string {
  console.warn("[tracking-panel] mutation failed:", err);
  // Read .message off non-Error shapes too: postgrest-js catches a
  // failed fetch and resolves it into a PLAIN error object whose
  // message is "TypeError: Network request failed" — it's not an
  // Error instance, and String(obj) would hide the text.
  const message =
    typeof err === "object" && err !== null && "message" in err
      ? String((err as { message: unknown }).message)
      : String(err);
  // RN's fetch itself rejects with TypeError("Network request failed")
  // when offline; match both the instance and the wrapped-message shape.
  if (err instanceof TypeError || /network request failed/i.test(message)) {
    return "Couldn't save — check your connection and try again.";
  }
  return "Something went wrong saving your changes.";
}

/** lucide "heart" path (24×24 viewBox) — web's favorite icon. */
const HEART_PATH =
  "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 " +
  ".5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 " +
  "4.05 3 5.5l7 7Z";

function HeartIcon({ filled, size }: { filled: boolean; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d={HEART_PATH}
        fill={filled ? colors["accent-movie"] : "none"}
        stroke={filled ? colors["accent-movie"] : colors["text-muted"]}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function TrackingPanel({
  media,
  viewerRow,
  trackingPending,
}: {
  media: MediaDetailItem;
  viewerRow: Tables<"user_media"> | null;
  trackingPending: boolean;
}) {
  const trackMutation = useTrackMediaMutation();
  const rateMutation = useRateMediaMutation();
  const reviewMutation = useReviewMediaMutation();
  const favoriteMutation = useToggleFavoriteMutation();
  const removeMutation = useRemoveTrackingMutation();

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editingReview, setEditingReview] = useState(false);
  const [reviewDraft, setReviewDraft] = useState("");

  // While Remove is in flight the panel is mid-transition to
  // "untracked", so EVERY write control freezes — not just the Remove
  // button. A write racing the delete either lands first and is
  // silently deleted with the row, or (for the optimistic mutations)
  // fails after the delete and "rolls back" to a snapshot of the
  // now-deleted row, resurrecting it in the cache for a round trip.
  const removing = removeMutation.isPending;

  // Sentinel guard (see file header): never hand OPTIMISTIC_ID to a
  // byId mutation — the row doesn't exist in Postgres under that id.
  const safeId =
    viewerRow && viewerRow.id !== OPTIMISTIC_ID ? viewerRow.id : undefined;

  // rating is 1–10 DB scale; null-guard BEFORE Number() — Number(null)
  // is 0, which ratingToStars would clamp to half a star.
  const stars =
    viewerRow?.rating != null ? ratingToStars(Number(viewerRow.rating)) : null;
  const isFavorite = viewerRow?.is_favorite ?? false;

  const reportError = (err: unknown) =>
    setErrorMessage(trackingErrorMessage(err));

  function handleStatus(status: TrackingStatus) {
    // Deliberate no-op on the active status — web untracks-and-deletes
    // here; mobile routes destruction through Remove (see file header).
    if (viewerRow?.status === status) return;
    setErrorMessage(null);
    trackMutation.mutate(
      { mediaId: media.id, status },
      { onError: reportError }
    );
  }

  function handleRate(next: number | null) {
    setErrorMessage(null);
    rateMutation.mutate(
      { mediaId: media.id, rating: starsToRating(next), userMediaId: safeId },
      { onError: reportError }
    );
  }

  function openReviewEditor() {
    setReviewDraft(viewerRow?.review ?? "");
    setEditingReview(true);
  }

  function handleSaveReview() {
    setErrorMessage(null);
    reviewMutation.mutate(
      { mediaId: media.id, review: reviewDraft, userMediaId: safeId },
      {
        onError: reportError,
        // Close only on success — a failed save keeps the draft open.
        onSuccess: () => setEditingReview(false),
      }
    );
  }

  function handleFavorite() {
    setErrorMessage(null);
    favoriteMutation.mutate(
      { mediaId: media.id, userMediaId: safeId },
      { onError: reportError }
    );
  }

  function handleRemove() {
    if (!safeId) return;
    Alert.alert(
      "Remove from your library?",
      `This clears your status, rating, and review for “${media.title}”.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            setErrorMessage(null);
            removeMutation.mutate(
              { userMediaId: safeId, mediaId: media.id },
              { onError: reportError }
            );
          },
        },
      ]
    );
  }

  // Viewer row still in flight — same "…" treatment the M1 badge had,
  // so a tracked item never flashes untracked controls before it loads.
  if (trackingPending) {
    return (
      <View className="items-center rounded-lg bg-surface-raised px-4 py-6">
        <Text className="text-sm text-text-muted">…</Text>
      </View>
    );
  }

  return (
    <View className="gap-4 rounded-lg bg-surface-raised p-4">
      {/* Status chips — optimistic, so they stay enabled while their own
          mutation is pending; frozen only while removing. */}
      <View className="gap-2">
        <Text className="text-xs font-semibold uppercase text-text-muted">
          Status
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {STATUS_OPTIONS.map(({ status, label }) => {
            const active = viewerRow?.status === status;
            return (
              <Pressable
                key={status}
                accessibilityRole="button"
                accessibilityLabel={`Set status to ${label}`}
                accessibilityState={{ selected: active, disabled: removing }}
                disabled={removing}
                className={`rounded-full px-3 py-2 active:opacity-70 ${
                  active ? "bg-brand-dark" : "bg-surface-overlay"
                } ${removing ? "opacity-50" : ""}`}
                onPress={() => handleStatus(status)}
              >
                <Text
                  className={`text-sm ${
                    active
                      ? "font-semibold text-text-primary"
                      : "text-text-secondary"
                  }`}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Rating — optimistic; stars convert to DB scale in handleRate.
          readOnly while removing (panel freeze); size 32 keeps each tap
          half a 16pt-wide target. */}
      <View className="gap-2">
        <Text className="text-xs font-semibold uppercase text-text-muted">
          Your rating
        </Text>
        <StarRating
          value={stars}
          onChange={handleRate}
          readOnly={removing}
          size={32}
        />
      </View>

      {/* Review — non-optimistic: explicit saving state. */}
      <View className="gap-2">
        <Text className="text-xs font-semibold uppercase text-text-muted">
          Your review
        </Text>
        {editingReview ? (
          <View className="gap-2">
            <TextInput
              multiline
              autoFocus
              value={reviewDraft}
              onChangeText={setReviewDraft}
              editable={!reviewMutation.isPending}
              placeholder="What did you think?"
              placeholderTextColor={colors["text-muted"]}
              accessibilityLabel="Review text"
              className="min-h-24 rounded-md bg-surface-overlay px-3 py-2 text-base text-text-primary"
              style={{ textAlignVertical: "top" }}
            />
            <View className="flex-row justify-end gap-2">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel editing review"
                disabled={reviewMutation.isPending}
                className="rounded-md px-4 py-2 active:opacity-70"
                onPress={() => setEditingReview(false)}
              >
                <Text className="text-sm text-text-secondary">Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Save review"
                accessibilityState={{
                  disabled: reviewMutation.isPending || removing,
                }}
                disabled={reviewMutation.isPending || removing}
                className={`rounded-md bg-brand px-4 py-2 active:opacity-70 ${
                  reviewMutation.isPending || removing ? "opacity-50" : ""
                }`}
                onPress={handleSaveReview}
              >
                <Text className="text-sm font-semibold text-text-primary">
                  {reviewMutation.isPending ? "Saving…" : "Save"}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              viewerRow?.review ? "Edit your review" : "Add a review"
            }
            accessibilityState={{ disabled: removing }}
            disabled={removing}
            className={`rounded-md bg-surface-overlay px-3 py-2.5 active:opacity-70 ${
              removing ? "opacity-50" : ""
            }`}
            onPress={openReviewEditor}
          >
            {viewerRow?.review ? (
              <Text className="text-sm text-text-secondary" numberOfLines={3}>
                {viewerRow.review}
              </Text>
            ) : (
              <Text className="text-sm text-text-muted">Add a review</Text>
            )}
          </Pressable>
        )}
      </View>

      {/* Favorite — disabled while pending (double-tap flip-flop race)
          and while removing (panel freeze). */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          isFavorite ? "Remove from favorites" : "Add to favorites"
        }
        accessibilityState={{
          selected: isFavorite,
          disabled: favoriteMutation.isPending || removing,
        }}
        disabled={favoriteMutation.isPending || removing}
        className={`flex-row items-center gap-2 self-start rounded-md bg-surface-overlay px-3 py-2.5 active:opacity-70 ${
          favoriteMutation.isPending || removing ? "opacity-50" : ""
        }`}
        onPress={handleFavorite}
      >
        <HeartIcon filled={isFavorite} size={18} />
        <Text
          className={`text-sm ${
            isFavorite ? "font-semibold text-accent-movie" : "text-text-secondary"
          }`}
        >
          Loved
        </Text>
      </Pressable>

      {/* Remove — only with a REAL row id (hidden while optimistic). */}
      {safeId ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Remove from your library"
          accessibilityState={{ disabled: removeMutation.isPending }}
          disabled={removeMutation.isPending}
          className={`self-start rounded-md px-1 py-1 active:opacity-70 ${
            removeMutation.isPending ? "opacity-50" : ""
          }`}
          onPress={handleRemove}
        >
          <Text className="text-sm text-accent-movie">
            {removeMutation.isPending ? "Removing…" : "Remove from library"}
          </Text>
        </Pressable>
      ) : null}

      {/* Inline, dismissible error line (mapped message, never raw). */}
      {errorMessage ? (
        <View className="flex-row items-center gap-3 rounded-md bg-surface-overlay px-3 py-2">
          <Text className="flex-1 text-sm text-accent-movie">
            {errorMessage}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss error"
            hitSlop={8}
            onPress={() => setErrorMessage(null)}
          >
            <Text className="text-xs text-text-muted">Dismiss</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
