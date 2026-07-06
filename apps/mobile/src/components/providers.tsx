/**
 * App-wide React providers, hoisted into a single component so the
 * root layout stays focused on routing/theming.
 *
 * Add new providers here in order of dependency: outer providers
 * wrap inner ones, and inner providers can `use*` outer state.
 */

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";

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
    // GestureHandlerRootView must be a real flex-1 View at the ROOT of the
    // rendered tree — @gorhom/bottom-sheet v5 (and gesture-handler itself)
    // require it, and it needs `flex: 1` so it fills the screen instead of
    // collapsing to zero height. RootLayout renders <Providers> as the
    // outermost app element (only Expo Router's own root is above it), so
    // this is the correct root anchor.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          {/* BottomSheetModalProvider wraps the whole app tree so any
              screen can present a BottomSheetModal. It lives INSIDE
              GestureHandlerRootView (a v5 requirement) and inside the
              auth/query providers so sheet content can use their hooks. */}
          <BottomSheetModalProvider>{children}</BottomSheetModalProvider>
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
