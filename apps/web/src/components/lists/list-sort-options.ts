// Plain constants (not a client module) so both the server `/lists/
// browse` page and the client `ListSortSelector` can import without
// crossing the "use client" boundary — that boundary turns array
// exports into opaque RSC proxies that lose their prototype methods.

export const LIST_SORT_OPTIONS = [
  { value: "popular_week", label: "Popular this week" },
  { value: "popular_all", label: "Popular all-time" },
  { value: "recent", label: "Newest" },
  { value: "recently_liked", label: "Recently liked" },
] as const;

export type ListSortKey = (typeof LIST_SORT_OPTIONS)[number]["value"];
