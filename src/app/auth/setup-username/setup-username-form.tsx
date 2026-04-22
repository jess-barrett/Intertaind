"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createInitialProfile } from "@/app/actions/profile";

export default function SetupUsernameForm({ suggested }: { suggested: string }) {
  const router = useRouter();
  const [username, setUsername] = useState(suggested);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startSaving(async () => {
      try {
        await createInitialProfile(username);
        router.push("/");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save.");
      }
    });
  }

  return (
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
          onChange={(e) => setUsername(e.target.value)}
          required
          autoFocus
          className="w-full rounded-lg border border-surface-border bg-surface-overlay px-4 py-2.5 text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
          placeholder="cooluser42"
        />
        <p className="mt-1 text-xs text-text-muted">
          3–30 characters. Letters, numbers, underscore, or dash.
        </p>
      </div>

      {error && <p className="text-sm text-accent-movie">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-lg bg-brand py-2.5 font-medium text-white transition-colors hover:bg-brand-dark disabled:opacity-50"
      >
        {saving ? "Setting up…" : "Continue"}
      </button>
    </form>
  );
}
