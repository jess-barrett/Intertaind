/**
 * RecommendSheet — the "Intertain friends" cross-media recommend sheet, the
 * RN mirror of web's `RecommendButton`/`RecommendModal`
 * (apps/web/src/components/recommendations/recommend-button.tsx). Applies to
 * EVERY media type (Intertain is the cross-media headline feature): "if a
 * friend liked THIS, try THAT."
 *
 * ── Flow (two states in one sheet, mirroring web's modal) ──────────────
 * 1. No target yet → a `MediaSearchPicker`: search + pick another title.
 * 2. Target picked → its poster/title/year/type with a "Change" affordance
 *    (clears the target → back to search), an optional note field (≤280),
 *    and a prominent brand "Recommend" button.
 *
 * ── Recommend = ensure-id-then-create ─────────────────────────────────
 * The picked `SearchResult` isn't a catalog row yet, so on Recommend we:
 *   1. `upsert.mutateAsync({ searchResult: target })` — dedup-or-create the
 *      `media_items` row (all types) → its id.
 *   2. GUARD: if that id === the source media's id, the pairing would be a
 *      self-recommend (the DB's `no_self_recommend` CHECK would throw) — show
 *      a friendly line and stop BEFORE the insert. (Web guards at pick time
 *      via `excludeMediaIds`; mobile can't exclude pre-resolution, so we guard
 *      on the resolved id — a duplicate title resolving to the source is the
 *      only way this trips.)
 *   3. `createRec.mutateAsync({ sourceMediaId, recommendedMediaId, note })`.
 * Then dismiss via the OUTER sheet ref.
 *
 * ── The mutateAsync-dismiss pattern (why not `mutate(…, { onSuccess })`) ─
 * `useCreateRecommendationMutation` invalidates the source's media detail on
 * success, which can remount the detail screen's sheet tree; a per-call
 * `onSuccess` would be DROPPED if this form unmounts mid-mutation (TanStack
 * v5). So we `await` the mutateAsync chain and dismiss via the OUTER ref
 * (`onDismiss`), which targets the stable AppSheet — exactly the log sheets'
 * pattern.
 *
 * ── Errors ────────────────────────────────────────────────────────────
 * The create hook already maps 23505 ("You've already intertaind this
 * pairing") and the self-recommend case to friendly `Error`s; the upsert
 * hook throws transport errors. We catch and render the mapped `.message`
 * inline (falling back through `trackingErrorMessage` for anything without a
 * user-facing message) — NEVER the raw Supabase error.
 *
 * ── Fresh on re-open ──────────────────────────────────────────────────
 * State (target/note) is reset when the sheet dismisses, via a remount key
 * bumped in `onDismiss` (the seedKey pattern) — re-opening always starts at
 * the empty search state.
 */

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Pressable, Text, View } from "react-native";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { X } from "lucide-react-native";
import { colors } from "@intertaind/design-system";
import type { SearchResult } from "@intertaind/types";

import { Image } from "@/components/image";
import { MediaSearchPicker } from "@/components/media/media-search-picker";
import AppSheet, { type AppSheetRef } from "@/components/sheet/app-sheet";
import { MEDIA_TYPE_ICONS } from "@/lib/media-type-icons";
import { trackingErrorMessage } from "@/lib/tracking-errors";
import type { MediaDetailItem } from "@/queries/media";
import { useMediaUpsertMutation } from "@/queries/media";
import { useCreateRecommendationMutation } from "@/queries/recommendations";

/** Max note length — web parity (`MAX_NOTE`) + the DB's ≤280 CHECK. */
const MAX_NOTE = 280;

/** First 4 digits of an ISO date, mirroring web's yearFromDateString. */
function yearFrom(dateString: string | null): string | null {
  return dateString?.match(/^(\d{4})/)?.[1] ?? null;
}

/**
 * The already-friendly messages `useCreateRecommendationMutation` throws for
 * the two cases the user can trip (kept in lockstep with the hook). Any OTHER
 * rejection — a raw Supabase/`media-upsert` transport error — is routed
 * through `trackingErrorMessage` so we never render internals. An allowlist
 * (not "trust any `.message`") is the safe default: a raw error's `.message`
 * can be "JWT expired" / a PostgREST code, which must not leak.
 */
