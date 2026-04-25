import Link from "next/link";
import { User } from "lucide-react";
import {
  searchOpenLibraryAuthor,
  getOpenLibraryAuthor,
  getAuthorBio,
  authorPhotoUrl,
  authorOlid,
} from "@/lib/api/openlibrary";
import BiographyText from "@/components/media/biography-text";

/**
 * Server-rendered author card sourced from Open Library. Renders nothing
 * when neither a bio nor a photo can be resolved — we'd rather hide the
 * section than show an empty shell.
 */
export default async function AboutTheAuthor({ name }: { name: string }) {
  const search = await searchOpenLibraryAuthor(name);
  if (!search) return null;

  const author = await getOpenLibraryAuthor(search.key);
  if (!author) return null;

  const bio = getAuthorBio(author);
  const photo = authorPhotoUrl(author, "L");
  if (!bio && !photo) return null;

  // OL search occasionally returns a near-match. Surface the resolved
  // name when it differs from what was on the book so we're not silently
  // attributing the wrong person.
  const displayName = author.name || name;
  const olid = authorOlid(author);
  const authorHref = `/author/${olid}`;

  return (
    <section className="mt-8">
      <h2 className="mb-4 text-lg font-semibold text-text-primary">
        About the author
      </h2>
      <div className="flex items-start gap-4">
        <Link
          href={authorHref}
          className="group aspect-square w-28 shrink-0 overflow-hidden rounded-sm border border-surface-border bg-surface-overlay"
        >
          {photo ? (
            <img
              src={photo}
              alt={displayName}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-text-muted">
              <User size={32} className="opacity-40" />
            </div>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-text-primary">
            <Link
              href={authorHref}
              className="transition-colors hover:text-brand"
            >
              {displayName}
            </Link>
          </h3>
          {(author.birth_date || author.death_date) && (
            <p className="mt-0.5 text-xs text-text-muted">
              {author.birth_date}
              {author.death_date ? ` – ${author.death_date}` : ""}
            </p>
          )}
          {bio ? (
            <BiographyText text={bio} />
          ) : (
            <p className="mt-2 text-sm text-text-muted italic">
              No biography available.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
