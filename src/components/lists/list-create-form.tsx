"use client";

import { useState } from "react";
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
import { createList } from "@/app/actions/lists";
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
  const [visibility, setVisibility] = useState<ListVisibility>("public");
  const [items, setItems] = useState<PickedItem[]>([]);

  const requiresSource = LIST_TYPES_REQUIRING_SOURCE.includes(listType);
  const titleValid = title.trim().length > 0;
  const sourceValid = !requiresSource || !!sourceMedia;
  const canSubmit = titleValid && sourceValid && !pending;

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
      const id = await createList({
        title,
        description,
        list_type: listType,
        source_media_id: sourceMedia?.mediaId ?? null,
        media_types: mediaTypes,
        tags,
        visibility,
        initial_items: items.map((i) => ({
          media_id: i.mediaId,
          reason: i.reason,
        })),
      });
      router.push(`/lists/${id}`);
      // Note: we don't reset `pending` on success because the component
      // unmounts during navigation. Reset only on error.
    } catch (err) {
      setError((err as Error).message);
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

      <Field label="Title" required>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
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
        label="Media types"
        help="Which kinds of media this list contains. Multi-select."
      >
        <MediaTypeMultiSelect value={mediaTypes} onChange={setMediaTypes} />
      </Field>

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

      <Field
        label="Tags"
        help="Free text. Type a tag, press Enter to add. Click × to remove."
      >
        <TagInput tags={tags} onChange={setTags} />
      </Field>

      <Field label="Who can view">
        <VisibilitySelect value={visibility} onChange={setVisibility} />
      </Field>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
          Items ({items.length})
        </h2>

        <InlineMediaPicker
          placeholder="Search to add a movie, show, book, or game…"
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
                <div className="flex shrink-0 flex-col gap-1">
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
