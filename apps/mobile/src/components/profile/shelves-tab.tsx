/**
 * ShelvesTab — the "Shelves" segment of the shared `ProfileView`. Mirrors web's
 * per-type shelf pages collapsed into ONE screen: an inner media-type selector
 * (Movies · Shows · Books · Games), a status-section selector for the selected
 * type (from `SHELF_CONFIG`), then a poster grid of the owner's tracked titles
 * in that section.
 *
 * ── Two bars beneath the profile info ───────────────────────────────────────
 * The primary tabs (Profile/Shelves/Recs/Lists) live at the TOP of the screen
 * (in ProfileView, above the header), so this segment's own sub-nav sits BELOW
 * the profile info and never stacks against them:
 *   1. Media type — the four shelves as their own bar (Movies/Shows/Books/Games,
 *      icon + label chips, the active one accent-tinted).
 *   2. Status section — the sections `SHELF_CONFIG[type]` offers for the chosen
 *      type (Watched / Watchlist / …), as chips beneath the type bar.
 * Both bars are `rounded-sm` (no pills), consistent with the primary tabs.
 *
 * Switching TYPE resets the section to that type's FIRST section (each type has
 * a different section set, so the old section key is meaningless under the new
 * type). Section state is a single index into `SHELF_CONFIG[type]`.
 *
 * ── Grid (renders inside ProfileView's parent ScrollView) ───────────────────
 * ProfileView owns the outer vertical `ScrollView`, so this tab must NOT nest a
 * vertical scroller (a `FlatList` here would fight the parent's scroll +
 * mis-measure). Instead the grid is a flex-wrap `View` of fixed-width cells — a
 * 4-column poster grid (fixed quarter-width, so a partial last row left-aligns
 * rather than stretching, mirroring the search grid's fixed-cell approach).
 * Cards are poster + title only: NO year, and rating stars ONLY when the owner
 * actually rated the title (no community-average fallback → no empty stars).
 *
 * ── Owner rating vs viewer overlay ──────────────────────────────────────────
 * Each card shows the SHELF OWNER's own rating/heart by default (it's their
 * shelf) — carried on every `ProfileShelfItem` (owner `rating` + `is_favorite`
 * off their `user_media` row). When a NON-owner viewer browses the shelf, the
 * VIEWER's own tracking (from `useViewerTrackingMap` over the visible ids)
 * overrides per card where present — so a card reflects the viewer's rating on
 * titles THEY'VE tracked, and the owner's otherwise. On the owner's OWN shelf
 * the two coincide, so the overlay is skipped (isOwner).
 *
 * ── Deferred (web has these; v1 does not) ───────────────────────────────────
 * Genre / decade / platform filters + sort (web's `MediaFilterBar`) — v1 ships
 * the status sections only. Pagination (SHELF_LIMIT caps the read). Noted in
 * the plan.
 *
 * Mobile primitives only; icons color via the `color` PROP; design tokens only.
 */
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { colors } from "@intertaind/design-system";
import { type MediaType, MEDIA_TYPE_CONFIG } from "@intertaind/types";

import { MediaCard } from "@/components/media/media-card";
import { cardMediaFromHomeItem } from "@/components/media/card-media";
import { SHELF_CONFIG } from "@/components/profile/shelf-config";
import {
  MEDIA_TYPE_ICON_COLOR,
  MEDIA_TYPE_ICONS,
} from "@/lib/media-type-icons";
import { useProfileShelf } from "@/queries/profile";
import { useViewerTrackingMap } from "@/queries/home";

/** The four domain types, in the type-selector's display order. */
const TYPE_ORDER: MediaType[] = ["movie", "tv_show", "book", "video_game"];

/** 4-column poster grid. Fixed quarter-width cells (see file header). */
const NUM_COLUMNS = 4;
/** Gutter between grid columns / rows (points). */
const GRID_GAP = 12;
/** The horizontal padding the parent ScrollView body applies (profile-view). */
const CONTENT_PADDING = 16;

