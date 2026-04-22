"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function ShelfTabs({
  tabs,
  activeTab,
}: {
  tabs: { key: string; label: string }[];
  activeTab: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function setTab(key: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", key);
    // Wrap navigation in a transition so the current tab's content stays
    // rendered until the new tab's server data arrives (no empty-state flash).
    startTransition(() => {
      router.push(`?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <div
      className={`mb-6 flex flex-wrap gap-2 border-b border-surface-border pb-1 transition-opacity ${
        isPending ? "opacity-70" : ""
      }`}
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => setTab(tab.key)}
          className={`relative rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            activeTab === tab.key
              ? "text-text-primary"
              : "text-text-muted hover:text-text-secondary"
          }`}
        >
          {tab.label}
          {activeTab === tab.key && (
            <span className="absolute inset-x-3 -bottom-1 h-0.5 rounded-full bg-brand" />
          )}
        </button>
      ))}
    </div>
  );
}
