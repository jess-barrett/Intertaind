/**
 * ListsTab — the "Lists" segment of the shared `ProfileView`. Lists the profile
 * owner's CREATED lists (v1: created only), newest-touched first — the RN mirror
 * of web's `/u/[username]/lists` "Created" tab + `BrowseListRow`.
 *
 * ── Card grammar (web parity) ───────────────────────────────────────────────
 * Each card is a vertical block: a small overlapping COVER COLLAGE (up to
 * LIST_PREVIEW_COUNT poster thumbnails from `covers`, left-anchored and
 * overlapping so several titles read across the strip — the RN analogue of
 * web's `ListCoverStack`), then the list title, a meta row (author · item count
 * · like count with a Heart glyph), and the optional description (2 lines).
 *
 * ── NON-NAVIGABLE in v1 ─────────────────────────────────────────────────────
 * There is no mobile list-detail route yet, so a card has NOWHERE to go — it
 * renders as a plain `View`, NOT a `Pressable`/link. See the TODO on the card.
 *
 * ── Renders inside ProfileView's ScrollView ─────────────────────────────────
 * ProfileView owns the outer vertical `ScrollView`, so this tab is a plain
 * `View` list (no nested vertical scroller, which would fight the parent's
 * scroll). Structure/spacing/empty-state mirror ShelvesTab/RecommendationsTab.
 *
 * States: pending → spinner; error → a muted line; settled-empty → a muted
 * empty state (owner: "You haven't created any lists yet."; other: "No public
 * lists.").
 *
 * ── Deferred (web has these; v1 does not) ───────────────────────────────────
 * The Saved (liked) lists sub-tab (`list_saves`); the list-detail route + list
 * navigation (cards are non-navigable v1); `friends_unlisted` handling beyond
 * what RLS enforces. Noted in the plan + the query hook.
 *
 * Mobile primitives only; `Image` from `@/components/image`; icons color via the
 * `color` PROP; design tokens only.
 */
import { ActivityIndicator, Text, View } from "react-native";
import { Heart, ListMusic, User } from "lucide-react-native";
import { colors } from "@intertaind/design-system";

import { Image } from "@/components/image";
import { useProfileLists, type ProfileListCard } from "@/queries/profile";

/** Width of each collage cover thumbnail (points). */
const COVER_WIDTH = 44;
/** Cover aspect (poster: ~2:3). */
const COVER_HEIGHT = 64;
/** How much of each preceding cover a following one reveals (left offset). */
const COVER_OFFSET = 30;

export function ListsTab({
  userId,
  isOwner,
}: {
  /** The resolved profile owner's id — whose created lists these are. */
  userId: string;
  /** True when the viewer IS the profile owner (widens the empty-state copy;
   *  also drives the query's private-list visibility filter). */
  isOwner: boolean;
}) {
  const listsQuery = useProfileLists(userId, isOwner);
  const lists = listsQuery.data ?? [];

  if (listsQuery.isPending) {
    return (
      <View className="items-center py-12">
        <ActivityIndicator color={colors["text-muted"]} />
      </View>
    );
  }

  if (listsQuery.error) {
    return (
      <Text className="py-8 text-center text-sm text-text-muted">
        Couldn&apos;t load lists.
      </Text>
    );
  }

  if (lists.length === 0) {
    return (
      <Text className="py-12 text-center text-sm text-text-muted">
        {isOwner ? "You haven't created any lists yet." : "No public lists."}
      </Text>
    );
  }

  return (
    <View className="gap-6">
      {lists.map((card) => (
        <ListCard key={card.list.id} card={card} />
      ))}
    </View>
  );
}

/**
 * One created-list card: an overlapping cover collage, the title, a meta row
 * (author · item count · like count), and the optional description. Mirrors
 * web's `BrowseListRow`.
 *
 * TODO(list-detail route): non-navigable in v1 — there is no mobile list-detail
 * route yet, so this is a plain `View`, not a `Pressable`/link. Wrap it in a
 * tap target routing to the list once that route exists.
 */
function ListCard({ card }: { card: ProfileListCard }) {
  const { list, author, covers } = card;
  const authorName = author.display_name || author.username;

  return (
    <View className="gap-2.5">
      {/* Cover collage — overlapping poster thumbnails (web's ListCoverStack). */}
      {covers.length > 0 ? (
        <View
          className="flex-row"
          style={{
            height: COVER_HEIGHT,
            // Width = the last cover's left edge + one full cover.
            width: COVER_OFFSET * (covers.length - 1) + COVER_WIDTH,
          }}
        >
          {covers.map((src, i) => (
            <Image
              key={`${list.id}-${i}`}
              source={{ uri: src }}
              contentFit="cover"
              className="absolute rounded-md border border-surface-border bg-surface-overlay"
              style={{
                width: COVER_WIDTH,
                height: COVER_HEIGHT,
                left: i * COVER_OFFSET,
                // Later covers layer over earlier ones (left-anchored strip).
                zIndex: i,
              }}
            />
          ))}
        </View>
      ) : (
        // No covers (empty list) — a neutral placeholder tile so the card keeps
        // its shape rather than collapsing.
        <View
          className="items-center justify-center rounded-md border border-surface-border bg-surface-overlay"
          style={{ width: COVER_WIDTH, height: COVER_HEIGHT }}
        >
          <ListMusic size={18} color={colors["text-muted"]} />
        </View>
      )}

      {/* Title. */}
      <Text
        className="text-base font-semibold text-text-primary"
        numberOfLines={2}
      >
        {list.title}
      </Text>

      {/* Meta row — author · item count · like count. */}
      <View className="flex-row items-center gap-2">
        <View className="flex-row items-center gap-1">
          {author.avatar_url ? (
            <Image
              source={{ uri: author.avatar_url }}
              contentFit="cover"
              className="rounded-full border border-surface-border bg-surface-overlay"
              style={{ width: 16, height: 16 }}
            />
          ) : (
            <View className="h-4 w-4 items-center justify-center rounded-full border border-surface-border bg-surface-overlay">
              <User size={9} color={colors["text-muted"]} />
            </View>
          )}
          <Text className="text-xs font-medium text-text-secondary">
            {authorName}
          </Text>
        </View>

        <Text className="text-xs text-text-muted" accessibilityElementsHidden>
          ·
        </Text>
        <Text className="text-xs text-text-muted">
          {list.item_count} {list.item_count === 1 ? "item" : "items"}
        </Text>

        <Text className="text-xs text-text-muted" accessibilityElementsHidden>
          ·
        </Text>
        <View className="flex-row items-center gap-1">
          <Heart size={11} color={colors["text-muted"]} />
          <Text className="text-xs text-text-muted">{list.like_count ?? 0}</Text>
        </View>
      </View>

      {/* Optional description. */}
      {list.description ? (
        <Text
          className="text-sm leading-relaxed text-text-secondary"
          numberOfLines={2}
        >
          {list.description}
        </Text>
      ) : null}
    </View>
  );
}
