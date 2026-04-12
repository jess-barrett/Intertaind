"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { User } from "@supabase/supabase-js";
import { LogOut, User as UserIcon, ChevronDown } from "lucide-react";
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
    <nav className="glass fixed top-4 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-5xl -translate-x-1/2 items-center justify-between px-6 py-3">
      <div className="flex items-center gap-8">
        <Link href="/" className="text-lg font-bold tracking-tight">
          <span className="text-text-primary">inter</span>
          <span className="text-brand">taind</span>
        </Link>

        <div className="hidden items-center gap-6 sm:flex">
          <Link
            href="/browse"
            className="text-sm text-text-secondary transition-colors hover:text-text-primary"
          >
            Browse
          </Link>
          <Link
            href="/lists"
            className="text-sm text-text-secondary transition-colors hover:text-text-primary"
          >
            Lists
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <SearchBar />
        {user ? (
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
            >
              <UserIcon size={16} />
              <span className="hidden sm:inline">{username}</span>
              <ChevronDown size={14} />
            </button>

            {menuOpen && (
              <div className="glass absolute right-0 top-full mt-2 w-48 p-1">
                <Link
                  href={`/u/${username}`}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
                >
                  <UserIcon size={14} />
                  Profile
                </Link>
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
                >
                  <LogOut size={14} />
                  Sign out
                </button>
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
    </nav>
  );
}
