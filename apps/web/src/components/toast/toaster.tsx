"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { subscribeToToasts, type ToastEvent } from "@/lib/toast";

/**
 * Singleton toast renderer. Mounted once in the root layout — listens
 * to the module-level toast emitter and renders the queue stacked at
 * the bottom-right of the viewport. Each toast auto-dismisses after
 * its duration; the user can also dismiss manually via the X.
 */
export default function Toaster() {
  const [toasts, setToasts] = useState<ToastEvent[]>([]);

  useEffect(() => {
    const unsub = subscribeToToasts((t) => {
      setToasts((prev) => [...prev, t]);
      const duration = t.duration ?? 4000;
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, duration);
    });
    return unsub;
  }, []);

  function dismiss(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

const VARIANT_STYLES: Record<
  NonNullable<ToastEvent["variant"]>,
  { icon: React.ElementType; iconClass: string; border: string }
> = {
  success: {
    icon: CheckCircle2,
    iconClass: "text-green-400",
    border: "border-green-900/50",
  },
  error: {
    icon: AlertCircle,
    iconClass: "text-red-400",
    border: "border-red-900/50",
  },
  info: {
    icon: Info,
    iconClass: "text-text-secondary",
    border: "border-surface-border",
  },
};

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastEvent;
  onDismiss: () => void;
}) {
  const variant = toast.variant ?? "success";
  const { icon: Icon, iconClass, border } = VARIANT_STYLES[variant];
  return (
    <div
      role="status"
      className={`pointer-events-auto flex items-start gap-3 rounded-sm border ${border} bg-surface-raised px-4 py-3 text-sm text-text-primary shadow-xl shadow-black/50`}
    >
      <Icon size={16} className={`mt-0.5 shrink-0 ${iconClass}`} />
      <p className="min-w-0 flex-1 leading-relaxed">{toast.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-sm p-0.5 text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary"
      >
        <X size={14} />
      </button>
    </div>
  );
}
