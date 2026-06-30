import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

async function assertBusinessHead(supabase: SupabaseClient<Database>, userId: string) {
  const { data: myRole } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (myRole?.role !== "business_head") throw new Error("Only Business Head can manage users.");
}

/** Called on every login for sales_member users. If their phone matches ADMIN_PHONE env var,
 *  they are promoted to business_head automatically. */
export const ensureAdminRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const adminPhone = (process.env.ADMIN_PHONE ?? "").replace(/\D/g, "");
    if (!adminPhone) return { promoted: false };

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("phone")
      .eq("id", context.userId)
      .maybeSingle();

    if (!profile) return { promoted: false };
    const userPhone = (profile.phone ?? "").replace(/\D/g, "");
    if (userPhone !== adminPhone) return { promoted: false };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", context.userId);
    await supabaseAdmin.from("user_roles").insert({ user_id: context.userId, role: "business_head" });

    return { promoted: true };
  });

/** Business Head can change any user's role to business_head / sales_head / sales_member. */
export const changeUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      userId: z.string().uuid(),
      role: z.enum(["business_head", "sales_head", "sales_member"]),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertBusinessHead(context.supabase, context.userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("user_roles").insert({ user_id: data.userId, role: data.role });
    return { ok: true };
  });

/** Business Head-only login directory. Passwords cannot be read back from Supabase;
 *  only the env-configured admin password is returned for the matching admin phone. */
export const listLoginUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertBusinessHead(context.supabase, context.userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: profiles }, { data: roles }, { data: authUsers, error }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id,name,phone"),
      supabaseAdmin.from("user_roles").select("user_id,role"),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    if (error) throw error;

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const roleMap = new Map((roles ?? []).map((r) => [r.user_id, r.role]));
    const adminPhone = (process.env.ADMIN_PHONE ?? "").replace(/\D/g, "");
    const adminPassword = process.env.ADMIN_PASSWORD ?? "";

    return (authUsers.users ?? []).map((u) => {
      const profile = profileMap.get(u.id);
      const metadata = u.user_metadata as { name?: string; phone?: string } | null;
      const emailPhone = u.email?.match(/^p(\d+)@chimertech\.app$/)?.[1] ?? "";
      const phone = profile?.phone ?? metadata?.phone ?? emailPhone;
      const normalizedPhone = (phone ?? "").replace(/\D/g, "");

      return {
        id: u.id,
        name: profile?.name ?? metadata?.name ?? "User",
        phone,
        email: u.email ?? "",
        role: roleMap.get(u.id) ?? null,
        createdAt: u.created_at ?? null,
        lastSignInAt: u.last_sign_in_at ?? null,
        adminPassword: adminPhone && normalizedPhone === adminPhone ? adminPassword : "",
      };
    });
  });
