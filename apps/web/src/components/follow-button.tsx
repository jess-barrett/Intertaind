"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UserPlus, UserCheck, UserX, Lock } from "lucide-react";
import type { FollowState } from "@intertaind/types";
import {
  followUser,
  unfollowUser,
  cancelFollowRequest,
  unblockUser,
} from "@/app/actions/social";

export default function FollowButton({
  targetId,
  targetIsPrivate,
  initialState,
  loggedIn,
}: {
  targetId: string;
  targetIsPrivate: boolean;
  initialState: FollowState;
  loggedIn: boolean;
}) {
  const [state, setState] = useState<FollowState>(initialState);
  const [hovering, setHovering] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (state === "self") return null;

  if (!loggedIn) {
    return (
      <Link
        href="/login"
        className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-dark"
      >
        <UserPlus size={14} />
        Follow
      </Link>
    );
  }

  function run(action: () => Promise<void>, next: FollowState) {
    startTransition(async () => {
      try {
        await action();
        setState(next);
        router.refresh();
      } catch {
        // no-op — could show a toast later
      }
    });
  }

  let label: string;
  let icon: React.ReactNode;
  let onClick: () => void;
  let cls =
    "flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-50";

  if (state === "blocked_by_me") {
    label = "Unblock";
    icon = <UserX size={14} />;
    cls += " border border-surface-border text-text-secondary hover:bg-surface-overlay hover:text-text-primary";
    onClick = () =>
      run(() => unblockUser(targetId), "none");
  } else if (state === "following") {
    label = hovering ? "Unfollow" : "Following";
    icon = <UserCheck size={14} />;
    cls += hovering
      ? " border border-accent-movie text-accent-movie"
      : " border border-surface-border text-text-primary";
    onClick = () => run(() => unfollowUser(targetId), "none");
  } else if (state === "requested") {
    label = hovering ? "Cancel" : "Requested";
    icon = <Lock size={14} />;
    cls += hovering
      ? " border border-accent-movie text-accent-movie"
      : " border border-surface-border text-text-secondary";
    onClick = () => run(() => cancelFollowRequest(targetId), "none");
  } else {
    label = targetIsPrivate ? "Request" : "Follow";
    icon = targetIsPrivate ? <Lock size={14} /> : <UserPlus size={14} />;
    cls += " bg-brand text-white hover:bg-brand-dark";
    onClick = () =>
      run(
        async () => {
          await followUser(targetId);
        },
        targetIsPrivate ? "requested" : "following"
      );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      disabled={pending}
      className={cls}
    >
      {icon}
      {label}
    </button>
  );
}
