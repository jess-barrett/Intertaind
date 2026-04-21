"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Film, Tv, Gamepad2 } from "lucide-react";

export default function ProfileNavTabs({ username }: { username: string }) {
  const pathname = usePathname();
  const base = `/u/${username}`;

  const tabs = [
    { href: base, label: "Overview" },
    { href: `${base}/movies`, label: "Movies", icon: Film, color: "text-accent-movie" },
    { href: `${base}/tv-shows`, label: "Shows", icon: Tv, color: "text-accent-tv" },
    { href: `${base}/books`, label: "Books", icon: BookOpen, color: "text-accent-book" },
    { href: `${base}/games`, label: "Games", icon: Gamepad2, color: "text-accent-game" },
  ] as const;

  return (
    <nav className="mt-10 flex gap-2 border-b border-surface-border pb-3">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-surface-raised text-text-primary"
                : "text-text-muted hover:bg-surface-raised hover:text-text-primary"
            }`}
          >
            {"icon" in tab && <tab.icon size={14} className={tab.color} />}
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