const FRIENDLY_CREATE_MESSAGES = new Set([
  "You've already intertaind this pairing",
  "Can't intertain a media with itself",
  "Not signed in.",
]);

/** Pull a user-facing message off a thrown value; never the raw error. */
function messageFor(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === "string" && FRIENDLY_CREATE_MESSAGES.has(m)) {
      return m;
    }
  }
  return trackingErrorMessage(err, "the recommendation", "recommend-sheet");
}

/** The picked-target preview pill (poster + title + year + type + Change). */
function TargetPreview({
  target,
  onChange,
}: {
  target: SearchResult;
  onChange: () => void;
}) {
  const year = yearFrom(target.release_date);
  const Glyph = MEDIA_TYPE_ICONS[target.media_type];
  return (
    <View className="flex-row items-center gap-3 rounded-sm border border-brand/40 bg-surface-overlay p-2">
      {target.cover_image_url ? (
        <Image
          source={{ uri: target.cover_image_url }}
          className="aspect-[2/3] w-12 rounded-sm border border-surface-border bg-surface-overlay"
          contentFit="cover"
          accessible={false}
        />
      ) : (
        <View className="aspect-[2/3] w-12 items-center justify-center rounded-sm border border-surface-border bg-surface-overlay">
          <Text className="text-text-muted">—</Text>
        </View>
      )}
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-xs font-semibold uppercase tracking-wider text-brand">
          Intertain with
        </Text>
        <Text className="text-sm font-medium text-text-primary" numberOfLines={2}>
          {target.title}
        </Text>
        <View className="flex-row items-center gap-1.5">
          <Glyph size={12} color={colors["text-muted"]} />
          {year ? (
            <Text className="text-xs text-text-muted">{year}</Text>
          ) : null}
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Change pairing"
        hitSlop={8}
        className="shrink-0 rounded-sm p-1.5 active:opacity-70"
        onPress={onChange}
      >
        <Text className="text-xs text-text-secondary">Change</Text>
      </Pressable>
    </View>
  );
}

/**
 * The form body. Split from the ref wrapper so it REMOUNTS (via the parent's
 * `key`) on each dismiss — re-opening always starts fresh (no stale target
 * or note).
 */
