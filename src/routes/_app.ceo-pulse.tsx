import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, TrendingUp, Target, AlertTriangle, Sparkles, Wallet, Users, Building2, Flame, TrendingDown, BarChart3 } from "lucide-react";
import { useCommitments, useIntakes, aggregateReps, aggregateCustomers, fmtINR, effectiveStatus } from "@/lib/sales-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/ceo-pulse")({ component: CeoPulse });

function CeoPulse() {
  const { data: commitments = [] } = useCommitments();
  const { data: intakes = [] } = useIntakes();
  const reps = useMemo(() => aggregateReps(commitments), [commitments]);
  const customers = useMemo(() => aggregateCustomers(commitments, intakes), [commitments, intakes]);

  const today = new Date().toISOString().slice(0,10);
  const won = commitments.filter((c) => c.status === "completed").reduce((s,c)=>s+Number(c.expected_revenue??0),0);
  const pipeline = commitments.filter((c) => c.status !== "completed" && c.status !== "missed").reduce((s,c)=>s+Number(c.expected_revenue??0),0);
  const target = Math.max(won * 1.5, 5_000_000);
  const gap = Math.max(0, target - won);
  const onTrack = won / Math.max(target, 1);
  const monthEnd = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth()+1, 0).toISOString().slice(0,10); })();
  const weekEnd = (() => { const d = new Date(); d.setDate(d.getDate()+7); return d.toISOString().slice(0,10); })();
  const closingWk = commitments.filter((c) => c.promise_date && c.promise_date >= today && c.promise_date <= weekEnd && c.status !== "completed" && c.status !== "missed").reduce((s,c)=>s+Number(c.expected_revenue??0),0);
  const closingMo = commitments.filter((c) => c.promise_date && c.promise_date >= today && c.promise_date <= monthEnd && c.status !== "completed" && c.status !== "missed").reduce((s,c)=>s+Number(c.expected_revenue??0),0);
  const forecast = won + closingMo * 0.6;
  const missed = commitments.filter((c) => effectiveStatus(c) === "missed");
  const revenueRisk = missed.reduce((s,c)=>s+Number(c.expected_revenue??0),0);
  const recoverable = Math.round(revenueRisk * 0.4);

  const topRep = reps[0];
  const weakRep = [...reps].filter((r) => r.commitments >= 1).sort((a,b)=>a.accuracy-b.accuracy)[0];
  const topCustomer = customers[0];
  const conversion = commitments.length ? Math.round((commitments.filter((c)=>c.status==="completed").length / commitments.length) * 100) : 0;

  const reason = onTrack >= 1
    ? "Above target."
    : missed.length > 0
      ? `${missed.length} missed commitment${missed.length===1?"":"s"} burning ${fmtINR(revenueRisk)} of expected revenue.`
      : "Pipeline build is healthy but conversion velocity is the limiter.";

  const responsible = weakRep?.name ?? "Pipeline owners";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight"><span className="gradient-text">CEO Pulse</span></h1>
        <p className="text-sm text-muted-foreground">30-second read of business health.</p>
      </div>

      <Card className="card-soft border-0 shadow-none">
        <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> The 30-second briefing</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Brief q="Are we on track?" a={`${Math.round(onTrack * 100)}% of target (${fmtINR(won)} of ${fmtINR(target)}).`} tone={onTrack >= 1 ? "success" : onTrack >= 0.7 ? "warning" : "destructive"} />
          <Brief q="Why not?" a={reason} />
          <Brief q="Who is responsible?" a={responsible} />
          <Brief q="Recoverable revenue?" a={fmtINR(recoverable)} tone="info" />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile icon={TrendingUp} label="Revenue" value={fmtINR(won)} tone="success" />
        <Tile icon={Target} label="Target" value={fmtINR(target)} />
        <Tile icon={AlertTriangle} label="Gap" value={fmtINR(gap)} tone="warning" />
        <Tile icon={BarChart3} label="AI forecast" value={fmtINR(forecast)} tone="info" />
        <Tile icon={Flame} label="Closing this week" value={fmtINR(closingWk)} />
        <Tile icon={TrendingUp} label="Closing this month" value={fmtINR(closingMo)} />
        <Tile icon={Wallet} label="Pipeline" value={fmtINR(pipeline)} />
        <Tile icon={Activity} label="Conversion" value={`${conversion}%`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="card-soft border-0 shadow-none">
          <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-4 w-4" /> People</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Row icon={Flame} label="Top salesperson" value={topRep?.name ?? "—"} sub={topRep ? `${fmtINR(topRep.won)} won` : ""} tone="success" />
            <Row icon={TrendingDown} label="Weakest salesperson" value={weakRep?.name ?? "—"} sub={weakRep ? `${weakRep.accuracy}% accuracy` : ""} tone="warning" />
            <Row icon={Building2} label="Top customer" value={topCustomer?.name ?? "—"} sub={topCustomer ? fmtINR(topCustomer.pipeline + topCustomer.won) : ""} tone="info" />
          </CardContent>
        </Card>
        <Card className="card-soft border-0 shadow-none">
          <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> AI insights</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Insight text={`Marketing ROI proxy: ${intakes.length} intakes → ${commitments.length} commitments (${commitments.length && intakes.length ? Math.round((commitments.length/intakes.length)*100) : 0}% conversion).`} />
            <Insight text={`Cash flow risk: ${fmtINR(revenueRisk)} stuck behind missed commitments. Recover ~${fmtINR(recoverable)} with focused escalation.`} />
            <Insight text={`Forecast confidence: 60% of this month's open pipeline (${fmtINR(closingMo)}) should land — base case ${fmtINR(forecast)}.`} />
            {weakRep && <Insight text={`Concentration risk: ${weakRep.name} is the bottleneck on commitment discipline.`} />}
          </CardContent>
        </Card>
      </div>

      <Card className="card-soft border-0 shadow-none">
        <CardHeader><CardTitle>Today's must-do</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Must text={`Personally call ${Math.min(3, missed.length)} delayed accounts.`} />
          <Must text={`Approve closure path for top ${Math.min(3, reps.length)} reps.`} />
          <Must text={`Review forecast variance vs target: gap of ${fmtINR(gap)}.`} />
        </CardContent>
      </Card>
    </div>
  );
}

