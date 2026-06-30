import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Flame, Sun, AlertTriangle, Clock, CheckCircle2, TrendingUp, Wallet, Sparkles, ArrowUpRight, Users } from "lucide-react";
import { useCommitments, useIntakes, effectiveStatus, fmtINR } from "@/lib/sales-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/war-room")({ component: WarRoom });

function WarRoom() {
  const { data: commitments = [] } = useCommitments();
  const { data: intakes = [] } = useIntakes();

  const today = new Date().toISOString().slice(0, 10);
  const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const yesterdayClosed = commitments.filter((c) => c.status === "completed" && c.created_at.slice(0,10) === yest);

  const yesterdayCommit = commitments.filter((c) => c.promise_date === yest);
  const followUps = commitments.filter((c) => c.promise_date === today && c.status !== "completed");
  const missed = commitments.filter((c) => effectiveStatus(c) === "missed");
  const closingSoon = commitments.filter((c) => c.promise_date && c.promise_date >= today && c.promise_date <= addDays(today, 7) && c.status !== "completed" && c.status !== "missed");
  const hiPriority = commitments.filter((c) => c.risk_level === "High" && c.status !== "completed");
  const escalation = commitments.filter((c) => effectiveStatus(c) === "missed" || c.risk_level === "High");
  const revenueRisk = escalation.filter((c) => c.status !== "completed").reduce((s,c)=>s+Number(c.expected_revenue??0),0);
  const pendingCollections = commitments.filter((c) => /collection|payment|invoice/i.test(c.title) && c.status !== "completed");
  const delayedQuotes = commitments.filter((c) => /quotation|quote/i.test(c.title) && (c.status !== "completed"));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight"><span className="gradient-text">War Room</span></h1>
        <p className="text-sm text-muted-foreground">Daily execution dashboard. Today's battle plan.</p>
      </div>

      <Card className="card-soft border-0 shadow-none">
        <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> AI Morning Brief</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Yesterday the team closed <b>{fmtINR(yesterdayClosed.reduce((s,c)=>s+Number(c.expected_revenue??0),0))}</b> across {yesterdayClosed.length} commitment{yesterdayClosed.length===1?"":"s"}. {missed.length} commitment{missed.length===1?"":"s"} {missed.length===1?"is":"are"} currently overdue and {fmtINR(revenueRisk)} of pipeline is at risk.</p>
          <p>Today's priority: {followUps.length} follow-up{followUps.length===1?"":"s"}, {hiPriority.length} high-risk deal{hiPriority.length===1?"":"s"}, and {closingSoon.length} deal{closingSoon.length===1?"":"s"} closing this week worth <b>{fmtINR(closingSoon.reduce((s,c)=>s+Number(c.expected_revenue??0),0))}</b>.</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile icon={Sun} label="Yesterday sales" value={fmtINR(yesterdayClosed.reduce((s,c)=>s+Number(c.expected_revenue??0),0))} sub={`${yesterdayClosed.length} kept`} tone="success" />
        <Tile icon={CheckCircle2} label="Yesterday commitments" value={yesterdayCommit.length} sub={`${yesterdayCommit.filter(c=>c.status==='completed').length} kept`} />
        <Tile icon={Clock} label="Today follow-ups" value={followUps.length} sub={fmtINR(followUps.reduce((s,c)=>s+Number(c.expected_revenue??0),0))} tone="info" />
        <Tile icon={AlertTriangle} label="Missed commitments" value={missed.length} sub={fmtINR(missed.reduce((s,c)=>s+Number(c.expected_revenue??0),0))} tone="destructive" />
        <Tile icon={Flame} label="High priority" value={hiPriority.length} sub="needs intervention" tone="warning" />
        <Tile icon={TrendingUp} label="Likely closures" value={closingSoon.length} sub={fmtINR(closingSoon.reduce((s,c)=>s+Number(c.expected_revenue??0),0))} tone="success" />
        <Tile icon={Wallet} label="Revenue at risk" value={fmtINR(revenueRisk)} sub={`${escalation.length} accounts`} tone="destructive" />
        <Tile icon={Users} label="Recent intakes" value={intakes.length} sub="last 200" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ListCard title="Customers needing escalation" icon={AlertTriangle} items={escalation.slice(0, 8).map((c) => ({ title: c.customer ?? c.title, sub: `${c.salesperson ?? "—"} · ${c.title}`, value: fmtINR(c.expected_revenue ?? 0), tone: "destructive" as const }))} empty="All accounts healthy." />
        <ListCard title="Today follow-ups" icon={Clock} items={followUps.slice(0, 8).map((c) => ({ title: c.title, sub: `${c.customer ?? "—"} · ${c.salesperson ?? "—"}`, value: fmtINR(c.expected_revenue ?? 0), tone: "info" as const }))} empty="No follow-ups due today." />
        <ListCard title="Delayed quotations" icon={Clock} items={delayedQuotes.slice(0, 8).map((c) => ({ title: c.title, sub: c.customer ?? "—", value: fmtINR(c.expected_revenue ?? 0), tone: "warning" as const }))} empty="No quotations pending." />
        <ListCard title="Pending collections" icon={Wallet} items={pendingCollections.slice(0, 8).map((c) => ({ title: c.title, sub: c.customer ?? "—", value: fmtINR(c.expected_revenue ?? 0), tone: "warning" as const }))} empty="Collections on track." />
      </div>

      <Card className="card-soft border-0 shadow-none">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Suggested actions for today</CardTitle>
          <Button asChild size="sm" variant="ghost"><Link to="/ask-ai">Ask AI <ArrowUpRight className="ml-1 h-3 w-3" /></Link></Button>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Action text={`Personally call top ${Math.min(3, escalation.length)} escalation account${escalation.length===1?"":"s"}.`} />
          <Action text={`Stand-up review of ${missed.length} missed commitment${missed.length===1?"":"s"} — confirm new dates.`} />
          <Action text={`Push ${closingSoon.length} likely closure${closingSoon.length===1?"":"s"} for end-of-week revenue.`} />
          <Action text={`Audit ${delayedQuotes.length} delayed quotation${delayedQuotes.length===1?"":"s"} — bottleneck?`} />
        </CardContent>
      </Card>
    </div>
  );
}

