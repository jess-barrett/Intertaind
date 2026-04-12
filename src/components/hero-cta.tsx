"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function HeroCta() {
  const [username, setUsername] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUsername(user?.user_metadata?.username ?? null);
    });
  }, [supabase.auth]);

  return (
    <div className="mt-8 flex gap-3">
      {username ? (
        <Link
          href={`/u/${username}`}
          className="flex items-center gap-2 rounded-lg bg-brand px-6 py-3 font-medium text-white transition-colors hover:bg-brand-dark"
        >
          View profile
          <ArrowRight size={16} />
        </Link>
      ) : (
        <Link
          href="/signup"
          className="flex items-center gap-2 rounded-lg bg-brand px-6 py-3 font-medium text-white transition-colors hover:bg-brand-dark"
        >
          Get started
          <ArrowRight size={16} />
        </Link>
      )}
      <Link
        href="/browse"
        className="rounded-lg border border-surface-border px-6 py-3 font-medium text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary"
      >
        Browse
      </Link>
    </div>
  );
}
