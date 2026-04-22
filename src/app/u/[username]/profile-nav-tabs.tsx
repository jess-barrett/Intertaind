"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, Film, Tv, Gamepad2 } from "lucide-react";
import UserSearchBar from "@/components/user-search-bar";

export default function ProfileNavTabs({ username }: { username: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const base = `/u/${username}`;

  const tabs = [
    { href: base, label: "Overview" },
    { href: `${base}/movies`, label: "Movies", icon: Film, color: "text-accent-movie" },
    { href: `${base}/tv-shows`, label: "Shows", icon: Tv, color: "text-accent-tv" },
    { href: `${base}/books`, label: "Books", icon: BookOpen, color: "text-accent-book" },
    { href: `${base}/games`, label: "Games", icon: Gamepad2, color: "text-accent-game" },
  ] as const;

  function navigate(href: string) {
    // Transition keeps the current tab's content rendered until the new
    // page's server data is ready — no empty-state flash between tabs.
    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <nav
      className={`mt-10 flex flex-wrap items-center gap-2 border-b border-surface-border pb-3 transition-opacity ${
        isPending ? "opacity-70" : ""
      }`}
    >
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <button
            key={tab.href}
            type="button"
            onClick={() => navigate(tab.href)}
            className={`flex items-center gap-1.5 rounded-sm px-4 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-surface-raised text-text-primary"
                : "text-text-muted hover:bg-surface-raised hover:text-text-primary"
            }`}
          >
            {"icon" in tab && <tab.icon size={14} className={tab.color} />}
            {tab.label}
          </button>
        );
      })}

      {/* Right-aligned user search */}
      <div className="ml-auto">
        <UserSearchBar />
      </div>
    </nav>
  );
}
