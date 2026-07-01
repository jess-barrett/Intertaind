/**
 * Layered horizontal stack of list-item covers — Letterboxd-style. Used
 * across all three list-card variants on /lists, the home page, and
 * anywhere else we surface a list preview. The stack always presents
 * leftmost cover on top via `z-index: covers.length - i`.
 *
 * `coverWidth` + `coverOffset` let each consumer pick its own scale:
 *   - small + medium overlap (Featured / Recent rows)
 *   - large + heavy overlap (Popular this week)
 * — the total stack width = coverWidth + (covers.length - 1) * coverOffset.
 */
export default function ListCoverStack({
  covers,
  coverWidth,
  coverOffset,
}: {
  covers: { src: string | null; title: string }[];
  coverWidth: number;
  coverOffset: number;
}) {
  if (covers.length === 0) return null;
  const stackWidth = coverWidth + (covers.length - 1) * coverOffset;
  const stackHeight = coverWidth * 1.5; // aspect-2/3 movie-poster ratio

  return (
    <div
      className="relative shrink-0"
      style={{ width: `${stackWidth}px`, height: `${stackHeight}px` }}
      aria-hidden
    >
      {covers.map((cover, i) => (
        <div
          key={i}
          className="absolute top-0 overflow-hidden rounded-sm border border-surface-border bg-surface-overlay shadow-md shadow-black/40"
          style={{
            left: `${i * coverOffset}px`,
            width: `${coverWidth}px`,
            height: `${stackHeight}px`,
            zIndex: covers.length - i,
          }}
        >
          {cover.src ? (
            <img
              src={cover.src}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-surface-overlay" />
          )}
        </div>
      ))}
    </div>
  );
}
