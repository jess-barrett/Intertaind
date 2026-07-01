import { Share2 } from "lucide-react";
import {
  LIST_TYPES_REQUIRING_SOURCE,
  MEDIA_TYPE_CONFIG,
  type List,
  type MediaItem,
  type MediaType,
} from "@intertaind/types";
import { MEDIA_TYPE_ICONS } from "@/lib/media-type-icons";

type SourceLite = Pick<MediaItem, "media_type"> | null | undefined;

/**
 * Renders the media-type icon strip that appears on every list card
 * and the list detail page. Two layouts:
 *
 *   - Source-anchored lists (`if_you_liked`, `vibe`): the source's
 *     media-type icon → `git-compare-arrows` → the list's selected
 *     media-type icons. Communicates "this movie pairs with these
 *     books and games" at a glance.
 *   - Everything else: just the list's selected media-type icons.
 *
 * Returns null when there's nothing meaningful to show — never renders
 * an empty container so cards don't end up with an unexplained gap.
 */
export default function ListMediaIcons({
  list,
  sourceMedia,
  iconSize = 14,
  className,
}: {
  list: Pick<List, "list_type" | "media_types">;
  sourceMedia?: SourceLite;
  iconSize?: number;
  className?: string;
}) {
  const listTypes = list.media_types ?? [];
  const isSourceAnchored = LIST_TYPES_REQUIRING_SOURCE.includes(list.list_type);
  const sourceType = isSourceAnchored ? sourceMedia?.media_type ?? null : null;

  if (listTypes.length === 0 && !sourceType) return null;

  if (isSourceAnchored && sourceType) {
    if (listTypes.length === 0) {
      // Source set but no list media-types selected — just show the
      // source icon on its own, no arrow (the arrow without a target
      // reads as broken).
      return (
        <div
          className={`flex flex-wrap items-center gap-x-1.5 gap-y-1 text-text-muted ${
            className ?? ""
          }`}
        >
          <IconRow types={[sourceType]} iconSize={iconSize} />
        </div>
      );
    }
    return (
      <div
        className={`flex flex-wrap items-center gap-x-1.5 gap-y-1 text-text-muted ${
          className ?? ""
        }`}
      >
        <IconRow types={[sourceType]} iconSize={iconSize} />
        <Share2
          size={iconSize}
          className="shrink-0 text-text-muted/70"
          aria-label="paired with"
        />
        <IconRow types={listTypes} iconSize={iconSize} />
      </div>
    );
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-x-1.5 gap-y-1 text-text-muted ${
        className ?? ""
      }`}
    >
      <IconRow types={listTypes} iconSize={iconSize} />
    </div>
  );
}

function IconRow({
  types,
  iconSize,
}: {
  types: MediaType[];
  iconSize: number;
}) {
  return (
    <span className="flex items-center gap-1">
      {types.map((t) => {
        const Icon = MEDIA_TYPE_ICONS[t];
        const label = MEDIA_TYPE_CONFIG[t].label;
        const color = MEDIA_TYPE_CONFIG[t].color;
        return (
          <span key={t} title={label} className="inline-flex">
            <Icon size={iconSize} aria-label={label} className={color} />
          </span>
        );
      })}
    </span>
  );
}
