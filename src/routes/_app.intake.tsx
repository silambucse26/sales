import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Mic, Square, Upload, Sparkles, Loader2, FileSpreadsheet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { analyzeIntakeBulk, saveIntakeBulk, transcribeAudio } from "@/lib/intake.functions";
import type { BulkRecord } from "@/lib/intake.functions";
import { BulkIntakeTable } from "@/components/BulkIntakeTable";
import { useIntakes, useCommitments, fmtINR } from "@/lib/sales-data";
import { coerceMoneyToINR } from "@/lib/money";
import { useAuth } from "@/lib/auth-context";
import { intakePrefix } from "@/lib/auth";
import { Link } from "@tanstack/react-router";
import { ArrowRight, MessageSquare, IdCard } from "lucide-react";

export const Route = createFileRoute("/_app/intake")({ component: IntakePage });

// BulkRecord type comes from intake.functions via BulkIntakeTable import

function IntakePage() {
  const analyzeBulk = useServerFn(analyzeIntakeBulk);
  const saveBulk = useServerFn(saveIntakeBulk);
  const transcribe = useServerFn(transcribeAudio);
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recording, setRecording] = useState(false);
  const [bulkRecords, setBulkRecords] = useState<BulkRecord[] | null>(null);
  const [reviewSource, setReviewSource] = useState<"text" | "voice" | "file">("text");
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



  async function submit(source: "text" | "voice" | "file" = "text") {
    if (!text.trim()) { toast.error("Enter some text or record a note first."); return; }
    setBusy(true);
    setBulkRecords(null);
    setReviewSource(source);
    try {
      const res = await analyzeBulk({ data: { text, source, salespersonName: name ?? undefined, intakePrefix: myPrefix } });
      const records = (res.records as BulkRecord[]).map((r) => ({ ...r, salesperson: name ?? r.salesperson ?? null }));
      setBulkRecords(records);
      toast.success(records.length === 1 ? "AI extraction ready — review and save." : `AI extracted ${records.length} records — review and save all.`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "AI processing failed");
    } finally { setBusy(false); }
  }

  function patchRecord(idx: number, field: keyof BulkRecord, value: BulkRecord[keyof BulkRecord]) {
    setBulkRecords((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }

  async function saveAll() {
    if (!bulkRecords?.length) return;
    setSaving(true);
    try {
      const res = await saveBulk({ data: {
        records: bulkRecords.map((r) => ({ ...r, salesperson: name ?? r.salesperson ?? null })),
        source: reviewSource as "text" | "voice" | "file" | "excel" | "whatsapp",
        salespersonName: name ?? undefined,
        intakePrefix: myPrefix,
      }});
      toast.success(`Saved ${res.count} intake${res.count !== 1 ? "s" : ""} successfully.`);
      setBulkRecords(null);
      setText("");
      qc.invalidateQueries({ queryKey: ["commitments"] });
      qc.invalidateQueries({ queryKey: ["intakes-count"] });
      qc.invalidateQueries({ queryKey: ["intakes"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
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
        const wavBlob = await audioBlobToWav(blob);
        const b64 = await blobToBase64(wavBlob);
        setBusy(true);
        try {
          const r = await transcribe({ data: { audioBase64: b64, mime: "audio/wav" } });
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
    setBulkRecords(null);
    try {
      const XLSX = await import("xlsx");
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf);
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
      if (rows.length === 0) { toast.error("Sheet is empty."); return; }
      const c = (r: Record<string, unknown>, k: string) =>
        (r[k] ?? r[k.toLowerCase()] ?? r[k.toUpperCase()] ?? r[Object.keys(r).find(key => key.toLowerCase() === k.toLowerCase()) ?? ""] ?? undefined) as string | number | undefined;
      const records: BulkRecord[] = rows.map((r) => ({
        customer: String(c(r, "Customer") ?? c(r, "Customer Name") ?? "").trim() || null,
        salesperson: String(c(r, "Salesperson") ?? c(r, "Sales Person") ?? "").trim() || name || null,
        product: String(c(r, "Product") ?? c(r, "Product Name") ?? "").trim() || null,
        quantity: c(r, "Quantity") != null ? Number(c(r, "Quantity")) : null,
        expected_revenue: coerceMoneyToINR(c(r, "Revenue") ?? c(r, "Expected Revenue") ?? c(r, "Amount") ?? c(r, "Value"), JSON.stringify(r)) || null,
        pipeline_stage: String(c(r, "Stage") ?? c(r, "Pipeline Stage") ?? "").trim() || null,
        follow_up_date: normalizeDate(c(r, "Follow Up Date") ?? c(r, "Follow-up") ?? c(r, "Follow Up") ?? c(r, "Date")),
        competitor: String(c(r, "Competitor") ?? "").trim() || null,
        sentiment: String(c(r, "Sentiment") ?? "").trim() || null,
        risk_level: String(c(r, "Risk") ?? c(r, "Risk Level") ?? "").trim() || null,
        english_translation: String(c(r, "English Translation") ?? c(r, "Translation") ?? "").trim() || null,
        summary: String(c(r, "Summary") ?? c(r, "Notes") ?? c(r, "Remarks") ?? c(r, "Description") ?? "").trim() || null,
        commitments: (() => {
          const title = String(c(r, "Commitment") ?? c(r, "Next Action") ?? "").trim();
          if (!title) return [];
          return [{ title, promise_date: normalizeDate(c(r, "Commitment Date")), next_action: null, risk: null }];
        })(),
        intake_code: null,
      }));
      setReviewSource("file");
      setBulkRecords(records);
      toast.success(records.length === 1 ? "Excel loaded — review and save." : `Loaded ${records.length} rows from Excel — review and save.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Excel import failed");
    } finally { setBusy(false); e.target.value = ""; }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New intake</h1>
          <p className="text-sm text-muted-foreground">Paste EOD reports, WhatsApp chats, or speak. Tamil and mixed-language notes are translated to English and split by customer.</p>
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

      {bulkRecords && bulkRecords.length > 0 && (
        <BulkIntakeTable
          records={bulkRecords}
          loggedInName={name ?? ""}
          saving={saving}
          onPatch={patchRecord}
          onSave={saveAll}
          onCancel={() => { setBulkRecords(null); setText(""); }}
        />
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
                const ext = (i.extracted ?? {}) as { intake_code?: string; customer?: string; salesperson?: string; expected_revenue?: number; english_translation?: string; summary?: string };
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
                        {ext.english_translation ?? ext.summary ?? i.raw_text ?? "—"}
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

async function audioBlobToWav(blob: Blob): Promise<Blob> {
  const AudioContextClass =
    window.AudioContext ||
    (window as Window & typeof globalThis & { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new AudioContextClass();
  try {
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    return new Blob([encodeWav(buffer)], { type: "audio/wav" });
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

function encodeWav(buffer: AudioBuffer): ArrayBuffer {
  const channels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const samples = buffer.length;
  const blockAlign = channels * 2;
  const dataSize = samples * blockAlign;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);
  let offset = 0;
  const writeString = (s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset++, s.charCodeAt(i));
  };
  writeString("RIFF");
  view.setUint32(offset, 36 + dataSize, true); offset += 4;
  writeString("WAVE");
  writeString("fmt ");
  view.setUint32(offset, 16, true); offset += 4;
  view.setUint16(offset, 1, true); offset += 2;
  view.setUint16(offset, channels, true); offset += 2;
  view.setUint32(offset, sampleRate, true); offset += 4;
  view.setUint32(offset, sampleRate * blockAlign, true); offset += 4;
  view.setUint16(offset, blockAlign, true); offset += 2;
  view.setUint16(offset, 16, true); offset += 2;
  writeString("data");
  view.setUint32(offset, dataSize, true); offset += 4;
  const channelData = Array.from({ length: channels }, (_, i) => buffer.getChannelData(i));
  for (let i = 0; i < samples; i++) {
    for (let ch = 0; ch < channels; ch++) {
      const sample = Math.max(-1, Math.min(1, channelData[ch][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return out;
}

const EXAMPLE = `Visited Lakshmi Vet Pharma. Pregnancy Kit discussion. Customer interested in 200 kits. Expected order Friday. Need revised quotation. Competition is ABC Pharma. No PO yet.`;
