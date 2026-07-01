"use client";

import { Check } from "lucide-react";
import {
  LIST_VISIBILITY_OPTIONS,
  type ListVisibility,
} from "@intertaind/types";

/**
 * Vertical radio-style picker for list visibility. Each option has a
 * one-line label and a short help line explaining what it means in
 * practice — Letterboxd-style "describe the consequence, not the
 * jargon" so users don't have to guess what "unlisted" means.
 */
export default function VisibilitySelect({
  value,
  onChange,
}: {
  value: ListVisibility;
  onChange: (v: ListVisibility) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {LIST_VISIBILITY_OPTIONS.map((opt) => {
        const isActive = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex items-start gap-3 rounded-sm border px-3 py-2 text-left transition-colors ${
              isActive
                ? "border-brand bg-brand/5"
                : "border-surface-border bg-surface-overlay hover:border-brand/40"
            }`}
          >
            <span
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                isActive
                  ? "border-brand bg-brand text-white"
                  : "border-text-muted/40"
              }`}
            >
              {isActive && <Check size={10} />}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={`block text-sm ${
                  isActive ? "text-text-primary" : "text-text-secondary"
                }`}
              >
                {opt.label}
              </span>
              <span className="block text-xs text-text-muted">{opt.help}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
