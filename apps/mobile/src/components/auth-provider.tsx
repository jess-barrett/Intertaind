/**
 * Auth context: the single source of truth for "who is signed in" on
 * mobile. Subscribes to Supabase auth-state changes and tracks whether
 * the signed-in user has completed profile setup (picked a username).
 *
 * Sits INSIDE QueryClientProvider for provider ordering — it doesn't use
 * the query client today, but keeping it under the provider lets it adopt
 * query hooks later without a reshuffle, and it's outside the navigation
 * tree (the root layout reads this to gate routes). Note: the profile
 * existence check below calls `supabase.from(...)` directly rather than
 * going through `src/queries/`. That is a deliberate bootstrap exception —
 * this read must run before the tree mounts, so it can't depend on a
 * component-level query hook.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type ProfileStatus = "none" | "missing" | "present" | "error";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  /** Whether the signed-in user has a profiles row yet. */
  profileStatus: ProfileStatus;
  /** True until the initial session check resolves — gate nav on this. */
  loading: boolean;
  /** Re-check profile existence (call after creating a profile). */
  refreshProfileStatus: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchProfileStatus(userId: string): Promise<ProfileStatus> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    // Network/RLS error — treat as "error" (distinct from "none"/signed-out)
    // so gating doesn't bounce a signed-in user to setup-username on a
    // transient failure.
    return "error";
  }
  return data ? "present" : "missing";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>("none");
  const [loading, setLoading] = useState(true);

  // Monotonic guard: getSession() and onAuthStateChange can both run
  // syncProfile concurrently. Each call claims a sequence number; a fetch
  // only commits its result if it's still the latest, so a stale in-flight
  // fetch can't clobber newer state.
  const syncSeq = useRef(0);

  async function syncProfile(nextSession: Session | null) {
    const seq = ++syncSeq.current;
    if (!nextSession?.user) {
      setProfileStatus("none");
      return;
    }
    const status = await fetchProfileStatus(nextSession.user.id);
    if (seq === syncSeq.current) setProfileStatus(status);
  }

  useEffect(() => {
    let active = true;

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!active) return;
        setSession(data.session);
        await syncProfile(data.session);
      })
      .catch(() => {
        // getSession reading from storage shouldn't reject, but if it does
        // we must not leave the app stuck on the splash — fall through to
        // gating (which will treat the absent session as signed-out).
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange(
      async (_event, nextSession) => {
        if (!active) return;
        setSession(nextSession);
        await syncProfile(nextSession);
      }
    );

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profileStatus,
      loading,
      refreshProfileStatus: () => syncProfile(session),
    }),
    [session, profileStatus, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
