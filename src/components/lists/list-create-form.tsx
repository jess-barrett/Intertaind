"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Save,
  Trash2,
  X,
} from "lucide-react";
import CoverImage from "@/components/cover-image";
import InlineMediaPicker from "@/components/lists/inline-media-picker";
import TagInput from "@/components/lists/tag-input";
import MediaTypeMultiSelect from "@/components/lists/media-type-multiselect";
import VisibilitySelect from "@/components/lists/visibility-select";
import FilterDropdown from "@/components/filter-dropdown";
import {
  GENRE_OPTIONS,
  genreToTag,
  moodToTag,
} from "@/components/lists/genre-options";
import { createList } from "@/app/actions/lists";
import { toast } from "@/lib/toast";
import {
  LIST_TYPE_LABELS,
  LIST_TYPES_REQUIRING_SOURCE,
  SELECTABLE_LIST_TYPES,
  type ListType,
  type ListVisibility,
  type MediaType,
  type SearchResult,
} from "@/lib/types";
import { MEDIA_TYPE_CONFIG } from "@/lib/types";

interface PickedItem {
  mediaId: string;
  title: string;
  cover: string | null;
  mediaType: MediaType;
  reason: string;
}

/**
 * Compose the auto-suggested title for "If you liked…" lists from the
 * source media's title plus the chosen media types:
 *   1 type:  "If you liked Severance try these Books"
 *   2 types: "If you liked Severance try these Books and Movies"
 *   3+:      "If you liked Severance try these Books, Movies, and TV Shows"
 */