function addDays(iso: string, n: number) { const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0,10); }

function Tile({ icon: Icon, label, value, sub, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number; sub?: string; tone?: "success" | "info" | "destructive" | "warning" }) {
  const cls = tone === "destructive" ? "bg-destructive/10 text-destructive" : tone === "success" ? "bg-success/15 text-success-foreground" : tone === "info" ? "bg-info/15 text-info-foreground" : tone === "warning" ? "bg-warning/15 text-warning-foreground" : "bg-muted text-foreground/70";
  return (
    <div className="card-soft p-4">
      <div className="flex items-center justify-between">
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", cls)}><Icon className="h-4 w-4" /></div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function ListCard({ title, icon: Icon, items, empty }: { title: string; icon: React.ComponentType<{ className?: string }>; items: { title: string; sub: string; value: string; tone: "destructive" | "info" | "warning" }[]; empty: string }) {
  return (
    <Card className="card-soft border-0 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Icon className="h-4 w-4 text-muted-foreground" /> {title}</CardTitle>
        <Badge variant="secondary">{items.length}</Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">{empty}</p>}
        {items.map((it, i) => (
          <div key={i} className={cn("flex items-center gap-3 rounded-lg border p-3", it.tone === "destructive" ? "border-destructive/20 bg-destructive/5" : it.tone === "warning" ? "border-warning/20 bg-warning/5" : "border-border bg-background/50")}>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{it.title}</div>
              <div className="truncate text-xs text-muted-foreground">{it.sub}</div>
            </div>
            <div className="text-sm font-semibold">{it.value}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Action({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-background/40 p-2.5">
      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /><span>{text}</span>
    </div>
  );
}
