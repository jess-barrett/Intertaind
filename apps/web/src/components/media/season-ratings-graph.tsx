"use client";

import { useState, useMemo, useRef } from "react";

/**
 * Sidebar TV ratings graph — one component, two views:
 *   - "Episodes" view (default): line chart of every episode's
 *     `vote_average` across the SELECTED season.
 *   - "Seasons" view: line chart of every season's AVERAGE rating
 *     (mean of its episodes' `vote_average`), one dot per season.
 *
 * Mirrors the books `SeriesGraph` visual treatment — same SVG sizing,
 * same dot/tooltip/baseline language — but the data shape diverges
 * enough that sharing the underlying component would be more confusing
 * than helpful. Ratings live on a 0–10 scale (TMDb's vote_average) so
 * the Y-axis labels show ★10/0 instead of ★5/0.
 */

export interface SeasonRatingPoint {
  episode_number: number;
  name: string;
  air_date: string | null;
  vote_average: number;
  vote_count: number;
}

export interface SeasonRatingsSeason {
  season_number: number;
  /** "Season 1", "Specials", etc. — displayed verbatim. */
  name: string;
  episodes: SeasonRatingPoint[];
}

interface Props {
  seasons: SeasonRatingsSeason[];
  /** Show name — rendered in the header. */
  showTitle: string;
}

const WIDTH = 200;
const HEIGHT = 110;
const PADDING_LEFT = 20;
const PADDING_RIGHT = 8;
const PADDING_TOP = 10;
const PADDING_BOTTOM = 24;
const X_INSET = 10;

const DOT_R = 4;
const DOT_R_HOVER = 6;
// Threshold for collapsing into "line only, dot follows hover" mode.
// The Office's season 3+ has 20+ episodes per season — at that density
// individual dots and tick labels cram into mush. Above this count we
// render just the polyline and reveal a single dot at the nearest
// episode while the cursor is over the chart.
const DENSE_THRESHOLD = 10;

interface PlottedDot {
  /** Stable key for React */
  key: string;
  /** Display label for the X-axis tick (episode # or season #). */
  label: string;
  /** Display title for the tooltip (episode name or "Season N"). */
  title: string;
  /** Optional subtitle line in the tooltip (air date, etc.). */
  subtitle: string | null;
  rating: number;
  voteCount: number;
  /** 0..1 across the X axis */
  xRatio: number;
}

function plotEpisodes(season: SeasonRatingsSeason): PlottedDot[] {
  // Filter out unaired / unrated episodes — TMDb sometimes lists future
  // episodes with vote_average === 0 and vote_count === 0; rendering
  // those as "0★" lies about the data.
  const rated = season.episodes
    .filter((e) => e.vote_count > 0 && e.vote_average > 0)
    .sort((a, b) => a.episode_number - b.episode_number);
  if (rated.length === 0) return [];
  const minEp = rated[0].episode_number;
  const maxEp = rated[rated.length - 1].episode_number;
  const span = Math.max(1, maxEp - minEp);
  return rated.map((e) => ({
    key: `s${season.season_number}-e${e.episode_number}`,
    label: String(e.episode_number),
    // Prefix with E# so the tooltip carries episode-number context
    // even in dense mode (where the X-axis tick labels are hidden).
    title: `E${e.episode_number} · ${e.name}`,
    subtitle: e.air_date,
    rating: e.vote_average,
    voteCount: e.vote_count,
    xRatio: span === 0 ? 0.5 : (e.episode_number - minEp) / span,
  }));
}

