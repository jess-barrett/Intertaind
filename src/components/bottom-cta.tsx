"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function BottomCta() {
  const [username, setUsername] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUsername(user?.user_metadata?.username ?? null);
    });
  }, [supabase.auth]);

  if (username) return null;

  return (
    <section className="flex flex-col items-center px-4 py-16">
      <h2 className="text-2xl font-bold text-text-primary">
        Ready to unify your shelf?
      </h2>
      <p className="mt-3 text-text-secondary">
        Join and start tracking across all media types.
      </p>
      <Link
        href="/signup"
        className="mt-6 flex items-center gap-2 rounded-lg bg-brand px-6 py-3 font-medium text-white transition-colors hover:bg-brand-dark"
      >
        Create your account
        <ArrowRight size={16} />
      </Link>
    </section>
  );
}
