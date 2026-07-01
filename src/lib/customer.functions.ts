import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

type AppContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

async function myRole(context: AppContext) {
  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .maybeSingle();
  return data?.role ?? null;
}

async function assertBusinessHead(context: AppContext) {
  if ((await myRole(context)) !== "business_head") {
    throw new Error("Only Business Head can delete this data.");
  }
}

function statusFor(row: { status: string; promise_date: string | null }) {
  const today = new Date().toISOString().slice(0, 10);
  return row.status === "open" && row.promise_date && row.promise_date < today ? "missed" : row.status;
}

export const deleteIntake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as AppContext;
    const role = await myRole(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: intake, error: readErr } = await supabaseAdmin
      .from("intakes")
      .select("id,user_id")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!intake) throw new Error("Intake not found.");
    if (role !== "business_head" && intake.user_id !== ctx.userId) {
      throw new Error("You can delete only your own uploaded intakes.");
    }
    const { error: commitmentErr } = await supabaseAdmin
      .from("commitments")
      .delete()
      .eq("intake_id", data.id);
    if (commitmentErr) throw new Error(commitmentErr.message);
    const { error } = await supabaseAdmin.from("intakes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ customer: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as AppContext;
    await assertBusinessHead(ctx);
    const customer = data.customer.trim();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: intakeRows, error: intakeReadErr } = await supabaseAdmin
      .from("intakes")
      .select("id,extracted");
    if (intakeReadErr) throw new Error(intakeReadErr.message);
    const intakeIds = (intakeRows ?? [])
      .filter((row) => {
        const ext = (row.extracted ?? {}) as { customer?: string | null };
        return ext.customer?.trim().toLowerCase() === customer.toLowerCase();
      })
      .map((row) => row.id);

    const { error: commitmentErr } = await supabaseAdmin
      .from("commitments")
      .delete()
      .ilike("customer", customer);
    if (commitmentErr) throw new Error(commitmentErr.message);

    if (intakeIds.length) {
      const { error: intakeErr } = await supabaseAdmin.from("intakes").delete().in("id", intakeIds);
      if (intakeErr) throw new Error(intakeErr.message);
    }

    return { ok: true, deletedIntakes: intakeIds.length };
  });

export const setCustomerFinancials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        customer: z.string().min(1),
        pipeline: z.number().min(0),
        won: z.number().min(0),
        assigned_to: z.string().uuid().optional(),
        salesperson: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as AppContext;
    const role = await myRole(ctx);
    const customer = data.customer.trim();
    const { data: rows, error } = await ctx.supabase
      .from("commitments")
      .select("id,user_id,assigned_to,status,promise_date,expected_revenue")
      .eq("customer", customer);
    if (error) throw new Error(error.message);
    if (!rows?.length && role !== "business_head") {
      const { data: intakeRows, error: intakeErr } = await ctx.supabase
        .from("intakes")
        .select("id,extracted");
      if (intakeErr) throw new Error(intakeErr.message);
      const hasOwnIntake = (intakeRows ?? []).some((row) => {
        const ext = (row.extracted ?? {}) as { customer?: string | null };
        return ext.customer?.trim().toLowerCase() === customer.toLowerCase();
      });
      if (!hasOwnIntake) {
        throw new Error("You can edit only customers assigned to you.");
      }
    }

    const current = (rows ?? []).reduce(
      (acc, row) => {
        const amount = Number(row.expected_revenue ?? 0);
        if (row.status === "completed") acc.won += amount;
        else if (statusFor(row) !== "missed") acc.pipeline += amount;
        return acc;
      },
      { pipeline: 0, won: 0 },
    );
    const pipelineDelta = Math.round(data.pipeline - current.pipeline);
    const wonDelta = Math.round(data.won - current.won);
    const inserts = [];
    if (pipelineDelta !== 0) {
      inserts.push({
        user_id: ctx.userId,
        title: `Pipeline adjustment - ${customer}`,
        customer,
        salesperson: data.salesperson?.trim() || null,
        expected_revenue: pipelineDelta,
        status: "open" as const,
        remarks: "Manual customer edit",
        assigned_to: data.assigned_to ?? ctx.userId,
      });
    }
    if (wonDelta !== 0) {
      inserts.push({
        user_id: ctx.userId,
        title: `Revenue adjustment - ${customer}`,
        customer,
        salesperson: data.salesperson?.trim() || null,
        expected_revenue: wonDelta,
        status: "completed" as const,
        remarks: "Manual customer edit",
        assigned_to: data.assigned_to ?? ctx.userId,
      });
    }
    if (inserts.length) {
      const { error: insertErr } = await ctx.supabase.from("commitments").insert(inserts);
      if (insertErr) throw new Error(insertErr.message);
    }
    return { ok: true, pipelineDelta, wonDelta };
  });
