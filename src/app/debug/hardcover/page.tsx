// TEMPORARY debug page — sanity-check the Hardcover GraphQL schema and
// data quality before committing to the author-page rewrite. Delete
// once the integration is dialed in.

import {
  getHardcoverMe,
  searchHardcoverAuthorByName,
  getHardcoverAuthorBibliography,
  pickHardcoverISBN,
  hardcoverImageUrl,
} from "@/lib/api/hardcover";
import type { HardcoverBook } from "@/lib/api/hardcover";

export const dynamic = "force-dynamic";

export default async function DebugHardcoverPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string }>;
}) {
  const params = await searchParams;
  const name = params.name?.trim() ?? "Brandon Sanderson";

  let meErr: string | null = null;
  let me: { username: string } | null = null;
  try {
    me = await getHardcoverMe();
  } catch (e) {
    meErr = (e as Error).message;
  }

  let authorErr: string | null = null;
  let bibErr: string | null = null;
  let author: Awaited<ReturnType<typeof searchHardcoverAuthorByName>> = null;
  let bibliography: HardcoverBook[] = [];

  try {
    author = await searchHardcoverAuthorByName(name);
  } catch (e) {
    authorErr = (e as Error).message;
  }

  if (author) {
    try {
      bibliography = await getHardcoverAuthorBibliography(author.id);
    } catch (e) {
      bibErr = (e as Error).message;
    }
  }

  return (
    <div className="mx-auto max-w-7xl p-6 text-sm">
      <h1 className="mb-2 text-2xl font-bold">Debug: Hardcover</h1>
      <p className="mb-6 text-text-muted">
        Author: <span className="font-mono">{name}</span> · try{" "}
        <a className="underline" href={`?name=Stephen+King`}>
          Stephen King
        </a>{" "}
        ·{" "}
        <a className="underline" href={`?name=Robert+Jordan`}>
          Robert Jordan
        </a>
      </p>

      <Section title="Sanity check: /me query">
        {meErr ? (
          <ErrorBox message={meErr} />
        ) : (
          <p className="text-green-500">
            Token works — logged in as <strong>{me?.username}</strong>
          </p>
        )}
      </Section>

      <Section title={`Author lookup: name="${name}"`}>
        {authorErr ? (
          <ErrorBox message={authorErr} />
        ) : !author ? (
          <p className="text-red-500">No author found.</p>
        ) : (
          <div className="flex gap-4">
            {hardcoverImageUrl(author.cached_image) && (
              <img
                src={hardcoverImageUrl(author.cached_image)!}
                alt={author.name}
                className="h-24 w-24 rounded-sm border border-surface-border object-cover"
              />
            )}
            <div>
              <p>
                <strong>{author.name}</strong>{" "}
                <span className="text-text-muted">id: {author.id}</span>
              </p>
              <p className="text-text-muted">slug: {author.slug ?? "—"}</p>
              <p className="text-text-muted">
                books_count: {author.books_count ?? "—"}
              </p>
              {author.bio && (
                <p className="mt-2 max-w-2xl text-text-secondary line-clamp-3">
                  {author.bio}
                </p>
              )}
            </div>
          </div>
        )}
      </Section>

      <Section
        title={`Bibliography: ${bibliography.length} books${
          bibErr ? "" : ""
        }`}
      >
        {bibErr ? (
          <ErrorBox message={bibErr} />
        ) : bibliography.length === 0 ? (
          <p className="text-text-muted">No books returned.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-surface-border text-text-muted">
                  <th className="p-2 text-left">Cover</th>
                  <th className="p-2 text-left">Title</th>
                  <th className="p-2 text-left">Release</th>
                  <th className="p-2 text-right">Rating</th>
                  <th className="p-2 text-right">Ratings</th>
                  <th className="p-2 text-left">ISBN</th>
                  <th className="p-2 text-left">Description</th>
                </tr>
              </thead>
              <tbody>
                {bibliography.map((b) => (
                  <tr
                    key={b.id}
                    className="border-b border-surface-border/50 align-top"
                  >
                    <td className="p-2">
                      {hardcoverImageUrl(b.cached_image) ? (
                        <img
                          src={hardcoverImageUrl(b.cached_image)!}
                          alt={b.title}
                          className="h-16 w-12 rounded-sm border border-surface-border object-cover"
                        />
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="p-2">
                      <strong>{b.title}</strong>
                      {b.subtitle && (
                        <span className="text-text-muted">: {b.subtitle}</span>
                      )}
                      <div className="text-text-muted">id: {b.id}</div>
                    </td>
                    <td className="p-2">{b.release_date ?? "—"}</td>
                    <td className="p-2 text-right">
                      {b.rating?.toFixed(2) ?? "—"}
                    </td>
                    <td className="p-2 text-right">{b.ratings_count ?? 0}</td>
                    <td className="p-2 font-mono">
                      {pickHardcoverISBN(b) ?? "—"}
                    </td>
                    <td className="max-w-md p-2 text-text-muted">
                      {(b.description ?? "").slice(0, 120)}
                      {(b.description?.length ?? 0) > 120 ? "…" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
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

function ErrorBox({ message }: { message: string }) {
  return (
    <pre className="overflow-x-auto rounded-sm border border-red-900 bg-red-950/30 p-3 text-xs text-red-300">
      {message}
    </pre>
  );
}
