"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import ModalWrapper from "./modal-wrapper";
import { listMediaBackdrops, setCustomBackdrop } from "@/app/actions/media";

export default function BackdropPickerModal({
  mediaId,
  currentUrl,
  defaultUrl,
  onClose,
  onSaved,
}: {
  mediaId: string;
  /** The URL currently being used (user override OR shared default). */
  currentUrl: string | null;
  /** The shared default backdrop — rendered with a "Default" badge and
      used by the "Use default" action. */
  defaultUrl: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [candidates, setCandidates] = useState<string[] | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    listMediaBackdrops(mediaId).then((urls) => {
      if (!cancelled) setCandidates(urls);
    });
    return () => {
      cancelled = true;
    };
  }, [mediaId]);

  function pick(url: string | null) {
    startTransition(async () => {
      try {
        await setCustomBackdrop(mediaId, url);
        onSaved();
      } catch (err) {
        console.error(err);
      }
    });
  }

  return (
    <ModalWrapper title="Change backdrop" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-text-muted">
          Pick a backdrop for this title. Only you see your choice.
        </p>

        {candidates === null ? (
          <div className="flex justify-center py-12">
            <Loader2 size={24} className="animate-spin text-text-muted" />
          </div>
        ) : candidates.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-muted">
            No alternate backdrops available for this title.
          </p>
        ) : (
          <>
            <div className="custom-scrollbar grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto pr-1">
              {defaultUrl && !candidates.includes(defaultUrl) && (
                <BackdropTile
                  key="default-extra"
                  url={defaultUrl}
                  selected={currentUrl === defaultUrl}
                  label="Default"
                  disabled={isPending}
                  onClick={() => pick(null)}
                />
              )}
              {candidates.map((url) => (
                <BackdropTile
                  key={url}
                  url={url}
                  selected={currentUrl === url}
                  label={url === defaultUrl ? "Default" : undefined}
                  disabled={isPending}
                  onClick={() => pick(url === defaultUrl ? null : url)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </ModalWrapper>
  );
}

function BackdropTile({
  url,
  selected,
  label,
  disabled,
  onClick,
}: {
  url: string;
  selected: boolean;
  label?: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group relative aspect-video overflow-hidden rounded-sm border transition-all disabled:opacity-50 ${
        selected
          ? "border-brand ring-2 ring-brand/40"
          : "border-surface-border hover:border-brand/40"
      }`}
    >
      <img src={url} alt="" className="h-full w-full object-cover" />
      {label && (
        <span className="absolute left-1.5 top-1.5 rounded-sm bg-surface-raised/80 px-1.5 py-0.5 text-[10px] font-medium text-text-secondary backdrop-blur">
          {label}
        </span>
      )}
      {selected && (
        <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white">
          <Check size={12} />
        </span>
      )}
    </button>
  );
}
