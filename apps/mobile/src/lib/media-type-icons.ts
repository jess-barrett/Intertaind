/**
 * Per-media-type icon map — the RN mirror of web's
 * `apps/web/src/lib/media-type-icons.ts`. Same lucide glyph NAMES
 * (movie→Film, tv_show→Tv, book→BookOpen, video_game→Gamepad2), but
 * imported from `lucide-react-native` (web uses `lucide-react`).
 *
 * Why a separate map instead of sharing from `@intertaind/types`:
 * `MEDIA_TYPE_CONFIG` there carries colors/labels (className tokens),
 * which are cross-platform, but icon COMPONENTS can't be shared — the
 * two lucide builds (`lucide-react` vs `lucide-react-native`) are
 * different libraries rendering to DOM vs react-native-svg. So each app
 * keeps its own component map keyed by the same lucide names.
 *
 * Coloring: lucide-react-native icons render through react-native-svg,
 * so their color comes from the `color` PROP (a hex string, typically
 * `colors[...]` from `@intertaind/design-system`) — a NativeWind
 * `className` won't reach the SVG. Size comes from the `size` prop.
 *
 * Note: the domain `MediaType` is exactly the 4 types below (the DB
 * enum's extra `board_game` is not part of `MediaType`), so this map is
 * total with no fallback needed.
 */
import {
  BookOpen,
  Film,
  Gamepad2,
  Tv,
  type LucideIcon,
} from "lucide-react-native";
import { colors } from "@intertaind/design-system";
import type { MediaType } from "@intertaind/types";

export const MEDIA_TYPE_ICONS: Record<MediaType, LucideIcon> = {
  movie: Film,
  tv_show: Tv,
  book: BookOpen,
  video_game: Gamepad2,
};

/**
 * Per-media-type accent HEX for a type glyph (the react-native-svg `color`
 * prop — a className won't reach the SVG). The consistent, app-wide color
 * for each media type: movie red-pink, TV purple, book green, game gold.
 * Use this everywhere a media-type icon is shown so the color reads the
 * same across the app.
 */
export const MEDIA_TYPE_ICON_COLOR: Record<MediaType, string> = {
  movie: colors["accent-movie"],
  tv_show: colors["accent-tv"],
  book: colors["accent-book"],
  video_game: colors["accent-game"],
};
