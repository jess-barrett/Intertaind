"use client";

import { useState } from "react";
import Link from "next/link";

interface SeriesBook {
  id: string;
  title: string;
  series_position: number | null;
  /** Used as a fallback when `series_position` is null — sorts books
      within a series by publication date and assigns synthetic
      positions. Lets the graph render even when OL only had partial
      position metadata for some entries. */
  release_date: string | null;
  /** Intertaind community rating, 0–5 (Supabase numeric → string in JSON) */
  avg_rating: number | string | null;
  rating_count: number | null;
  /** Google Books fallback ratings, cached during enrichment */
  metadata: {
    gb_average_rating?: number | null;
    gb_ratings_count?: number | null;
  } | null;
}

interface Props {
  books: SeriesBook[];
  currentId: string;
  seriesName: string | null;
  /** Series completion status — only populated when Wikidata had it
      (no reliable signal from GB/OL). Renders as a small chip next to
      the series name when set. */
  seriesStatus: "ongoing" | "complete" | "cancelled" | "hiatus" | null;
  /** The next book in the series after the current one. Null when
      current is the last in the series, or when ordering can't be
      determined. Computed in the page component (which already knows
      the ordering rules) so the graph component stays purely view. */
  nextBook: { id: string; title: string } | null;
}

const WIDTH = 200;
const HEIGHT = 110;
// Asymmetric vertical padding: top is tight (just header clearance),
// bottom needs room for the X-axis book-number labels.
const PADDING_LEFT = 18; // room for Y-axis tick labels
const PADDING_RIGHT = 8;
const PADDING_TOP = 10;
const PADDING_BOTTOM = 24; // room for X-axis position numbers
// Inset inside the plot area so the leftmost / rightmost dots don't
// sit flush against the Y-axis labels or right edge — gives the chart
// a bit of breathing room.
const X_INSET = 10;
// Baseline sits at the floor of the data range — gives the eye a
// "rating = 0" reference line at the bottom edge of the plot area.
const BASELINE_RATING = 0;
// Below this many Intertaind ratings, fall back to Google Books'
// averageRating. Set to 1 for early-stage use — at solo / small-group
// volume the GB fallback is rarely populated for genre fiction, so
// a strict threshold would just hide the graph everywhere. Bump back
// up to 5+ once community volume builds and the graph needs to be
// resilient to single-user outliers.
const INTERTAIND_RATING_THRESHOLD = 1;

const DOT_R = 5;
const DOT_R_CURRENT = 8;

interface PlottedDot {
  id: string;
  title: string;
  position: number;
  rating: number;
  /** 0..1 across the X axis */
  xRatio: number;
  isCurrent: boolean;
}

function effectiveRating(book: SeriesBook): number | null {
  const cnt = book.rating_count ?? 0;
  if (cnt >= INTERTAIND_RATING_THRESHOLD && book.avg_rating != null) {
    const v = typeof book.avg_rating === "string"
      ? Number(book.avg_rating)
      : book.avg_rating;
    if (Number.isFinite(v)) return v;
  }
  const gb = book.metadata?.gb_average_rating;
  return typeof gb === "number" && Number.isFinite(gb) ? gb : null;
}

/**
 * Compact line graph of community ratings across a book series. Renders
 * one dot per book with a connecting line, and highlights the dot for
 * the page the viewer is currently on. Pure SVG — no chart-lib bundle
 * cost — because the shape is small (~200×90) and we don't need axes,
 * legends, or zoom.
 *
 * Client component because each dot has a custom hover tooltip
 * (title + rating + position) that needs React state to coordinate
 * mouse-enter/leave with positioning.
 *
 * Returns null when the data is too thin to be meaningful: <2 books in
 * the series total, or <2 dots once unrated books are dropped. Better
 * to render nothing than a broken half-graph.
 */