function Brief({ q, a, tone }: { q: string; a: string; tone?: "success"|"warning"|"destructive"|"info" }) {
  const cls = tone === "success" ? "border-success/30 bg-success/5" : tone === "warning" ? "border-warning/30 bg-warning/5" : tone === "destructive" ? "border-destructive/30 bg-destructive/5" : tone === "info" ? "border-info/30 bg-info/5" : "border-border bg-background/50";
  return (
    <div className={cn("rounded-xl border p-3", cls)}>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{q}</div>
      <div className="mt-1 text-sm font-semibold">{a}</div>
    </div>
  );
}

function Tile({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number; tone?: "success"|"info"|"warning"|"destructive" }) {
  const cls = tone === "destructive" ? "bg-destructive/10 text-destructive" : tone === "success" ? "bg-success/15 text-success-foreground" : tone === "info" ? "bg-info/15 text-info-foreground" : tone === "warning" ? "bg-warning/15 text-warning-foreground" : "bg-muted text-foreground/70";
  return (
    <div className="card-soft p-4">
      <div className="flex items-center justify-between">
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", cls)}><Icon className="h-4 w-4" /></div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight">{value}</div>
    </div>
  );
}

function Row({ icon: Icon, label, value, sub, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub?: string; tone: "success"|"warning"|"info" }) {
  const cls = { success: "bg-success/15 text-success-foreground", warning: "bg-warning/15 text-warning-foreground", info: "bg-info/15 text-info-foreground" }[tone];
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background/50 p-3">
      <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", cls)}><Icon className="h-4 w-4" /></div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="truncate text-sm font-semibold">{value}</div>
      </div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Insight({ text }: { text: string }) {
  return <div className="flex items-start gap-2 rounded-lg border border-border bg-background/40 p-2.5"><Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /><span>{text}</span></div>;
}
function Must({ text }: { text: string }) {
  return <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5"><Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /><span>{text}</span></div>;
}
