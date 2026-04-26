// TEMPORARY debug page — used to inspect what Google Books returns for
// an author and why specific titles are or aren't surfacing. Delete
// this directory once the bibliography quality is dialed in.

import { searchBooks, bookCoverUrl } from "@/lib/api/google-books";
import type { GoogleBooksVolume } from "@/lib/api/types";

export const dynamic = "force-dynamic";

interface RawSummary {
  id: string;
  title: string;
  subtitle: string;
  authors: string[];
  authorMatch: boolean;
  publishedDate: string | null;
  language: string | null;
  isbn13: string | null;
  isbn10: string | null;
  ratingsCount: number;
  hasCover: boolean;
  cover: string | null;
  description: string;
  cleanTitleKey: string;
}

function summarize(v: GoogleBooksVolume, target: string): RawSummary {
  const info = v.volumeInfo;
  const credited = info.authors ?? [];
  const cleanKey = info.title?.split(":")[0].trim().toLowerCase() ?? "";
  return {
    id: v.id,
    title: info.title ?? "",
    subtitle: info.subtitle ?? "",
    authors: credited,
    authorMatch: credited.some((a) => a.toLowerCase().includes(target)),
    publishedDate: info.publishedDate ?? null,
    language: info.language ?? null,
    isbn13:
      info.industryIdentifiers?.find((i) => i.type === "ISBN_13")?.identifier ??
      null,
    isbn10:
      info.industryIdentifiers?.find((i) => i.type === "ISBN_10")?.identifier ??
      null,
    ratingsCount: info.ratingsCount ?? 0,
    hasCover: !!info.imageLinks?.thumbnail,
    cover: bookCoverUrl(v),
    description: (info.description ?? "").slice(0, 80),
    cleanTitleKey: cleanKey,
  };
}

async function fetchAllPages(
  query: string,
  pages: number
): Promise<GoogleBooksVolume[]> {
  const out: GoogleBooksVolume[] = [];
  for (let p = 0; p < pages; p++) {
    const res = await searchBooks(query, p * 40, 40);
    const items = res.items ?? [];
    if (items.length === 0) break;
    out.push(...items);
    if (items.length < 40) break;
  }
  return out;
}

export default async function DebugBooksPage({
  searchParams,
}: {
  searchParams: Promise<{ author?: string; search?: string }>;
}) {
  const params = await searchParams;
  const author = params.author?.trim() ?? "Brandon Sanderson";
  const search = params.search?.trim() ?? "";
  const target = author.toLowerCase();

  const inauthorRaw = await fetchAllPages(`inauthor:"${author}"`, 5);
  const inauthorSummaries = inauthorRaw.map((v) => summarize(v, target));

  const dropped = inauthorSummaries.filter((s) => !s.authorMatch || !s.title);
  const kept = inauthorSummaries.filter((s) => s.authorMatch && !!s.title);

  const dedupeMap = new Map<string, RawSummary[]>();
  for (const s of kept) {
    const key = s.cleanTitleKey;
    const arr = dedupeMap.get(key) ?? [];
    arr.push(s);
    dedupeMap.set(key, arr);
  }

  let titleSearch: RawSummary[] = [];
  let titleSearchAuthorOnly: RawSummary[] = [];
  if (search) {
    const both = await fetchAllPages(
      `intitle:"${search}" inauthor:"${author}"`,
      2
    );
    titleSearch = both.map((v) => summarize(v, target));
    const authorOnly = await fetchAllPages(`intitle:"${search}"`, 2);
    titleSearchAuthorOnly = authorOnly.map((v) => summarize(v, target));
  }

  return (
    <div className="mx-auto max-w-7xl p-6 text-sm">
      <h1 className="mb-2 text-2xl font-bold">Debug: Google Books</h1>
      <p className="mb-4 text-text-muted">
        Author: <span className="font-mono">{author}</span>
        {search && (
          <>
            {" · "}Searching for: <span className="font-mono">{search}</span>
          </>
        )}
      </p>
      <p className="mb-6 text-xs text-text-muted">
        Try{" "}
        <a
          className="underline"
          href={`?author=${encodeURIComponent(author)}&search=Oathbringer`}
        >
          ?search=Oathbringer
        </a>{" "}
        to inspect a missing title.
      </p>

      <Section title={`Raw inauthor:"${author}" — ${inauthorRaw.length} volumes returned`}>
        <Table rows={inauthorSummaries} />
      </Section>

      <Section title={`Author-match filter — kept ${kept.length}, dropped ${dropped.length}`}>
        <p className="mb-2 text-text-muted">
          Filter: must include <code>{author}</code> in the authors array.
        </p>
        {dropped.length > 0 && (
          <details>
            <summary className="cursor-pointer text-brand-light">
              Show {dropped.length} dropped volumes
            </summary>
            <Table rows={dropped} />
          </details>
        )}
      </Section>

      <Section title={`Dedupe by clean title — ${dedupeMap.size} unique titles`}>
        <ul className="list-disc pl-5">
          {Array.from(dedupeMap.entries())
            .sort()
            .map(([key, vols]) => (
              <li key={key} className="mb-1">
                <span className="font-mono text-xs text-text-muted">[{key}]</span>{" "}
                <span className="font-medium">
                  {vols[0].title}
                  {vols[0].subtitle ? `: ${vols[0].subtitle}` : ""}
                </span>{" "}
                <span className="text-text-muted">
                  ({vols.length} edition{vols.length === 1 ? "" : "s"})
                </span>
              </li>
            ))}
        </ul>
      </Section>

      {search && (
        <>
          <Section
            title={`Targeted search — intitle:"${search}" inauthor:"${author}"`}
          >
            <p className="mb-2 text-text-muted">
              {titleSearch.length === 0
                ? "No results — Google Books has no record of this combo."
                : `${titleSearch.length} results.`}
            </p>
            <Table rows={titleSearch} />
          </Section>
          <Section
            title={`Targeted search — intitle:"${search}" (any author)`}
          >
            <p className="mb-2 text-text-muted">
              {titleSearchAuthorOnly.length === 0
                ? "No results — Google Books has no record of this title."
                : `${titleSearchAuthorOnly.length} results. Useful for checking who Google credits as the author.`}
            </p>
            <Table rows={titleSearchAuthorOnly} />
          </Section>
        </>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Table({ rows }: { rows: RawSummary[] }) {
  if (rows.length === 0) return <p className="text-text-muted">(empty)</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-surface-border text-text-muted">
            <th className="p-2 text-left">Title</th>
            <th className="p-2 text-left">Authors</th>
            <th className="p-2 text-left">Date</th>
            <th className="p-2 text-left">Lang</th>
            <th className="p-2 text-left">ISBN-13</th>
            <th className="p-2 text-right">Ratings</th>
            <th className="p-2 text-left">Match?</th>
            <th className="p-2 text-left">Clean Key</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-surface-border/50">
              <td className="p-2">
                {r.title}
                {r.subtitle && (
                  <span className="text-text-muted">: {r.subtitle}</span>
                )}
              </td>
              <td className="p-2">{r.authors.join(", ") || "—"}</td>
              <td className="p-2">{r.publishedDate ?? "—"}</td>
              <td className="p-2">{r.language ?? "—"}</td>
              <td className="p-2 font-mono">{r.isbn13 ?? "—"}</td>
              <td className="p-2 text-right">{r.ratingsCount}</td>
              <td className={`p-2 ${r.authorMatch ? "text-green-500" : "text-red-500"}`}>
                {r.authorMatch ? "yes" : "no"}
              </td>
              <td className="p-2 font-mono text-text-muted">{r.cleanTitleKey}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
