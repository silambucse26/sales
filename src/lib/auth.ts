import { supabase } from "@/integrations/supabase/client";


export type AppRole = "business_head" | "sales_head" | "sales_member";

export const ROLE_LABELS: Record<AppRole, string> = {
  business_head: "Business Head",
  sales_head: "Sales Head",
  sales_member: "Sales Member",
};

export function phoneToEmail(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return `p${digits}@chimertech.app`;
}

// Build a short rep code from name + phone, e.g. "Silambu" + 9000000003 -> "Sil003"
export function salesCode(name: string | null | undefined, phone?: string | null): string {
  const letters = (name ?? "User").replace(/[^A-Za-z]/g, "").slice(0, 3).padEnd(3, "X");
  const initial = letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase();
  const digits = (phone ?? "").replace(/\D/g, "");
  const suffix = (digits.slice(-3) || "001").padStart(3, "0");
  return `${initial}${suffix}`;
}

// Build a 3-letter intake prefix from the user's name, e.g. "Silambu" -> "SIL"
export function intakePrefix(name: string | null | undefined): string {
  const letters = (name ?? "User").replace(/[^A-Za-z]/g, "").slice(0, 3).padEnd(3, "X").toUpperCase();
  return letters;
}


export async function signUpWithPhone(name: string, phone: string, password: string) {
  const email = phoneToEmail(phone);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, phone } },
  });
  return { data, error };
}

export async function signInWithPhone(phone: string, password: string) {
  const email = phoneToEmail(phone);
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function fetchMyRole(userId: string): Promise<AppRole | null> {
  try {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .order("role", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[Auth] Failed to load user role", error);
      return null;
    }

    return (data?.role as AppRole) ?? null;
  } catch (error) {
    console.error("[Auth] Failed to load user role", error);
    return null;
  }
}
