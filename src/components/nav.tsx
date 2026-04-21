"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { User } from "@supabase/supabase-js";
import {
  LogOut,
  User as UserIcon,
  ChevronDown,
  Film,
  Tv,
  BookOpen,
  Gamepad2,
  Settings,
} from "lucide-react";
import SearchBar from "./search-bar";

export default function Nav() {
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase.auth]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    setMenuOpen(false);
    router.push("/");
    router.refresh();
  }

  const username = user?.user_metadata?.username;

  return (
    <nav className="relative z-40 w-full border-b border-surface-border bg-surface-raised/60 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center px-4 py-3">
        {/* Left: Logo */}
        <div className="flex flex-1 items-center">
          <Link
            href="/"
            className="block text-5xl tracking-wider leading-none"
            style={{
              fontFamily: '"mundial", sans-serif',
              fontWeight: 700,
              transform: "translateY(-0.15em)",
            }}
          >
            <span className="text-text-primary">inter</span>
            <span className="text-brand">taind</span>
          </Link>
        </div>

        {/* Center: Search */}
        <div className="hidden flex-1 justify-center sm:flex">
          <SearchBar />
        </div>

        {/* Right: Browse Lists + auth */}
        <div className="flex flex-1 items-center justify-end gap-3">
          <Link
            href="/lists"
            className="hidden text-sm text-text-secondary transition-colors hover:text-text-primary sm:inline"
          >
            Browse Lists
          </Link>
          <div className="sm:hidden">
            <SearchBar />
          </div>
          {user ? (
            <div
              className="relative"
              onMouseEnter={() => setMenuOpen(true)}
              onMouseLeave={() => setMenuOpen(false)}
            >
              <button className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary">
                <UserIcon size={16} />
                <span className="hidden sm:inline">{username}</span>
                <ChevronDown size={14} />
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full z-50 w-48 pt-2">
                  <div className="rounded-xl border border-surface-border bg-surface-raised p-1 shadow-xl shadow-black/40">
                    <Link
                      href={`/u/${username}`}
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
                    >
                      <UserIcon size={14} />
                      Profile
                    </Link>

                    <div className="my-1 border-t border-surface-border" />

                    <p className="px-3 py-1 text-xs font-medium text-text-muted">
                      Shelves
                    </p>
                    <Link
                      href={`/u/${username}/movies`}
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
                    >
                      <Film size={14} className="text-accent-movie" />
                      Movies
                    </Link>
                    <Link
                      href={`/u/${username}/tv-shows`}
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
                    >
                      <Tv size={14} className="text-accent-tv" />
                      Shows
                    </Link>
                    <Link
                      href={`/u/${username}/books`}
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
                    >
                      <BookOpen size={14} className="text-accent-book" />
                      Books
                    </Link>
                    <Link
                      href={`/u/${username}/games`}
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
                    >
                      <Gamepad2 size={14} className="text-accent-game" />
                      Games
                    </Link>

                    <div className="my-1 border-t border-surface-border" />

                    <Link
                      href="/settings"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
                    >
                      <Settings size={14} />
                      Settings
                    </Link>
                    <button
                      onClick={handleSignOut}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
                    >
                      <LogOut size={14} />
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg px-4 py-1.5 text-sm text-text-secondary transition-colors hover:text-text-primary"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-dark"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
