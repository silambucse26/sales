import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import {
  ArrowUpRight,
  Target,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Users,
  Sparkles,
  FileText,
  TrendingDown,
  Wallet,
  Flame,
  BarChart3,
  PieChart as PieIcon,
  CalendarDays,
  Pencil,
  Save,
  X,
  Building2,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useCommitments,
  useIntakes,
  useTeamMembers,
  aggregateCustomers,
  type Commitment,
  type IntakeRow,
  type CustomerStats,
  effectiveStatus,
  fmtINR,
} from "@/lib/sales-data";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/")({ component: DashboardPage });

const DEFAULT_MONTHLY_TARGET_PER_REP = 5_000_000; // Rs 50 Lakhs per sales member per month
const CRORE = 10_000_000;

function useMonthlyTarget() {
  return useQuery({
    queryKey: ["app_settings", "monthly_target_per_rep"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "monthly_target_per_rep")
        .maybeSingle();
      if (error) throw error;
      const v = data?.value;
      const n =
        typeof v === "number"
          ? v
          : typeof v === "string"
            ? Number(v)
            : DEFAULT_MONTHLY_TARGET_PER_REP;
      return Number.isFinite(n) && n > 0 ? n : DEFAULT_MONTHLY_TARGET_PER_REP;
    },
  });
}

