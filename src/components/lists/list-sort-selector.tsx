"use client";

import { useRouter } from "next/navigation";
import FilterDropdown from "@/components/filter-dropdown";
import {
  LIST_SORT_OPTIONS,
  type ListSortKey,
} from "@/components/lists/list-sort-options";

/**
 * Sort dropdown for /lists/browse. URL-driven so the server component
 * re-renders with the new sort applied — no client-side filtering or
 * data fetching required.
 */
export default function ListSortSelector({
  value,
}: {
  value: ListSortKey;
}) {
  const router = useRouter();
  return (
    <FilterDropdown
      value={value}
      placeholder="Sort by"
      options={LIST_SORT_OPTIONS.map((o) => ({
        value: o.value,
        label: o.label,
      }))}
      onChange={(next) => {
        router.push(`/lists/browse?sort=${next}`);
      }}
    />
  );
}
