import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, ArrowRight, AlertTriangle, Target, User, Calendar } from "lucide-react";
import { toast } from "sonner";
import { askAi } from "@/lib/ai-assistant.functions";

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
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Array<{ q: string; a: Answer }>>([]);

  async function submit(question: string) {
    if (!question.trim()) return;
    setBusy(true);
    try {
      const a = await ask({ data: { question } }) as Answer;
      setHistory((h) => [{ q: question, a }, ...h]);
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
          <div className="flex justify-end">
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
                <p className="text-foreground/90 leading-relaxed">{row.a.answer}</p>
              </div>
              {row.a.evidence && row.a.evidence.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Evidence</div>
                  <ul className="space-y-1 text-sm">
                    {row.a.evidence.map((e, idx) => (
                      <li key={idx} className="flex items-start gap-2"><span className="mt-1.5 h-1 w-1 rounded-full bg-muted-foreground" />{e}</li>
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
