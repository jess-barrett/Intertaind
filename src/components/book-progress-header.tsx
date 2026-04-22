"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { trackMedia, updateBookPage } from "@/app/actions/media";

function daysBetween(startIso: string | null): number | null {
  if (!startIso) return null;
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return null;
  const diffMs = Date.now() - start.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export default function BookProgressHeader({
  userMediaId,
  mediaId,
  title,
  startedAt,
  currentPage,
  totalPages,
  editable,
}: {
  userMediaId: string;
  mediaId: string;
  title: string;
  startedAt: string | null;
  currentPage: number;
  totalPages: number | null;
  editable: boolean;
}) {
  const [page, setPage] = useState<number>(currentPage);
  const [isPending, startTransition] = useTransition();
  const [celebrate, setCelebrate] = useState(false);
  const [popupPos, setPopupPos] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const pct =
    totalPages && totalPages > 0
      ? Math.min(100, Math.max(0, Math.round((page / totalPages) * 100)))
      : 0;

  function openCelebration() {
    if (!headerRef.current) return;
    const rect = headerRef.current.getBoundingClientRect();
    setPopupPos({
      // Anchor to the horizontal center of the progress row and the
      // vertical top — the popup will shift itself up/over via transform.
      left: rect.left + rect.width / 2,
      top: rect.top,
    });
    setCelebrate(true);
  }

  function closeCelebration() {
    setCelebrate(false);
    setPopupPos(null);
    router.refresh();
  }

  function commit() {
    if (page === currentPage) return;
    // Save whatever the user typed. If they over-shoot (typo), they'll
    // see e.g. "301 / 300" and correct it — we intentionally don't
    // clamp, so the congrats popover doesn't fire on typos.
    const nextPage = page;
    startTransition(async () => {
      try {
        await updateBookPage(userMediaId, nextPage);
        if (totalPages && nextPage === totalPages) {
          openCelebration();
        } else {
          router.refresh();
        }
      } catch (err) {
        console.error(err);
      }
    });
  }

  function handleMoveToRead() {
    startTransition(async () => {
      try {
        await trackMedia(mediaId, "completed", {
          completed_at: new Date().toISOString(),
        });
        setCelebrate(false);
        setPopupPos(null);
        router.refresh();
      } catch (err) {
        console.error(err);
      }
    });
  }

  // Close the popover on outside click / scroll / resize — the fixed
  // anchor drifts if we don't refresh it, and users expect escape behavior.
  useEffect(() => {
    if (!celebrate) return;
    function onDocClick(e: MouseEvent) {
      if (!popupRef.current?.contains(e.target as Node)) closeCelebration();
    }
    function onScrollOrResize() {
      closeCelebration();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeCelebration();
    }
    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebrate]);

  const days = daysBetween(startedAt);
  const daysText =
    days === null
      ? null
      : days === 0
      ? "today"
      : days === 1
      ? "in 1 day"
      : `in ${days} days`;

  return (
    <>
      <div
        ref={headerRef}
        className="flex items-center gap-2 px-2 py-1.5 text-[10px] text-text-muted"
      >
        {editable ? (
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={page || ""}
            disabled={isPending}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "");
              setPage(digits === "" ? 0 : Number(digits));
            }}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            onClick={(e) => e.preventDefault()}
            className="w-10 rounded-sm border border-surface-border bg-surface-overlay px-1 text-center text-[10px] text-text-primary focus:border-brand focus:outline-none disabled:opacity-50"
          />
        ) : (
          <span className="text-text-primary">{page}</span>
        )}
        {totalPages ? <span>/ {totalPages}</span> : null}

        {totalPages && totalPages > 0 ? (
          <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-overlay">
            <div
              className="absolute inset-y-0 left-0 bg-accent-book transition-[width] duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
        ) : (
          <div className="flex-1" />
        )}
        <span className="shrink-0 tabular-nums">{pct}%</span>
      </div>

      {celebrate &&
        popupPos &&
        createPortal(
          <div
            ref={popupRef}
            style={{
              position: "fixed",
              left: popupPos.left,
              top: popupPos.top,
              transform: "translate(-50%, -60%)",
            }}
            className="z-50 w-72 rounded-sm border border-surface-border bg-surface-raised p-4 shadow-2xl shadow-black/60"
          >
            <p className="mb-3 text-center text-sm text-text-secondary">
              Congrats! You finished{" "}
              <span className="font-medium text-text-primary">{title}</span>
              {daysText ? ` ${daysText}` : ""}.
            </p>
            <button
              onClick={handleMoveToRead}
              disabled={isPending}
              className="w-full rounded-sm bg-brand px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark disabled:opacity-50"
            >
              Move to Read
            </button>
          </div>,
          document.body
        )}
    </>
  );
}
