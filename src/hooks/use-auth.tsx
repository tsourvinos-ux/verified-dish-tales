import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [memberships, setMemberships] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // @complexity-explanation: subscribe BEFORE getSession to avoid missing the initial INITIAL_SESSION event
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        // defer so RLS-bound reads see the new JWT
        setTimeout(() => loadProfile(s.user.id), 0);
      } else {
        setRoles([]);
        setMemberships([]);
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
    return () => sub.subscription.unsubscribe();
  }, []);

  async function loadProfile(userId: string) {
    const [r, m] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("business_profile_membership").select("business_id").eq("user_id", userId),
    ]);
    setRoles((r.data ?? []).map((x) => x.role as AppRole));
    setMemberships((m.data ?? []).map((x) => x.business_id));
  }

  const value: AuthState = {
    session,
    user: session?.user ?? null,
    roles,
    memberships,
    loading,
    signOut: async () => {
      await supabase.auth.signOut();
    },
    refresh: async () => {
      if (session?.user) await loadProfile(session.user.id);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}