import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { coerceMoneyToINR, parseMoneyToINR } from "@/lib/money";
import { z } from "zod";

const ExtractInput = z.object({
  text: z.string().min(1).max(20000),
  source: z.enum(["text", "voice", "file", "excel", "whatsapp"]).default("text"),
  fileName: z.string().optional(),
  salespersonName: z.string().optional(),
  intakePrefix: z.string().optional(),
});

function parseExpectedRevenueInput(value: unknown) {
  const money = parseMoneyToINR(value);
  if (money) return money;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  return value;
}

const ExtractedSchema = z.object({
  salesperson: z.string().nullable().optional(),
  intake_code: z.string().nullable().optional(),
  customer: z.string().nullable().optional(),
  product: z.string().nullable().optional(),
  quantity: z.number().nullable().optional(),
  expected_revenue: z.preprocess(parseExpectedRevenueInput, z.number().nullable().optional()),
  pipeline_stage: z.string().nullable().optional(),
  commitments: z
    .array(
      z.object({
        title: z.string(),
        promise_date: z.string().nullable().optional(),
        next_action: z.string().nullable().optional(),
        risk: z.string().nullable().optional(),
      })
    )
    .default([]),
  follow_up_date: z.string().nullable().optional(),
  competitor: z.string().nullable().optional(),
  sentiment: z.string().nullable().optional(),
  risk_level: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
});

function tryParseDate(input?: string | null): string | null {
  if (!input) return null;
  const s = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  // Handle words like "Friday", "next Monday" — push to next occurrence
  const days = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  const lower = s.toLowerCase();
  for (let i = 0; i < days.length; i++) {
    if (lower.includes(days[i])) {
      const today = new Date();
      const diff = (i - today.getDay() + 7) % 7 || 7;
      const target = new Date(today);
      target.setDate(today.getDate() + diff);
      return target.toISOString().slice(0, 10);
    }
  }
  if (lower.includes("tomorrow")) {
    const d2 = new Date(); d2.setDate(d2.getDate() + 1);
    return d2.toISOString().slice(0, 10);
  }
  return null;
}

