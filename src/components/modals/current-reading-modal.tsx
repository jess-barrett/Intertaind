"use client";

import { useState } from "react";
import ModalWrapper from "./modal-wrapper";

export default function CurrentReadingModal({
  title,
  onClose,
  onSave,
  initial,
}: {
  title: string;
  onClose: () => void;
  onSave: (data: {
    status: "in_progress";
    progress: Record<string, unknown>;
    started_at: string;
    activity_type_override: "started_reading";
    activity_metadata_extra?: Record<string, unknown>;
  }) => void;
  initial?: {
    progress: Record<string, unknown> | null;
    started_at: string | null;
  };
}) {
  const today = new Date().toISOString().split("T")[0];
  const initialDateStarted = initial?.started_at?.split("T")[0] ?? today;
  const initialCurrentPage = (initial?.progress?.current_page as number) ?? 0;
  const initialIsReread = (initial?.progress?.is_reread as boolean) ?? false;

  const [dateStarted, setDateStarted] = useState(initialDateStarted);
  const [currentPage, setCurrentPage] = useState(initialCurrentPage);
  const [isReread, setIsReread] = useState(initialIsReread);

  // When no initial is passed, the user is starting a fresh Reading
  // session — pressing Save still has meaning (it transitions the book to
  // the Reading shelf) even without field edits. Only gate on dirty when
  // they're editing an already-active Reading session.
  const isFreshSession = !initial;
  const isDirty =
    isFreshSession ||
    dateStarted !== initialDateStarted ||
    currentPage !== initialCurrentPage ||
    isReread !== initialIsReread;

  function handleSave() {
    onSave({
      status: "in_progress",
      progress: {
        sub_shelf: "currently_reading",
        current_page: currentPage,
        is_reread: isReread,
      },
      started_at: new Date(dateStarted).toISOString(),
      activity_type_override: "started_reading",
      activity_metadata_extra: {
        ...(currentPage > 0 ? { current_page: currentPage } : {}),
        ...(isReread ? { is_reread: true } : {}),
      },
    });
  }

  return (
    <ModalWrapper title={title} onClose={onClose}>
      <div className="space-y-5">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text-secondary">
            Date started
          </label>
          <input
            type="date"
            value={dateStarted}
            onChange={(e) => setDateStarted(e.target.value)}
            className="w-full rounded-sm border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-text-primary focus:border-brand focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-text-secondary">
            Current page
          </label>
          <input
            type="number"
            min={0}
            value={currentPage || ""}
            onChange={(e) => setCurrentPage(Number(e.target.value))}
            placeholder="0"
            className="w-full rounded-sm border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={isReread}
            onChange={(e) => setIsReread(e.target.checked)}
            className="h-4 w-4 rounded border-surface-border bg-surface-overlay accent-brand"
          />
          <span className="text-sm text-text-secondary">This is a reread</span>
        </label>

        <div className="flex justify-end pt-2">
          <button
            onClick={handleSave}
            disabled={!isDirty}
            className="rounded-sm bg-brand px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark disabled:opacity-50 disabled:hover:bg-brand"
          >
            Save
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}
