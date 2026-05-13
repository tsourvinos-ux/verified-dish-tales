import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "restaurateur" | "patron";

interface AuthState {
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  memberships: string[]; // business_ids
  loading: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

// @complexity-explanation: Module-level cache survives provider remounts (HMR,
// route swaps) so we don't refire the two role/membership queries each time.
// 5-minute TTL bounds staleness; sign-out clears via setTimeout-free path below.
type ProfileCacheEntry = {
  roles: AppRole[];
  memberships: string[];
  fetchedAt: number;
};
const PROFILE_CACHE = new Map<string, ProfileCacheEntry>();
const PROFILE_TTL_MS = 5 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [memberships, setMemberships] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const manualSignOutRef = useRef(false);

  const loadProfile = useCallback(async (userId: string) => {
    const cached = PROFILE_CACHE.get(userId);
    if (cached && Date.now() - cached.fetchedAt < PROFILE_TTL_MS) {
      setRoles(cached.roles);
      setMemberships(cached.memberships);
      return;
    }
    const [r, m] = await Promise.allSettled([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("business_profile_membership").select("business_id").eq("user_id", userId),
    ]);
    let nextRoles = cached?.roles ?? [];
    let nextMemberships = cached?.memberships ?? [];
    if (r.status === "fulfilled" && !r.value.error) {
      nextRoles = (r.value.data ?? []).map((x) => x.role as AppRole);
    } else if (r.status === "rejected") {
      console.error("[auth] failed to load roles", r.reason);
    } else if (r.status === "fulfilled" && r.value.error) {
      console.error("[auth] roles query error", r.value.error);
    }
    if (m.status === "fulfilled" && !m.value.error) {
      nextMemberships = (m.value.data ?? []).map((x) => x.business_id);
    } else if (m.status === "rejected") {
      console.error("[auth] failed to load memberships", m.reason);
    } else if (m.status === "fulfilled" && m.value.error) {
      console.error("[auth] memberships query error", m.value.error);
    }
    setRoles(nextRoles);
    setMemberships(nextMemberships);
    PROFILE_CACHE.set(userId, {
      roles: nextRoles,
      memberships: nextMemberships,
      fetchedAt: Date.now(),
    });
  }, []);

  // @complexity-explanation: subscribe BEFORE getSession to avoid missing the initial INITIAL_SESSION event.
  // queueMicrotask defers past the auth callback (so RLS sees the new JWT) without
  // a 16ms macrotask delay from setTimeout(..., 0).
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (s?.user) {
        queueMicrotask(() => {
          void loadProfile(s.user.id);
        });
      } else {
        setRoles([]);
        setMemberships([]);
      }
      // @business-logic: surface a permanent refresh failure as a sign-out toast.
      // supabase-js auto-refreshes; we only toast when the refresh fails AND the
      // user gets bumped to anonymous (event === "SIGNED_OUT" with no manual call).
      if (event === "SIGNED_OUT" && manualSignOutRef.current) {
        manualSignOutRef.current = false;
      } else if (event === "SIGNED_OUT") {
        // Defer toast import to avoid SSR boundary noise
        void import("sonner").then(({ toast }) =>
          toast.error("Your session expired. Please sign in again."),
        );
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        loadProfile(data.session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // @complexity-explanation: PWA / installed apps stay open across days. When the
    // tab regains focus we proactively refresh if the access token has < 60s left,
    // so the next API call doesn't 401 mid-flight.
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      void supabase.auth.getSession().then(({ data }) => {
        const exp = data.session?.expires_at;
        if (!exp) return;
        const secondsLeft = exp - Math.floor(Date.now() / 1000);
        if (secondsLeft < 60) {
          void supabase.auth.refreshSession();
        }
      });
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      sub.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadProfile]);

  const value: AuthState = {
    session,
    user: session?.user ?? null,
    roles,
    memberships,
    loading,
    signOut: async () => {
      const uid = session?.user?.id;
      if (uid) PROFILE_CACHE.delete(uid);
      manualSignOutRef.current = true;
      await supabase.auth.signOut();
    },
    refresh: async () => {
      if (session?.user) {
        PROFILE_CACHE.delete(session.user.id);
        await loadProfile(session.user.id);
      }
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}