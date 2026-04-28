import { BookOpen, Film, Gamepad2, Tv, type LucideIcon } from "lucide-react";
import type { MediaType } from "@/lib/types";

/**
 * Single source of truth for the icon used to represent each media
 * type. The same Lucide glyphs were already inlined into half a dozen
 * components — pulling them here keeps the visual vocabulary
 * consistent and lets new surfaces (list cards, badges, filter pills)
 * import without re-deriving the map.
 */
export const MEDIA_TYPE_ICONS: Record<MediaType, LucideIcon> = {
  movie: Film,
  tv_show: Tv,
  book: BookOpen,
  video_game: Gamepad2,
};
