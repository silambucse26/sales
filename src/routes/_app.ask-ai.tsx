import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sparkles, Loader2, ArrowRight, AlertTriangle, Target, User, Calendar, Mic, Square } from "lucide-react";
import { toast } from "sonner";
import { askAi } from "@/lib/ai-assistant.functions";
import { transcribeAudio } from "@/lib/intake.functions";

export const Route = createFileRoute("/_app/ask-ai")({ component: AskAi });

type Answer = {
  answer: string;
  evidence?: string[];
  risk?: string | null;
  action_required?: string | null;
  responsible?: string | null;
  follow_up_date?: string | null;
};

const SUGGESTIONS = [
  "What commitments are overdue?",
  "Which customer needs escalation?",
  "Who is the best closer?",
  "Which salesperson needs coaching?",
  "Which product is slowing down?",
  "What should I discuss in today's review?",
  "Which deals are likely to close this week?",
];

function AskAi() {
  const ask = useServerFn(askAi);
  const transcribe = useServerFn(transcribeAudio);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [history, setHistory] = useState<Array<{ q: string; a: Answer }>>([]);
  const [popup, setPopup] = useState<{ q: string; a: Answer } | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function toggleRecord() {
    if (recording) { mediaRef.current?.stop(); return; }
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
        if (blob.size < 1024) { toast.error("Recording too short."); return; }
        const wavBlob = await audioBlobToWav(blob);
        const b64 = await blobToBase64(wavBlob);
        setBusy(true);
        try {
          const r = await transcribe({ data: { audioBase64: b64, mime: "audio/wav" } });
          if (r.text) { setQ(r.text); toast.success("Voice transcribed — review and ask."); }
        } catch (e: unknown) {
          toast.error(e instanceof Error ? e.message : "Transcription failed");
        } finally { setBusy(false); }
      };
      mediaRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      toast.error("Microphone permission denied.");
    }
  }

  async function submit(question: string) {
    if (!question.trim()) return;
    setBusy(true);
    try {
      const a = await ask({ data: { question } }) as Answer;
      setHistory((h) => [{ q: question, a }, ...h]);
      setPopup({ q: question, a });
      setQ("");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "AI failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight"><span className="gradient-text">Ask AI</span></h1>
        <p className="text-sm text-muted-foreground">Ask anything about sales execution. Answers come from your live data.</p>
      </div>

      <Card className="card-soft border-0 shadow-none">
        <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Ask a question</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Textarea rows={3} value={q} onChange={(e) => setQ(e.target.value)} placeholder="What did Praveen promise yesterday? What commitments are overdue?" />
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => submit(s)} disabled={busy} className="rounded-full border border-border bg-background/60 px-3 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">{s}</button>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <Button onClick={toggleRecord} variant={recording ? "destructive" : "outline"} disabled={busy} size="sm">
              {recording ? <><Square className="mr-1.5 h-4 w-4" /> Stop</> : <><Mic className="mr-1.5 h-4 w-4" /> Speak your question</>}
            </Button>
            <Button onClick={() => submit(q)} disabled={busy || !q.trim()}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-1.5 h-4 w-4" />} Ask
            </Button>
          </div>
        </CardContent>
      </Card>

      {history.length === 0 && !busy && (
        <Card className="card-soft border-0 shadow-none">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Try a question above. Answers cite live commitments, intakes, and team data.
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {history.map((row, i) => (
          <Card key={i} className="card-soft border-0 shadow-none">
            <CardHeader>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">You asked</div>
              <CardTitle className="text-base font-semibold">{row.q}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
                <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary"><Sparkles className="h-3.5 w-3.5" /> Answer</div>
                <p className="text-foreground/90 leading-relaxed">{readableText(row.a.answer)}</p>
              </div>
              {row.a.evidence && row.a.evidence.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Evidence</div>
                  <ul className="space-y-1 text-sm">
                    {row.a.evidence.map((e, idx) => (
                      <li key={idx} className="flex items-start gap-2"><span className="mt-1.5 h-1 w-1 rounded-full bg-muted-foreground" />{readableText(e)}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                {row.a.risk && <Pill icon={AlertTriangle} label="Risk" value={row.a.risk} tone="destructive" />}
                {row.a.action_required && <Pill icon={Target} label="Action" value={row.a.action_required} tone="primary" />}
                {row.a.responsible && <Pill icon={User} label="Responsible" value={row.a.responsible} />}
                {row.a.follow_up_date && <Pill icon={Calendar} label="Follow-up" value={row.a.follow_up_date} tone="info" />}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!popup} onOpenChange={(open) => !open && setPopup(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="pr-8 text-base leading-snug">{popup?.q}</DialogTitle>
          </DialogHeader>
          {popup && <AnswerDetails answer={popup.a} />}
        </DialogContent>
      </Dialog>
    </div>
  );
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
    (window as Window & typeof globalThis & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioContextClass();
  try {
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    const channels = Math.min(2, buffer.numberOfChannels);
    const sampleRate = buffer.sampleRate;
    const samples = buffer.length;
    const blockAlign = channels * 2;
    const dataSize = samples * blockAlign;
    const out = new ArrayBuffer(44 + dataSize);
    const view = new DataView(out);
    let offset = 0;
    const writeString = (s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(offset++, s.charCodeAt(i)); };
    writeString("RIFF"); view.setUint32(offset, 36 + dataSize, true); offset += 4;
    writeString("WAVE"); writeString("fmt ");
    view.setUint32(offset, 16, true); offset += 4;
    view.setUint16(offset, 1, true); offset += 2;
    view.setUint16(offset, channels, true); offset += 2;
    view.setUint32(offset, sampleRate, true); offset += 4;
    view.setUint32(offset, sampleRate * blockAlign, true); offset += 4;
    view.setUint16(offset, blockAlign, true); offset += 2;
    view.setUint16(offset, 16, true); offset += 2;
    writeString("data"); view.setUint32(offset, dataSize, true); offset += 4;
    const channelData = Array.from({ length: channels }, (_, i) => buffer.getChannelData(i));
    for (let i = 0; i < samples; i++) {
      for (let ch = 0; ch < channels; ch++) {
        const sample = Math.max(-1, Math.min(1, channelData[ch][i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }
    return new Blob([out], { type: "audio/wav" });
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

function readableText(value: string) {
  return value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .replace(/^\s*\{\s*"answer"\s*:\s*/i, "")
    .replace(/,\s*"evidence"\s*:\s*\[[\s\S]*$/i, "")
    .replace(/^\s*"|"\s*$/g, "")
    .replace(/\\n/g, " ")
    .replace(/\\"/g, '"')
    .trim();
}

function AnswerDetails({ answer }: { answer: Answer }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase text-primary">
          <Sparkles className="h-3.5 w-3.5" /> Answer
        </div>
        <p className="leading-relaxed text-foreground/90">{readableText(answer.answer)}</p>
      </div>
      {answer.evidence && answer.evidence.length > 0 && (
        <div className="rounded-lg border border-border p-3">
          <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Evidence</div>
          <ul className="space-y-1 text-sm">
            {answer.evidence.map((e, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                <span className="min-w-0">{readableText(e)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {answer.risk && <Pill icon={AlertTriangle} label="Risk" value={answer.risk} tone="destructive" />}
        {answer.action_required && <Pill icon={Target} label="Action" value={answer.action_required} tone="primary" />}
        {answer.responsible && <Pill icon={User} label="Responsible" value={answer.responsible} />}
        {answer.follow_up_date && <Pill icon={Calendar} label="Follow-up" value={answer.follow_up_date} tone="info" />}
      </div>
    </div>
  );
}

function Pill({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; tone?: "destructive"|"primary"|"info" }) {
  const cls = tone === "destructive" ? "border-destructive/30 bg-destructive/5 text-destructive" : tone === "primary" ? "border-primary/30 bg-primary/5 text-primary" : tone === "info" ? "border-info/30 bg-info/5 text-info-foreground" : "border-border bg-background/50";
  return (
    <div className={`flex items-start gap-2 rounded-lg border p-2.5 text-sm ${cls}`}>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0">
        <Badge variant="outline" className="mb-1 text-[10px]">{label}</Badge>
        <div className="font-medium leading-snug">{value}</div>
      </div>
    </div>
  );
}
