"use client";

import { useState } from "react";
import { Star, X } from "lucide-react";

/**
 * 5-star half-star rating component.
 *
 * Values: 0.5 to 5.0 in 0.5 increments.
 * Internal DB storage: multiply by 2 (3.5 stars → 7 in DB).
 *
 * Hover over left half of a star → half rating.
 * Hover over right half → full rating.
 */
export default function StarRating({
  value,
  onChange,
  disabled,
  size = 24,
  showClear = true,
}: {
  value: number | null;
  onChange?: (rating: number | null) => void;
  disabled?: boolean;
  size?: number;
  showClear?: boolean;
}) {
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const displayValue = hoverValue ?? value ?? 0;
  const interactive = !!onChange && !disabled;

  function handleMouseMove(starIndex: number, e: React.MouseEvent) {
    if (!interactive) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const isLeftHalf = x < rect.width / 2;
    setHoverValue(isLeftHalf ? starIndex - 0.5 : starIndex);
  }

  function handleClick(starIndex: number, e: React.MouseEvent) {
    if (!interactive || !onChange) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const isLeftHalf = x < rect.width / 2;
    const newValue = isLeftHalf ? starIndex - 0.5 : starIndex;
    onChange(newValue);
  }

  return (
    <div className="flex items-center gap-1">
      <div
        className="flex"
        onMouseLeave={() => setHoverValue(null)}
      >
        {[1, 2, 3, 4, 5].map((starIndex) => {
          const fillPercent =
            displayValue >= starIndex
              ? 100
              : displayValue >= starIndex - 0.5
                ? 50
                : 0;

          return (
            <button
              key={starIndex}
              type="button"
              disabled={!interactive}
              onMouseMove={(e) => handleMouseMove(starIndex, e)}
              onClick={(e) => handleClick(starIndex, e)}
              className="relative p-0.5 disabled:cursor-default"
              style={{ width: size + 4, height: size + 4 }}
            >
              {/* Empty star (background) */}
              <Star
                size={size}
                className="text-surface-border"
              />
              {/* Filled star (clipped) */}
              {fillPercent > 0 && (
                <div
                  className="absolute inset-0 overflow-hidden p-0.5"
                  style={{ width: `${fillPercent}%` }}
                >
                  <Star
                    size={size}
                    className="fill-accent-game text-accent-game"
                  />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {value && (
        <span className="ml-1 text-sm font-medium text-accent-game">
          {value.toFixed(1)}
        </span>
      )}

      {interactive && showClear && value && (
        <button
          type="button"
          onClick={() => onChange!(null)}
          className="ml-1 flex h-5 w-5 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-secondary"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

/** Display-only star rating (no interaction) */
export function StarRatingDisplay({
  value,
  size = 14,
}: {
  value: number;
  size?: number;
}) {
  // Convert from DB scale (1-10) to display scale (0.5-5.0)
  const stars = value / 2;

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((starIndex) => {
        const fillPercent =
          stars >= starIndex
            ? 100
            : stars >= starIndex - 0.5
              ? 50
              : 0;

        return (
          <span key={starIndex} className="relative" style={{ width: size, height: size }}>
            <Star size={size} className="text-surface-border" />
            {fillPercent > 0 && (
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${fillPercent}%` }}
              >
                <Star size={size} className="fill-accent-game text-accent-game" />
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
