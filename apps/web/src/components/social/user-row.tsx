import Link from "next/link";
import { Lock } from "lucide-react";
import type { Profile } from "@intertaind/types";

/** Generic avatar+username row used in follower / following lists. */
export default function UserRow({ user }: { user: Profile }) {
  return (
    <Link
      href={`/u/${user.username}`}
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-raised"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-overlay text-base font-bold text-brand">
        {user.avatar_url ? (
          <img
            src={user.avatar_url}
            alt={user.username}
            className="h-full w-full object-cover"
          />
        ) : (
          user.username[0]?.toUpperCase()
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
          <span className="truncate">{user.display_name || user.username}</span>
          {user.is_private && <Lock size={11} className="text-text-muted" />}
        </div>
        <div className="truncate text-xs text-text-muted">@{user.username}</div>
        {user.bio && (
          <div className="mt-0.5 line-clamp-1 text-xs text-text-secondary">
            {user.bio}
          </div>
        )}
      </div>
    </Link>
  );
}