function buildIfYouLikedTitle(
  sourceTitle: string,
  types: MediaType[]
): string {
  const labels = types.map((t) => MEDIA_TYPE_CONFIG[t].label);
  let mediaPart: string;
  if (labels.length === 1) {
    mediaPart = labels[0];
  } else if (labels.length === 2) {
    mediaPart = `${labels[0]} and ${labels[1]}`;
  } else {
    mediaPart = `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
  }
  return `If you liked ${sourceTitle} try these ${mediaPart}`;
}

/**
 * Build a search placeholder that names the media types the curator
 * picked. Reads "Search movies and books…" when restricted, falls back
 * to the full menu when the user hasn't selected anything.
 */
function pickerPlaceholder(mediaTypes: MediaType[]): string {
  const labels: Record<MediaType, string> = {
    movie: "movies",
    tv_show: "shows",
    book: "books",
    video_game: "games",
  };
  if (mediaTypes.length === 0 || mediaTypes.length === 4) {
    return "Search movies, TV, books, or games…";
  }
  const names = mediaTypes.map((t) => labels[t]);
  if (names.length === 1) return `Search ${names[0]}…`;
  if (names.length === 2) return `Search ${names[0]} and ${names[1]}…`;
  return `Search ${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}…`;
}

const TYPE_HINTS: Record<ListType, string> = {
  curated: "A general 'things I love' list — anything goes",
  if_you_liked: "Recommendations anchored on a specific title you'd suggest after",
  genre: "Best-of for a single genre across one or more media types",
  vibe: "Captures the feel of a specific title — atmosphere, mood, pacing",
  mood: "Things to watch/read/play in a specific emotional state",
  cross_media: "Explicit cross-media pairing — books that pair with movies, etc.",
};

export default function ListCreateForm() {
  const router = useRouter();
  // Manual pending flag instead of useTransition. Next's useTransition
  // ties pending state to the navigation completing, which gets stuck
  // in dev mode (HMR / Fast Refresh) even though the destination page
  // renders fine. Plain state + manual reset is more predictable.
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  // Tracks whether the title is currently the auto-suggested string
  // (true = we own it, can keep updating it as inputs change). Flips to
  // false the moment the user types something into the title input —
  // their edit is sacred and won't be overwritten. Resets back to true
  // when they clear the field, so they can grab the suggestion again.
  const [titleAutoFilled, setTitleAutoFilled] = useState(true);
  const [description, setDescription] = useState("");
  const [mediaTypes, setMediaTypes] = useState<MediaType[]>([]);
  const [listType, setListType] = useState<ListType>("curated");
  const [sourceMedia, setSourceMedia] = useState<{
    mediaId: string;
    title: string;
    cover: string | null;
    mediaType: MediaType;
  } | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  // Optional genre selection for list_type === "genre". Stored as a
  // tag at submit time so it slots into the existing tag GIN index
  // for discovery filters without a new schema column.
  const [genre, setGenre] = useState<string | null>(null);
  // Free-form primary mood for list_type === "mood". Same storage
  // approach (folded into tags), but with a `mood:` prefix on the
  // stored tag so the edit form can extract it unambiguously from
  // user-entered tags.
  const [mood, setMood] = useState("");
  const [visibility, setVisibility] = useState<ListVisibility>("public");
  // Ranked lists number their items from #1 on the detail page and
  // suppress the sort controls (position IS the order).
  const [ranked, setRanked] = useState(false);
  const [items, setItems] = useState<PickedItem[]>([]);

  const requiresSource = LIST_TYPES_REQUIRING_SOURCE.includes(listType);
  const titleValid = title.trim().length > 0;
  const sourceValid = !requiresSource || !!sourceMedia;
  const canSubmit = titleValid && sourceValid && !pending;

  // Auto-suggest title for "If you liked…" lists: flows source title +
  // chosen media types into a sentence the curator probably wants
  // anyway. Stops as soon as the user types over it.
  useEffect(() => {
    if (!titleAutoFilled) return;
    if (listType !== "if_you_liked") return;
    if (!sourceMedia) return;
    if (mediaTypes.length === 0) return;
    setTitle(buildIfYouLikedTitle(sourceMedia.title, mediaTypes));
  }, [titleAutoFilled, listType, sourceMedia, mediaTypes]);

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setTitle(next);
    // Clearing the field re-arms the auto-suggester. Anything else
    // counts as a manual edit and locks it.
    setTitleAutoFilled(next === "");
  }

  function handleAddItem(result: SearchResult, mediaId: string) {
    if (items.some((i) => i.mediaId === mediaId)) return;
    setItems((prev) => [
      ...prev,
      {
        mediaId,
        title: result.title,
        cover: result.cover_image_url,
        mediaType: result.media_type,
        reason: "",
      },
    ]);
  }

  function handleRemoveItem(mediaId: string) {
    setItems((prev) => prev.filter((i) => i.mediaId !== mediaId));
  }

  function handleMove(mediaId: string, dir: -1 | 1) {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.mediaId === mediaId);
      if (idx === -1) return prev;
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  function handleReason(mediaId: string, reason: string) {
    setItems((prev) =>
      prev.map((i) => (i.mediaId === mediaId ? { ...i, reason } : i))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setPending(true);
    try {
      // Fold the type-specific extra (genre / mood) into the tag set so
      // discovery filters (which run on the tags GIN index) treat them
      // like any other tag. Dedupe in case the user also typed them.
      let tagsForSave = tags;
      if (listType === "genre" && genre) {
        tagsForSave = Array.from(new Set([genreToTag(genre), ...tagsForSave]));
      }
      if (listType === "mood" && mood.trim().length > 0) {
        tagsForSave = Array.from(new Set([moodToTag(mood), ...tagsForSave]));
      }
      const id = await createList({
        title,
        description,
        list_type: listType,
        source_media_id: sourceMedia?.mediaId ?? null,
        media_types: mediaTypes,
        tags: tagsForSave,
        visibility,
        ranked,
        initial_items: items.map((i) => ({
          media_id: i.mediaId,
          reason: i.reason,
        })),
      });
      toast(`List “${title.trim()}” created`, { variant: "success" });
      router.push(`/lists/${id}`);
      // Note: we don't reset `pending` on success because the component
      // unmounts during navigation. Reset only on error.
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      toast(`Couldn't create list: ${message}`, { variant: "error" });
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-sm border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* List type leads the form — picking it changes which fields
          appear (e.g., source media for if-you-liked / vibe), so it's
          easier to set this first than backtrack to it. */}
      <Field label="List type" help={TYPE_HINTS[listType]}>
        <div className="flex flex-wrap gap-2">
          {SELECTABLE_LIST_TYPES.map((t) => {
            const isActive = listType === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setListType(t)}
                className={`rounded-sm border px-3 py-1.5 text-xs transition-colors ${
                  isActive
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-surface-border bg-surface-overlay text-text-secondary hover:border-brand/40"
                }`}
              >
                {LIST_TYPE_LABELS[t]}
              </button>
            );
          })}
        </div>
      </Field>

      {/* Genre dropdown — only when list_type is "genre". Gets folded
          into tags at submit time so it participates in discovery
          filters alongside the user's free-text tags. */}
      {listType === "genre" && (
        <Field
          label="Genre"
          help="The primary genre this list is about (TMDb's published list)."
        >
          <FilterDropdown
            value={genre ?? ""}
            placeholder="Pick a genre"
            onChange={(v) => setGenre(v || null)}
            options={[
              { value: "", label: "Pick a genre" },
              ...GENRE_OPTIONS.map((g) => ({ value: g, label: g })),
            ]}
          />
        </Field>
      )}

      {/* Primary mood — free-form so users can name moods we'd never
          enumerate in a fixed list ("nostalgic comfort", "dread", "hyped
          up", etc.). Same fold-into-tags-at-submit pattern as Genre. */}
      {listType === "mood" && (
        <Field
          label="Primary mood"
          help="What mood does this list capture? Free-form."
        >
          <input
            type="text"
            value={mood}
            onChange={(e) => setMood(e.target.value)}
            maxLength={60}
            placeholder="e.g. cozy melancholy"
            className="w-full rounded-sm border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
          />
        </Field>
      )}

      <Field
        label="Media types"
        help="Which kinds of media this list contains. Multi-select."
      >
        <MediaTypeMultiSelect value={mediaTypes} onChange={setMediaTypes} />
      </Field>

      {requiresSource && (
        <Field
          label="Source media"
          required
          help={
            listType === "if_you_liked"
              ? "The title this list is recommending after"
              : "The title whose vibe this list captures"
          }
        >
          {sourceMedia ? (
            <PickedRow
              title={sourceMedia.title}
              cover={sourceMedia.cover}
              mediaType={sourceMedia.mediaType}
              onRemove={() => setSourceMedia(null)}
            />
          ) : (
            <InlineMediaPicker
              placeholder="Pick a source title…"
              onPick={(r, mediaId) =>
                setSourceMedia({
                  mediaId,
                  title: r.title,
                  cover: r.cover_image_url,
                  mediaType: r.media_type,
                })
              }
            />
          )}
        </Field>
      )}

      <Field label="Title" required>
        <input
          type="text"
          value={title}
          onChange={handleTitleChange}
          maxLength={200}
          placeholder="e.g. Slow-burn cozy mysteries"
          className="w-full rounded-sm border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-text-primary focus:border-brand focus:outline-none"
        />
      </Field>

      <Field
        label="Description"
        help="What ties this list together? Why should someone read it?"
      >
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="A few sentences of context…"
          className="w-full resize-y rounded-sm border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-text-primary focus:border-brand focus:outline-none"
        />
      </Field>

      <Field
        label="Tags"
        help="Free text. Type a tag, press Enter to add. Click × to remove."
      >
        <TagInput tags={tags} onChange={setTags} />
      </Field>

      <Field label="Who can view">
        <VisibilitySelect value={visibility} onChange={setVisibility} />
      </Field>

      <Field
        label="Ranked list"
        help="Number items from #1 (top) to #N. Sort controls are hidden on ranked lists since position is the order."
      >
        <RankedToggle value={ranked} onChange={setRanked} />
      </Field>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
          Items ({items.length})
          {ranked && (
            <span className="ml-2 text-xs font-normal normal-case text-brand">
              ranked — drag to reorder
            </span>
          )}
        </h2>

        <InlineMediaPicker
          placeholder={pickerPlaceholder(mediaTypes)}
          // Restrict search to the media types the curator picked above.
          // Empty array = unrestricted (resolved to "all" inside the
          // picker), so the form is forgiving when the user hasn't
          // touched the multi-select yet.
          scope={mediaTypes}
          excludeMediaIds={items.map((i) => i.mediaId)}
          onPick={handleAddItem}
        />

        {items.length > 0 && (
          <ul className="space-y-2">
            {items.map((item, i) => (
              <li
                key={item.mediaId}
                className="flex items-start gap-3 rounded-sm border border-surface-border bg-surface-raised/40 p-3"
              >
                {/* Up + down arrows pinned to the top and bottom of
                    the row via `self-stretch` + `justify-between` so
                    the down arrow always sits flush with the bottom of
                    the cover. */}
                <div className="flex shrink-0 flex-col self-stretch justify-between">
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() => handleMove(item.mediaId, -1)}
                    aria-label="Move up"
                    className="rounded-sm p-1 text-text-muted hover:bg-surface-overlay hover:text-text-primary disabled:opacity-30"
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    type="button"
                    disabled={i === items.length - 1}
                    onClick={() => handleMove(item.mediaId, 1)}
                    aria-label="Move down"
                    className="rounded-sm p-1 text-text-muted hover:bg-surface-overlay hover:text-text-primary disabled:opacity-30"
                  >
                    <ArrowDown size={12} />
                  </button>
                </div>
                {/* Rank number — only visible when the curator has
                    flipped on the Ranked-list toggle. `self-stretch`
                    fills the row height so `items-center` can center
                    the digit vertically against the cover beside it. */}
                {ranked && (
                  <span className="flex w-8 shrink-0 self-stretch items-center justify-center text-lg font-bold text-brand tabular-nums">
                    {i + 1}
                  </span>
                )}
                <div className="aspect-2/3 w-12 shrink-0 overflow-hidden rounded-sm border border-surface-border bg-surface-overlay">
                  <CoverImage
                    src={item.cover}
                    alt={item.title}
                    className="h-full w-full object-cover"
                    fallback={
                      <div className="flex h-full items-center justify-center text-text-muted">
                        —
                      </div>
                    }
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-text-primary">
                      {item.title}
                    </span>
                    <span
                      className={`text-xs ${MEDIA_TYPE_CONFIG[item.mediaType].color}`}
                    >
                      {MEDIA_TYPE_CONFIG[item.mediaType].label}
                    </span>
                  </div>
                  <textarea
                    value={item.reason}
                    onChange={(e) => handleReason(item.mediaId, e.target.value)}
                    rows={1}
                    placeholder="Why this fits the list (optional)"
                    className="w-full resize-y rounded-sm border border-surface-border bg-surface-overlay px-2 py-1 text-xs text-text-secondary focus:border-brand focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveItem(item.mediaId)}
                  aria-label="Remove"
                  className="rounded-sm p-1 text-text-muted hover:bg-surface-overlay hover:text-red-400"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-surface-border pt-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-sm border border-surface-border px-4 py-2 text-sm text-text-secondary hover:border-brand/40 hover:text-text-primary"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex items-center gap-2 rounded-sm bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-light disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Save size={14} />
          )}
          Create list
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  help,
  children,
}: {
  label: string;
  required?: boolean;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium uppercase tracking-wider text-text-muted">
        {label}
        {required && <span className="ml-1 text-brand">*</span>}
      </label>
      {children}
      {help && <p className="text-xs text-text-muted">{help}</p>}
    </div>
  );
}

