/**
 * App-wide React providers, hoisted into a single component so the
 * root layout stays focused on routing/theming.
 *
 * Add new providers here in order of dependency: outer providers
 * wrap inner ones, and inner providers can `use*` outer state.
 */

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AuthProvider } from "./auth-provider";

/**
 * QueryClient configuration.
 *
 * - `staleTime`: 5 min. Most domain data (catalog rows, user shelves)
 *   changes infrequently; cache hits prevent redundant network on
 *   tab-switching and re-mounts.
 * - `gcTime`: 30 min (formerly `cacheTime`). Keeps unused data hot
 *   for half an hour so back-navigation is instant.
 * - `retry`: 1. Network blips happen on mobile constantly; one
 *   automatic retry is the right "ask once more, then bubble error".
 *   Skip retry on 4xx (would be a real bug, not a transient).
 * - `refetchOnWindowFocus` is mostly meaningless on RN, but
 *   `refetchOnReconnect` matters — re-fetch when the device regains
 *   network. Default is true; we keep it.
 */
function buildQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        retry: (failureCount, error) => {
          // Don't retry 4xx — those are real bugs, not transient.
          const status = (error as { status?: number })?.status;
          if (status && status >= 400 && status < 500) return false;
          return failureCount < 1;
        },
      },
    },
  });
}

export default function Providers({ children }: { children: ReactNode }) {
  // useState lazily initialized so the client survives Fast Refresh
  // and isn't recreated on every render. Module-scoping would also
  // work but breaks under Fast Refresh in some RN setups.
  const [queryClient] = useState(buildQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
