import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import RecommendationCard from "@/components/recommendations/recommendation-card";
import {
  fetchRecommendationsForSource,
  fetchRecommendationsForTarget,
} from "@/app/actions/recommendations";
import type { MediaItem } from "@intertaind/types";

type Direction = "with" | "for";

const PAGE_SIZE = 20;

function isDirection(s: string | undefined): s is Direction {
  return s === "with" || s === "for";
}

function pageHref(mediaId: string, direction: Direction, n: number) {
  const base = `/media/${mediaId}/recommendations?direction=${direction}`;
  return n <= 1 ? base : `${base}&page=${n}`;
}

/**
 * "See all" full-page view of recommendations for a media item, in
 * either direction. Linked from the section on /media/[id] when the
 * total exceeds the 5-row preview.
 *
 * Direction lives in the URL so each view is its own indexable page —
 * SEO-friendly: every "All recommendations for fans of X" page becomes
 * a long-tail discovery surface.
 */
export default async function MediaRecommendationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ direction?: string; page?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const direction: Direction = isDirection(sp.direction) ? sp.direction : "with";
  const rawPage = Number.parseInt(sp.page ?? "1", 10) || 1;
  const page = Math.max(1, rawPage);
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  const { data: media } = await supabase
    .from("media_items")
    .select("id, title, cover_image_url, recommendations_count, recommended_for_count")
    .eq("id", id)
    .single();
  if (!media) notFound();

  const typedMedia = media as Pick<
    MediaItem,
    "id" | "title" | "cover_image_url" | "recommendations_count" | "recommended_for_count"
  >;

  // Resolve the active page from the appropriate direction. Both helper
  // actions follow the same shape (`{ items, hasMore }`), so the render
  // path is unified — only the per-card props differ.
  const total =
    direction === "with"
      ? typedMedia.recommendations_count ?? 0
      : typedMedia.recommended_for_count ?? 0;
  const hasPrev = page > 1;

  const heading =
    direction === "with"
      ? `Intertaind with ${typedMedia.title}`
      : `Intertaind for fans of ${typedMedia.title}`;
  const subhead =
    direction === "with"
      ? "Community pairings — what people intertain this with."
      : "Community pairings — what people intertain this for fans of.";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link
        href={`/media/${id}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text-secondary"
      >
        <ArrowLeft size={14} />
        Back to {typedMedia.title}
      </Link>

      <div className="mb-6 border-b border-surface-border pb-4">
        <h1 className="text-2xl font-bold text-text-primary">{heading}</h1>
        <p className="mt-1 text-sm text-text-secondary">{subhead}</p>

        {/* Direction switcher — preserves the page=1 default so a deep
            page on one direction doesn't carry over to the other. */}
        <div className="mt-3 flex items-center gap-2 text-xs">
          <Link
            href={pageHref(id, "with", 1)}
            className={`rounded-sm px-2 py-1 font-medium transition-colors ${
              direction === "with"
                ? "bg-brand/10 text-brand"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            Pairs with this ({typedMedia.recommendations_count ?? 0})
          </Link>
          <Link
            href={pageHref(id, "for", 1)}
            className={`rounded-sm px-2 py-1 font-medium transition-colors ${
              direction === "for"
                ? "bg-brand/10 text-brand"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            Intertaind for this ({typedMedia.recommended_for_count ?? 0})
          </Link>
        </div>
      </div>

      {direction === "with" ? (
        <PairsWithList
          mediaId={id}
          page={page}
          offset={offset}
          total={total}
          hasPrev={hasPrev}
        />
      ) : (
        <RecommendedForList
          mediaId={id}
          page={page}
          offset={offset}
          total={total}
          hasPrev={hasPrev}
        />
      )}
    </div>
  );
}

async function PairsWithList({
  mediaId,
  page,
  offset,
  total,
  hasPrev,
}: {
  mediaId: string;
  page: number;
  offset: number;
  total: number;
  hasPrev: boolean;
}) {
  const { items, hasMore } = await fetchRecommendationsForSource(
    mediaId,
    PAGE_SIZE,
    offset
  );
  return (
    <ListBody
      isEmpty={items.length === 0}
      direction="with"
      mediaId={mediaId}
      page={page}
      hasPrev={hasPrev}
      hasNext={hasMore}
      total={total}
    >
      {items.map((r) => (
        <RecommendationCard
          key={r.id}
          primaryMedia={r.recommended_media}
          recommender={r.profiles}
          note={r.note}
          createdAt={r.created_at}
        />
      ))}
    </ListBody>
  );
}

async function RecommendedForList({
  mediaId,
  page,
  offset,
  total,
  hasPrev,
}: {
  mediaId: string;
  page: number;
  offset: number;
  total: number;
  hasPrev: boolean;
}) {
  const { items, hasMore } = await fetchRecommendationsForTarget(
    mediaId,
    PAGE_SIZE,
    offset
  );
  return (
    <ListBody
      isEmpty={items.length === 0}
      direction="for"
      mediaId={mediaId}
      page={page}
      hasPrev={hasPrev}
      hasNext={hasMore}
      total={total}
    >
      {items.map((r) => (
        <RecommendationCard
          key={r.id}
          primaryMedia={r.source_media}
          recommender={r.profiles}
          note={r.note}
          createdAt={r.created_at}
        />
      ))}
    </ListBody>
  );
}

function ListBody({
  isEmpty,
  direction,
  mediaId,
  page,
  hasPrev,
  hasNext,
  total,
  children,
}: {
  isEmpty: boolean;
  direction: Direction;
  mediaId: string;
  page: number;
  hasPrev: boolean;
  hasNext: boolean;
  total: number;
  children: React.ReactNode;
}) {
  if (isEmpty) {
    return (
      <p className="py-12 text-center text-sm text-text-muted">
        {page === 1 ? "No pairings in this direction yet." : "No more results."}
      </p>
    );
  }
  return (
    <>
      <div>{children}</div>
      {(hasPrev || hasNext) && (
        <div className="mt-6 flex items-center justify-center gap-3 text-xs text-text-muted">
          {hasPrev ? (
            <Link
              href={pageHref(mediaId, direction, page - 1)}
              className="flex items-center gap-1 rounded-sm border border-surface-border bg-surface-overlay px-3 py-1.5 transition-colors hover:border-brand/40 hover:text-text-primary"
            >
              <ChevronLeft size={12} />
              Newer
            </Link>
          ) : (
            <span className="flex items-center gap-1 rounded-sm border border-surface-border px-3 py-1.5 opacity-40">
              <ChevronLeft size={12} />
              Newer
            </span>
          )}
          <span className="tabular-nums">
            Page {page}
            {total > 0 && ` of ~${Math.max(1, Math.ceil(total / PAGE_SIZE))}`}
          </span>
          {hasNext ? (
            <Link
              href={pageHref(mediaId, direction, page + 1)}
              className="flex items-center gap-1 rounded-sm border border-surface-border bg-surface-overlay px-3 py-1.5 transition-colors hover:border-brand/40 hover:text-text-primary"
            >
              Older
              <ChevronRight size={12} />
            </Link>
          ) : (
            <span className="flex items-center gap-1 rounded-sm border border-surface-border px-3 py-1.5 opacity-40">
              Older
              <ChevronRight size={12} />
            </span>
          )}
        </div>
      )}
    </>
  );
}