export const extractAndSaveIntake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ExtractInput.parse(input))
  .handler(async ({ data, context }) => {
    const { generateText } = await import("ai");
    const { createGeminiProvider, GEMINI_TEXT_MODEL } = await import("@/lib/ai-gateway.server");
    const gateway = createGeminiProvider();

    const system = `You are an AI sales analyst for Chimertech. Extract structured sales information from unstructured sales notes (EOD reports, WhatsApp messages, meeting notes, voice transcripts).

Return ONLY valid JSON matching exactly this schema (no markdown, no commentary):
{
  "salesperson": string|null,
  "customer": string|null,
  "product": string|null,
  "quantity": number|null,
  "expected_revenue": number|null,
  "pipeline_stage": "Lead"|"Contacted"|"Qualified"|"Quoted"|"Negotiation"|"Won"|"Lost"|null,
  "commitments": [{"title": string, "promise_date": string|null, "next_action": string|null, "risk": "Low"|"Medium"|"High"|null}],
  "follow_up_date": string|null,
  "competitor": string|null,
  "sentiment": "Positive"|"Neutral"|"Negative"|null,
  "risk_level": "Low"|"Medium"|"High"|null,
  "summary": string
}

Rules:
- Dates: prefer ISO YYYY-MM-DD. Words like "Friday", "tomorrow", "next week" are allowed as-is.
- expected_revenue is in INR.
- A "commitment" is anything the customer or salesperson promised (PO release, payment, demo, sample).
- If a field is unknown, set it to null. Always include a short summary.`;

    let extracted: z.infer<typeof ExtractedSchema>;
    try {
      const { text } = await generateText({
        model: gateway.chatModel(GEMINI_TEXT_MODEL),
        system,
        prompt: data.text,
      });
      const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");
      const json = JSON.parse(cleaned);
      extracted = ExtractedSchema.parse(json);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`AI extraction failed: ${msg}`);
    }

    // Tag with the logged-in salesperson name and a sequential intake code
    const prefix = (data.intakePrefix ?? "USR").toUpperCase();
    const { count: intakeCount } = await context.supabase
      .from("intakes")
      .select("*", { count: "exact", head: true })
      .eq("user_id", context.userId);
    const nextNumber = (intakeCount ?? 0) + 1;
    const intakeCode = `${prefix}${String(nextNumber).padStart(3, "0")}`;
    extracted.salesperson = data.salespersonName?.trim() || extracted.salesperson || null;
    extracted.intake_code = intakeCode;
    extracted.expected_revenue = coerceMoneyToINR(extracted.expected_revenue, data.text) || null;

    const { data: intakeRow, error: intakeErr } = await context.supabase
      .from("intakes")
      .insert({
        user_id: context.userId,
        source: data.source,
        raw_text: data.text,
        file_name: data.fileName ?? null,
        extracted: extracted as never,
        status: "processed",
      })
      .select()
      .single();
    if (intakeErr) throw new Error(intakeErr.message);

    // Create commitments. If the note only contains revenue/pipeline without a
    // specific promise, create an open pipeline opportunity so dashboards count it.
    const commitments = extracted.commitments ?? [];
    const hasRevenue = Number(extracted.expected_revenue ?? 0) > 0;
    const rows = commitments.length > 0
      ? commitments.map((c) => ({
        user_id: context.userId,
        assigned_to: context.userId,
        intake_id: intakeRow.id,
        title: c.title,
        customer: extracted.customer ?? null,
        salesperson: extracted.salesperson ?? null,
        product: extracted.product ?? null,
        expected_revenue: extracted.expected_revenue ?? 0,
        promise_date: tryParseDate(c.promise_date ?? null),
        next_action: c.next_action ?? null,
        risk_level: c.risk ?? extracted.risk_level ?? null,
        status: "open" as const,
      }))
      : hasRevenue
        ? [{
            user_id: context.userId,
            assigned_to: context.userId,
            intake_id: intakeRow.id,
            title: extracted.customer ? `Pipeline opportunity - ${extracted.customer}` : "Pipeline opportunity from intake",
            customer: extracted.customer ?? null,
            salesperson: extracted.salesperson ?? null,
            product: extracted.product ?? null,
            expected_revenue: extracted.expected_revenue ?? 0,
            promise_date: tryParseDate(extracted.follow_up_date ?? null),
            next_action: extracted.summary ?? null,
            risk_level: extracted.risk_level ?? null,
            status: "open" as const,
          }]
        : [];
    if (rows.length > 0) {
      const { error: cErr } = await context.supabase.from("commitments").insert(rows);
      if (cErr) throw new Error(cErr.message);
    }

    return { intake: intakeRow, extracted, intakeCode };
  });

export const transcribeAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ audioBase64: z.string().min(1), mime: z.string().default("audio/wav") }).parse(input)
  )
  .handler(async ({ data }) => {
    const { GEMINI_TEXT_MODEL, getGeminiApiKey } = await import("@/lib/ai-gateway.server");
    const apiKey = getGeminiApiKey();

    const ext = ({
      "audio/mpeg": "mp3",
      "audio/mp3": "mp3",
      "audio/wav": "wav",
      "audio/wave": "wav",
      "audio/x-wav": "wav",
    } as Record<string, string>)[data.mime.split(";")[0]] ?? "webm";
    if (ext !== "wav" && ext !== "mp3") {
      throw new Error("Unsupported audio format. Please record again; voice notes are converted to WAV before transcription.");
    }

    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GEMINI_TEXT_MODEL,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Transcribe this audio exactly. Return only the spoken text, with no markdown or extra commentary.",
              },
              {
                type: "input_audio",
                input_audio: {
                  data: data.audioBase64,
                  format: ext,
                },
              },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Gemini transcription failed (${res.status}): ${t}`);
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return { text: json.choices?.[0]?.message?.content?.trim() ?? "" };
  });
