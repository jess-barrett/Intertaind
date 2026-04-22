"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check, X } from "lucide-react";
import type { NotificationWithActor } from "@/app/actions/social";
import {
  getNotifications,
  markNotificationsRead,
  acceptFollowRequest,
  denyFollowRequest,
} from "@/app/actions/social";
import { relativeTime } from "@/lib/time";

export default function NotificationBell() {
  const [items, setItems] = useState<NotificationWithActor[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ right: number; top: number } | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Initial fetch + after any action we mutate state optimistically
  async function refresh() {
    const { items, unreadCount } = await getNotifications();
    setItems(items);
    setUnreadCount(unreadCount);
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (
        !triggerRef.current?.contains(t) &&
        !menuRef.current?.contains(t)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ right: window.innerWidth - rect.right, top: rect.bottom + 6 });
    }
    setOpen(true);

    // Mark all unread items as read shortly after opening so the user can
    // still see which ones were new for a beat.
    const unreadIds = items.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length > 0) {
      setTimeout(() => {
        markNotificationsRead(unreadIds).then(() => {
          setUnreadCount(0);
        });
      }, 500);
    }
  }

  function accept(id: string, requesterId: string) {
    startTransition(async () => {
      try {
        await acceptFollowRequest(requesterId);
        setItems((prev) => prev.filter((n) => n.id !== id));
        router.refresh();
      } catch {
        // no-op
      }
    });
  }

  function deny(id: string, requesterId: string) {
    startTransition(async () => {
      try {
        await denyFollowRequest(requesterId);
        setItems((prev) => prev.filter((n) => n.id !== id));
      } catch {
        // no-op
      }
    });
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-label="Notifications"
        className="relative flex h-8 w-8 items-center justify-center rounded-sm text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", right: pos.right, top: pos.top }}
            className="z-50 w-80 overflow-hidden rounded-sm border border-surface-border bg-surface-raised shadow-2xl shadow-black/40"
          >
            <div className="border-b border-surface-border px-4 py-3 text-sm font-semibold text-text-primary">
              Notifications
            </div>
            {items.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-text-muted">
                You&apos;re all caught up.
              </div>
            ) : (
              <ul className="max-h-96 overflow-y-auto">
                {items.map((n) => (
                  <NotificationItem
                    key={n.id}
                    n={n}
                    onAccept={() => accept(n.id, n.actor_id)}
                    onDeny={() => deny(n.id, n.actor_id)}
                    onLinkClick={() => setOpen(false)}
                  />
                ))}
              </ul>
            )}
          </div>,
          document.body
        )}
    </>
  );
}

function NotificationItem({
  n,
  onAccept,
  onDeny,
  onLinkClick,
}: {
  n: NotificationWithActor;
  onAccept: () => void;
  onDeny: () => void;
  onLinkClick: () => void;
}) {
  const actor = n.actor;
  const displayName = actor?.display_name || actor?.username || "someone";
  const unread = !n.read_at;

  const message =
    n.type === "follow"
      ? "started following you"
      : n.type === "follow_request"
      ? "wants to follow you"
      : "accepted your follow request";

  return (
    <li
      className={`flex items-start gap-3 border-b border-surface-border/60 px-4 py-3 last:border-b-0 ${
        unread ? "bg-surface-overlay/50" : ""
      }`}
    >
      <Link
        href={`/u/${actor?.username}`}
        onClick={onLinkClick}
        className="shrink-0"
      >
        <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-surface-overlay text-sm font-bold text-brand">
          {actor?.avatar_url ? (
            <img
              src={actor.avatar_url}
              alt={actor.username}
              className="h-full w-full object-cover"
            />
          ) : (
            actor?.username?.[0]?.toUpperCase() ?? "?"
          )}
        </div>
      </Link>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-text-secondary">
          <Link
            href={`/u/${actor?.username}`}
            onClick={onLinkClick}
            className="font-medium text-text-primary hover:text-brand"
          >
            {displayName}
          </Link>{" "}
          {message}
        </p>
        <p className="mt-0.5 text-xs text-text-muted">
          {relativeTime(n.created_at)}
        </p>
        {n.type === "follow_request" && (
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onAccept}
              className="flex items-center gap-1 rounded-sm bg-brand px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-brand-dark"
            >
              <Check size={12} />
              Accept
            </button>
            <button
              type="button"
              onClick={onDeny}
              className="flex items-center gap-1 rounded-sm border border-surface-border px-2.5 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-overlay"
            >
              <X size={12} />
              Deny
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

