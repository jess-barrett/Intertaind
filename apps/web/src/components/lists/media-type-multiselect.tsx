"use client";

import { Check } from "lucide-react";
import type { MediaType } from "@/lib/types";
import { MEDIA_TYPE_CONFIG } from "@/lib/types";

const ALL_TYPES: MediaType[] = ["movie", "tv_show", "book", "video_game"];

/**
 * Multi-select for which media types a list contains. Users can pick
 * any combination of the four MVP types — drives discovery filters
 * ("only show lists with movies and games") in Phase 2.
 */
export default function MediaTypeMultiSelect({
  value,
  onChange,
}: {
  value: MediaType[];
  onChange: (types: MediaType[]) => void;
}) {
  function toggle(type: MediaType) {
    if (value.includes(type)) {
      onChange(value.filter((t) => t !== type));
    } else {
      onChange([...value, type]);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {ALL_TYPES.map((type) => {
        const isSelected = value.includes(type);
        const config = MEDIA_TYPE_CONFIG[type];
        return (
          <button
            key={type}
            type="button"
            onClick={() => toggle(type)}
            className={`flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-xs transition-colors ${
              isSelected
                ? "border-brand bg-brand/10 text-brand"
                : "border-surface-border bg-surface-overlay text-text-secondary hover:border-brand/40"
            }`}
          >
            {isSelected ? (
              <Check size={12} />
            ) : (
              <span className="inline-block h-3 w-3 rounded-sm border border-text-muted/50" />
            )}
            {config.label}
          </button>
        );
      })}
    </div>
  );
}
