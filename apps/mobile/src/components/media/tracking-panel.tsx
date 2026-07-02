/**
 * ⚠️ ORPHANED / UNUSED as of M1 (2026-07-02). The detail screen no longer
 * imports this — it used a domain-wrong "5 status chips for every media
 * type" model. M2 REPLACES it with the config-driven per-type action strip
 * (`components/media/action-strip.tsx`); this file is kept only so M2 can
 * salvage the styling/mutation-wiring from it, then delete it. Do not wire
 * this back into a screen. See docs/plans/2026-07-01-mobile-media-tracking.md.
 *
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
 *     divergence from web: web's detail panel treats that tap as
 *     untrack-and-delete (web media-detail-client.tsx ~267–294,
 *     handleStatusToggle — removeTracking deletes the row, and the
 *     rating/review go with it; media-card-actions.tsx ~269–287 does
 *     the same for the want chip); mobile no-ops and
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
 *
 * Presentation (Intertaind visual language, mirroring the web panel):
 * the whole panel is a `surface-raised` card with a hairline border and
 * `border-t` section dividers; each section carries an uppercase muted
 * label. Active status chips take that status's neon accent at 15%
 * (web's active-button style); the color map is shared with
 * `StatusBadge` so the two never drift.
 */
import { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { Heart } from "lucide-react-native";
import { colors } from "@intertaind/design-system";
import {
  ratingToStars,
  starsToRating,
  type TrackingStatus,
} from "@intertaind/types";
import type { Tables } from "@intertaind/supabase";

import StarRating from "@/components/star-rating";
import { STATUS_BADGE_CONFIG } from "@/components/status-badge";
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
 * Active status-chip styling — the accent-at-15% + accent-text pattern
 * from web's active buttons (media-detail-client.tsx). Split into `bg`
 * (for the chip) and `text` (for its label) so each class lands on the
 * right element. Mirrors the per-status color intent of `StatusBadge`'s
 * STATUS_BADGE_CONFIG; on_hold has no neon accent, so it reads as a
 * neutral raised chip.
 */
const STATUS_ACTIVE_CLASS: Record<
  TrackingStatus,
  { bg: string; text: string }
> = {
  want: { bg: "bg-brand/15", text: "text-brand-light" },
  in_progress: { bg: "bg-accent-game/15", text: "text-accent-game" },
  completed: { bg: "bg-accent-book/15", text: "text-accent-book" },
  dropped: { bg: "bg-accent-movie/15", text: "text-accent-movie" },
  on_hold: { bg: "bg-surface-border", text: "text-text-secondary" },
};

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

/** Uppercase section label (STATUS / YOUR RATING / …). */
function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="text-xs font-semibold uppercase tracking-wider text-text-muted">
      {children}
    </Text>
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
      <View className="items-center rounded-sm border border-surface-border bg-surface-raised px-4 py-6">
        <Text className="text-sm text-text-muted">…</Text>
      </View>
    );
  }

  return (
    <View className="overflow-hidden rounded-sm border border-surface-border bg-surface-raised">
      {/* Status chips — optimistic, so they stay enabled while their own
          mutation is pending; frozen only while removing. */}
      <View className="gap-3 p-4">
        <SectionLabel>Status</SectionLabel>
        <View className="flex-row flex-wrap gap-2">
          {STATUS_OPTIONS.map(({ status, label }) => {
            const active = viewerRow?.status === status;
            // Icon shares StatusBadge's per-status glyph map (one source,
            // no drift). Icons color via the `color` PROP (hex), not
            // className: active = the status accent, inactive = muted
            // secondary — mirroring the label's active/inactive tokens.
            const Icon = STATUS_BADGE_CONFIG[status].icon;
            const iconColor = active
              ? STATUS_BADGE_CONFIG[status].iconColor
              : colors["text-secondary"];
            return (
              <Pressable
                key={status}
                accessibilityRole="button"
                accessibilityLabel={`Set status to ${label}`}
                accessibilityState={{ selected: active, disabled: removing }}
                disabled={removing}
                className={`flex-row items-center gap-1.5 rounded-sm px-3 py-2 active:opacity-70 ${
                  active ? STATUS_ACTIVE_CLASS[status].bg : "bg-surface-overlay"
                } ${removing ? "opacity-50" : ""}`}
                onPress={() => handleStatus(status)}
              >
                <Icon size={14} color={iconColor} />
                <Text
                  className={`text-sm ${
                    active
                      ? `font-semibold ${STATUS_ACTIVE_CLASS[status].text}`
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
      <View className="gap-3 border-t border-surface-border p-4">
        <SectionLabel>Your rating</SectionLabel>
        <StarRating
          value={stars}
          onChange={handleRate}
          readOnly={removing}
          size={32}
        />
      </View>

      {/* Review — non-optimistic: explicit saving state. */}
      <View className="gap-3 border-t border-surface-border p-4">
        <SectionLabel>Your review</SectionLabel>
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
              className="min-h-24 rounded-sm border border-surface-border bg-surface-overlay px-3 py-2 text-base text-text-primary"
              style={{ textAlignVertical: "top" }}
            />
            <View className="flex-row justify-end gap-2">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel editing review"
                disabled={reviewMutation.isPending}
                className="rounded-sm px-4 py-2 active:opacity-70"
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
                className={`rounded-sm bg-brand px-4 py-2 active:opacity-70 ${
                  reviewMutation.isPending || removing ? "opacity-50" : ""
                }`}
                onPress={handleSaveReview}
              >
                <Text className="text-sm font-semibold text-white">
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
            className={`rounded-sm bg-surface-overlay px-3 py-2 active:opacity-70 ${
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

      {/* Favorite + Remove row. Favorite is disabled while pending
          (double-tap flip-flop race) and while removing (panel freeze);
          Remove renders only with a REAL row id (hidden while
          optimistic) and routes destruction through the Alert confirm. */}
      <View className="flex-row items-center justify-between border-t border-surface-border p-4">
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
          className={`flex-row items-center gap-2 active:opacity-70 ${
            favoriteMutation.isPending || removing ? "opacity-50" : ""
          }`}
          onPress={handleFavorite}
        >
          {/* lucide Heart — icons color via props (react-native-svg),
              not className. Filled = accent-movie fill + stroke; empty =
              no fill, muted stroke. */}
          <Heart
            size={22}
            color={isFavorite ? colors["accent-movie"] : colors["text-muted"]}
            fill={isFavorite ? colors["accent-movie"] : "none"}
          />
          <Text
            className={`text-sm ${
              isFavorite
                ? "font-semibold text-accent-movie"
                : "text-text-secondary"
            }`}
          >
            {isFavorite ? "Favorited" : "Favorite"}
          </Text>
        </Pressable>

        {/* Remove — only with a REAL row id (hidden while optimistic). */}
        {safeId ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove from your library"
            accessibilityState={{ disabled: removeMutation.isPending }}
            disabled={removeMutation.isPending}
            className={`active:opacity-70 ${
              removeMutation.isPending ? "opacity-50" : ""
            }`}
            onPress={handleRemove}
          >
            <Text className="text-sm text-accent-movie">
              {removeMutation.isPending ? "Removing…" : "Remove"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* Inline, dismissible error line (mapped message, never raw). */}
      {errorMessage ? (
        <View className="flex-row items-center gap-3 border-t border-surface-border bg-surface-overlay px-4 py-3">
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
