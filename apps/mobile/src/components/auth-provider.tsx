/**
 * Auth context: the single source of truth for "who is signed in" on
 * mobile. Subscribes to Supabase auth-state changes and tracks whether
 * the signed-in user has completed profile setup (picked a username).
 *
 * Sits INSIDE QueryClientProvider (it uses the query client to look up
 * profile existence) and OUTSIDE the navigation tree (the root layout
 * reads this to gate routes).
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type ProfileStatus = "unknown" | "missing" | "present";

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
    // Network/RLS error — treat as unknown so we don't bounce the user
    // to setup-username on a transient failure.
    return "unknown";
  }
  return data ? "present" : "missing";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>("unknown");
  const [loading, setLoading] = useState(true);

  async function syncProfile(nextSession: Session | null) {
    if (!nextSession?.user) {
      setProfileStatus("unknown");
      return;
    }
    setProfileStatus(await fetchProfileStatus(nextSession.user.id));
  }

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await syncProfile(data.session);
      setLoading(false);
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
