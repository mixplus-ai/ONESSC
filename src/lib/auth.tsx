import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "./supabase";
import type { Profile } from "./types";

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  perms: Set<string>;
  loading: boolean;
  isAdmin: boolean;
  isStaff: boolean; // staff or admin
  can: (perm: string) => boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(supabaseConfigured);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      setPerms(new Set());
      return;
    }
    const [{ data: p }, { data: sp }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", s.user.id).maybeSingle(),
      supabase.from("staff_permissions").select("perm").eq("user_id", s.user.id),
    ]);
    setProfile((p as Profile) ?? null);
    setPerms(new Set((sp ?? []).map((r: { perm: string }) => r.perm)));
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      // defer DB calls out of the auth callback (supabase-js recommendation)
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        setTimeout(() => loadProfile(s), 0);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const value = useMemo<AuthState>(() => {
    const active = profile?.is_active ?? false;
    const isAdmin = active && profile?.role === "admin";
    const isStaff = active && (profile?.role === "admin" || profile?.role === "staff");
    return {
      session,
      profile,
      perms,
      loading,
      isAdmin,
      isStaff,
      can: (perm) => isAdmin || (isStaff && perms.has(perm)),
      refresh: () => loadProfile(session),
      signOut: async () => {
        await supabase.auth.signOut();
        setProfile(null);
        setPerms(new Set());
      },
    };
  }, [session, profile, perms, loading, loadProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