function plotSeasonAverages(seasons: SeasonRatingsSeason[]): PlottedDot[] {
  const points = seasons
    .map((s) => {
      const rated = s.episodes.filter(
        (e) => e.vote_count > 0 && e.vote_average > 0
      );
      if (rated.length === 0) return null;
      const sum = rated.reduce((acc, e) => acc + e.vote_average, 0);
      const totalVotes = rated.reduce((acc, e) => acc + e.vote_count, 0);
      return {
        key: `season-avg-${s.season_number}`,
        label: String(s.season_number),
        title: s.name,
        subtitle: `${rated.length} ep${rated.length === 1 ? "" : "s"}`,
        rating: sum / rated.length,
        voteCount: totalVotes,
        season_number: s.season_number,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);
  if (points.length === 0) return [];
  const minSeason = points[0].season_number;
  const maxSeason = points[points.length - 1].season_number;
  const span = Math.max(1, maxSeason - minSeason);
  return points.map((p) => ({
    ...p,
    xRatio: span === 0 ? 0.5 : (p.season_number - minSeason) / span,
  }));
}

export default function SeasonRatingsGraph({ seasons, showTitle }: Props) {
  const playableSeasons = useMemo(
    () =>
      seasons
        .filter((s) => s.season_number > 0)
        .filter((s) =>
          s.episodes.some((e) => e.vote_count > 0 && e.vote_average > 0)
        )
        .sort((a, b) => a.season_number - b.season_number),
    [seasons]
  );

  const [view, setView] = useState<"episodes" | "seasons">("episodes");
  const [selectedSeason, setSelectedSeason] = useState<number>(
    playableSeasons[0]?.season_number ?? 1
  );
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (playableSeasons.length === 0) return null;

  const activeSeason =
    playableSeasons.find((s) => s.season_number === selectedSeason) ??
    playableSeasons[0];

  const dots: PlottedDot[] =
    view === "episodes"
      ? plotEpisodes(activeSeason)
      : plotSeasonAverages(playableSeasons);

  // Episodes view needs ≥ 2 dots; seasons view we let through with 1
  // dot if that's all there is, since the multi-season picker disappears
  // for single-season shows.
  if (view === "episodes" && dots.length < 2) {
    // Fall back to seasons view when the current season has too few
    // rated episodes — the user can flip back manually if they want.
    if (playableSeasons.length >= 2) {
      return (
        <SeasonRatingsGraph
          seasons={seasons}
          showTitle={showTitle}
          // ↓ key-by-view re-mounts the inner state when we recurse so the
          // useState defaults pick up the new starting view.
          key="seasons-fallback"
        />
      );
    }
    return null;
  }

  const innerW = WIDTH - PADDING_LEFT - PADDING_RIGHT;
  const innerH = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const usableW = Math.max(0, innerW - X_INSET * 2);
  const xFor = (xRatio: number) => PADDING_LEFT + X_INSET + xRatio * usableW;
  const yFor = (rating: number) =>
    PADDING_TOP + (1 - rating / 10) * innerH;
  const baselineY = yFor(0);

  const polylinePoints = dots
    .map((d) => `${xFor(d.xRatio)},${yFor(d.rating)}`)
    .join(" ");

  const dense = dots.length > DENSE_THRESHOLD;

  // In dense mode, the SVG itself catches mouse moves and picks the
  // nearest dot to highlight. In sparse mode, each dot has its own
  // hover handler — leave the SVG-level tracking off so the two
  // sources don't fight.
  function handleSVGMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!dense) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    // Map screen X back into the viewBox coordinate space.
    const svgX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < dots.length; i++) {
      const dx = Math.abs(xFor(dots[i].xRatio) - svgX);
      if (dx < nearestDist) {
        nearestDist = dx;
        nearestIdx = i;
      }
    }
    setHoveredIdx(nearestIdx);
  }

  function handleSVGMouseLeave() {
    if (dense) setHoveredIdx(null);
  }

  const hoveredDot = hoveredIdx != null ? dots[hoveredIdx] : null;
  const tooltipLeft = hoveredDot
    ? (xFor(hoveredDot.xRatio) / WIDTH) * 100
    : 0;
  const tooltipTop = hoveredDot
    ? (yFor(hoveredDot.rating) / HEIGHT) * 100
    : 0;

  const xCaption = view === "episodes" ? "EPISODE #" : "SEASON #";

  return (
    <div className="relative mt-3 rounded-sm border border-surface-border bg-surface-overlay/40 p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
          Ratings · {showTitle}
        </p>
        {/* Episodes / Seasons toggle — segmented control. Hidden when
            there's only one playable season (Seasons view would be a
            single dot). */}
        {playableSeasons.length >= 2 && (
          <div className="flex overflow-hidden rounded-sm border border-surface-border text-[9px] font-semibold uppercase tracking-wider">
            <button
              type="button"
              onClick={() => setView("episodes")}
              className={`px-1.5 py-0.5 transition-colors ${
                view === "episodes"
                  ? "bg-brand text-white"
                  : "bg-surface-raised text-text-muted hover:text-text-primary"
              }`}
            >
              Eps
            </button>
            <button
              type="button"
              onClick={() => setView("seasons")}
              className={`px-1.5 py-0.5 transition-colors ${
                view === "seasons"
                  ? "bg-brand text-white"
                  : "bg-surface-raised text-text-muted hover:text-text-primary"
              }`}
            >
              Seasons
            </button>
          </div>
        )}
      </div>

      {/* Season picker — only shown in Episodes view with 2+ seasons. */}
      {view === "episodes" && playableSeasons.length >= 2 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {playableSeasons.map((s) => (
            <button
              type="button"
              key={s.season_number}
              onClick={() => setSelectedSeason(s.season_number)}
              className={`rounded-sm px-1.5 py-0.5 text-[9px] font-semibold transition-colors ${
                s.season_number === activeSeason.season_number
                  ? "bg-brand/15 text-brand"
                  : "bg-surface-raised text-text-muted hover:text-text-primary"
              }`}
            >
              S{s.season_number}
            </button>
          ))}
        </div>
      )}

      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full overflow-visible"
          role="img"
          aria-label={
            view === "episodes"
              ? `Ratings across season ${activeSeason.season_number}`
              : `Average ratings across seasons of ${showTitle}`
          }
          onMouseMove={handleSVGMouseMove}
          onMouseLeave={handleSVGMouseLeave}
        >
          {/* Baseline at floor */}
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
          {/* Y-axis labels: ★10 at top, 0 at bottom, ticks at integers
              between. */}
          {[0, 2, 4, 6, 8, 10].map((rating) => {
            const y = yFor(rating);
            if (rating === 10) {
              return (
                <text
                  key={`ytick-${rating}`}
                  x={PADDING_LEFT - 3}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-text-muted"
                  fontSize={8.5}
                >
                  ★10
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

          {/* Line — brand-pink to make the trend line the visual hero
              and match the highlighted hover dot in dense mode. */}
          <polyline
            points={polylinePoints}
            fill="none"
            stroke="currentColor"
            className="text-brand"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* X-axis tick labels — episode # or season #. Dropped in
              dense mode (>10 dots) since they'd overlap; we render
              the hovered dot's label inside the tooltip instead. */}
          {!dense &&
            dots.map((d) => (
              <text
                key={`xtick-${d.key}`}
                x={xFor(d.xRatio)}
                y={HEIGHT - 12}
                textAnchor="middle"
                className="fill-text-muted"
                fontSize={9}
              >
                {d.label}
              </text>
            ))}

          {/* X-axis caption */}
          <text
            x={WIDTH / 2}
            y={HEIGHT - 2}
            textAnchor="middle"
            className="fill-text-muted"
            fontSize={8}
            letterSpacing={1.2}
          >
            {xCaption}
          </text>

          {/* Dots:
              - Sparse mode (≤ DENSE_THRESHOLD): render every dot with
                its own hover handler — classic "circle per point" look.
              - Dense mode (> DENSE_THRESHOLD): hide all dots; the SVG-
                level mousemove handler picks the nearest one and we
                render JUST that one below as a "spotlight" marker.
                Keeps the chart legible even at 20+ episodes/season.
          */}
          {!dense &&
            dots.map((d, i) => {
              const cx = xFor(d.xRatio);
              const cy = yFor(d.rating);
              const isHovered = hoveredIdx === i;
              return (
                <g
                  key={d.key}
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  className="cursor-pointer"
                >
                  <circle cx={cx} cy={cy} r={DOT_R_HOVER + 4} fill="transparent" />
                  {isHovered ? (
                    // Match the dense-mode spotlight treatment: a single
                    // pink-filled circle at the hover radius with a
                    // light outline. Same visual language across both
                    // sparse and dense modes so the hover doesn't feel
                    // like two different graphs depending on density.
                    <circle
                      cx={cx}
                      cy={cy}
                      r={DOT_R_HOVER}
                      fill="rgb(255, 0, 110)"
                      stroke="white"
                      strokeWidth={1.5}
                    />
                  ) : (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={DOT_R}
                      fill="currentColor"
                      className="text-text-secondary"
                    />
                  )}
                </g>
              );
            })}

          {/* Dense-mode spotlight — a single dot at whichever point is
              closest to the cursor, plus a thin vertical guide so the
              user sees which episode they're reading. */}
          {dense && hoveredDot && (
            <>
              <line
                x1={xFor(hoveredDot.xRatio)}
                x2={xFor(hoveredDot.xRatio)}
                y1={PADDING_TOP}
                y2={HEIGHT - PADDING_BOTTOM}
                stroke="currentColor"
                className="text-surface-border"
                strokeWidth={0.5}
              />
              <circle
                cx={xFor(hoveredDot.xRatio)}
                cy={yFor(hoveredDot.rating)}
                r={DOT_R_HOVER}
                fill="rgb(255, 0, 110)"
                stroke="white"
                strokeWidth={1.5}
              />
            </>
          )}
        </svg>

        {/* Tooltip */}
        {hoveredDot && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-sm border border-surface-border bg-surface-raised px-2 py-1 text-[10px] shadow-lg shadow-black/40"
            style={{
              left: `${tooltipLeft}%`,
              top: `${tooltipTop}%`,
              marginTop: -DOT_R_HOVER - 4,
            }}
          >
            <p className="font-semibold text-text-primary">
              {hoveredDot.title}
            </p>
            <p className="mt-0.5 text-text-muted">
              <span className="text-brand">★</span>{" "}
              {hoveredDot.rating.toFixed(1)}
              <span className="text-text-muted/70"> / 10</span>
              {hoveredDot.voteCount > 0 && (
                <span className="ml-1.5 text-text-muted/70">
                  · {hoveredDot.voteCount.toLocaleString()} votes
                </span>
              )}
            </p>
            {hoveredDot.subtitle && (
              <p className="mt-0.5 text-text-muted/70">{hoveredDot.subtitle}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
