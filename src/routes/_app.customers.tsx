import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Sparkles, Building2, TrendingUp, Heart, Plus, IndianRupee, Loader2, User, CalendarDays, XCircle } from "lucide-react";
import { useCommitments, useIntakes, useTeamMembers, aggregateCustomers, fmtINR, effectiveStatus, type CustomerStats, type Commitment, type IntakeRow, type TeamMember } from "@/lib/sales-data";
import { useAuth } from "@/lib/auth-context";
import { salesCode } from "@/lib/auth";
import { createCommitment } from "@/lib/commitments.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/customers")({ component: Customers });

function Customers() {
  const { data: commitments = [] } = useCommitments();
  const { data: intakes = [] } = useIntakes();
  const { data: members = [] } = useTeamMembers();
  const customers = useMemo(() => aggregateCustomers(commitments, intakes), [commitments, intakes]);
  const [q, setQ] = useState("");
  const [repFilter, setRepFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [open, setOpen] = useState<CustomerStats | null>(null);
  const repOptions = useMemo(() => Array.from(new Set(commitments.map((c) => (c.salesperson ?? "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [commitments]);
  const filtered = customers.filter((c) => {
    if (q && !c.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (repFilter !== "all" && c.rep !== repFilter) return false;
    if (dateFilter) {
      const hasCommitmentOnDate = commitments.some((row) => (row.customer ?? "").trim() === c.name && row.promise_date === dateFilter);
      if (!hasCommitmentOnDate) return false;
    }
    return true;
  });
  const selectedCustomer = open ? (customers.find((c) => c.name === open.name) ?? open) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight"><span className="gradient-text">Customers</span></h1>
          <p className="text-sm text-muted-foreground">Account intelligence — relationship, probability, and risk.</p>
        </div>
        <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-[220px_200px_170px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer..." className="pl-8" />
          </div>
          <div className="relative">
            <User className="pointer-events-none absolute left-2.5 top-2.5 z-10 h-4 w-4 text-muted-foreground" />
            <Select value={repFilter} onValueChange={setRepFilter}>
              <SelectTrigger className="pl-8"><SelectValue placeholder="Salesperson" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All salespeople</SelectItem>
                {repOptions.map((person) => <SelectItem key={person} value={person}>{person}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="pl-8" />
          </div>
          {(q || repFilter !== "all" || dateFilter) && (
            <Button variant="outline" onClick={() => { setQ(""); setRepFilter("all"); setDateFilter(""); }}>
              <XCircle className="h-4 w-4" /> Clear
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.length === 0 && <p className="col-span-full py-12 text-center text-sm text-muted-foreground">No customers yet.</p>}
        {filtered.map((c) => {
          const risk = c.missed > 0 ? "High" : c.open > 2 ? "Medium" : "Low";
          return (
            <button key={c.name} onClick={() => setOpen(c)} className="text-left">
              <Card className="card-soft border-0 shadow-none hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="flex items-center gap-2 truncate text-base"><Building2 className="h-4 w-4 text-primary" /> {c.name}</CardTitle>
                      <div className="mt-0.5 text-xs text-muted-foreground">{c.rep ?? "Unassigned"}</div>
                    </div>
                    <Badge variant="outline" className={cn("text-[10px]", risk === "High" ? "border-destructive/40 text-destructive" : risk === "Medium" ? "border-warning/40 text-warning-foreground" : "border-success/40 text-success-foreground")}>{risk} risk</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <Mini label="Pipeline" value={fmtINR(c.pipeline)} />
                    <Mini label="Won" value={fmtINR(c.won)} />
                  </div>
                  <Meter label="Relationship" value={c.relationship} icon={Heart} />
                  <Meter label="Buying probability" value={c.buyingProb} icon={TrendingUp} />
                  <div className="flex flex-wrap gap-1.5 text-[10px]">
                    <Badge variant="secondary">{c.open} open</Badge>
                    {c.missed > 0 && <Badge variant="outline" className="border-destructive/40 text-destructive">{c.missed} missed</Badge>}
                    {c.competitor && <Badge variant="outline">vs {c.competitor}</Badge>}
                  </div>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{open?.name}</DialogTitle></DialogHeader>
          {selectedCustomer && <CustomerProfile cust={selectedCustomer} commitments={commitments} intakes={intakes} members={members} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CustomerProfile({ cust, commitments, intakes, members }: { cust: CustomerStats; commitments: Commitment[]; intakes: IntakeRow[]; members: TeamMember[] }) {
  const own = (commitments ?? []).filter((c) => (c.customer ?? "").trim() === cust.name);
  const ownIntakes = (intakes ?? []).filter((i) => {
    const ext = (i.extracted ?? {}) as { customer?: string };
    return ext.customer?.trim() === cust.name;
  });
  const products = Array.from(new Set(own.map((c) => c.product).filter(Boolean))) as string[];
  const { user, role, name, phone } = useAuth();
  const myCode = salesCode(name, phone);
  const canAssign = role === "business_head" || role === "sales_head";
  const assignableMembers = useMemo(() => members.filter((m) => m.role === "sales_member" || m.role === "sales_head"), [members]);
  const defaultAssignee = assignableMembers.find((m) => m.name === cust.rep)?.id ?? user?.id ?? "";
  const qc = useQueryClient();
  const create = useServerFn(createCommitment);
  const [kind, setKind] = useState<"pipeline" | "won">("pipeline");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [assignedTo, setAssignedTo] = useState(defaultAssignee);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAssignedTo(defaultAssignee);
  }, [defaultAssignee]);

  async function submitUpdate() {
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount in ₹"); return; }
    setSaving(true);
    try {
      await create({ data: {
        title: kind === "won" ? `Revenue won from ${cust.name}` : `Pipeline update — ${cust.name}`,
        customer: cust.name,
        salesperson: canAssign ? undefined : myCode,
        expected_revenue: amt,
        status: kind === "won" ? "completed" : "open",
        remarks: note || undefined,
        promise_date: kind === "pipeline" ? new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10) : undefined,
        assigned_to: assignedTo || undefined,
      } });
      toast.success(kind === "won" ? `₹${amt.toLocaleString()} marked as revenue won` : `Pipeline updated by ₹${amt.toLocaleString()}`);
      setAmount(""); setNote("");
      qc.invalidateQueries({ queryKey: ["commitments"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Pipeline" value={fmtINR(cust.pipeline)} />
        <Stat label="Won" value={fmtINR(cust.won)} />
        <Stat label="Relationship" value={`${cust.relationship}`} />
        <Stat label="Buying prob." value={`${cust.buyingProb}%`} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 text-center text-xs">
        <Mini label="Open" value={cust.open} />
        <Mini label="Missed" value={cust.missed} />
        <Mini label="Competitor" value={cust.competitor ?? "—"} />
        <Mini label="Products" value={products.length || "—"} />
      </div>

      <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 to-info/5 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold"><Plus className="h-4 w-4 text-primary" /> Update this customer</div>
          <div className="inline-flex rounded-full border border-border bg-background p-0.5 text-xs">
            <button onClick={() => setKind("pipeline")} className={cn("rounded-full px-3 py-1 font-medium transition-colors", kind === "pipeline" ? "bg-info text-info-foreground" : "text-muted-foreground")}>Pipeline</button>
            <button onClick={() => setKind("won")} className={cn("rounded-full px-3 py-1 font-medium transition-colors", kind === "won" ? "bg-success text-success-foreground" : "text-muted-foreground")}>Revenue won</button>
          </div>
        </div>
        <div className={cn("grid gap-2", canAssign ? "sm:grid-cols-[140px_180px_1fr_auto]" : "sm:grid-cols-[140px_1fr_auto]")}>
          <div className="relative">
            <IndianRupee className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} placeholder="Amount" inputMode="numeric" className="pl-7" />
          </div>
          {canAssign && (
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger><SelectValue placeholder="Sales member" /></SelectTrigger>
              <SelectContent>
                {user && <SelectItem value={user.id}>{name ?? "Me"}</SelectItem>}
                {assignableMembers.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === "won" ? "PO number, invoice ref…" : "Discussion summary, expected close…"} />
          <Button onClick={submitUpdate} disabled={saving} className={kind === "won" ? "bg-success text-success-foreground hover:bg-success/90" : ""}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">Tagged to <span className="font-mono font-semibold text-foreground/80">{canAssign ? (assignableMembers.find((m) => m.id === assignedTo)?.name ?? name ?? "selected member") : myCode}</span> · {kind === "won" ? "adds to revenue won" : "adds to open pipeline"}</p>
      </div>

      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
        <div className="flex items-center gap-2 font-medium"><Sparkles className="h-4 w-4 text-primary" /> AI summary</div>
        <p className="mt-1 text-foreground/80">
          {cust.missed > 0
            ? `${cust.missed} missed commitment${cust.missed === 1 ? "" : "s"} with this account. Schedule an escalation call.`
            : cust.won > 0
              ? `Healthy account — already converted ${fmtINR(cust.won)}. Cross-sell opportunity across ${products.length || 1} product${products.length===1?"":"s"}.`
              : `Active engagement worth ${fmtINR(cust.pipeline)} in pipeline. ${cust.competitor ? `Competing with ${cust.competitor}.` : "No known competitor."}`}
        </p>
      </div>
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Timeline</div>
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {[...own.map((c) => ({ kind: "commit" as const, when: c.created_at, c })), ...ownIntakes.map((i) => ({ kind: "intake" as const, when: i.created_at, i }))]
            .sort((a, b) => b.when.localeCompare(a.when))
            .slice(0, 30)
            .map((row, idx) => row.kind === "commit" ? (
              <div key={`c-${idx}`} className="flex items-center gap-3 rounded-lg border border-border bg-background/50 p-2.5 text-sm">
                <span className={cn("h-2 w-2 rounded-full", effectiveStatus(row.c) === "completed" ? "bg-success" : effectiveStatus(row.c) === "missed" ? "bg-destructive" : "bg-info")} />
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{row.c.title}</div><div className="truncate text-xs text-muted-foreground">Commitment · {row.c.promise_date ?? "—"}</div></div>
                <div className="text-xs font-semibold">{fmtINR(row.c.expected_revenue ?? 0)}</div>
              </div>
            ) : (
              <div key={`i-${idx}`} className="flex items-start gap-3 rounded-lg border border-border bg-background/50 p-2.5 text-sm">
                <span className="mt-1 h-2 w-2 rounded-full bg-primary" />
                <div className="min-w-0 flex-1"><div className="truncate font-medium capitalize">{row.i.source} note</div><div className="line-clamp-2 text-xs text-muted-foreground">{row.i.raw_text}</div></div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-background/50 p-2">
      <div className="text-sm font-semibold">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-background/60 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-bold">{value}</div>
    </div>
  );
}

function Meter({ label, value, icon: Icon }: { label: string; value: number; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 text-muted-foreground"><Icon className="h-3 w-3" /> {label}</span>
        <span className="font-medium">{value}%</span>
      </div>
      <Progress value={value} className="h-1.5" />
    </div>
  );
}
