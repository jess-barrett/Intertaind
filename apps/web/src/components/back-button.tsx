"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export default function BackButton({ fallbackHref = "/" }: { fallbackHref?: string }) {
  const router = useRouter();

  function handleBack() {
    // If there's history to return to, use it. Otherwise fall back so users
    // who opened the page directly (shared link, new tab) aren't stranded.
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      className="flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text-secondary"
    >
      <ArrowLeft size={14} />
      Back
    </button>
  );
}
