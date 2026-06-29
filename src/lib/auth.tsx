import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "customer";

type AuthCtx = {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  loading: boolean;            // session resolving
  roleLoading: boolean;        // role lookup in flight
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({
  session: null, user: null, role: null, loading: true, roleLoading: true, signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadRole = async (uid: string | undefined) => {
      if (!uid) { setRole(null); setRoleLoading(false); return; }
      setRoleLoading(true);
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      if (!mounted) return;
      const roles = (data ?? []).map((r: any) => r.role as AppRole);
      setRole(roles.includes("admin") ? "admin" : roles.includes("customer") ? "customer" : null);
      setRoleLoading(false);
    };

    // Subscribe FIRST so we don't miss events
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      if (!s?.user) { setRole(null); setRoleLoading(false); return; }
      setRoleLoading(true);
      // defer to avoid deadlock with supabase auth
      setTimeout(() => { loadRole(s.user.id); }, 0);
    });

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        await loadRole(data.session.user.id);
      } else {
        setRole(null);
        setRoleLoading(false);
      }
      setLoading(false);
    });

    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  const signOut = async () => { await supabase.auth.signOut(); };

  return (
    <Ctx.Provider value={{ session, user: session?.user ?? null, role, loading, roleLoading, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
