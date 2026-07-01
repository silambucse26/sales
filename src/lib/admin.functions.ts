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

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("name,phone")
      .eq("id", context.userId)
      .maybeSingle();

    let userPhone = (profile?.phone ?? "").replace(/\D/g, "");
    let userName = profile?.name ?? "Admin";
    if (!userPhone) {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(context.userId);
      const metadata = authUser.user?.user_metadata as { name?: string; phone?: string } | null;
      userPhone =
        (metadata?.phone ?? authUser.user?.email?.match(/^p?(\d+)@/)?.[1] ?? "").replace(/\D/g, "");
      userName = metadata?.name ?? userName;
    }

    if (userPhone !== adminPhone) return { promoted: false };

    await supabaseAdmin
      .from("profiles")
      .upsert({ id: context.userId, name: userName, phone: userPhone });
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

/** Business Head can remove a sales user and all app data owned by that user. */
export const deleteSalesMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      userId: z.string().uuid(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertBusinessHead(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("You cannot delete your own admin account.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("name,phone")
      .eq("id", data.userId)
      .maybeSingle();
    const memberName = profile?.name?.trim() ?? "";

    const commitmentQuery = supabaseAdmin
      .from("commitments")
      .select("id")
      .or(
        [
          `user_id.eq.${data.userId}`,
          `assigned_to.eq.${data.userId}`,
          ...(memberName ? [`salesperson.eq.${memberName}`] : []),
        ].join(","),
      );
    const { data: commitmentRows, error: commitmentReadError } = await commitmentQuery;
    if (commitmentReadError) throw new Error(commitmentReadError.message);
    const commitmentIds = (commitmentRows ?? []).map((row) => row.id);

    await supabaseAdmin.from("notifications").delete().eq("user_id", data.userId);
    if (commitmentIds.length) {
      await supabaseAdmin.from("notifications").delete().in("commitment_id", commitmentIds);
      const { error } = await supabaseAdmin.from("commitments").delete().in("id", commitmentIds);
      if (error) throw new Error(error.message);
    }

    const { data: intakeRows, error: intakeReadError } = await supabaseAdmin
      .from("intakes")
      .select("id,user_id,extracted");
    if (intakeReadError) throw new Error(intakeReadError.message);
    const intakeIds = (intakeRows ?? [])
      .filter((row) => {
        const ext = (row.extracted ?? {}) as { salesperson?: string | null };
        return row.user_id === data.userId || (!!memberName && ext.salesperson?.trim() === memberName);
      })
      .map((row) => row.id);
    if (intakeIds.length) {
      const { error } = await supabaseAdmin.from("intakes").delete().in("id", intakeIds);
      if (error) throw new Error(error.message);
    }

    await supabaseAdmin
      .from("sales_team_messages")
      .delete()
      .or(`member_id.eq.${data.userId},sender_id.eq.${data.userId}`);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("profiles").delete().eq("id", data.userId);
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (authError) throw new Error(authError.message);

    return {
      ok: true,
      deletedCommitments: commitmentIds.length,
      deletedIntakes: intakeIds.length,
    };
  });

/** Business Head can remove filled/imported data for a salesperson name that has no login profile. */
export const deleteDataOnlySalesperson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      name: z.string().min(1),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertBusinessHead(context.supabase, context.userId);

    const name = data.name.trim();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profileRows, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("name", name);
    if (profileError) throw new Error(profileError.message);
    if ((profileRows ?? []).length > 0) {
      throw new Error("This salesperson has a login profile. Use Delete member data instead.");
    }

    const { data: commitmentRows, error: commitmentReadError } = await supabaseAdmin
      .from("commitments")
      .select("id")
      .ilike("salesperson", name);
    if (commitmentReadError) throw new Error(commitmentReadError.message);
    const commitmentIds = (commitmentRows ?? []).map((row) => row.id);
    if (commitmentIds.length) {
      await supabaseAdmin.from("notifications").delete().in("commitment_id", commitmentIds);
      const { error } = await supabaseAdmin.from("commitments").delete().in("id", commitmentIds);
      if (error) throw new Error(error.message);
    }

    const { data: intakeRows, error: intakeReadError } = await supabaseAdmin
      .from("intakes")
      .select("id,extracted");
    if (intakeReadError) throw new Error(intakeReadError.message);
    const intakeIds = (intakeRows ?? [])
      .filter((row) => {
        const ext = (row.extracted ?? {}) as { salesperson?: string | null };
        return ext.salesperson?.trim().toLowerCase() === name.toLowerCase();
      })
      .map((row) => row.id);
    if (intakeIds.length) {
      const { error } = await supabaseAdmin.from("intakes").delete().in("id", intakeIds);
      if (error) throw new Error(error.message);
    }

    return {
      ok: true,
      deletedCommitments: commitmentIds.length,
      deletedIntakes: intakeIds.length,
    };
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