function TargetEditor({ current, canEdit }: { current: number; canEdit: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(formatCroreInput(current));
  const [saving, setSaving] = useState(false);
  if (!canEdit) return null;
  async function save() {
    const crore = Number(val);
    if (!Number.isFinite(crore) || crore <= 0) {
      toast.error("Enter a valid amount in crores");
      return;
    }
    setSaving(true);
    const rupees = Math.round(crore * CRORE);
    const { error } = await supabase.from("app_settings").upsert({
      key: "monthly_target_per_rep",
      value: rupees,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Monthly target set to ${formatCroreInput(rupees)} Cr per rep`);
    setEditing(false);
    qc.invalidateQueries({ queryKey: ["app_settings", "monthly_target_per_rep"] });
  }
  if (!editing)
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setVal(formatCroreInput(current));
          setEditing(true);
        }}
      >
        <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit target
      </Button>
    );
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1">
      <span className="text-xs text-muted-foreground">₹</span>
      <Input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className="h-7 w-20 border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
      />
      <span className="text-xs text-muted-foreground">Cr / rep / month</span>
      <Button size="sm" onClick={save} disabled={saving}>
        <Save className="h-3.5 w-3.5" />
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function formatCroreInput(value: number) {
  return Number((value / CRORE).toFixed(2)).toString();
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function weekFromNow() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}
function monthEnd() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}
function monthKey(d: Date | string) {
  const x = typeof d === "string" ? new Date(d) : d;
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-IN", { month: "short", year: "2-digit" });
}
function formatDateTime(value: string | null | undefined) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}
function downloadCsv(fileName: string, headers: string[], rows: Array<Array<unknown>>) {
  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
function commitmentMonth(c: Commitment) {
  return monthKey(c.promise_date ?? c.created_at);
}

function DashboardPage() {
  const { user, role, name } = useAuth();
  const isBH = role === "business_head";
  const isPrivileged = role === "business_head" || role === "sales_head";

  const { data: commitments = [] } = useCommitments();
  const { data: customerIntakes = [] } = useIntakes();
  const { data: members = [] } = useTeamMembers();
  const { data: monthlyTargetPerRep = DEFAULT_MONTHLY_TARGET_PER_REP } = useMonthlyTarget();
  const targetCrore = formatCroreInput(monthlyTargetPerRep);
  const memberNameById = useMemo(
    () => new Map(members.map((m) => [m.id, m.name] as const)),
    [members],
  );
  const repNameFor = useCallback(
    (c: Commitment) =>
      (
        (c.assigned_to ? memberNameById.get(c.assigned_to) : null) ??
        c.salesperson ??
        "Unassigned"
      ).trim() || "Unassigned",
    [memberNameById],
  );
  const displayCommitments = useMemo(
    () => commitments.map((c) => ({ ...c, salesperson: repNameFor(c) })),
    [commitments, repNameFor],
  );

  const { data: intakes = [] } = useQuery({
    queryKey: ["intakes-count", user?.id, role],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("intakes")
        .select("id, created_at, user_id")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const today = todayISO();
  const wk = weekFromNow();
  const me = monthEnd();
  const thisMonthKey = monthKey(new Date());

  // Calendar state
  const [calDate, setCalDate] = useState<Date | undefined>(new Date());

  const calModifiers = useMemo(() => {
    const overdue: Date[] = [],
      hasToday: Date[] = [],
      upcoming: Date[] = [],
      completed: Date[] = [];
    for (const c of displayCommitments) {
      if (!c.promise_date) continue;
      const [y, mo, d] = c.promise_date.split("-").map(Number);
      const dt = new Date(y, mo - 1, d);
      if (c.status === "completed") completed.push(dt);
      else if (effectiveStatus(c) === "missed") overdue.push(dt);
      else if (c.promise_date === today) hasToday.push(dt);
      else upcoming.push(dt);
    }
    return { overdue, hasToday, upcoming, completed };
  }, [displayCommitments, today]);

  const calDayCommitments = useMemo(() => {
    if (!calDate) return [];
    const y = calDate.getFullYear();
    const m = String(calDate.getMonth() + 1).padStart(2, "0");
    const d = String(calDate.getDate()).padStart(2, "0");
    return displayCommitments.filter((c) => c.promise_date === `${y}-${m}-${d}`);
  }, [calDate, displayCommitments]);

  // Available months (last 6 + any with data)
  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      set.add(monthKey(d));
    }
    for (const c of displayCommitments) set.add(commitmentMonth(c));
    return Array.from(set).sort().reverse();
  }, [displayCommitments]);
  const [selectedMonth, setSelectedMonth] = useState<string>(thisMonthKey);
  const [dashboardCustomer, setDashboardCustomer] = useState<CustomerStats | null>(null);

  const monthCommits = displayCommitments.filter((c) => commitmentMonth(c) === selectedMonth);
  const customers = useMemo(
    () => aggregateCustomers(displayCommitments, customerIntakes),
    [displayCommitments, customerIntakes],
  );

  // Totals (all-time, role-scoped via RLS)
  const todays = displayCommitments.filter((c) => c.promise_date === today);
  const completed = displayCommitments.filter((c) => c.status === "completed");
  const pending = displayCommitments.filter((c) => effectiveStatus(c) === "open");
  const missed = displayCommitments.filter((c) => effectiveStatus(c) === "missed");
  const total = displayCommitments.length;
  const successRate = total === 0 ? 0 : Math.round((completed.length / total) * 100);
  const totalWon = completed.reduce((s, c) => s + Number(c.expected_revenue ?? 0), 0);
  const totalPipeline = displayCommitments
    .filter((c) => c.status !== "completed" && effectiveStatus(c) !== "missed")
    .reduce((s, c) => s + Number(c.expected_revenue ?? 0), 0);

  // Monthly slices
  const monthWon = monthCommits
    .filter((c) => c.status === "completed")
    .reduce((s, c) => s + Number(c.expected_revenue ?? 0), 0);
  const monthPipeline = monthCommits
    .filter((c) => c.status !== "completed" && effectiveStatus(c) !== "missed")
    .reduce((s, c) => s + Number(c.expected_revenue ?? 0), 0);
  const monthMissed = monthCommits
    .filter((c) => effectiveStatus(c) === "missed")
    .reduce((s, c) => s + Number(c.expected_revenue ?? 0), 0);

  // Per-rep aggregation (for selected month)
  const byRepMonth: Record<
    string,
    {
      name: string;
      won: number;
      pipeline: number;
      missed: number;
      commitments: number;
      completed: number;
    }
  > = {};
  for (const c of monthCommits) {
    const key = (c.salesperson ?? "Unassigned").trim() || "Unassigned";
    byRepMonth[key] ??= { name: key, won: 0, pipeline: 0, missed: 0, commitments: 0, completed: 0 };
    byRepMonth[key].commitments++;
    if (c.status === "completed") {
      byRepMonth[key].completed++;
      byRepMonth[key].won += Number(c.expected_revenue ?? 0);
    } else if (effectiveStatus(c) === "missed")
      byRepMonth[key].missed += Number(c.expected_revenue ?? 0);
    else byRepMonth[key].pipeline += Number(c.expected_revenue ?? 0);
  }
  const monthReps = Object.values(byRepMonth).sort(
    (a, b) => b.won + b.pipeline - (a.won + a.pipeline),
  );

  // All-time per rep (for legacy charts/highlights)
  const byRep: Record<
    string,
    {
      name: string;
      won: number;
      pipeline: number;
      commitments: number;
      completed: number;
      missed: number;
    }
  > = {};
  for (const c of displayCommitments) {
    const key = (c.salesperson ?? "Unassigned").trim() || "Unassigned";
    byRep[key] ??= { name: key, won: 0, pipeline: 0, commitments: 0, completed: 0, missed: 0 };
    byRep[key].commitments++;
    if (c.status === "completed") {
      byRep[key].completed++;
      byRep[key].won += Number(c.expected_revenue ?? 0);
    } else if (effectiveStatus(c) === "missed") byRep[key].missed++;
    else byRep[key].pipeline += Number(c.expected_revenue ?? 0);
  }
  const reps = Object.values(byRep).map((r) => ({
    ...r,
    accuracy: r.commitments ? Math.round((r.completed / r.commitments) * 100) : 0,
  }));
  const topRep = [...reps].sort((a, b) => b.won - a.won)[0];
  const weakRep = [...reps]
    .filter((r) => r.commitments >= 1)
    .sort((a, b) => a.accuracy - b.accuracy)[0];

  // Monthly trend (last 6 months) — won vs pipeline
  const trend = useMemo(() => {
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      months.push(monthKey(d));
    }
    return months.map((mk) => {
      const inM = displayCommitments.filter((c) => commitmentMonth(c) === mk);
      const won = inM
        .filter((c) => c.status === "completed")
        .reduce((s, c) => s + Number(c.expected_revenue ?? 0), 0);
      const pipe = inM
        .filter((c) => c.status !== "completed" && effectiveStatus(c) !== "missed")
        .reduce((s, c) => s + Number(c.expected_revenue ?? 0), 0);
      const miss = inM
        .filter((c) => effectiveStatus(c) === "missed")
        .reduce((s, c) => s + Number(c.expected_revenue ?? 0), 0);
      return {
        name: monthLabel(mk),
        Won: Math.round(won / 100000),
        Pipeline: Math.round(pipe / 100000),
        Missed: Math.round(miss / 100000),
      };
    });
  }, [displayCommitments]);

  // Target math for selected month
  const repCount = isPrivileged ? Math.max(1, monthReps.length || reps.length || 1) : 1;
  const monthTarget = monthlyTargetPerRep * repCount;
  const targetProgress = Math.min(100, Math.round((monthWon / monthTarget) * 100));
  const gap = Math.max(0, monthTarget - monthWon);
  const forecast = monthWon + monthPipeline * 0.6;

  // Products
  const byProd: Record<string, number> = {};
  for (const c of displayCommitments) {
    const k = (c.product ?? "—").trim() || "—";
    byProd[k] = (byProd[k] ?? 0) + Number(c.expected_revenue ?? 0);
  }
  const products = Object.entries(byProd)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  const topProduct = products[0];
  const weakProduct = products[products.length - 1];

  const escal = displayCommitments.filter(
    (c) => effectiveStatus(c) === "missed" || c.risk_level === "High",
  );
  const closingWeek = displayCommitments.filter(
    (c) =>
      c.promise_date &&
      c.promise_date >= today &&
      c.promise_date <= wk &&
      c.status !== "completed" &&
      effectiveStatus(c) !== "missed",
  );
  const closingMonth = displayCommitments.filter(
    (c) =>
      c.promise_date &&
      c.promise_date >= today &&
      c.promise_date <= me &&
      c.status !== "completed" &&
      effectiveStatus(c) !== "missed",
  );
  const upcoming = displayCommitments
    .filter((c) => c.status !== "completed" && c.promise_date && c.promise_date >= today)
    .sort((a, b) => (a.promise_date ?? "").localeCompare(b.promise_date ?? ""))
    .slice(0, 6);

  function downloadDailyReport() {
    const todayIntakes = customerIntakes.filter((i) => i.created_at.slice(0, 10) === today);
    const rows = [
      ...todays.map((c) => [
        "commitment",
        c.customer ?? "",
        c.salesperson ?? "",
        c.title,
        c.product ?? "",
        c.promise_date ?? "",
        c.status,
        c.risk_level ?? "",
        Number(c.expected_revenue ?? 0),
        formatDateTime(c.created_at),
      ]),
      ...todayIntakes.map((i) => {
        const ext = (i.extracted ?? {}) as { customer?: string; salesperson?: string; product?: string; intake_code?: string; expected_revenue?: number; summary?: string };
        return [
          "intake",
          ext.customer ?? "",
          ext.salesperson ?? "",
          ext.summary ?? i.raw_text ?? "",
          ext.product ?? "",
          ext.intake_code ?? "",
          i.source,
          "",
          Number(ext.expected_revenue ?? 0),
          formatDateTime(i.created_at),
        ];
      }),
    ];
    downloadCsv(`daily-report-${today}.csv`, ["Type", "Customer", "Salesperson", "Detail", "Product", "Date or visit no", "Status or source", "Risk", "Amount INR", "Created"], rows);
  }

  function downloadMonthlyReport() {
    const monthlyIntakes = customerIntakes.filter((i) => monthKey(i.created_at) === selectedMonth);
    const rows = [
      ...monthCommits.map((c) => [
        "commitment",
        c.customer ?? "",
        c.salesperson ?? "",
        c.title,
        c.product ?? "",
        c.promise_date ?? "",
        c.status,
        c.risk_level ?? "",
        Number(c.expected_revenue ?? 0),
        formatDateTime(c.created_at),
      ]),
      ...monthlyIntakes.map((i) => {
        const ext = (i.extracted ?? {}) as { customer?: string; salesperson?: string; product?: string; intake_code?: string; expected_revenue?: number; summary?: string };
        return [
          "intake",
          ext.customer ?? "",
          ext.salesperson ?? "",
          ext.summary ?? i.raw_text ?? "",
          ext.product ?? "",
          ext.intake_code ?? "",
          i.source,
          "",
          Number(ext.expected_revenue ?? 0),
          formatDateTime(i.created_at),
        ];
      }),
    ];
    downloadCsv(`monthly-report-${selectedMonth}.csv`, ["Type", "Customer", "Salesperson", "Detail", "Product", "Date or visit no", "Status or source", "Risk", "Amount INR", "Created"], rows);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="gradient-text">Good day, {name ?? "there"}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {isBH
              ? "Business Head view — full company pulse."
              : isPrivileged
                ? "Team view — your reps and their commitments."
                : "Your execution view — focus on what closes today."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="h-7 w-[140px] border-0 bg-transparent px-1 text-sm shadow-none focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((m) => (
                  <SelectItem key={m} value={m}>
                    {monthLabel(m)}
                    {m === thisMonthKey ? " (This month)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <TargetEditor current={monthlyTargetPerRep} canEdit={isPrivileged} />
          {isPrivileged && (
            <>
              <Button variant="outline" onClick={downloadDailyReport}>
                <Download className="mr-1.5 h-4 w-4" /> Daily report
              </Button>
              <Button variant="outline" onClick={downloadMonthlyReport}>
                <Download className="mr-1.5 h-4 w-4" /> Monthly report
              </Button>
            </>
          )}
          <Button asChild variant="outline">
            <Link to="/commitments">Commitments</Link>
          </Button>
          <Button asChild>
            <Link to="/intake">
              <Sparkles className="mr-1.5 h-4 w-4" /> New intake
            </Link>
          </Button>
        </div>
      </div>

      {/* KPIs + calendar */}
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        {/* Calendar - top right */}
        <Card className="card-soft border-0 shadow-none lg:col-start-2 lg:row-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4 text-primary" /> Commitment Calendar
            </CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center pb-2">
            <Calendar
              mode="single"
              selected={calDate}
              onSelect={setCalDate}
              modifiers={calModifiers}
              modifiersClassNames={{
                overdue: "bg-destructive/20 !text-destructive font-bold rounded-full",
                hasToday: "bg-warning/30 !text-warning-foreground font-bold rounded-full",
                upcoming: "bg-success/15 !text-success font-medium rounded-full",
                completed: "bg-info/10 !text-info rounded-full",
              }}
            />
          </CardContent>
          <div className="flex flex-wrap gap-3 px-6 pb-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-destructive/50" />
              Overdue
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-warning/50" />
              Due today
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-success/50" />
              Upcoming
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-info/50" />
              Completed
            </span>
          </div>
          {calDayCommitments.length > 0 && (
            <CardContent className="border-t border-border pt-3">
              <div className="mb-2 text-xs font-semibold text-muted-foreground">
                {calDate?.toLocaleDateString("en-IN", { day: "numeric", month: "long" })}
                <Badge variant="secondary" className="ml-1.5">
                  {calDayCommitments.length}
                </Badge>
              </div>
              <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                {calDayCommitments.map((c) => (
                  <RowItem key={c.id} c={c} />
                ))}
              </div>
            </CardContent>
          )}
          {calDate && calDayCommitments.length === 0 && (
            <CardContent className="border-t border-border pt-3">
              <p className="py-2 text-center text-xs text-muted-foreground">
                No commitments on{" "}
                {calDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}.
              </p>
            </CardContent>
          )}
        </Card>

        {/* Monthly KPIs */}
        <div className="grid grid-cols-2 gap-4 lg:col-start-1 lg:row-start-1">
          <Kpi
            label={`${monthLabel(selectedMonth)} · Revenue won`}
            value={fmtINR(monthWon)}
            icon={CheckCircle2}
            tone="success"
          />
          <Kpi
            label={`${monthLabel(selectedMonth)} · Pipeline`}
            value={fmtINR(monthPipeline)}
            icon={TrendingUp}
            tone="info"
          />
          <Kpi
            label={`${monthLabel(selectedMonth)} · Missed value`}
            value={fmtINR(monthMissed)}
            icon={AlertTriangle}
            tone="warning"
          />
          <Kpi
            label="AI forecast (month)"
            value={fmtINR(forecast)}
            icon={BarChart3}
            tone="primary"
          />
        </div>

        {/* Target progress */}
        <Card className="card-soft border-0 shadow-none lg:col-start-1 lg:row-start-2">
          <CardContent className="p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Monthly target · {monthLabel(selectedMonth)}
                </div>
                <div className="mt-1 text-2xl font-bold">
                  <span
                    className={cn(
                      targetProgress >= 80
                        ? "text-success"
                        : targetProgress >= 40
                          ? "text-info"
                          : "text-destructive",
                    )}
                  >
                    {fmtINR(monthWon)}
                  </span>{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    of {fmtINR(monthTarget)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {isPrivileged
                    ? `${repCount} rep${repCount > 1 ? "s" : ""} x ${targetCrore} Cr target`
                    : `Personal target ${targetCrore} Cr this month`}{" "}
                  · Gap {fmtINR(gap)}
                </div>
              </div>
              <div className="text-right">
                <div
                  className={cn(
                    "text-3xl font-bold",
                    targetProgress >= 80
                      ? "text-success"
                      : targetProgress >= 40
                        ? "text-info"
                        : "text-destructive",
                  )}
                >
                  {targetProgress}%
                </div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  achieved
                </div>
              </div>
            </div>
            <Progress
              value={targetProgress}
              className={cn(
                "mt-3 h-2",
                targetProgress >= 80
                  ? "[&>*]:bg-success"
                  : targetProgress >= 40
                    ? "[&>*]:bg-info"
                    : "[&>*]:bg-destructive",
              )}
            />
          </CardContent>
        </Card>
      </div>

      {/* All-time totals */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Mini
          label="Total revenue (all time)"
          value={fmtINR(totalWon)}
          icon={Wallet}
          tone="success"
        />
        <Mini label="Total pipeline" value={fmtINR(totalPipeline)} icon={TrendingUp} tone="info" />
        <Mini label="Today's commitments" value={todays.length} icon={Clock} />
        <Mini label="Success rate" value={`${successRate}%`} icon={Target} tone="info" />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Mini label="Completed" value={completed.length} icon={CheckCircle2} tone="success" />
        <Mini label="Pending" value={pending.length} icon={FileText} />
        <Mini label="Missed" value={missed.length} icon={AlertTriangle} tone="destructive" />
        <Mini label="Closing this week" value={closingWeek.length} icon={Flame} />
      </div>

      {/* Monthly trend */}
      <MonthlyTrend data={trend} />

      {isPrivileged && (
        <HeadRevenueCharts reps={monthReps} monthLabel={monthLabel(selectedMonth)} />
      )}

      {isPrivileged && (
        <CustomerDashboard
          customers={customers}
          intakes={customerIntakes}
          onOpenCustomer={setDashboardCustomer}
        />
      )}

      <Dialog open={!!dashboardCustomer} onOpenChange={(v) => !v && setDashboardCustomer(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{dashboardCustomer?.name}</DialogTitle>
          </DialogHeader>
          {dashboardCustomer && (
            <DashboardCustomerPopup
              customer={dashboardCustomer}
              commitments={displayCommitments}
              intakes={customerIntakes}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Per-rep target tracker (privileged) or self card */}
      {isPrivileged ? (
        <Card className="card-soft border-0 shadow-none">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" /> Salesperson pipeline & target ·{" "}
              {monthLabel(selectedMonth)}
            </CardTitle>
            <Badge variant="secondary">
              {monthReps.length} rep{monthReps.length === 1 ? "" : "s"}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {monthReps.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No salesperson activity for this month.
              </p>
            )}
            {monthReps.length > 0 && (
              <SalesMemberMonthTable reps={monthReps} target={monthlyTargetPerRep} />
            )}
            {monthReps.map((r) => {
              const pct = Math.min(100, Math.round((r.won / monthlyTargetPerRep) * 100));
              const tone = pct >= 80 ? "success" : pct >= 40 ? "info" : "destructive";
              return (
                <div key={r.name} className="rounded-xl border border-border bg-background/50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-info text-sm font-bold text-primary-foreground">
                        {r.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-semibold">{r.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.commitments} commitments · {r.completed} kept
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className={cn(
                          "text-lg font-bold",
                          tone === "success"
                            ? "text-success"
                            : tone === "info"
                              ? "text-info"
                              : "text-destructive",
                        )}
                      >
                        {pct}%
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        of {targetCrore} Cr
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                    <RepStat label="Won" value={fmtINR(r.won)} tone="success" />
                    <RepStat label="Pipeline" value={fmtINR(r.pipeline)} tone="info" />
                    <RepStat
                      label="Missed"
                      value={fmtINR(r.missed)}
                      tone={r.missed > 0 ? "destructive" : "muted"}
                    />
                  </div>
                  <Progress
                    value={pct}
                    className={cn(
                      "mt-2 h-1.5",
                      tone === "success"
                        ? "[&>*]:bg-success"
                        : tone === "info"
                          ? "[&>*]:bg-info"
                          : "[&>*]:bg-destructive",
                    )}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : (
        <Card className="card-soft border-0 shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4 text-primary" /> My month · {monthLabel(selectedMonth)}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-3 text-center">
            <RepStat label="Revenue won" value={fmtINR(monthWon)} tone="success" />
            <RepStat label="Pipeline" value={fmtINR(monthPipeline)} tone="info" />
            <RepStat
              label="Missed value"
              value={fmtINR(monthMissed)}
              tone={monthMissed > 0 ? "destructive" : "muted"}
            />
          </CardContent>
        </Card>
      )}

      <ChartsRow
        completed={completed.length}
        pending={pending.length}
        missed={missed.length}
        reps={reps}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 card-soft border-0 shadow-none">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Upcoming commitments</CardTitle>
            <Badge variant="secondary">{upcoming.length}</Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcoming.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No upcoming commitments.
              </p>
            )}
            {upcoming.map((c) => (
              <RowItem key={c.id} c={c} />
            ))}
          </CardContent>
        </Card>

        <Card className="card-soft border-0 shadow-none">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{isPrivileged ? "Top performers" : "My highlights"}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-2">
            {isPrivileged && topRep && (
              <Highlight
                label="Top salesperson"
                name={topRep.name}
                value={fmtINR(topRep.won)}
                tone="success"
                icon={Flame}
              />
            )}
            {isPrivileged && weakRep && weakRep.name !== topRep?.name && (
              <Highlight
                label="Needs coaching"
                name={weakRep.name}
                value={`${weakRep.accuracy}% accuracy`}
                tone="warning"
                icon={TrendingDown}
              />
            )}
            {!isPrivileged && (
              <Highlight
                label="Revenue won"
                name={name ?? "You"}
                value={fmtINR(totalWon)}
                tone="success"
                icon={Flame}
              />
            )}
            {topProduct && (
              <Highlight
                label="Top product"
                name={topProduct.name}
                value={fmtINR(topProduct.value)}
                tone="info"
                icon={BarChart3}
              />
            )}
            {weakProduct && weakProduct.name !== topProduct?.name && (
              <Highlight
                label="Weak product"
                name={weakProduct.name}
                value={fmtINR(weakProduct.value)}
                tone="muted"
                icon={TrendingDown}
              />
            )}
            <Button asChild variant="ghost" size="sm" className="w-full mt-2">
              <Link to="/sales-team">
                {isPrivileged ? "View Sales Team" : "View my scorecard"}{" "}
                <ArrowUpRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="card-soft border-0 shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Needs escalation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {escal.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">All clear.</p>
            )}
            {escal.slice(0, 5).map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3"
              >
                <span className="h-2 w-2 rounded-full bg-destructive" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{c.customer ?? c.title}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {c.salesperson ?? "—"} • {c.title}
                  </div>
                </div>
                <Button asChild size="sm" variant="ghost">
                  <Link to="/commitments">
                    Resolve <ArrowUpRight className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="card-soft border-0 shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> AI suggested actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Suggestion
              text={`Review ${missed.length} missed commitment${missed.length === 1 ? "" : "s"} ${isPrivileged ? "in today's stand-up and assign owners." : "and reschedule or escalate to your Head."}`}
            />
            <Suggestion
              text={`Push closures: ${closingWeek.length} deals worth ${fmtINR(closingWeek.reduce((s, c) => s + Number(c.expected_revenue ?? 0), 0))} can close this week.`}
            />
            {isPrivileged && weakRep && (
              <Suggestion
                text={`Coach ${weakRep.name} on commitment discipline (${weakRep.accuracy}% accuracy).`}
              />
            )}
            {isPrivileged && topRep && (
              <Suggestion
                text={`Have ${topRep.name} share playbook on closing ${topProduct?.name ?? "top product"}.`}
              />
            )}
            <div className="pt-2">
              <Button asChild variant="outline" size="sm">
                <Link to="/ask-ai">
                  Ask AI anything <ArrowUpRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-muted-foreground">
              <Stat label="Intakes" value={intakes.length} />
              <Stat label="Commitments" value={total} />
              <Stat label="Active reps" value={reps.length} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function RowItem({ c }: { c: Commitment }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background/50 p-3">
      <RiskDot level={c.risk_level} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{c.title}</div>
        <div className="truncate text-xs text-muted-foreground">
          {c.customer ?? "—"} • {c.salesperson ?? "—"}
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-semibold">{fmtINR(c.expected_revenue ?? 0)}</div>
        <div className="text-xs text-muted-foreground">{c.promise_date ?? "—"}</div>
      </div>
    </div>
  );
}

function Suggestion({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-background/40 p-2.5">
      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
      <span>{text}</span>
    </div>
  );
}

function Highlight({
  label,
  name,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  name: string;
  value: string;
  tone: "success" | "warning" | "info" | "muted";
  icon: React.ComponentType<{ className?: string }>;
}) {
  const cls = {
    success: "bg-success/20 text-success",
    warning: "bg-warning/25 text-warning",
    info: "bg-info/20 text-info",
    muted: "bg-muted text-foreground/70",
  }[tone];
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background/50 p-3">
      <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", cls)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="truncate text-sm font-semibold">{name}</div>
      </div>
      <div className="text-right text-xs font-medium text-muted-foreground">{value}</div>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "primary" | "info" | "success" | "warning";
}) {
  const toneClass = {
    primary: "from-primary/20 to-primary/0 text-primary",
    info: "from-info/25 to-info/0 text-info",
    success: "from-success/25 to-success/0 text-success",
    warning: "from-warning/30 to-warning/0 text-warning",
  }[tone];
  const valCls = {
    primary: "text-primary",
    info: "text-info",
    success: "text-success",
    warning: "text-warning",
  }[tone];
  return (
    <div className="card-soft relative overflow-hidden p-5">
      <div
        className={cn(
          "pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-gradient-to-br",
          toneClass,
        )}
      />
      <div className="relative flex items-center justify-between">
        <div className="text-sm font-medium text-muted-foreground">{label}</div>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className={cn("relative mt-3 text-3xl font-bold tracking-tight", valCls)}>{value}</div>
    </div>
  );
}

function Mini({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "destructive" | "success" | "info";
}) {
  const cls =
    tone === "destructive"
      ? "bg-destructive/15 text-destructive"
      : tone === "success"
        ? "bg-success/20 text-success"
        : tone === "info"
          ? "bg-info/20 text-info"
          : "bg-muted text-foreground/70";
  const valCls =
    tone === "destructive" ? "text-destructive" : tone === "success" ? "text-success" : "";
  return (
    <div className="card-soft flex items-center gap-3 p-4">
      <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", cls)}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={cn("text-lg font-semibold", valCls)}>{value}</div>
      </div>
    </div>
  );
}

const STATUS_COLORS = {
  Kept: "oklch(0.7 0.18 155)",
  Pending: "oklch(0.7 0.14 230)",
  Missed: "oklch(0.62 0.22 25)",
} as const;

function ChartsRow({
  completed,
  pending,
  missed,
  reps,
}: {
  completed: number;
  pending: number;
  missed: number;
  reps: { name: string; won: number; pipeline: number; missed: number }[];
}) {
  const pieData = [
    { name: "Kept", value: completed, fill: STATUS_COLORS.Kept },
    { name: "Pending", value: pending, fill: STATUS_COLORS.Pending },
    { name: "Missed", value: missed, fill: STATUS_COLORS.Missed },
  ].filter((d) => d.value > 0);
  const barData = reps
    .map((r) => ({
      name: r.name.length > 10 ? r.name.slice(0, 10) + "…" : r.name,
      Won: Math.round(r.won / 1000),
      Pipeline: Math.round(r.pipeline / 1000),
      Missed: r.missed,
    }))
    .sort((a, b) => b.Won + b.Pipeline - (a.Won + a.Pipeline))
    .slice(0, 6);
  const total = completed + pending + missed;
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="card-soft border-0 shadow-none lg:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <PieIcon className="h-4 w-4 text-primary" /> Commitment health
          </CardTitle>
          <Badge variant="secondary">{total} total</Badge>
        </CardHeader>
        <CardContent>
          {total === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No commitments yet.</p>
          ) : (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={3}
                    strokeWidth={2}
                    stroke="var(--card)"
                  >
                    {pieData.map((d, i) => (
                      <Cell key={i} fill={d.fill} />
                    ))}
                  </Pie>
                  <RTooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      color: "var(--popover-foreground)",
                    }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="card-soft border-0 shadow-none lg:col-span-3">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-primary" /> Revenue by salesperson{" "}
            <span className="text-xs font-normal text-muted-foreground">(₹ thousands)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {barData.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No data yet.</p>
          ) : (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={{ stroke: "var(--border)" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={{ stroke: "var(--border)" }}
                    tickLine={false}
                  />
                  <RTooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      color: "var(--popover-foreground)",
                    }}
                    cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Won" stackId="a" fill={STATUS_COLORS.Kept} radius={[0, 0, 4, 4]} />
                  <Bar
                    dataKey="Pipeline"
                    stackId="a"
                    fill={STATUS_COLORS.Pending}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function HeadRevenueCharts({
  reps,
  monthLabel,
}: {
  reps: { name: string; won: number; pipeline: number }[];
  monthLabel: string;
}) {
  const palette = [
    "oklch(0.7 0.14 230)",
    "oklch(0.7 0.18 155)",
    "oklch(0.74 0.16 70)",
    "oklch(0.65 0.16 300)",
    "oklch(0.62 0.22 25)",
    "oklch(0.68 0.12 190)",
  ];
  const chartRows = reps
    .filter((r) => r.won > 0 || r.pipeline > 0)
    .map((r) => ({
      name: r.name.length > 12 ? `${r.name.slice(0, 12)}…` : r.name,
      fullName: r.name,
      "Revenue won": Math.round(r.won / 100000),
      Pipeline: Math.round(r.pipeline / 100000),
      pipelineRaw: r.pipeline,
    }))
    .sort((a, b) => b.Pipeline + b["Revenue won"] - (a.Pipeline + a["Revenue won"]));
  const pieData = chartRows
    .filter((r) => r.pipelineRaw > 0)
    .map((r) => ({ name: r.name, value: r.pipelineRaw }));

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="card-soft border-0 shadow-none lg:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <PieIcon className="h-4 w-4 text-primary" /> Head pipeline split
          </CardTitle>
          <Badge variant="secondary">{monthLabel}</Badge>
        </CardHeader>
        <CardContent>
          {pieData.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No active pipeline for this month.
            </p>
          ) : (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={92}
                    paddingAngle={2}
                    strokeWidth={2}
                    stroke="var(--card)"
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={palette[i % palette.length]} />
                    ))}
                  </Pie>
                  <RTooltip
                    formatter={(value) => fmtINR(Number(value))}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      color: "var(--popover-foreground)",
                    }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="card-soft border-0 shadow-none lg:col-span-3">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" /> Head revenue and pipeline{" "}
            <span className="text-xs font-normal text-muted-foreground">(₹ Lakhs)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chartRows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No revenue or pipeline activity yet.
            </p>
          ) : (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartRows} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={{ stroke: "var(--border)" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={{ stroke: "var(--border)" }}
                    tickLine={false}
                  />
                  <RTooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      color: "var(--popover-foreground)",
                    }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="Revenue won"
                    stroke="oklch(0.7 0.18 155)"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="Pipeline"
                    stroke="oklch(0.7 0.14 230)"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CustomerDashboard({
  customers,
  intakes,
  onOpenCustomer,
}: {
  customers: ReturnType<typeof aggregateCustomers>;
  intakes: IntakeRow[];
  onOpenCustomer: (customer: CustomerStats) => void;
}) {
  const topCustomers = customers.slice(0, 8);
  const totalPipeline = customers.reduce((s, c) => s + c.pipeline, 0);
  const totalWon = customers.reduce((s, c) => s + c.won, 0);
  const atRisk = customers.filter((c) => c.missed > 0).length;

  return (
    <Card className="card-soft border-0 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4 text-primary" /> Customer dashboard detail
        </CardTitle>
        <Badge variant="secondary">{customers.length} customers</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <RepStat label="Customer pipeline" value={fmtINR(totalPipeline)} tone="info" />
          <RepStat label="Revenue won" value={fmtINR(totalWon)} tone="success" />
          <RepStat
            label="At risk"
            value={String(atRisk)}
            tone={atRisk > 0 ? "destructive" : "muted"}
          />
        </div>
        {topCustomers.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No customer detail yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[720px] rounded-lg border border-border">
              <div className="grid grid-cols-[1.5fr_1fr_0.8fr_1fr_1fr_0.8fr_0.8fr] gap-3 border-b border-border bg-muted/30 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <div>Customer</div>
                <div>Sales member</div>
                <div className="text-right">Visit no</div>
                <div className="text-right">Pipeline</div>
                <div className="text-right">Revenue won</div>
                <div className="text-right">Relation</div>
                <div className="text-right">Buy prob.</div>
              </div>
              {topCustomers.map((c) => {
                const latest = latestCustomerIntake(c.name, intakes);
                const latestCode = ((latest?.extracted ?? {}) as { intake_code?: string }).intake_code ?? "—";
                return (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => onOpenCustomer(c)}
                  className="grid w-full grid-cols-[1.5fr_1fr_0.8fr_1fr_1fr_0.8fr_0.8fr] gap-3 border-b border-border/70 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/25"
                >
                  <div className="truncate font-medium">{c.name}</div>
                  <div className="truncate text-muted-foreground">{c.rep ?? "Unassigned"}</div>
                  <div className="text-right font-mono text-xs text-primary">{latestCode}</div>
                  <div className="text-right font-semibold text-info">{fmtINR(c.pipeline)}</div>
                  <div className="text-right font-semibold text-success">{fmtINR(c.won)}</div>
                  <div className="text-right">{c.relationship}%</div>
                  <div className="text-right">{c.buyingProb}%</div>
                </button>
              )})}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function latestCustomerIntake(customerName: string, intakes: IntakeRow[]) {
  return intakes
    .filter((i) => {
      const ext = (i.extracted ?? {}) as { customer?: string };
      return ext.customer?.trim() === customerName;
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}

function DashboardCustomerPopup({
  customer,
  commitments,
  intakes,
}: {
  customer: CustomerStats;
  commitments: Commitment[];
  intakes: IntakeRow[];
}) {
  const ownCommitments = commitments.filter((c) => (c.customer ?? "").trim() === customer.name);
  const ownIntakes = intakes.filter((i) => {
    const ext = (i.extracted ?? {}) as { customer?: string };
    return ext.customer?.trim() === customer.name;
  });
  const latest = latestCustomerIntake(customer.name, intakes);
  const latestExt = (latest?.extracted ?? {}) as { intake_code?: string; summary?: string };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <RepStat label="Visit no" value={latestExt.intake_code ?? (ownIntakes.length ? `#${ownIntakes.length}` : "—")} tone="info" />
        <RepStat label="Visits" value={String(ownIntakes.length)} tone="muted" />
        <RepStat label="Pipeline" value={fmtINR(customer.pipeline)} tone="info" />
        <RepStat label="Won" value={fmtINR(customer.won)} tone="success" />
      </div>
      <div className="rounded-lg border border-border bg-background/50 p-3 text-sm">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Latest intake</div>
        <div className="font-medium">{latest ? formatDateTime(latest.created_at) : "No intake captured"}</div>
        <p className="mt-1 line-clamp-3 text-muted-foreground">{latestExt.summary ?? latest?.raw_text ?? "—"}</p>
      </div>
      <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
        {[...ownCommitments.map((c) => ({ type: "commitment" as const, when: c.created_at, c })), ...ownIntakes.map((i) => ({ type: "intake" as const, when: i.created_at, i }))]
          .sort((a, b) => b.when.localeCompare(a.when))
          .slice(0, 12)
          .map((row, idx) => row.type === "commitment" ? (
            <div key={`dc-${idx}`} className="flex items-center gap-3 rounded-lg border border-border bg-background/50 p-2.5 text-sm">
              <RiskDot level={row.c.risk_level} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{row.c.title}</div>
                <div className="truncate text-xs text-muted-foreground">{row.c.promise_date ?? "—"} · {row.c.salesperson ?? "—"}</div>
              </div>
              <div className="text-xs font-semibold">{fmtINR(row.c.expected_revenue ?? 0)}</div>
            </div>
          ) : (
            <div key={`di-${idx}`} className="flex items-center gap-3 rounded-lg border border-border bg-background/50 p-2.5 text-sm">
              <span className="h-2.5 w-2.5 rounded-full bg-primary" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{((row.i.extracted ?? {}) as { intake_code?: string }).intake_code ?? "Intake"}</div>
                <div className="truncate text-xs text-muted-foreground">{formatDateTime(row.i.created_at)}</div>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

function SalesMemberMonthTable({
  reps,
  target,
}: {
  reps: {
    name: string;
    won: number;
    pipeline: number;
    missed: number;
    commitments: number;
    completed: number;
  }[];
  target: number;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <div className="min-w-[620px]">
        <div className="grid grid-cols-[1.4fr_1fr_1fr_0.8fr_0.8fr] gap-3 border-b border-border bg-muted/30 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <div>Sales member</div>
          <div className="text-right">Pipeline value</div>
          <div className="text-right">Revenue won</div>
          <div className="text-right">Target</div>
          <div className="text-right">Achieved</div>
        </div>
        {reps.map((r) => {
          const pct = Math.min(100, Math.round((r.won / target) * 100));
          return (
            <div
              key={r.name}
              className="grid grid-cols-[1.4fr_1fr_1fr_0.8fr_0.8fr] gap-3 border-b border-border/70 px-3 py-2 text-sm last:border-b-0"
            >
              <div className="truncate font-medium">{r.name}</div>
              <div className="text-right font-semibold text-info">{fmtINR(r.pipeline)}</div>
              <div className="text-right font-semibold text-success">{fmtINR(r.won)}</div>
              <div className="text-right text-muted-foreground">{fmtINR(target)}</div>
              <div
                className={cn(
                  "text-right font-semibold",
                  pct >= 80 ? "text-success" : pct >= 40 ? "text-info" : "text-destructive",
                )}
              >
                {pct}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-background/50 p-2">
      <div className="text-base font-bold">{value}</div>
      <div className="text-[10px] uppercase tracking-wider">{label}</div>
    </div>
  );
}

function RiskDot({ level }: { level: string | null }) {
  const color =
    level === "High" ? "bg-destructive" : level === "Medium" ? "bg-warning" : "bg-success";
  return <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", color)} />;
}

function RepStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "info" | "destructive" | "muted";
}) {
  const cls = {
    success: "text-success",
    info: "text-info",
    destructive: "text-destructive",
    muted: "text-foreground/70",
  }[tone];
  return (
    <div className="rounded-lg border border-border bg-card/60 p-2">
      <div className={cn("text-sm font-bold", cls)}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function MonthlyTrend({
  data,
}: {
  data: { name: string; Won: number; Pipeline: number; Missed: number }[];
}) {
  const hasData = data.some((d) => d.Won + d.Pipeline + d.Missed > 0);
  return (
    <Card className="card-soft border-0 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4 text-primary" /> Monthly trend{" "}
          <span className="text-xs font-normal text-muted-foreground">
            (₹ Lakhs · last 6 months)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No data yet — capture intakes to populate monthly trend.
          </p>
        ) : (
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={{ stroke: "var(--border)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={{ stroke: "var(--border)" }}
                  tickLine={false}
                />
                <RTooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    color: "var(--popover-foreground)",
                  }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="Won"
                  stroke="oklch(0.7 0.18 155)"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="Pipeline"
                  stroke="oklch(0.7 0.14 230)"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="Missed"
                  stroke="oklch(0.62 0.22 25)"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
