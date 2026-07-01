import { notFound } from "next/navigation";
import { User } from "lucide-react";
import {
  getOpenLibraryAuthor,
  getAuthorBio,
  authorPhotoUrl,
  getEnglishAuthorWorks,
  workOlid,
} from "@/lib/api/openlibrary";
import type { OpenLibraryWork } from "@/lib/api/openlibrary";
import { findVolumeByTitleAndAuthor } from "@/lib/api/google-books";
import { resolveAndCacheBookFromOLWork } from "@/app/actions/media";
import { createClient } from "@/lib/supabase/server";
import BackButton from "@/components/back-button";
import BiographyText from "@/components/media/biography-text";
import EntityFilmographyList from "@/components/media/entity-filmography-list";
import type { EntityCredit } from "@/components/media/entity-filmography-list";
import type { MediaItem, UserMedia } from "@intertaind/types";

const OLID_PATTERN = /^OL\d+A$/;

// Process at most this many works in parallel when populating the
// cache. Sanderson has ~70 works; firing all at once trips Google
// Books' burst limit. Chunked, we stay comfortably under their
// 100-requests-per-100-seconds ceiling for the first cold render.
const RESOLVE_CHUNK_SIZE = 10;

export default async function AuthorPage({
  params,
}: {
  params: Promise<{ olid: string }>;
}) {
  const { olid } = await params;
  if (!OLID_PATTERN.test(olid)) notFound();

  const author = await getOpenLibraryAuthor(olid);
  if (!author) notFound();

  const bio = getAuthorBio(author);
  const photo = authorPhotoUrl(author, "L");

  // OL gives us the bibliography list with English-edition filter
  // applied server-side. We then resolve each work to a Google Books
  // volume — but only on cache misses. The cache is media_items itself:
  // every resolved book becomes a row keyed by `openlibrary_work_id`,
  // so subsequent author-page visits hit the DB instead of Google.
  const works = await getEnglishAuthorWorks(olid, 200);
  const filteredWorks = works.filter(isRenderableWork);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Bulk look up cached resolutions in one query — much cheaper than
  // checking per-work inside the resolve action.
  const olWorkIds = filteredWorks.map(workOlid);
  const cachedByWork = new Map<string, MediaItem>();
  if (olWorkIds.length > 0) {
    const { data: cachedRows } = await supabase
      .from("media_items")
      .select("*")
      .in("external_ids->>openlibrary_work_id", olWorkIds)
      .eq("media_type", "book");
    for (const row of (cachedRows as MediaItem[] | null) ?? []) {
      const olw = (row.external_ids as Record<string, unknown> | null)
        ?.openlibrary_work_id;
      if (typeof olw === "string") cachedByWork.set(olw, row);
    }
  }

  // Cache misses go through Google Books. Only authenticated users can
  // populate the cache (RLS gates the insert), so anonymous viewers see
  // whatever's been resolved by prior authenticated visits.
  const missedWorks = filteredWorks.filter(
    (w) => !cachedByWork.has(workOlid(w))
  );

  if (user && missedWorks.length > 0) {
    // Phase 1 — pre-resolve every missed work to a Google Books volume
    // (cached at the fetch layer for 24h). We do this BEFORE calling
    // `resolveAndCacheBookFromOLWork` so we can dedupe on the GB id
    // *before* hitting the insert path. Without this, two OL works that
    // map to the same GB volume race each other and both insert,
    // leaving duplicate `media_items` rows.
    const preResolved = await resolveInChunks(missedWorks, async (w) => {
      const volume = await findVolumeByTitleAndAuthor(w.title, author.name);
      return { work: w, volume };
    });

    // Phase 2 — bucket by (normalized GB title, first author). Bucketing
    // by gbid alone misses the case where two OL works resolve to two
    // different GB editions of the same book (different ISBNs, same
    // title + author). Without this, both buckets fire `resolve…` in
    // parallel, race on the DB, and create duplicate rows.
    //
    // Title key is lowercase+trim so case differences don't split a
    // bucket. We don't strip subtitles — series like "LOTR: The Two
    // Towers" / "LOTR: The Return of the King" share a base but are
    // genuinely different books and should NOT merge.
    const bucketsByKey = new Map<string, OpenLibraryWork[]>();
    for (const { work, volume } of preResolved) {
      if (!volume) continue;
      if (
        volume.volumeInfo.language &&
        volume.volumeInfo.language !== "en"
      ) {
        continue;
      }
      const fullTitle =
        volume.volumeInfo.title +
        (volume.volumeInfo.subtitle ? `: ${volume.volumeInfo.subtitle}` : "");
      const titleKey = fullTitle.trim().toLowerCase();
      const authorKey = (volume.volumeInfo.authors?.[0] ?? "")
        .trim()
        .toLowerCase();
      const key = `${titleKey}|${authorKey}`;
      const arr = bucketsByKey.get(key) ?? [];
      arr.push(work);
      bucketsByKey.set(key, arr);
    }

    // Phase 3 — for each bucket, run the insert action ONCE. The
    // action's own `findExistingBookByIdentifiers` (gbid → isbn →
    // title+author) protects against cross-page-load races; the
    // bucket dedup above protects against intra-batch races.
    const bucketEntries = Array.from(bucketsByKey.entries());
    const ids = await resolveInChunks(bucketEntries, async ([, works]) =>
      resolveAndCacheBookFromOLWork(
        workOlid(works[0]),
        works[0].title,
        author.name
      )
    );

    // Hydrate rows in one query, then broadcast by array index: every
    // OL work in a bucket maps to the same row, so aliased OL work IDs
    // (multiple OLs resolving to the same canonical book) all end up
    // in `cachedByWork` pointing at the same media_items row.
    const idsFiltered = ids.filter((id): id is string => id !== null);
    if (idsFiltered.length > 0) {
      const { data: newRows } = await supabase
        .from("media_items")
        .select("*")
        .in("id", idsFiltered);
      const rowsById = new Map<string, MediaItem>();
      for (const row of (newRows as MediaItem[] | null) ?? []) {
        rowsById.set(row.id, row);
      }
      bucketEntries.forEach(([, works], i) => {
        const id = ids[i];
        if (!id) return;
        const row = rowsById.get(id);
        if (!row) return;
        for (const w of works) {
          cachedByWork.set(workOlid(w), row);
        }
      });
    }
  }

  // Build credits in OL-work order, dropping works that didn't resolve.
  const credits: EntityCredit[] = [];
  const mediaItemsByKey = new Map<string, MediaItem>();
  const seenISBN = new Set<string>();
  for (const work of filteredWorks) {
    const row = cachedByWork.get(workOlid(work));
    if (!row) continue;
    const ext = (row.external_ids as Record<string, unknown> | null) ?? {};
    const isbn = ext.isbn_13 as string | undefined;
    if (isbn && seenISBN.has(isbn)) continue;
    if (isbn) seenISBN.add(isbn);
    const credit = creditFromMediaItem(row);
    credits.push(credit);
    mediaItemsByKey.set(
      `${credit.media_type}-${credit.source_id}`,
      row
    );
  }

  // Viewer's tracking rows for the matched media so the slide-out
  // shows the correct watched/loved/rated state.
  const viewerTracking: Record<string, UserMedia> = {};
  if (user && mediaItemsByKey.size > 0) {
    const matchedIds = Array.from(mediaItemsByKey.values()).map((m) => m.id);
    const { data: vmRows } = await supabase
      .from("user_media")
      .select("*")
      .eq("user_id", user.id)
      .in("media_id", matchedIds);
    for (const row of (vmRows as UserMedia[] | null) ?? []) {
      viewerTracking[row.media_id] = row;
    }
  }

  let tracked: { read: number; total: number } | null = null;
  if (user && credits.length > 0) {
    let read = 0;
    const seen = new Set<string>();
    for (const c of credits) {
      const matched = mediaItemsByKey.get(`${c.media_type}-${c.source_id}`);
      if (!matched) continue;
      if (seen.has(matched.id)) continue;
      const um = viewerTracking[matched.id];
      if (um?.status === "completed") {
        read++;
        seen.add(matched.id);
      }
    }
    tracked = { read, total: credits.length };
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-4">
        <BackButton />
      </div>

      <div className="flex flex-col gap-8 md:flex-row">
        <aside className="w-full shrink-0 md:w-56">
          <div className="aspect-square overflow-hidden rounded-sm border border-surface-border bg-surface-overlay">
            {photo ? (
              <img
                src={photo}
                alt={author.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-text-muted">
                <User size={48} className="opacity-40" />
              </div>
            )}
          </div>

          {(author.birth_date || author.death_date) && (
            <dl className="mt-4 space-y-2 text-xs">
              {author.birth_date && (
                <Field label="Born" value={author.birth_date} />
              )}
              {author.death_date && (
                <Field label="Died" value={author.death_date} />
              )}
            </dl>
          )}

          {tracked && (
            <div className="mt-4 rounded-sm border border-surface-border bg-surface-raised/40 p-3 text-xs">
              <div className="font-medium text-text-primary">
                {tracked.read} of {tracked.total}
              </div>
              <div className="text-text-muted">
                {tracked.total > 0
                  ? `${Math.round((tracked.read / tracked.total) * 100)}% read`
                  : ""}
              </div>
            </div>
          )}
        </aside>

        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold text-text-primary">
            {author.name}
          </h1>

          {bio && <BiographyText text={bio} />}

          <h2 className="mt-8 mb-3 text-lg font-semibold text-text-primary">
            Books
          </h2>

          {credits.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-muted">
              {user
                ? "No books found for this author."
                : "Sign in to load this author's bibliography."}
            </p>
          ) : (
            <EntityFilmographyList
              credits={credits}
              mediaItemsByKey={Object.fromEntries(mediaItemsByKey.entries())}
              viewerTracking={viewerTracking}
              defaultSort="release_desc"
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium uppercase tracking-wider text-text-muted">
        {label}
      </dt>
      <dd className="mt-0.5 text-text-secondary">{value}</dd>
    </div>
  );
}

/**
 * Skip OL works that won't render well even after Google Books
 * resolution. Language filtering happens upstream (OL search filters
 * to English editions; the GB lookup applies a final language check
 * inside the resolver), so this is just a bundle filter.
 */
function isRenderableWork(work: OpenLibraryWork): boolean {
  if (!work.title?.trim()) return false;
  if (looksLikeBundle(work.title)) return false;
  return true;
}

function looksLikeBundle(title: string): boolean {
  const lower = title.toLowerCase();
  if (
    lower.includes("box set") ||
    lower.includes("boxed set") ||
    lower.includes("box-set")
  ) {
    return true;
  }
  const main = title.split(":")[0];
  if (
    /\b(trilogy|quartet|quintet|tetralogy|pentalogy|hexalogy|saga)\b/i.test(
      main
    )
  ) {
    return true;
  }
  if (/\b(anthology|omnibus|complete\s+(series|collection))\b/i.test(lower)) {
    return true;
  }
  if (title.includes("|")) return true;
  const segments = title.split(/,\s+/);
  if (
    segments.length >= 3 &&
    segments.every((s) => /^(the|a|an)\s+[A-Z]|^[A-Z]/.test(s.trim()))
  ) {
    return true;
  }
  return false;
}

/**
 * Build an EntityCredit from a media_items row. Used to present cached
 * books through the same EntityFilmographyList that drives person and
 * other entity pages — sort by rating, filter by decade, etc.
 */
function creditFromMediaItem(row: MediaItem): EntityCredit {
  const meta = (row.metadata as Record<string, unknown> | null) ?? {};
  const ext = (row.external_ids as Record<string, unknown> | null) ?? {};
  const date = row.release_date;
  const gbId = ext.google_books_id as string | undefined;
  return {
    // Use the row id as the credit identity — guaranteed unique even
    // when google_books_id is missing.
    key: `book-${row.id}`,
    source: "gbooks",
    source_id: gbId ?? row.id,
    media_type: "book",
    title: row.title,
    description: row.description,
    cover_url: row.cover_image_url,
    backdrop_url: row.backdrop_url,
    release_date: date,
    year: date ? parseInt(date.slice(0, 4), 10) || null : null,
    vote_average: row.avg_rating ?? 0,
    vote_count: row.rating_count ?? 0,
    genres: (meta.categories as string[] | undefined) ?? [],
    metadata: meta,
  };
}

async function resolveInChunks<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += RESOLVE_CHUNK_SIZE) {
    const chunk = items.slice(i, i + RESOLVE_CHUNK_SIZE);
    const results = await Promise.all(chunk.map(fn));
    out.push(...results);
  }
  return out;
}
