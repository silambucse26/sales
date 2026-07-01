import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, CheckCircle2, Clock, AlertTriangle, Search, XCircle, Sparkles, CalendarDays, User, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createCommitment, updateCommitmentStatus, deleteCommitment } from "@/lib/commitments.functions";
import { useCommitments, effectiveStatus, fmtINR, type Commitment } from "@/lib/sales-data";
import { useTeamMembers } from "@/lib/sales-data";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_app/commitments")({ component: CommitmentsPage });

function CommitmentsPage() {
  const qc = useQueryClient();
  const update = useServerFn(updateCommitmentStatus);
  const create = useServerFn(createCommitment);
  const remove = useServerFn(deleteCommitment);
  const [filter, setFilter] = useState<"all" | "open" | "today" | "missed" | "completed" | "overdue">("all");
  const [search, setSearch] = useState("");
  const [salespersonFilter, setSalespersonFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [missedDialog, setMissedDialog] = useState<{ id: string; title: string } | null>(null);
  const [missedReason, setMissedReason] = useState("");
  const [detail, setDetail] = useState<Commitment | null>(null);
  const { role } = useAuth();
  const isBH = role === "business_head";

  const { data: rows = [], isLoading } = useCommitments();
  const today = new Date().toISOString().slice(0, 10);
  const salespersonOptions = useMemo(() => {
    return Array.from(new Set(rows.map((r) => (r.salesperson ?? "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const eff = effectiveStatus(r);
      if (filter === "today" && r.promise_date !== today) return false;
      if (filter === "overdue" && !(r.status === "open" && r.promise_date && r.promise_date < today)) return false;
      if (filter !== "all" && filter !== "today" && filter !== "overdue" && eff !== filter) return false;
      if (salespersonFilter !== "all" && (r.salesperson ?? "").trim() !== salespersonFilter) return false;
      if (dateFilter && r.promise_date !== dateFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!(r.title.toLowerCase().includes(q) || (r.customer ?? "").toLowerCase().includes(q) || (r.salesperson ?? "").toLowerCase().includes(q) || (r.product ?? "").toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [rows, filter, salespersonFilter, dateFilter, search, today]);

  async function markKept(c: Commitment) {
    try { await update({ data: { id: c.id, status: "completed" } }); toast.success(`Kept: ${c.title}`); qc.invalidateQueries({ queryKey: ["commitments"] }); }
    catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }
  function openMissed(c: Commitment) { setMissedReason(""); setMissedDialog({ id: c.id, title: c.title }); }
  async function confirmMissed() {
    if (!missedDialog) return;
    try {
      await update({ data: { id: missedDialog.id, status: "missed", missed_reason: missedReason.trim() || "—" } });
      toast.success("Marked as missed");
      qc.invalidateQueries({ queryKey: ["commitments"] });
      setMissedDialog(null);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  async function deleteOne(c: Commitment) {
    if (!confirm(`Delete commitment "${c.title}"?`)) return;
    try {
      await remove({ data: { id: c.id } });
      toast.success("Commitment deleted");
      qc.invalidateQueries({ queryKey: ["commitments"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      setDetail(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight"><span className="gradient-text">Commitments</span></h1>
          <p className="text-sm text-muted-foreground">Every promise tracked. Red means overdue. Mark Kept or Missed.</p>
        </div>
        <NewCommitmentDialog onCreate={async (v) => { await create({ data: v }); qc.invalidateQueries({ queryKey: ["commitments"] }); }} />
      </div>

      <Card className="card-soft border-0 shadow-none">
        <CardHeader className="flex flex-col gap-3">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <TabsList>
              <TabsTrigger value="all">All <Badge variant="secondary" className="ml-1.5">{rows.length}</Badge></TabsTrigger>
              <TabsTrigger value="today">Today</TabsTrigger>
              <TabsTrigger value="open">Open</TabsTrigger>
              <TabsTrigger value="overdue">Overdue</TabsTrigger>
              <TabsTrigger value="missed">Missed</TabsTrigger>
              <TabsTrigger value="completed">Kept</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_220px_180px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, customer, rep..." className="pl-8" />
            </div>
            <div className="relative">
              <User className="pointer-events-none absolute left-2.5 top-2.5 z-10 h-4 w-4 text-muted-foreground" />
              <Select value={salespersonFilter} onValueChange={setSalespersonFilter}>
                <SelectTrigger className="pl-8"><SelectValue placeholder="Salesperson" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All salespeople</SelectItem>
                  {salespersonOptions.map((person) => <SelectItem key={person} value={person}>{person}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="pl-8" />
            </div>
            {(search || salespersonFilter !== "all" || dateFilter) && (
              <Button variant="outline" onClick={() => { setSearch(""); setSalespersonFilter("all"); setDateFilter(""); }}>
                <XCircle className="h-4 w-4" /> Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && filtered.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No commitments here.</p>}
          <div className="space-y-2">
            {filtered.map((r) => {
              const eff = effectiveStatus(r);
              const overdue = r.status === "open" && r.promise_date && r.promise_date < today;
              return (
                <div
                  key={r.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setDetail(r)}
                  onKeyDown={(e) => { if (e.key === "Enter") setDetail(r); }}
                  className={cn(
                    "group relative flex flex-col gap-3 rounded-2xl border-l-4 border-y border-r p-4 cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5 sm:flex-row sm:items-center",
                    eff === "missed"
                      ? "border-l-destructive border-destructive/30 bg-gradient-to-r from-destructive/10 via-destructive/5 to-transparent"
                      : eff === "completed"
                        ? "border-l-success border-success/30 bg-gradient-to-r from-success/15 via-success/5 to-transparent"
                        : overdue
                          ? "border-l-destructive border-destructive/30 bg-gradient-to-r from-destructive/10 to-transparent"
                          : "border-l-info border-border bg-gradient-to-r from-info/5 to-transparent",
                  )}>
                  <RiskDot level={r.risk_level} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate text-sm font-semibold group-hover:text-primary transition-colors">{r.title}</div>
                      <StatusBadge status={overdue ? "overdue" : eff === "completed" ? "kept" : eff} />
                      {r.risk_level && <Badge variant="outline" className="text-xs">{r.risk_level} risk</Badge>}
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/80">{r.customer ?? "—"}</span> · {r.salesperson ?? "—"} · {r.product ?? "—"} {r.promise_date && <>· Due <span className={cn(overdue && "text-destructive font-medium")}>{r.promise_date}</span></>}
                    </div>
                    {r.ai_note && (
                      <div className="mt-1.5 flex items-start gap-1.5 text-[11px] text-muted-foreground">
                        <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" /><span>{r.ai_note}</span>
                      </div>
                    )}
                    {r.missed_reason && <div className="mt-1 text-[11px] text-destructive">Reason: {r.missed_reason}</div>}
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:w-28">
                    <div className={cn("text-base font-bold tabular-nums", eff === "completed" ? "text-success" : eff === "missed" ? "text-destructive" : "text-foreground")}>{fmtINR(r.expected_revenue ?? 0)}</div>
                  </div>
                  <div className="flex gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      className={cn(eff === "completed" ? "bg-success text-success-foreground hover:bg-success/90 shadow-md shadow-success/30" : "bg-success/10 text-success hover:bg-success/20 border border-success/30")}
                      variant="ghost"
                      onClick={() => markKept(r)}
                      disabled={eff === "completed"}
                    >
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Kept
                    </Button>
                    <Button
                      size="sm"
                      className={cn(eff === "missed" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-md shadow-destructive/30" : "bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/30")}
                      variant="ghost"
                      onClick={() => openMissed(r)}
                      disabled={eff === "missed"}
                    >
                      <XCircle className="mr-1 h-3.5 w-3.5" /> Missed
                    </Button>
                    {isBH && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/30"
                        onClick={() => deleteOne(r)}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!missedDialog} onOpenChange={(o) => !o && setMissedDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Why was it missed?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{missedDialog?.title}</p>
          <Textarea autoFocus rows={4} value={missedReason} onChange={(e) => setMissedReason(e.target.value)} placeholder="Customer postponed PO to next quarter…" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMissedDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmMissed}>Confirm missed</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-xl">
          {detail && <CommitmentDetail c={detail} canDelete={isBH} onDelete={() => deleteOne(detail)} onKept={async () => { await markKept(detail); setDetail(null); }} onMissed={() => { setDetail(null); openMissed(detail); }} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CommitmentDetail({ c, canDelete, onKept, onMissed, onDelete }: { c: Commitment; canDelete?: boolean; onKept: () => void; onMissed: () => void; onDelete?: () => void }) {
  const eff = effectiveStatus(c);
  const overdue = c.status === "open" && c.promise_date && c.promise_date < new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle className="text-xl pr-8">{c.title}</DialogTitle>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <StatusBadge status={overdue ? "overdue" : eff === "completed" ? "kept" : eff} />
          {c.risk_level && <Badge variant="outline">{c.risk_level} risk</Badge>}
          <span className="text-xs text-muted-foreground">Created {new Date(c.created_at).toLocaleDateString()}</span>
        </div>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <DetailField label="Customer" value={c.customer ?? "—"} />
        <DetailField label="Salesperson" value={c.salesperson ?? "—"} />
        <DetailField label="Product" value={c.product ?? "—"} />
        <DetailField label="Expected revenue" value={fmtINR(c.expected_revenue ?? 0)} highlight />
        <DetailField label="Promise date" value={c.promise_date ?? "—"} tone={overdue ? "destructive" : undefined} />
        <DetailField label="Status" value={(overdue ? "Overdue" : eff).toUpperCase()} />
      </div>
      {c.next_action && (
        <div className="rounded-xl border border-info/30 bg-info/5 p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Next action</div>
          <div className="text-sm">{c.next_action}</div>
        </div>
      )}
      {c.remarks && (
        <div className="rounded-xl border border-border bg-background/50 p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Remarks</div>
          <div className="text-sm">{c.remarks}</div>
        </div>
      )}
      {c.missed_reason && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
          <div className="text-[10px] uppercase tracking-wider text-destructive mb-1">Missed reason</div>
          <div className="text-sm text-destructive">{c.missed_reason}</div>
        </div>
      )}
      {c.ai_note && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-primary mb-1"><Sparkles className="h-3 w-3" /> AI coaching</div>
          <div className="text-sm">{c.ai_note}</div>
        </div>
      )}
      <DialogFooter>
        {canDelete && <Button variant="destructive" onClick={onDelete}><Trash2 className="mr-1 h-4 w-4" /> Delete</Button>}
        <Button variant="outline" onClick={onMissed} disabled={eff === "missed"}><XCircle className="mr-1 h-4 w-4" /> Mark missed</Button>
        <Button onClick={onKept} disabled={eff === "completed"}><CheckCircle2 className="mr-1 h-4 w-4" /> Mark kept</Button>
      </DialogFooter>
    </div>
  );
}

function DetailField({ label, value, highlight, tone }: { label: string; value: string; highlight?: boolean; tone?: "destructive" }) {
  return (
    <div className="rounded-xl border border-border bg-background/50 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-sm font-semibold truncate", highlight && "text-primary text-base", tone === "destructive" && "text-destructive")}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
    kept: { cls: "bg-success/15 text-success-foreground border-success/30", icon: <CheckCircle2 className="h-3 w-3" />, label: "Kept" },
    open: { cls: "bg-info/15 text-info-foreground border-info/30", icon: <Clock className="h-3 w-3" />, label: "Open" },
    delayed: { cls: "bg-warning/20 text-warning-foreground border-warning/30", icon: <Clock className="h-3 w-3" />, label: "Delayed" },
    missed: { cls: "bg-destructive/15 text-destructive border-destructive/30", icon: <AlertTriangle className="h-3 w-3" />, label: "Missed" },
    overdue: { cls: "bg-destructive/15 text-destructive border-destructive/30 animate-pulse", icon: <AlertTriangle className="h-3 w-3" />, label: "Overdue" },
  };
  const v = map[status] ?? map.open;
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", v.cls)}>{v.icon}{v.label}</span>;
}

function RiskDot({ level }: { level: string | null }) {
  const color = level === "High" ? "bg-destructive" : level === "Medium" ? "bg-warning" : "bg-success";
  return <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", color)} />;
}

function NewCommitmentDialog({ onCreate }: { onCreate: (v: {
  title: string; customer?: string; product?: string; salesperson?: string;
  expected_revenue: number; promise_date?: string; next_action?: string; risk_level?: string;
  assigned_to?: string;
}) => Promise<void> }) {
  const { user, role, name } = useAuth();
  const { data: members = [] } = useTeamMembers();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(""); const [customer, setCustomer] = useState("");
  const [salesperson, setSalesperson] = useState(""); const [product, setProduct] = useState("");
  const [revenue, setRevenue] = useState(""); const [date, setDate] = useState("");
  const [risk, setRisk] = useState("Medium"); const [next, setNext] = useState("");
  const [assignedTo, setAssignedTo] = useState(user?.id ?? "");
  const [busy, setBusy] = useState(false);
  const canAssignTeam = role === "business_head" || role === "sales_head";
  const assigneeOptions = canAssignTeam ? members.filter((m) => m.role !== "business_head") : [];
  async function save() {
    if (!title.trim()) { toast.error("Title required"); return; }
    setBusy(true);
    try {
      const assignee = assigneeOptions.find((m) => m.id === assignedTo);
      await onCreate({
        title: title.trim(),
        customer: customer || undefined,
        product: product || undefined,
        salesperson: assignee?.name || salesperson || name || undefined,
        assigned_to: assignedTo || user?.id,
        expected_revenue: Number(revenue) || 0,
        promise_date: date || undefined,
        next_action: next || undefined,
        risk_level: risk,
      });
      toast.success("Commitment added");
      setOpen(false); setTitle(""); setCustomer(""); setSalesperson(""); setProduct(""); setRevenue(""); setDate(""); setNext(""); setAssignedTo(user?.id ?? "");
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="mr-1.5 h-4 w-4" /> New commitment</Button></DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Add commitment</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Customer to release PO" /></div>
          <div><Label>Customer</Label><Input value={customer} onChange={(e) => setCustomer(e.target.value)} /></div>
          {canAssignTeam ? (
            <div><Label>Assign to</Label>
              <Select value={assignedTo || user?.id || ""} onValueChange={setAssignedTo}>
                <SelectTrigger><SelectValue placeholder="Sales member" /></SelectTrigger>
                <SelectContent>
                  {user && <SelectItem value={user.id}>Me</SelectItem>}
                  {assigneeOptions.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}{m.phone ? ` (${m.phone})` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div><Label>Salesperson</Label><Input value={name ?? salesperson} onChange={(e) => setSalesperson(e.target.value)} disabled={!!name} /></div>
          )}
          <div><Label>Product</Label><Input value={product} onChange={(e) => setProduct(e.target.value)} /></div>
          <div><Label>Expected revenue (₹)</Label><Input type="number" value={revenue} onChange={(e) => setRevenue(e.target.value)} /></div>
          <div><Label>Promise date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><Label>Risk</Label>
            <Select value={risk} onValueChange={setRisk}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="Low">Low</SelectItem><SelectItem value="Medium">Medium</SelectItem><SelectItem value="High">High</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><Label>Next action</Label><Textarea rows={2} value={next} onChange={(e) => setNext(e.target.value)} /></div>
        </div>
        <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={busy}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