export function ShelvesTab({
  userId,
  isOwner,
}: {
  /** The resolved profile owner's id — the shelf being browsed. */
  userId: string;
  /** True when the viewer IS the profile owner (skips the viewer overlay). */
  isOwner: boolean;
}) {
  const { width } = useWindowDimensions();
  // Fixed third-width cell: (screen − the profile body's side padding − the two
  // gutters) / 3. Every card is exactly this wide, so a partial last row keeps
  // its cards a third-width and left-aligns instead of stretching to fill.
  const cellWidth =
    (width - CONTENT_PADDING * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

  const [type, setType] = useState<MediaType>("movie");
  // The active section is an INDEX into SHELF_CONFIG[type] — resilient to the
  // section SETS differing per type (a key from one type may not exist in
  // another; an index always resolves against the current type's list).
  const [sectionIndex, setSectionIndex] = useState(0);

  const sections = SHELF_CONFIG[type];
  // Clamp defensively — sectionIndex is reset to 0 on every type change, but a
  // guard keeps a render between the two setState calls from indexing past end.
  const section = sections[Math.min(sectionIndex, sections.length - 1)];

  const shelfQuery = useProfileShelf(userId, type, section);
  const items = shelfQuery.data ?? [];

  // Viewer overlay: only when browsing SOMEONE ELSE's shelf. On the owner's own
  // shelf the embedded owner rating already IS the viewer's, so skip the round
  // trip (pass [] → the hook stays disabled). Keyed by the visible ids.
  const overlayIds = isOwner ? [] : items.map((item) => item.id);
  const viewerQuery = useViewerTrackingMap(overlayIds);
  const viewerMap = viewerQuery.data;

  function selectType(next: MediaType) {
    setType(next);
    // Different types expose different section sets → reset to the first.
    setSectionIndex(0);
  }

  return (
    <View className="gap-3">
      {/* (1) Media-type bar — the four shelves, icon + label chips (rounded-sm),
          active one accent-tinted. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {TYPE_ORDER.map((t) => {
          const active = t === type;
          const Icon = MEDIA_TYPE_ICONS[t];
          return (
            <Pressable
              key={t}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Show ${MEDIA_TYPE_CONFIG[t].label}`}
              onPress={() => selectType(t)}
              className={`flex-row items-center gap-1.5 rounded-sm px-3 py-1.5 active:opacity-70 ${
                active ? "bg-surface-overlay" : ""
              }`}
            >
              <Icon
                size={16}
                color={active ? MEDIA_TYPE_ICON_COLOR[t] : colors["text-muted"]}
              />
              <Text
                className={`text-sm font-medium ${
                  active ? "text-text-primary" : "text-text-muted"
                }`}
              >
                {MEDIA_TYPE_CONFIG[t].label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* (2) Status sections for the active type — chips (rounded-sm) beneath. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {sections.map((s, i) => {
          const active = i === sectionIndex;
          return (
            <Pressable
              key={s.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={s.label}
              onPress={() => setSectionIndex(i)}
              className={`rounded-sm px-3 py-1.5 active:opacity-70 ${
                active ? "bg-brand" : "border border-surface-border"
              }`}
            >
              <Text
                className={`text-sm font-medium ${
                  active ? "text-text-primary" : "text-text-muted"
                }`}
              >
                {s.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* The section's poster grid / states. */}
      {shelfQuery.isPending ? (
        <View className="items-center py-12">
          <ActivityIndicator color={colors["text-muted"]} />
        </View>
      ) : shelfQuery.error ? (
        <Text className="py-8 text-center text-sm text-text-muted">
          Couldn&apos;t load this shelf.
        </Text>
      ) : items.length === 0 ? (
        <Text className="py-8 text-center text-sm text-text-muted">
          {`No ${MEDIA_TYPE_CONFIG[type].label.toLowerCase()} in ${section.label.toLowerCase()}.`}
        </Text>
      ) : (
        <View
          className="flex-row flex-wrap"
          style={{ gap: GRID_GAP }}
        >
          {items.map((item) => {
            // Owner rating by default; a non-owner viewer's own tracking (if
            // present) overrides per card. On the owner's own shelf, viewerMap
            // is undefined (overlay skipped), so this always uses the owner row.
            const viewer = viewerMap?.get(item.id);
            const tracking = viewer
              ? {
                  status: viewer.status,
                  rating: viewer.rating,
                  is_favorite: viewer.is_favorite,
                }
              : {
                  // Owner-side fallback: the embedded owner rating/heart. Status
                  // isn't needed for the meta row; a benign placeholder keeps
                  // the MediaCard tracking shape satisfied.
                  status: "",
                  rating: item.rating,
                  is_favorite: item.is_favorite ?? false,
                };
            return (
              <View key={item.id} style={{ width: cellWidth }}>
                <MediaCard
                  media={cardMediaFromHomeItem(item)}
                  tracking={tracking}
                  showYear={false}
                  compact
                  onMutated={() => {
                    // A viewer quick-action on someone else's shelf card writes
                    // the VIEWER's tracking → refresh the overlay so the card's
                    // active states update. Owner shelves skip the overlay.
                    if (!isOwner) void viewerQuery.refetch();
                  }}
                />
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
