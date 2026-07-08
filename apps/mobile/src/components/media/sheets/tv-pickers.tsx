/**
 * Shared Season / Episode chip pickers for the three TV tracking sheets.
 *
 * Mobile has no native `<select>` (web's modals render one), so the
 * season list + episode grid become horizontally-scrollable rows of
 * chips — the clean, token-consistent native analogue called for by the
 * task brief. Both rows scroll horizontally so a long series (many
 * seasons) or a long season (many episodes) never blows out the sheet
 * height.
 *
 * Design grammar mirrors the sheets' locked chrome + web's TV modals: a
 * muted "Season" / "Episode" label, chips as sharp-cornered
 * `surface-border` boxes, the SELECTED chip lit in the TV accent
 * (`accent-tv`, matching web's `bg-accent-tv/15 text-accent-tv border`
 * treatment), and — for the episode grid — a subtle "already watched"
 * fill on episodes the viewer has logged (web's watched-episode hint).
 * Tokens only; the selected/watched accents read from `colors` for the
 * few style-prop surfaces NativeWind can't reach.
 */
import { Pressable, ScrollView, Text, View } from "react-native";
import { Check } from "lucide-react-native";
import { colors } from "@intertaind/design-system";

/** One tappable chip (season or episode). Selected lights in accent-tv. */
function Chip({
  label,
  selected,
  watched,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  selected: boolean;
  /** Episode chips only — a subtle fill + check on already-logged episodes. */
  watched?: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`relative min-w-[44px] items-center justify-center rounded-sm border px-3 py-2 active:opacity-70 ${
        selected
          ? "border-accent-tv bg-accent-tv/15"
          : watched
            ? "border-accent-tv/30 bg-accent-tv/10"
            : "border-surface-border bg-surface-overlay"
      }`}
    >
      <Text
        className={`text-sm font-medium ${
          selected || watched ? "text-accent-tv" : "text-text-secondary"
        }`}
      >
        {label}
      </Text>
      {watched && !selected ? (
        <View className="absolute right-0.5 top-0.5">
          <Check size={9} color={colors["accent-tv"]} />
        </View>
      ) : null}
    </Pressable>
  );
}

/** Horizontal scroll of season chips (`S1`, `S2`, …). */
export function SeasonChips({
  seasonNumbers,
  selected,
  onSelect,
}: {
  seasonNumbers: number[];
  selected: number;
  onSelect: (season: number) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8 }}
    >
      {seasonNumbers.map((s) => (
        <Chip
          key={s}
          label={`S${s}`}
          selected={selected === s}
          accessibilityLabel={`Season ${s}`}
          onPress={() => onSelect(s)}
        />
      ))}
    </ScrollView>
  );
}

/**
 * Horizontal scroll of episode chips (`1`..`episodeCount`). When
 * `episodeCount` is 0 (unknown — no metadata for the season) renders a
 * muted note instead, mirroring web's "episode count not available"
 * fallback (mobile omits web's manual-count input to keep the sheet a
 * single-write flow).
 */
export function EpisodeChips({
  episodeCount,
  selected,
  watchedEpisodes,
  onSelect,
}: {
  episodeCount: number;
  selected: number | null;
  /** Episodes already logged for the chosen season (subtle fill + check). */
  watchedEpisodes?: number[];
  onSelect: (episode: number) => void;
}) {
  if (episodeCount <= 0) {
    return (
      <Text className="text-sm text-text-muted">
        Episode list unavailable for this season.
      </Text>
    );
  }
  const watched = new Set(watchedEpisodes ?? []);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8 }}
    >
      {Array.from({ length: episodeCount }, (_, i) => i + 1).map((ep) => (
        <Chip
          key={ep}
          label={String(ep)}
          selected={selected === ep}
          watched={watched.has(ep)}
          accessibilityLabel={`Episode ${ep}`}
          onPress={() => onSelect(ep)}
        />
      ))}
    </ScrollView>
  );
}
