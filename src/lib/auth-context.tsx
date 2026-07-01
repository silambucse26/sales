import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyRole, type AppRole } from "@/lib/auth";

type AuthCtx = {
  user: User | null;
  role: AppRole | null;
  name: string | null;
  phone: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({ user: null, role: null, name: null, phone: null, loading: true, refresh: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function hydrate(u: User | null) {
    setUser(u);
    if (!u) { setRole(null); setName(null); setPhone(null); return; }
    const [roleResult, profileResult] = await Promise.allSettled([
      fetchMyRole(u.id),
      supabase.from("profiles").select("name,phone").eq("id", u.id).maybeSingle(),
    ]);

    setRole(roleResult.status === "fulfilled" ? roleResult.value : null);

    if (roleResult.status === "rejected") {
      console.error("[Auth] Failed to hydrate user role", roleResult.reason);
    }

    if (profileResult.status === "fulfilled") {
      const { data, error } = profileResult.value;
      if (error) {
        console.error("[Auth] Failed to load user profile", error);
      }
      setName(data?.name ?? null);
      setPhone(data?.phone ?? null);
    } else {
      console.error("[Auth] Failed to hydrate user profile", profileResult.reason);
      setName(null);
      setPhone(null);
    }
  }

  useEffect(() => {
    const sub = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED" || event === "INITIAL_SESSION") {
        hydrate(session?.user ?? null).finally(() => setLoading(false));
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      hydrate(data.session?.user ?? null).finally(() => setLoading(false));
    });
    return () => { sub.data.subscription.unsubscribe(); };
  }, []);

  const refresh = async () => { await hydrate(user); };
  return <Ctx.Provider value={{ user, role, name, phone, loading, refresh }}>{children}</Ctx.Provider>;
}

export function useAuth() { return useContext(Ctx); }
