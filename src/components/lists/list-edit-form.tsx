"use client";

import { useState, useTransition } from "react";
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
  tagToGenre,
  moodToTag,
  tagToMood,
  isMoodTag,
} from "@/components/lists/genre-options";
import {
  updateList,
  addItemsToList,
  removeItemFromList,
  reorderListItems,
  updateListItemReason,
  deleteList,
} from "@/app/actions/lists";
import { toast } from "@/lib/toast";
import {
  LIST_TYPE_LABELS,
  LIST_TYPES_REQUIRING_SOURCE,
  SELECTABLE_LIST_TYPES,
  type List,
  type ListItem,
  type ListType,
  type ListVisibility,
  type MediaItem,
  type MediaType,
  type SearchResult,
} from "@/lib/types";
import { MEDIA_TYPE_CONFIG } from "@/lib/types";

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

/**
 * Edit form for a list. Metadata changes are buffered locally and saved
 * via `updateList` on submit; item add/remove/reorder/reason changes
 * fire individual server actions immediately followed by a router
 * refresh so the server-rendered detail data stays canonical.
 */
export default function ListEditForm({
  list,
  items,
  sourceMedia,
}: {
  list: List;
  items: (ListItem & { media_items: MediaItem })[];
  sourceMedia: MediaItem | null;
}) {
  const router = useRouter();
  const [pendingMetadata, startMetadataTransition] = useTransition();
  const [pendingItem, startItemTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(list.title);
  const [description, setDescription] = useState(list.description ?? "");
  const [mediaTypes, setMediaTypes] = useState<MediaType[]>(
    list.media_types ?? []
  );
  const [listType, setListType] = useState<ListType>(list.list_type);
  // Strip the type-specific tags (genre / mood) out of the editable
  // tags array so the dedicated form fields own them; we re-fold both
  // back in at submit time. Display tags = everything else.
  const allInitialTags = list.tags ?? [];
  const initialGenre = tagToGenre(allInitialTags);
  const initialMood = tagToMood(allInitialTags);
  const [tags, setTags] = useState<string[]>(
    allInitialTags.filter((t) => {
      if (initialGenre && t === genreToTag(initialGenre)) return false;
      if (isMoodTag(t)) return false;
      return true;
    })
  );
  const [genre, setGenre] = useState<string | null>(initialGenre);
  const [mood, setMood] = useState<string>(initialMood ?? "");
  const [visibility, setVisibility] = useState<ListVisibility>(list.visibility);
  const [picked, setPicked] = useState<MediaItem | null>(sourceMedia);

  const requiresSource = LIST_TYPES_REQUIRING_SOURCE.includes(listType);
  const titleValid = title.trim().length > 0;
  const sourceValid = !requiresSource || !!picked;
  const canSubmit = titleValid && sourceValid && !pendingMetadata;

  function handleSaveMetadata(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    startMetadataTransition(async () => {
      try {
        // Re-fold the type-specific dropdown / textbox values back into
        // the tag set. Mirror of the create-form path.
        let tagsForSave = tags;
        if (listType === "genre" && genre) {
          tagsForSave = Array.from(
            new Set([genreToTag(genre), ...tagsForSave])
          );
        }
        if (listType === "mood" && mood.trim().length > 0) {
          tagsForSave = Array.from(
            new Set([moodToTag(mood), ...tagsForSave])
          );
        }
        await updateList(list.id, {
          title,
          description,
          list_type: listType,
          source_media_id: picked?.id ?? null,
          media_types: mediaTypes,
          tags: tagsForSave,
          visibility,
        });
        toast("Changes saved", { variant: "success" });
        router.refresh();
      } catch (err) {
        const message = (err as Error).message;
        setError(message);
        toast(`Couldn't save changes: ${message}`, { variant: "error" });
      }
    });
  }

  async function handleAddItem(_: SearchResult, mediaId: string) {
    if (items.some((i) => i.media_id === mediaId)) return;
    startItemTransition(async () => {
      try {
        await addItemsToList(list.id, [{ media_id: mediaId }]);
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  function handleRemove(itemId: string) {
    startItemTransition(async () => {
      try {
        await removeItemFromList(itemId);
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  function handleMove(itemId: string, dir: -1 | 1) {
    const idx = items.findIndex((i) => i.id === itemId);
    if (idx === -1) return;
    const target = idx + dir;
    if (target < 0 || target >= items.length) return;
    const reordered = [...items];
    [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
    startItemTransition(async () => {
      try {
        await reorderListItems(list.id, reordered.map((i) => i.id));
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  function handleDelete() {
    if (
      !confirm(
        "Delete this list? This will remove every item and any likes/saves on it."
      )
    )
      return;
    startMetadataTransition(async () => {
      try {
        await deleteList(list.id);
        toast("List deleted", { variant: "success" });
        router.push("/lists");
        router.refresh();
      } catch (err) {
        const message = (err as Error).message;
        setError(message);
        toast(`Couldn't delete list: ${message}`, { variant: "error" });
      }
    });
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-sm border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Metadata form. Field order matches the create form so users
          have a consistent flow: list type first (drives downstream
          fields like source media), then title/description/media-types. */}
      <form onSubmit={handleSaveMetadata} className="space-y-6">
        <Field label="List type" help={TYPE_HINTS[listType]}>
          <div className="flex flex-wrap gap-2">
            {/* Render the existing list_type even if it's no longer in the
                selectable set (e.g., legacy `cross_media` rows). */}
            {Array.from(
              new Set([...SELECTABLE_LIST_TYPES, listType])
            ).map((t) => {
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
          help="Which kinds of media this list contains."
        >
          <MediaTypeMultiSelect value={mediaTypes} onChange={setMediaTypes} />
        </Field>

        {requiresSource && (
          <Field label="Source media" required>
            {picked ? (
              <PickedRow
                title={picked.title}
                cover={picked.cover_image_url}
                mediaType={picked.media_type}
                onRemove={() => setPicked(null)}
              />
            ) : (
              <InlineMediaPicker
                placeholder="Pick a source title…"
                onPick={async (_, mediaId) => {
                  // Hydrate the picked field locally; metadata save will
                  // commit it. We don't need full row here — the form
                  // only needs id + display fields.
                  setPicked({
                    id: mediaId,
                    media_type: _.media_type,
                    title: _.title,
                    description: _.description,
                    cover_image_url: _.cover_image_url,
                    backdrop_url: _.backdrop_url,
                    release_date: _.release_date,
                    metadata: _.metadata,
                    external_ids: _.external_ids,
                    avg_rating: null,
                    rating_count: 0,
                    tracking_count: 0,
                    favorites_count: 0,
                    lists_count: 0,
                    created_at: new Date().toISOString(),
                  } as MediaItem);
                }}
              />
            )}
          </Field>
        )}

        <Field label="Title" required>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            className="w-full rounded-sm border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-text-primary focus:border-brand focus:outline-none"
          />
        </Field>

        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full resize-y rounded-sm border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-text-primary focus:border-brand focus:outline-none"
          />
        </Field>

        <Field label="Tags">
          <TagInput tags={tags} onChange={setTags} />
        </Field>

        <Field label="Who can view">
          <VisibilitySelect value={visibility} onChange={setVisibility} />
        </Field>

        <div className="flex items-center justify-between gap-3 border-t border-surface-border pt-4">
          <button
            type="button"
            onClick={handleDelete}
            className="flex items-center gap-2 rounded-sm border border-red-900/40 px-4 py-2 text-sm text-red-300 hover:bg-red-950/30"
          >
            <Trash2 size={14} />
            Delete list
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex items-center gap-2 rounded-sm bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-light disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pendingMetadata ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            Save changes
          </button>
        </div>
      </form>

      {/* Items management — fires immediately, separate from metadata save */}
      <div className="space-y-3 border-t border-surface-border pt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
          Items ({items.length})
        </h2>

        <InlineMediaPicker
          placeholder={pickerPlaceholder(mediaTypes)}
          // Same multi-type restriction as the create form — search
          // results stay scoped to the list's chosen media types.
          scope={mediaTypes}
          excludeMediaIds={items.map((i) => i.media_id)}
          onPick={handleAddItem}
        />

        {items.length > 0 && (
          <ul className="space-y-2">
            {items.map((item, i) => (
              <li
                key={item.id}
                className="flex items-start gap-3 rounded-sm border border-surface-border bg-surface-raised/40 p-3"
              >
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    disabled={i === 0 || pendingItem}
                    onClick={() => handleMove(item.id, -1)}
                    aria-label="Move up"
                    className="rounded-sm p-1 text-text-muted hover:bg-surface-overlay hover:text-text-primary disabled:opacity-30"
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    type="button"
                    disabled={i === items.length - 1 || pendingItem}
                    onClick={() => handleMove(item.id, 1)}
                    aria-label="Move down"
                    className="rounded-sm p-1 text-text-muted hover:bg-surface-overlay hover:text-text-primary disabled:opacity-30"
                  >
                    <ArrowDown size={12} />
                  </button>
                </div>
                <div className="aspect-2/3 w-12 shrink-0 overflow-hidden rounded-sm border border-surface-border bg-surface-overlay">
                  <CoverImage
                    src={item.media_items.cover_image_url}
                    alt={item.media_items.title}
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
                      {item.media_items.title}
                    </span>
                    <span
                      className={`text-xs ${MEDIA_TYPE_CONFIG[item.media_items.media_type].color}`}
                    >
                      {MEDIA_TYPE_CONFIG[item.media_items.media_type].label}
                    </span>
                  </div>
                  <ReasonInput
                    initialValue={item.reason ?? ""}
                    onCommit={async (val) => {
                      await updateListItemReason(item.id, val);
                      router.refresh();
                    }}
                  />
                </div>
                <button
                  type="button"
                  disabled={pendingItem}
                  onClick={() => handleRemove(item.id)}
                  aria-label="Remove"
                  className="rounded-sm p-1 text-text-muted hover:bg-surface-overlay hover:text-red-400 disabled:opacity-30"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Single-line reason editor that commits on blur. Avoids round-tripping
 * a server action on every keystroke.
 */
function ReasonInput({
  initialValue,
  onCommit,
}: {
  initialValue: string;
  onCommit: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <textarea
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value !== initialValue) onCommit(value);
      }}
      rows={1}
      placeholder="Why this fits the list (optional)"
      className="w-full resize-y rounded-sm border border-surface-border bg-surface-overlay px-2 py-1 text-xs text-text-secondary focus:border-brand focus:outline-none"
    />
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
