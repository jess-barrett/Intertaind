"use client";

/**
 * Tiny pub/sub toast emitter — module-level subscriber list, no React
 * context. Components call `toast(message, opts)` from anywhere in the
 * client; the singleton `<Toaster />` mounted in the root layout
 * subscribes once and renders the queue. Survives client-side router
 * navigations because the layout doesn't unmount.
 */

export type ToastVariant = "success" | "error" | "info";

export interface ToastInput {
  message: string;
  variant?: ToastVariant;
  /** Auto-dismiss after this many ms. Defaults to 4000. */
  duration?: number;
}

export interface ToastEvent extends ToastInput {
  id: number;
}

type Subscriber = (t: ToastEvent) => void;

let subscribers: Subscriber[] = [];
let nextId = 1;

export function toast(message: string, opts: Omit<ToastInput, "message"> = {}) {
  const event: ToastEvent = {
    id: nextId++,
    message,
    variant: opts.variant ?? "success",
    duration: opts.duration ?? 4000,
  };
  for (const sub of subscribers) sub(event);
}

export function subscribeToToasts(fn: Subscriber): () => void {
  subscribers.push(fn);
  return () => {
    subscribers = subscribers.filter((s) => s !== fn);
  };
}
