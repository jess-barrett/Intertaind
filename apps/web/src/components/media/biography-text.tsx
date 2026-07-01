"use client";

import { useState } from "react";

/**
 * Collapses a multi-paragraph biography to its first paragraph with an
 * inline "show more" toggle. Mirrors the pattern used by the season
 * synopsis on the media detail page.
 */
export default function BiographyText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  // Split on any run of one-or-more newlines. TMDb bios consistently use
  // `\n\n` between paragraphs, but Open Library author bios sometimes
  // use single `\n` — splitting on `\n+` handles both without missing
  // the first-paragraph cutoff that authors expect.
  const paragraphs = text.split(/\n+/).filter((p) => p.trim().length > 0);
  const hasMore = paragraphs.length > 1;
  const first = paragraphs[0] ?? "";

  return (
    <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-text-secondary">
      {expanded || !hasMore ? text : first}
      {hasMore && (
        <>
          {" "}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs font-medium text-brand-light transition-colors hover:text-brand"
          >
            {expanded ? "show less" : "show more"}
          </button>
        </>
      )}
    </p>
  );
}
