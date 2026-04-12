"use client";

import { Star } from "lucide-react";

export default function RatingInput({
  value,
  onChange,
  disabled,
}: {
  value: number | null;
  onChange: (rating: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          onClick={() => onChange(n)}
          disabled={disabled}
          className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium transition-all ${
            value !== null && n <= value
              ? "bg-accent-game text-surface-default"
              : "bg-surface-overlay text-text-muted hover:bg-surface-border hover:text-text-secondary"
          } disabled:opacity-50`}
        >
          {n}
        </button>
      ))}
      {value && (
        <span className="ml-2 flex items-center gap-1 text-sm text-accent-game">
          <Star size={12} className="fill-accent-game" />
          {value}/10
        </span>
      )}
    </div>
  );
}
