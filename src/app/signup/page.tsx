"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";

const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const normalizedUsername = username.toLowerCase();

    if (!USERNAME_REGEX.test(normalizedUsername)) {
      setError(
        "Username must be 3-20 characters, lowercase letters, numbers, and underscores only."
      );
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username: normalizedUsername },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="glass w-full max-w-md p-8">
        <h1 className="mb-2 text-2xl font-bold text-text-primary">
          Create your account
        </h1>
        <p className="mb-6 text-text-secondary">
          Start tracking your entertainment
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="username"
              className="mb-1 block text-sm text-text-secondary"
            >
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              required
              className="w-full rounded-lg border border-surface-border bg-surface-overlay px-4 py-2.5 text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
              placeholder="cooluser42"
            />
            <p className="mt-1 text-xs text-text-muted">
              3-20 characters. Letters, numbers, underscores.
            </p>
          </div>

          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm text-text-secondary"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-surface-border bg-surface-overlay px-4 py-2.5 text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm text-text-secondary"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-lg border border-surface-border bg-surface-overlay px-4 py-2.5 text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-accent-movie">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-brand py-2.5 font-medium text-white transition-colors hover:bg-brand-dark disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-text-secondary">
          Already have an account?{" "}
          <Link href="/login" className="text-brand hover:text-brand-light">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