export default function SeriesGraph({
  books,
  currentId,
  seriesName,
  seriesStatus,
  nextBook,
}: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (books.length < 2) return null;

  // Resolve a position for every book. Mix-mode (some explicit, some
  // null) is common because OL's edition-level series strings only
  // sometimes include "-- Book N" suffixes — Empire of Silence does,
  // Howling Dark doesn't. When ANY book in the series is missing a
  // position, we re-derive every book's position from `release_date`
  // so the graph stays consistent.
  const allHaveExplicit = books.every((b) => b.series_position != null);
  const sorted = allHaveExplicit
    ? [...books].sort(
        (a, b) => (a.series_position ?? 0) - (b.series_position ?? 0)
      )
    : [...books].sort((a, b) =>
        (a.release_date ?? "9999").localeCompare(b.release_date ?? "9999")
      );

  // Synthetic positions when at least one book lacks an explicit one.
  // 1-based so they align visually with how series are usually labeled.
  const positionFor = (book: SeriesBook, index: number): number =>
    allHaveExplicit ? book.series_position! : index + 1;

  const minPos = positionFor(sorted[0], 0);
  const maxPos = positionFor(sorted[sorted.length - 1], sorted.length - 1);
  const span = Math.max(1, maxPos - minPos);

  const dots: PlottedDot[] = [];
  sorted.forEach((b, i) => {
    const r = effectiveRating(b);
    if (r == null) return;
    const pos = positionFor(b, i);
    dots.push({
      id: b.id,
      title: b.title,
      position: pos,
      rating: r,
      xRatio: span === 0 ? 0.5 : (pos - minPos) / span,
      isCurrent: b.id === currentId,
    });
  });

  if (dots.length < 2) return null;

  const innerW = WIDTH - PADDING_LEFT - PADDING_RIGHT;
  const innerH = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  // Dots span the inner area minus the X_INSET margin on each side,
  // so the first dot doesn't kiss the Y-axis labels and the last
  // doesn't crowd the right edge.
  const usableW = Math.max(0, innerW - X_INSET * 2);
  const xFor = (xRatio: number) =>
    PADDING_LEFT + X_INSET + xRatio * usableW;
  const yFor = (rating: number) =>
    PADDING_TOP + (1 - rating / 5) * innerH;
  const baselineY = yFor(BASELINE_RATING);

  const polylinePoints = dots
    .map((d) => `${xFor(d.xRatio)},${yFor(d.rating)}`)
    .join(" ");

  // Tooltip position is computed in % of WIDTH/HEIGHT so it tracks the
  // dot when the SVG resizes responsively. The tooltip itself sits
  // above the dot via CSS translate, with a small upward offset.
  const hoveredDot = hoveredIdx != null ? dots[hoveredIdx] : null;
  const tooltipLeft = hoveredDot
    ? (xFor(hoveredDot.xRatio) / WIDTH) * 100
    : 0;
  const tooltipTop = hoveredDot
    ? (yFor(hoveredDot.rating) / HEIGHT) * 100
    : 0;

  return (
    <div className="relative mt-3 rounded-sm border border-surface-border bg-surface-overlay/40 p-2">
      {/* Header — descriptor + series name + status chip when known.
          Status is rendered as a tiny pill next to the series name,
          colored softly so it informs without competing with the
          graph below. */}
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
          Ratings · {seriesName ?? "Series"}
        </p>
        {seriesStatus && (
          <span
            className={`rounded-sm px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider ${
              seriesStatus === "complete"
                ? "bg-text-secondary/15 text-text-secondary"
                : seriesStatus === "cancelled"
                  ? "bg-accent-movie/15 text-accent-movie"
                  : seriesStatus === "hiatus"
                    ? "bg-accent-book/15 text-accent-book"
                    : "bg-brand/15 text-brand"
            }`}
          >
            {seriesStatus}
          </span>
        )}
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full overflow-visible"
          role="img"
          aria-label={`Ratings across ${seriesName ?? "the series"}`}
        >
          {/* Baseline at the floor of the rating scale — frames the
              chart at the bottom. */}
          <line
            x1={PADDING_LEFT}
            x2={WIDTH - PADDING_RIGHT}
            y1={baselineY}
            y2={baselineY}
            stroke="currentColor"
            className="text-surface-border"
            strokeWidth={0.5}
            strokeDasharray="2 3"
          />
          {/* Y-axis ticks. Top + floor are labeled (5★ identifies the
              scale as stars; 0 anchors the dashed baseline as the
              floor); the four interior values are tick marks instead
              of numbers so the axis stays clean. */}
          {[0, 1, 2, 3, 4, 5].map((rating) => {
            const y = yFor(rating);
            if (rating === 5) {
              return (
                <text
                  key={`ytick-${rating}`}
                  x={PADDING_LEFT - 3}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-text-muted"
                  fontSize={8.5}
                >
                  ★5
                </text>
              );
            }
            if (rating === 0) {
              return (
                <text
                  key={`ytick-${rating}`}
                  x={PADDING_LEFT - 3}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-text-muted"
                  fontSize={8.5}
                >
                  0
                </text>
              );
            }
            return (
              <line
                key={`ytick-${rating}`}
                x1={PADDING_LEFT - 8}
                x2={PADDING_LEFT - 5}
                y1={y}
                y2={y}
                stroke="currentColor"
                className="text-text-muted"
                strokeWidth={0.5}
              />
            );
          })}
          {/* Line */}
          <polyline
            points={polylinePoints}
            fill="none"
            stroke="currentColor"
            className="text-text-muted"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* X-axis position numbers under each dot — clarifies that
              the X axis is "book number in the series". The current
              page's number is also brand-pink so the highlight follows
              the dot above. */}
          {dots.map((d) => (
            <text
              key={`xtick-${d.id}`}
              x={xFor(d.xRatio)}
              y={HEIGHT - 12}
              textAnchor="middle"
              className={
                d.isCurrent ? "fill-brand font-semibold" : "fill-text-muted"
              }
              fontSize={9}
            >
              {d.position}
            </text>
          ))}
          {/* X-axis caption — explains what the row of numbers means
              without needing to read the tooltip. */}
          <text
            x={WIDTH / 2}
            y={HEIGHT - 2}
            textAnchor="middle"
            className="fill-text-muted"
            fontSize={8}
            letterSpacing={1.2}
          >
            BOOK #
          </text>
          {/* Dots — rendered as <a><circle/></a> so each one navigates
              to its book. The current page's dot is larger, brand-pink,
              and outlined so it pops against the muted line. Hover
              state drives the tooltip rendered outside the SVG. */}
          {dots.map((d, i) => {
            const cx = xFor(d.xRatio);
            const cy = yFor(d.rating);
            const r = d.isCurrent ? DOT_R_CURRENT : DOT_R;
            return (
              <Link key={d.id} href={`/media/${d.id}`}>
                <g
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  className="cursor-pointer"
                >
                  {/* Invisible larger hit area for easier hover */}
                  <circle cx={cx} cy={cy} r={r + 4} fill="transparent" />
                  {d.isCurrent ? (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill="rgb(255, 0, 110)"
                      stroke="white"
                      strokeWidth={1.5}
                    />
                  ) : (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill="currentColor"
                      className="text-text-secondary"
                    />
                  )}
                </g>
              </Link>
            );
          })}
        </svg>

        {/* Custom tooltip — positioned over the SVG via percentages so
            it tracks the dot through responsive resizing. Pointer-
            events-none so it never blocks the dot's click. Title is
            split on the first colon to drop verbose series subtitles
            ("Ashes of Man: The Sun Eater: Book Three" → "Ashes of Man")
            since the series name is already shown in the header. */}
        {hoveredDot && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-sm border border-surface-border bg-surface-raised px-2 py-1 text-[10px] shadow-lg shadow-black/40"
            style={{
              left: `${tooltipLeft}%`,
              top: `${tooltipTop}%`,
              marginTop: -DOT_R_CURRENT - 4,
            }}
          >
            <p className="font-semibold text-text-primary">
              {hoveredDot.title.split(":")[0].trim()}
            </p>
            <p className="mt-0.5 text-text-muted">
              <span className="text-brand">★</span>{" "}
              {hoveredDot.rating.toFixed(1)}
              <span className="text-text-muted/70"> / 5</span>
              <span className="ml-1.5 text-text-muted/70">
                · #{hoveredDot.position}
              </span>
            </p>
          </div>
        )}
      </div>

      {/* "Read next" — surfaces the immediately-following book in the
          series as a small inline link below the graph. Title is
          trimmed at the first colon to drop verbose series subtitles
          (same rule the tooltip uses). Hidden when the current book
          is the last in the series. */}
      {nextBook && (
        <div className="mt-2 border-t border-surface-border/60 pt-2">
          <p className="text-[9px] font-medium uppercase tracking-wider text-text-muted">
            Read next
          </p>
          <Link
            href={`/media/${nextBook.id}`}
            className="mt-0.5 block truncate text-xs font-semibold text-text-primary transition-colors hover:text-brand"
          >
            {nextBook.title.split(":")[0].trim()}
          </Link>
        </div>
      )}
    </div>
  );
}
