import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

function normalizeCurrencyText(value: string | null | undefined) {
  return value?.replace(/\$/g, "₹") ?? value ?? null;
}

function normalizeCurrencyArray(values: string[] | undefined) {
  return values?.map((value) => value.replace(/\$/g, "₹")) ?? [];
}

export const askAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ question: z.string().min(2).max(2000) }).parse(input))
  .handler(async ({ data, context }) => {
    // Gather business context the caller is allowed to see (RLS-scoped)
    const [{ data: commitments }, { data: intakes }, { data: profiles }] = await Promise.all([
      context.supabase.from("commitments").select("title,customer,salesperson,product,expected_revenue,promise_date,status,risk_level,missed_reason,created_at").order("created_at", { ascending: false }).limit(300),
      context.supabase.from("intakes").select("source,raw_text,extracted,created_at,user_id").order("created_at", { ascending: false }).limit(150),
      context.supabase.from("profiles").select("id,name,phone"),
    ]);

    const today = new Date().toISOString().slice(0, 10);

    const compact = {
      today,
      commitments: (commitments ?? []).slice(0, 200),
      recent_intakes: (intakes ?? []).slice(0, 80).map((i) => ({
        source: i.source,
        when: i.created_at,
        extracted: i.extracted,
        snippet: typeof i.raw_text === "string" ? i.raw_text.slice(0, 400) : null,
      })),
      team: profiles ?? [],
    };

    const { generateText } = await import("ai");
    const { createGeminiProvider, GEMINI_TEXT_MODEL } = await import("@/lib/ai-gateway.server");
    const gateway = createGeminiProvider();

    const system = `You are the Chimertech Sales Intelligence assistant. You answer questions about sales execution using ONLY the JSON dataset provided. Do not invent customers, salespeople, or numbers. If the dataset does not contain the answer, say so plainly. All money is Indian Rupees. Use INR or ₹ only; never use $ or dollars.

Return ONLY JSON in this exact shape (no markdown, no commentary):
{
  "answer": string,                          // crisp 2-4 sentence direct answer
  "evidence": string[],                      // bullet-style facts from the data (max 6)
  "risk": string|null,                       // commercial risk if any
  "action_required": string|null,            // what must happen
  "responsible": string|null,                // salesperson name
  "follow_up_date": string|null              // YYYY-MM-DD recommended follow-up
}`;

    const prompt = `Dataset (JSON):\n${JSON.stringify(compact)}\n\nQuestion: ${data.question}`;

    const { text } = await generateText({
      model: gateway.chatModel(GEMINI_TEXT_MODEL),
      system,
      prompt,
    });
    const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");
    try {
      const parsed = JSON.parse(cleaned) as {
        answer: string; evidence?: string[]; risk?: string | null;
        action_required?: string | null; responsible?: string | null; follow_up_date?: string | null;
      };
      return {
        ...parsed,
        answer: normalizeCurrencyText(parsed.answer) ?? "",
        evidence: normalizeCurrencyArray(parsed.evidence),
        risk: normalizeCurrencyText(parsed.risk),
        action_required: normalizeCurrencyText(parsed.action_required),
      };
    } catch {
      return { answer: cleaned.replace(/\$/g, "₹"), evidence: [], risk: null, action_required: null, responsible: null, follow_up_date: null };
    }
  });
