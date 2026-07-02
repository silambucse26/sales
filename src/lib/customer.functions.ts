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

function isManualFinancialAdjustment(row: { title: string; remarks: string | null }) {
  const title = row.title.trim().toLowerCase();
  return row.remarks === "Manual customer edit" && (title.startsWith("pipeline adjustment -") || title.startsWith("revenue adjustment -"));
}

async function applyRevenueDelta(
  ctx: AppContext,
  rows: Array<{ id: string; expected_revenue: number | null }>,
  delta: number,
) {
  if (delta === 0 || rows.length === 0) return;
  if (delta > 0) {
    const row = rows.find((r) => Number(r.expected_revenue ?? 0) > 0) ?? rows[0];
    const next = Math.round(Number(row.expected_revenue ?? 0) + delta);
    const { error } = await ctx.supabase.from("commitments").update({ expected_revenue: next }).eq("id", row.id);
    if (error) throw new Error(error.message);
    return;
  }

  let remainingDecrease = Math.abs(delta);
  for (const row of rows) {
    const current = Math.round(Number(row.expected_revenue ?? 0));
    const decrease = Math.min(Math.max(current, 0), remainingDecrease);
    const next = current - decrease;
    const { error } = await ctx.supabase.from("commitments").update({ expected_revenue: next }).eq("id", row.id);
    if (error) throw new Error(error.message);
    remainingDecrease -= decrease;
    if (remainingDecrease <= 0) return;
  }

  const row = rows[0];
  const next = Math.round(Number(row.expected_revenue ?? 0) - remainingDecrease);
  const { error } = await ctx.supabase.from("commitments").update({ expected_revenue: next }).eq("id", row.id);
  if (error) throw new Error(error.message);
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

export const updateIntakeCustomerName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), customer: z.string().trim().min(1).max(160) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as AppContext;
    const role = await myRole(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: intake, error: readErr } = await supabaseAdmin
      .from("intakes")
      .select("id,user_id,extracted")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!intake) throw new Error("Intake not found.");
    if (role !== "business_head" && intake.user_id !== ctx.userId) {
      throw new Error("You can edit only your own uploaded intakes.");
    }

    const extracted =
      intake.extracted && typeof intake.extracted === "object" && !Array.isArray(intake.extracted)
        ? { ...(intake.extracted as Record<string, unknown>) }
        : {};
    extracted.customer = data.customer;

    const { error: intakeErr } = await supabaseAdmin
      .from("intakes")
      .update({ extracted: extracted as never })
      .eq("id", data.id);
    if (intakeErr) throw new Error(intakeErr.message);

    const { error: commitmentErr } = await supabaseAdmin
      .from("commitments")
      .update({ customer: data.customer })
      .eq("intake_id", data.id);
    if (commitmentErr) throw new Error(commitmentErr.message);

    return { ok: true, customer: data.customer };
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
      .select("id,user_id,assigned_to,status,promise_date,expected_revenue,salesperson,product,title,remarks")
      .eq("customer", customer)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const { data: intakeRows, error: intakeErr } = await ctx.supabase
      .from("intakes")
      .select("id,extracted");
    if (intakeErr) throw new Error(intakeErr.message);
    const matchingIntakes = (intakeRows ?? []).filter((row) => {
      const ext = (row.extracted ?? {}) as { customer?: string | null };
      return ext.customer?.trim().toLowerCase() === customer.toLowerCase();
    });
    if (!rows?.length && role !== "business_head" && matchingIntakes.length === 0) {
      throw new Error("You can edit only customers assigned to you.");
    }
    const regularRows = (rows ?? []).filter((row) => !isManualFinancialAdjustment(row));
    const adjustmentRows = (rows ?? []).filter(isManualFinancialAdjustment);
    const existingSalesperson =
      regularRows.map((row) => row.salesperson?.trim()).find(Boolean) ??
      matchingIntakes.map((row) => ((row.extracted ?? {}) as { salesperson?: string | null }).salesperson?.trim()).find(Boolean) ??
      data.salesperson?.trim() ??
      null;
    const existingProduct =
      regularRows.map((row) => row.product?.trim()).find(Boolean) ??
      matchingIntakes.map((row) => ((row.extracted ?? {}) as { product?: string | null }).product?.trim()).find(Boolean) ??
      null;
    const existingAssignee = regularRows.map((row) => row.assigned_to).find(Boolean) ?? data.assigned_to ?? ctx.userId;

    const current = regularRows.reduce(
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
    const pipelineRows = regularRows.filter((row) => row.status !== "completed" && statusFor(row) !== "missed");
    const wonRows = regularRows.filter((row) => row.status === "completed");

    await applyRevenueDelta(ctx, pipelineRows, pipelineDelta);
    await applyRevenueDelta(ctx, wonRows, wonDelta);

    const inserts = [];
    if (pipelineRows.length === 0 && data.pipeline > 0) {
      inserts.push({
        user_id: ctx.userId,
        title: `Pipeline update - ${customer}`,
        customer,
        product: existingProduct,
        salesperson: existingSalesperson,
        expected_revenue: Math.round(data.pipeline),
        status: "open" as const,
        remarks: "Manual customer edit",
        assigned_to: existingAssignee,
      });
    }
    if (wonRows.length === 0 && data.won > 0) {
      inserts.push({
        user_id: ctx.userId,
        title: `Revenue won from ${customer}`,
        customer,
        product: existingProduct,
        salesperson: existingSalesperson,
        expected_revenue: Math.round(data.won),
        status: "completed" as const,
        remarks: "Manual customer edit",
        assigned_to: existingAssignee,
      });
    }
    if (inserts.length) {
      const { error: insertErr } = await ctx.supabase.from("commitments").insert(inserts);
      if (insertErr) throw new Error(insertErr.message);
    }
    const adjustmentIds = adjustmentRows.map((row) => row.id);
    if (adjustmentIds.length) {
      const { error: deleteErr } = await ctx.supabase.from("commitments").delete().in("id", adjustmentIds);
      if (deleteErr) throw new Error(deleteErr.message);
    }
    return { ok: true, pipelineDelta, wonDelta };
  });
