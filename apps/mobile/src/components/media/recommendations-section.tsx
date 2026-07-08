/**
 * Recommendations ("intertains") section for the media detail screen —
 * the RN mirror of web's `MediaRecommendationsSection`
 * (apps/web/src/components/recommendations/media-recommendations-section.tsx).
 *
 * A cross-media pairing ("intertain") is a `recommendations` row —
 * "if you liked SOURCE, try RECOMMENDED", authored by a user. This
 * section shows BOTH directions for the current media, behind a toggle:
 *
 *   - "Pairs with this"     → recs WHERE this media is the SOURCE; each
 *                             card renders the RECOMMENDED target.
 *   - "Intertaind for this" → recs WHERE this media is the RECOMMENDED
 *                             target; each card renders the SOURCE.
 *
 * The two directions are fetched independently (one query each) so the
 * toggle flips instantly between already-cached lists — the mobile
 * analogue of web holding both in props. Each list is capped at 20 (the
 * hooks' limit); a "see all" screen is a later addition.
 *
 * Empty-state grammar (locked "no empty headings" rule, web parity):
 *   - BOTH directions empty → render `null` (no heading with no body).
 *   - Only the ACTIVE direction empty (the other has items) → keep the
 *     heading + toggle, show a small "No pairings yet" for that tab.
 * The toggle only renders a tab for a direction that HAS items (web
 * parity — no disabled "0 results" tab), and defaults to whichever side
 * has content.
 *
 * Visual language mirrors the detail screen + info-sections: sharp
 * corners, hairline `surface-border`, 2:3 poster, `brand` accent on the
 * active tab, design tokens only. Each card taps through to the paired
 * media's detail (`router.push('/media/<id>')`).
 */
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { User } from "lucide-react-native";
import { colors } from "@intertaind/design-system";

import { Image } from "@/components/image";
import { SectionHeading } from "@/components/media/section-heading";
import {
  useRecommendationsForSource,
  useRecommendationsForTarget,
  type RecommendationCardAuthor,
  type RecommendationCardMedia,
} from "@/queries/recommendations";

type Direction = "with" | "for";

/** First 4 digits of an ISO date, mirroring the detail screen's yearFrom. */
function yearFrom(dateString: string | null): string | null {
  return dateString?.match(/^(\d{4})/)?.[1] ?? null;
}

export function RecommendationsSection({ mediaId }: { mediaId: string }) {
  const router = useRouter();
  const pairsWith = useRecommendationsForSource(mediaId);
  const recommendedFor = useRecommendationsForTarget(mediaId);

  const withItems = pairsWith.data ?? [];
  const forItems = recommendedFor.data ?? [];
  const hasWith = withItems.length > 0;
  const hasFor = forItems.length > 0;

  // Default to whichever side has content so the first paint is useful.
  const [direction, setDirection] = useState<Direction>("with");

  // While either query is still loading we can't yet know if the section
  // is empty — show a spinner rather than flashing null then popping in.
  const loading = pairsWith.isPending || recommendedFor.isPending;
  if (loading) {
    return (
      <View className="gap-4">
        <SectionHeading>Intertaind</SectionHeading>
        <View className="items-center py-6">
          <ActivityIndicator color={colors["text-muted"]} />
        </View>
      </View>
    );
  }

  // Both directions empty → render nothing (no heading with no body).
  if (!hasWith && !hasFor) return null;

  // Guard the toggle against a direction that has no tab: if the active
  // direction has no items but the other does, the active tab isn't shown,
  // so resolve to a direction that actually has a tab.
  const activeDirection: Direction = hasWith && hasFor
    ? direction
    : hasWith
      ? "with"
      : "for";

  const activeItems = activeDirection === "with" ? withItems : forItems;

  return (
    <View className="gap-4">
      <View className="gap-3">
        <SectionHeading>Intertaind</SectionHeading>

        {/* Tab pair — only the side(s) with content get a tab (web parity:
            no disabled "0 results" tab). The active tab carries the brand
            accent, matching the info-sections tab treatment. */}
        <View className="flex-row gap-2">
          {hasWith ? (
            <DirectionTab
              label="Pairs with this"
              active={activeDirection === "with"}
              onPress={() => setDirection("with")}
            />
          ) : null}
          {hasFor ? (
            <DirectionTab
              label="Intertaind for this"
              active={activeDirection === "for"}
              onPress={() => setDirection("for")}
            />
          ) : null}
        </View>
      </View>

      {activeItems.length === 0 ? (
        // The active tab exists (the other direction has items) but this
        // one is empty — a small inline note rather than a bare gap.
        <Text className="text-sm text-text-muted">No pairings yet.</Text>
      ) : (
        <View className="gap-4">
          {activeDirection === "with"
            ? withItems.map((r) => (
                <RecommendationCard
                  key={r.id}
                  media={r.recommended_media}
                  author={r.profiles}
                  note={r.note}
                  onPress={() => router.push(`/media/${r.recommended_media.id}`)}
                />
              ))
            : forItems.map((r) => (
                <RecommendationCard
                  key={r.id}
                  media={r.source_media}
                  author={r.profiles}
                  note={r.note}
                  onPress={() => router.push(`/media/${r.source_media.id}`)}
                />
              ))}
        </View>
      )}
    </View>
  );
}

