"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";

interface Option {
  value: string;
  label: string;
}

/**
 * Drop-in replacement for the native `<select>` on filter rows. Native
 * select's open-state popup is OS-rendered (white background, system
 * fonts) — this gives us dark theming, our custom scrollbar, and a
 * consistent look across browsers.
 */
export default function FilterDropdown({
  value,
  options,
  placeholder,
  onChange,
  className,
}: {
  value: string;
  options: Option[];
  placeholder: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = options.find((o) => o.value === value);
  const display = current?.label ?? placeholder;

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-sm border border-surface-border bg-surface-overlay px-2 py-1.5 text-xs text-text-secondary transition-colors hover:border-brand/40 focus:border-brand focus:outline-none"
      >
        <span className="whitespace-nowrap">{display}</span>
        <ChevronDown
          size={12}
          className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="custom-scrollbar absolute left-0 top-full z-30 mt-1 max-h-64 w-max min-w-full max-w-xs overflow-y-auto rounded-sm border border-surface-border bg-surface-raised py-1 shadow-xl shadow-black/40">
          {options.map((o) => {
            const selected = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-2 whitespace-nowrap px-3 py-1.5 text-left text-xs transition-colors hover:bg-surface-overlay ${
                  selected
                    ? "text-text-primary"
                    : "text-text-secondary"
                }`}
              >
                <span>{o.label}</span>
                {selected && <Check size={12} className="text-brand shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
