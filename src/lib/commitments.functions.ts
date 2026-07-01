import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const updateCommitmentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["open", "completed", "missed", "delayed"]),
      remarks: z.string().optional(),
      missed_reason: z.string().optional(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const patch: {
      status: "open" | "completed" | "missed" | "delayed";
      remarks?: string | null;
      missed_reason?: string | null;
      ai_note?: string | null;
    } = { status: data.status };
    if (data.remarks !== undefined) patch.remarks = data.remarks;
    if (data.missed_reason !== undefined) patch.missed_reason = data.missed_reason;

    if (data.status === "missed") {
      patch.ai_note = `Missed commitment. ${data.missed_reason ? `Reason: ${data.missed_reason}. ` : ""}Coach the rep on early escalation and realistic timelines.`;
    } else if (data.status === "completed") {
      patch.ai_note = `Commitment kept on time. Reinforce the closing pattern with the team.`;
    }


    const { error } = await context.supabase
      .from("commitments")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCommitment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { data: myRole, error: roleError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (roleError) throw new Error(roleError.message);
    if (myRole?.role !== "business_head") {
      throw new Error("Only Business Head can delete commitments.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("notifications").delete().eq("commitment_id", data.id);
    const { error } = await supabaseAdmin.from("commitments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createCommitment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      title: z.string().min(1),
      customer: z.string().optional(),
      product: z.string().optional(),
      salesperson: z.string().optional(),
      expected_revenue: z.number().default(0),
      promise_date: z.string().optional(),
      next_action: z.string().optional(),
      risk_level: z.string().optional(),
      remarks: z.string().optional(),
      assigned_to: z.string().uuid().optional(),
      status: z.enum(["open", "completed", "missed", "delayed"]).default("open"),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    let salesperson = data.salesperson ?? null;
    if (data.assigned_to) {
      const { data: assignee } = await context.supabase
        .from("profiles")
        .select("name,phone")
        .eq("id", data.assigned_to)
        .maybeSingle();
      salesperson = assignee?.name ?? salesperson;
    }

    const { data: row, error } = await context.supabase
      .from("commitments")
      .insert({
        user_id: context.userId,
        assigned_to: data.assigned_to ?? context.userId,
        title: data.title,
        customer: data.customer ?? null,
        product: data.product ?? null,
        salesperson,
        expected_revenue: data.expected_revenue,
        promise_date: data.promise_date ?? null,
        next_action: data.next_action ?? null,
        risk_level: data.risk_level ?? null,
        remarks: data.remarks ?? null,
        status: data.status,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    if (data.assigned_to && data.assigned_to !== context.userId) {
      await context.supabase.from("notifications").insert({
        user_id: data.assigned_to,
        commitment_id: row.id,
        kind: "assignment",
        title: "New commitment assigned",
        body: `${row.title}${row.promise_date ? ` due ${row.promise_date}` : ""}`,
      });
    }
    return row;
  });
