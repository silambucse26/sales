import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Mic, Square, Upload, Sparkles, Loader2, FileSpreadsheet, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { extractAndSaveIntake, transcribeAudio } from "@/lib/intake.functions";
import { supabase } from "@/integrations/supabase/client";
import { useIntakes, useCommitments, fmtINR } from "@/lib/sales-data";
import { coerceMoneyToINR } from "@/lib/money";
import { useAuth } from "@/lib/auth-context";
import { intakePrefix } from "@/lib/auth";
import { Link } from "@tanstack/react-router";
import { ArrowRight, MessageSquare, IdCard } from "lucide-react";

export const Route = createFileRoute("/_app/intake")({ component: IntakePage });

type Extracted = {
  intake_code?: string | null;
  salesperson?: string | null; customer?: string | null; product?: string | null;
  quantity?: number | null; expected_revenue?: number | null; pipeline_stage?: string | null;
  commitments?: Array<{ title: string; promise_date?: string | null; next_action?: string | null; risk?: string | null }>;
  follow_up_date?: string | null; competitor?: string | null; sentiment?: string | null;
  risk_level?: string | null; summary?: string | null;
};

function IntakePage() {
  const extract = useServerFn(extractAndSaveIntake);
  const transcribe = useServerFn(transcribeAudio);
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [preview, setPreview] = useState<Extracted | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const excelRef = useRef<HTMLInputElement | null>(null);
  const { data: recentIntakes = [] } = useIntakes();
  const { data: allCommitments = [] } = useCommitments();
  const { name } = useAuth();
  const myPrefix = intakePrefix(name);
  const nextIntakeNumber = recentIntakes.length + 1;
  const nextIntakeCode = `${myPrefix}${String(nextIntakeNumber).padStart(3, "0")}`;



  async function submit(source: "text" | "voice" | "file" = "text", fileName?: string) {
    if (!text.trim()) { toast.error("Enter some text or record a note first."); return; }
    setBusy(true);
    setPreview(null);
    try {
      const res = await extract({ data: { text, source, fileName, salespersonName: name ?? undefined, intakePrefix: myPrefix } });
      setPreview(res.extracted as Extracted);
      toast.success(`Intake ${res.intakeCode} tagged to ${name ?? "you"}`);
      setText("");
      qc.invalidateQueries({ queryKey: ["commitments"] });
      qc.invalidateQueries({ queryKey: ["intakes-count"] });
      qc.invalidateQueries({ queryKey: ["intakes"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "AI processing failed");
    } finally { setBusy(false); }
  }

  async function toggleRecord() {
    if (recording) {
      mediaRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: mime });
        if (blob.size < 1024) { toast.error("Recording was too short."); return; }
        const b64 = await blobToBase64(blob);
        setBusy(true);
        try {
          const r = await transcribe({ data: { audioBase64: b64, mime } });
          if (r.text) setText((prev) => (prev ? prev + "\n" : "") + r.text);
          toast.success("Voice transcribed");
        } catch (e: unknown) {
          toast.error(e instanceof Error ? e.message : "Transcription failed");
        } finally { setBusy(false); }
      };
      mediaRef.current = rec;
      rec.start();
      setRecording(true);
    } catch (e: unknown) {
      toast.error("Microphone permission denied.");
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/") && f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".txt")) {
      toast.error("Upload an image, PDF, or .txt file."); return;
    }
    if (f.size > 5 * 1024 * 1024) { toast.error("Max 5MB."); return; }
    if (f.type.startsWith("text/") || f.name.endsWith(".txt")) {
      const t = await f.text();
      setText((prev) => (prev ? prev + "\n" : "") + t);
      toast.success("File loaded as text");
      return;
    }
    // For images/PDFs, OCR is out of scope for v1 — upload only label
    setText((prev) => (prev ? prev + "\n" : "") + `[Attached ${f.name}] — please describe the contents in text.`);
    toast.info("Image/PDF attached. Add a short description so AI can extract.");
    e.target.value = "";
  }

  async function handleExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setBusy(true);
    try {
      const XLSX = await import("xlsx");
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf);
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
      if (rows.length === 0) { toast.error("Sheet is empty."); return; }
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user?.id;
      if (!userId) throw new Error("Not signed in");
      const intakeRows = rows.map((r) => ({
        user_id: userId,
        source: "excel" as const,
        raw_text: JSON.stringify(r),
        file_name: f.name,
        extracted: r as never,
        status: "imported",
      }));
      const { data: insertedIntakes, error: e1 } = await supabase.from("intakes").insert(intakeRows).select();
      if (e1) throw e1;
      const commitments = rows.flatMap((r, idx) => {
        const c = (k: string) => (r[k] ?? r[k.toLowerCase()] ?? r[k.toUpperCase()]) as string | number | undefined;
        const title = String(c("Commitment") ?? c("Next Action") ?? "").trim();
        const revenue = coerceMoneyToINR(c("Revenue") ?? c("Expected Revenue") ?? c("Amount"), JSON.stringify(r));
        const customer = String(c("Customer") ?? "").trim();
        if (!title && revenue <= 0) return [];
        return [{
          user_id: userId,
          assigned_to: userId,
          intake_id: insertedIntakes?.[idx]?.id ?? null,
          title: title || (customer ? `Pipeline opportunity - ${customer}` : "Pipeline opportunity from intake"),
          customer: customer || null,
          salesperson: String(c("Salesperson") ?? "") || null,
          product: String(c("Product") ?? "") || null,
          expected_revenue: revenue,
          promise_date: normalizeDate(c("Commitment Date") ?? c("Date")),
          next_action: String(c("Next Action") ?? "") || null,
          status: "open" as const,
        }];
      });
      if (commitments.length) {
        const { error: e2 } = await supabase.from("commitments").insert(commitments);
        if (e2) throw e2;
      }
      toast.success(`Imported ${rows.length} rows, created ${commitments.length} commitments.`);
      qc.invalidateQueries({ queryKey: ["commitments"] });
      qc.invalidateQueries({ queryKey: ["intakes-count"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Excel import failed");
    } finally { setBusy(false); e.target.value = ""; }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New intake</h1>
          <p className="text-sm text-muted-foreground">Paste EOD reports, WhatsApp chats, or speak. AI will structure it.</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-semibold">
          <IdCard className="h-3.5 w-3.5 text-primary" />
          <span className="text-muted-foreground">Signed in as</span>
          <span className="font-medium text-foreground">{name ?? "Salesperson"}</span>
          <span className="text-muted-foreground">· Next intake</span>
          <span className="font-mono text-primary">{nextIntakeCode}</span>
        </div>
      </div>

      <Card className="card-soft border-0 shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Unstructured input</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} placeholder={EXAMPLE} className="font-mono text-sm" />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={toggleRecord} variant={recording ? "destructive" : "outline"} disabled={busy}>
              {recording ? <><Square className="mr-1.5 h-4 w-4" /> Stop recording</> : <><Mic className="mr-1.5 h-4 w-4" /> Voice</>}
            </Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload className="mr-1.5 h-4 w-4" /> Attach file
            </Button>
            <input ref={fileRef} type="file" accept="image/*,application/pdf,.txt" hidden onChange={handleFile} />
            <Button variant="outline" onClick={() => excelRef.current?.click()} disabled={busy}>
              <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel import
            </Button>
            <input ref={excelRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={handleExcel} />
            <div className="flex-1" />
            <Button onClick={() => submit("text")} disabled={busy || !text.trim()}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />} Extract with AI
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
            <Badge variant="secondary">Salesperson</Badge>
            <Badge variant="secondary">Customer</Badge>
            <Badge variant="secondary">Product</Badge>
            <Badge variant="secondary">Quantity</Badge>
            <Badge variant="secondary">Revenue</Badge>
            <Badge variant="secondary">Stage</Badge>
            <Badge variant="secondary">Commitments</Badge>
            <Badge variant="secondary">Risk</Badge>
            <Badge variant="secondary">Competitor</Badge>
            <Badge variant="secondary">Sentiment</Badge>
          </div>
        </CardContent>
      </Card>

      {preview && (
        <Card className="card-soft border-0 shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> AI extraction</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3">
              <Field label="Customer" value={preview.customer} />
              <Field label="Salesperson" value={preview.salesperson} />
              <Field label="Product" value={preview.product} />
              <Field label="Quantity" value={preview.quantity} />
              <Field label="Expected revenue" value={preview.expected_revenue ? `₹${Number(preview.expected_revenue).toLocaleString()}` : null} />
              <Field label="Stage" value={preview.pipeline_stage} />
              <Field label="Follow-up" value={preview.follow_up_date} />
              <Field label="Competitor" value={preview.competitor} />
              <Field label="Sentiment" value={preview.sentiment} />
              <Field label="Risk" value={preview.risk_level} />
            </div>
            {preview.summary && (<><Separator className="my-4" /><p className="text-sm leading-relaxed text-foreground/90">{preview.summary}</p></>)}
            {preview.commitments && preview.commitments.length > 0 && (
              <>
                <Separator className="my-4" />
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Commitments created</div>
                <div className="mt-2 space-y-2">
                  {preview.commitments.map((c, i) => (
                    <div key={i} className="rounded-lg border border-border bg-background/50 p-3 text-sm">
                      <div className="font-medium">{c.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.promise_date && <>Promise: <span className="text-foreground/80">{c.promise_date}</span> · </>}
                        {c.next_action && <>Next: <span className="text-foreground/80">{c.next_action}</span> · </>}
                        {c.risk && <>Risk: <span className="text-foreground/80">{c.risk}</span></>}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="card-soft border-0 shadow-none">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="h-4 w-4 text-primary" /> Recent intakes</CardTitle>
          <Link to="/commitments" className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1">
            See commitments <ArrowRight className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent>
          {recentIntakes.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing yet — your captured intakes will appear here.</p>
          ) : (
            <div className="space-y-2">
              {recentIntakes.slice(0, 8).map((i, idx) => {
                const ext = (i.extracted ?? {}) as { intake_code?: string; customer?: string; salesperson?: string; expected_revenue?: number; summary?: string };
                const linked = allCommitments.filter((c) => c.intake_id === i.id).length;
                const fallbackNum = recentIntakes.length - idx;
                const code = ext.intake_code ?? `${myPrefix}${String(fallbackNum).padStart(3, "0")}`;
                return (
                  <div key={i.id} className="flex flex-col gap-1 rounded-xl border border-border bg-background/60 p-3 transition-colors hover:border-primary/40 sm:flex-row sm:items-center sm:gap-3">
                    <div className="flex h-9 w-20 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 to-info/15 font-mono text-xs font-bold text-primary">{code}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-semibold truncate">{ext.customer ?? "Unknown customer"}</span>
                        <Badge variant="secondary" className="text-[10px] uppercase">{i.source}</Badge>
                        {ext.salesperson && <Badge variant="outline" className="font-medium text-[10px]">{ext.salesperson}</Badge>}
                        {linked > 0 && <Badge className="bg-success/15 text-success border-success/30 text-[10px]">{linked} commitment{linked > 1 ? "s" : ""}</Badge>}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {ext.summary ?? i.raw_text ?? "—"}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      {ext.expected_revenue ? <span className="font-semibold text-success">{fmtINR(Number(ext.expected_revenue))}</span> : null}
                      <span className="text-muted-foreground whitespace-nowrap">{new Date(i.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium">{value === null || value === undefined || value === "" ? <span className="text-muted-foreground">—</span> : value}</div>
    </div>
  );
}

function normalizeDate(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "number") {
    // Excel serial date
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => {
      const s = String(r.result ?? "");
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.readAsDataURL(blob);
  });
}

const EXAMPLE = `Visited Lakshmi Vet Pharma. Pregnancy Kit discussion. Customer interested in 200 kits. Expected order Friday. Need revised quotation. Competition is ABC Pharma. No PO yet.`;