/** A single direction tab — brand accent underline when active (mirrors
    the info-sections tab strip). */
function DirectionTab({
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
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      className={`rounded-sm border px-3 py-1.5 active:opacity-70 ${
        active
          ? "border-brand bg-brand/10"
          : "border-surface-border bg-surface-overlay"
      }`}
    >
      <Text
        className={`text-xs font-medium ${
          active ? "text-brand" : "text-text-muted"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * One recommendation as a horizontal card: paired media poster (2:3) +
 * title/year/type + author attribution + optional note. The whole card
 * taps through to the paired media's detail. Mirrors web's
 * `RecommendationCard` (poster · recommender chip · headline · note),
 * adapted to a touch target.
 */
function RecommendationCard({
  media,
  author,
  note,
  onPress,
}: {
  media: RecommendationCardMedia;
  author: RecommendationCardAuthor;
  note: string | null;
  onPress: () => void;
}) {
  const year = yearFrom(media.release_date);
  const attribution = author.display_name || author.username || "someone";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${media.title}`}
      onPress={onPress}
      className="flex-row items-start gap-3 active:opacity-70"
    >
      {/* Poster — 2:3, sharp corners + hairline border, matching the
          detail-screen cover treatment. */}
      <View className="aspect-[2/3] w-16 shrink-0 overflow-hidden rounded-sm border border-surface-border bg-surface-overlay">
        {media.cover_image_url ? (
          <Image
            source={{ uri: media.cover_image_url }}
            className="h-full w-full"
            contentFit="cover"
            accessible
            accessibilityLabel={`${media.title} cover`}
          />
        ) : (
          <View className="h-full w-full items-center justify-center">
            <Text className="text-xs text-text-muted">—</Text>
          </View>
        )}
      </View>

      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-base font-semibold text-text-primary" numberOfLines={2}>
          {media.title}
          {year ? (
            <Text className="font-normal text-text-muted">
              {"  "}
              {year}
            </Text>
          ) : null}
        </Text>

        {/* Author attribution — "Intertaind by @username", mirroring web's
            recommender chip (avatar shown when present, glyph otherwise). */}
        <View className="flex-row items-center gap-1.5">
          {author.avatar_url ? (
            <Image
              source={{ uri: author.avatar_url }}
              className="h-4 w-4 rounded-full border border-surface-border"
              contentFit="cover"
              accessible={false}
            />
          ) : (
            <View className="h-4 w-4 items-center justify-center rounded-full border border-surface-border bg-surface-overlay">
              <User size={9} color={colors["text-muted"]} />
            </View>
          )}
          <Text className="text-xs text-text-secondary" numberOfLines={1}>
            Intertaind by {attribution}
          </Text>
        </View>

        {/* Optional note — the author's "why". Clamped to a few lines. */}
        {note ? (
          <Text
            className="text-sm leading-relaxed text-text-secondary"
            numberOfLines={3}
          >
            “{note}”
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