function RecommendForm({
  media,
  onDismiss,
}: {
  media: MediaDetailItem;
  onDismiss: () => void;
}) {
  const [target, setTarget] = useState<SearchResult | null>(null);
  const [note, setNote] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const upsert = useMediaUpsertMutation();
  const createRec = useCreateRecommendationMutation();
  const busy = upsert.isPending || createRec.isPending;

  async function handleRecommend() {
    if (!target || busy) return;
    setErrorMessage(null);
    try {
      // 1. Resolve the picked SearchResult → a media_items id (all types).
      const recommendedMediaId = await upsert.mutateAsync({
        searchResult: target,
      });
      // 2. Self-recommend guard on the RESOLVED id — a duplicate title that
      //    dedups to the source would trip the DB's no_self_recommend CHECK.
      if (recommendedMediaId === media.id) {
        setErrorMessage("You can't recommend a title to itself.");
        return;
      }
      // 3. Author the pairing (the hook maps 23505 + the self-rec case).
      await createRec.mutateAsync({
        sourceMediaId: media.id,
        recommendedMediaId,
        note: note.trim() || undefined,
      });
      // Dismiss via the OUTER sheet ref (stable across the create hook's
      // detail invalidation → potential remount).
      onDismiss();
    } catch (err) {
      setErrorMessage(messageFor(err));
    }
  }

  const remaining = MAX_NOTE - note.length;

  return (
    <View className="gap-5">
      {/* Header: label + source title + the cross-media hint (web parity). */}
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Intertain
          </Text>
          <Text className="text-lg font-bold text-text-primary" numberOfLines={2}>
            {media.title}
          </Text>
          <Text className="text-sm text-text-secondary">
            If a friend liked{" "}
            <Text className="font-semibold text-text-primary">
              {media.title}
            </Text>
            , what would you recommend next?
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}
          className="rounded-sm p-1 active:opacity-70"
          onPress={onDismiss}
        >
          <X size={22} color={colors["text-muted"]} />
        </Pressable>
      </View>

      {target === null ? (
        // No target yet → the search-and-pick widget.
        <MediaSearchPicker onPick={setTarget} />
      ) : (
        <>
          {/* Picked target preview + Change. */}
          <TargetPreview target={target} onChange={() => setTarget(null)} />

          {/* Optional note (≤280). BottomSheetTextInput so it rides above the
              keyboard. */}
          <View className="gap-1.5">
            <Text className="text-sm font-medium text-text-secondary">
              Add a note{" "}
              <Text className="text-text-muted">(optional)</Text>
            </Text>
            <BottomSheetTextInput
              value={note}
              onChangeText={setNote}
              placeholder="Why is this a good pair?"
              placeholderTextColor={colors["text-muted"]}
              maxLength={MAX_NOTE}
              multiline
              accessibilityLabel="Recommendation note"
              className="min-h-[80px] rounded-sm border border-surface-border bg-surface-overlay px-3 py-2.5 text-sm text-text-primary"
              style={{
                color: colors["text-primary"],
                textAlignVertical: "top",
              }}
            />
            {remaining < 80 ? (
              <Text className="text-right text-xs text-text-muted">
                {remaining} left
              </Text>
            ) : null}
          </View>

          {/* Recommend — the prominent brand CTA. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Recommend this pairing"
            accessibilityState={{ disabled: busy, busy }}
            disabled={busy}
            className={`items-center rounded-sm bg-brand px-6 py-3 active:opacity-80 ${
              busy ? "opacity-50" : ""
            }`}
            onPress={handleRecommend}
          >
            <Text className="text-sm font-semibold text-text-primary">
              {busy ? "Recommending…" : "Recommend"}
            </Text>
          </Pressable>
        </>
      )}

      {/* Inline, mapped error — never the raw Supabase error. */}
      {errorMessage ? (
        <View className="rounded-sm border border-surface-border bg-surface-overlay px-3 py-2.5">
          <Text className="text-sm text-accent-movie">{errorMessage}</Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Ref-driven recommend sheet. Parent presents it via `AppSheetRef`
 * (`present()`); the sheet dismisses itself on a successful recommend. Mount
 * it on the media detail screen (all types) and wire `present()` to the
 * action strip's `onIntertain`.
 *
 * Pinned to `snapPoints={["90%"]}` rather than dynamic sizing: the body
 * holds a search field + a height-bounded scrolling results list, so a fixed
 * tall sheet gives the list a predictable region (dynamic sizing around an
 * async-growing list jitters). The form is REMOUNTED on each dismiss via a
 * `resetKey` so re-opening starts fresh (empty search, no note).
 */
const RecommendSheet = forwardRef<
  AppSheetRef,
  {
    media: MediaDetailItem;
  }
>(function RecommendSheet({ media }, ref) {
  const sheetRef = useRef<AppSheetRef>(null);
  // Bumped on dismiss to remount the form with fresh state (seedKey pattern).
  const [resetKey, setResetKey] = useState(0);

  useImperativeHandle(
    ref,
    () => ({
      present: () => sheetRef.current?.present(),
      dismiss: () => sheetRef.current?.dismiss(),
    }),
    [],
  );

  return (
    <AppSheet
      ref={sheetRef}
      snapPoints={["90%"]}
      accessibilityLabel={`Recommend a pairing for ${media.title}`}
      // Reset on ANY dismiss (programmatic or swipe-to-close) so re-opening
      // is fresh — cleanup only, never a save side-effect.
      onDismiss={() => setResetKey((k) => k + 1)}
    >
      <RecommendForm
        key={resetKey}
        media={media}
        onDismiss={() => sheetRef.current?.dismiss()}
      />
    </AppSheet>
  );
});

export default RecommendSheet;