/**
 * Two-button toggle for the Ranked-list flag. Letterboxd-style: the
 * inactive option stays visible so the user can flip back without
 * hunting for it.
 */
function RankedToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`rounded-sm border px-3 py-1.5 text-xs transition-colors ${
          !value
            ? "border-brand bg-brand/10 text-brand"
            : "border-surface-border bg-surface-overlay text-text-secondary"
        }`}
      >
        Standard
      </button>
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`rounded-sm border px-3 py-1.5 text-xs transition-colors ${
          value
            ? "border-brand bg-brand/10 text-brand"
            : "border-surface-border bg-surface-overlay text-text-secondary"
        }`}
      >
        Ranked
      </button>
    </div>
  );
}

function PickedRow({
  title,
  cover,
  mediaType,
  onRemove,
}: {
  title: string;
  cover: string | null;
  mediaType: MediaType;
  onRemove: () => void;
}) {
  const config = MEDIA_TYPE_CONFIG[mediaType];
  return (
    <div className="flex items-center gap-3 rounded-sm border border-surface-border bg-surface-raised/40 p-2">
      <div className="aspect-2/3 w-10 shrink-0 overflow-hidden rounded-sm border border-surface-border bg-surface-overlay">
        <CoverImage
          src={cover}
          alt={title}
          className="h-full w-full object-cover"
          fallback={
            <div className="flex h-full items-center justify-center text-text-muted">
              —
            </div>
          }
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-text-primary">
          {title}
        </div>
        <div className={`text-xs ${config.color}`}>{config.label}</div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Clear"
        className="rounded-sm p-1 text-text-muted hover:bg-surface-overlay hover:text-text-primary"
      >
        <X size={14} />
      </button>
    </div>
  );
}
