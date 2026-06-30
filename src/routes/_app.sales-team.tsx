import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Trophy,
  AlertTriangle,
  Sparkles,
  Target,
  TrendingUp,
  Activity,
  CheckCircle2,
  Phone,
  Shield,
  Mail,
  KeyRound,
  CalendarClock,
  Bell,
  MessageSquare,
  Send,
} from "lucide-react";
import {
  DEFAULT_MONTHLY_TARGET_PER_REP,
  useCommitments,
  useIntakes,
  useTeamMembers,
  useNotifications,
  useChatMessages,
  useMonthlyTarget,
  aggregateReps,
  fmtINR,
  effectiveStatus,
  type RepStats,
  type Commitment,
  type IntakeRow,
  type TeamMember,
} from "@/lib/sales-data";
import { useAuth } from "@/lib/auth-context";
import { ROLE_LABELS } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { changeUserRole, listLoginUsers } from "@/lib/admin.functions";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/sales-team")({ component: SalesTeam });

const EMPTY_STATS = {
  commitments: 0,
  completed: 0,
  missed: 0,
  open: 0,
  won: 0,
  pipeline: 0,
  accuracy: 0,
  score: 0,
};

function matchesMember(c: Commitment, member: Pick<TeamMember, "id" | "name">) {
  return (
    c.assigned_to === member.id ||
    (c.salesperson ?? "").trim().toLowerCase() === member.name.toLowerCase()
  );
}

function statsForCommitments(name: string, rows: Commitment[]): RepStats {
  const stats: RepStats = { name, ...EMPTY_STATS };
  for (const c of rows) {
    stats.commitments++;
    const eff = effectiveStatus(c);
    if (c.status === "completed") {
      stats.completed++;
      stats.won += Number(c.expected_revenue ?? 0);
    } else if (eff === "missed") {
      stats.missed++;
    } else {
      stats.open++;
      stats.pipeline += Number(c.expected_revenue ?? 0);
    }
  }
  stats.accuracy = stats.commitments ? Math.round((stats.completed / stats.commitments) * 100) : 0;
  const wonScore = Math.log10(1 + stats.won) * 10;
  const pipeScore = Math.log10(1 + stats.pipeline) * 6;
  stats.score = Math.min(100, Math.round(stats.accuracy * 0.6 + wonScore + pipeScore));
  return stats;
}

function SalesTeam() {
  const { data: commitments = [] } = useCommitments();
  const { data: intakes = [] } = useIntakes();
  const { data: members = [] } = useTeamMembers();
  const { data: monthlyTargetPerRep = DEFAULT_MONTHLY_TARGET_PER_REP } = useMonthlyTarget();
  const { role, name, user } = useAuth();
  const { data: notifications = [] } = useNotifications();
  const qc = useQueryClient();
  const doChangeRole = useServerFn(changeUserRole);
  const getLoginUsers = useServerFn(listLoginUsers);
  const isMember = role === "sales_member";
  const isBH = role === "business_head";
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [activityFilter, setActivityFilter] = useState("all");
  const [open, setOpen] = useState<
    | (RepStats & {
        phone?: string;
        roleLabel?: string;
        memberId?: string;
        memberRole?: TeamMember["role"];
      })
    | null
  >(null);
  const memberNameById = useMemo(
    () => new Map(members.map((m) => [m.id, m.name] as const)),
    [members],
  );
  const ownerNameFor = useCallback(
    (c: Commitment) =>
      (
        (c.assigned_to ? memberNameById.get(c.assigned_to) : null) ??
        c.salesperson ??
        "Unassigned"
      ).trim() || "Unassigned",
    [memberNameById],
  );
  const { data: loginUsers = [] } = useQuery({
    queryKey: ["login-users", role],
    queryFn: () => getLoginUsers(),
    enabled: isBH,
  });

  const monthByRep = useMemo(() => {
    const current = new Date();
    const month = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
    const m = new Map<string, { won: number; pipeline: number }>();
    for (const c of commitments) {
      const date = c.promise_date ?? c.created_at;
      if (!date?.startsWith(month)) continue;
      const key = ownerNameFor(c);
      const row = m.get(key) ?? { won: 0, pipeline: 0 };
      if (c.status === "completed") row.won += Number(c.expected_revenue ?? 0);
      else if (effectiveStatus(c) !== "missed") row.pipeline += Number(c.expected_revenue ?? 0);
      m.set(key, row);
    }
    return m;
  }, [commitments, ownerNameFor]);
  const reps = useMemo(() => {
    if (isMember) return [statsForCommitments(name ?? "You", commitments)];
    const assignedCommitmentIds = new Set<string>();
    const rows = members
      .filter((m) => m.role === "sales_member" || m.role === "sales_head")
      .map((m) => {
        const ownRows = commitments.filter((c) => matchesMember(c, m));
        ownRows.forEach((c) => assignedCommitmentIds.add(c.id));
        return {
          ...statsForCommitments(m.name, ownRows),
          phone: m.phone,
          roleLabel: m.role ? ROLE_LABELS[m.role] : undefined,
          memberId: m.id,
          memberRole: m.role,
        };
      });
    const unmatched = aggregateReps(
      commitments.filter((c) => !assignedCommitmentIds.has(c.id)),
    ).map((r) => ({ ...r }));
    return [...rows, ...unmatched].sort((a, b) => b.score - a.score);
  }, [commitments, isMember, members, name]);
  const merged = useMemo(() => {
    if (isMember)
      return reps.map((r) => ({
        ...r,
        memberId: user?.id,
        memberRole: "sales_member" as const,
        roleLabel: ROLE_LABELS.sales_member,
      }));
    return reps;
  }, [reps, isMember, user?.id]);
  const filtered: Array<
    RepStats & {
      phone?: string;
      roleLabel?: string;
      memberId?: string;
      memberRole?: TeamMember["role"];
    }
  > = isMember
    ? merged
    : merged.filter((r) => {
        if (q && !(r.name.toLowerCase().includes(q.toLowerCase()) || (r.phone ?? "").includes(q)))
          return false;
        if (roleFilter !== "all" && r.memberRole !== roleFilter) return false;
        if (activityFilter === "active" && r.open === 0) return false;
        if (activityFilter === "missed" && r.missed === 0) return false;
        if (activityFilter === "kept" && r.completed === 0) return false;
        return true;
      });
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const dueTomorrow = commitments.filter(
    (c) => c.status !== "completed" && c.promise_date === tomorrow,
  );
  const unread = notifications.filter((n) => !n.read_at);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="gradient-text">{isMember ? "My Performance" : "Sales Team"}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {isMember
              ? `Your personal scorecard, ${name ?? ""}.`
              : "Leaderboard, scores, and coaching recommendations."}
          </p>
        </div>
        {!isMember && (
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search salesperson…"
              className="pl-8"
            />
          </div>
        )}
      </div>

      {!isMember && (
        <div className="grid gap-2 sm:grid-cols-2 lg:max-w-xl">
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="sales_head">{ROLE_LABELS.sales_head}</SelectItem>
              <SelectItem value="sales_member">{ROLE_LABELS.sales_member}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={activityFilter} onValueChange={setActivityFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Activity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All activity</SelectItem>
              <SelectItem value="active">Open tasks</SelectItem>
              <SelectItem value="missed">Missed</SelectItem>
              <SelectItem value="kept">Kept</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {isMember && user && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <MemberTaskPanel commitments={commitments} />
          <TeamChat memberId={user.id} memberName={name ?? "You"} embedded />
        </div>
      )}

      {!isMember && (unread.length > 0 || dueTomorrow.length > 0) && (
        <Card className="border-border shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4 text-primary" /> Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {dueTomorrow.slice(0, 3).map((c) => (
              <div
                key={`due-${c.id}`}
                className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm"
              >
                <div className="font-semibold">Reminder for tomorrow</div>
                <div className="text-xs text-muted-foreground">
                  {c.title} · {c.customer ?? "No customer"}
                </div>
              </div>
            ))}
            {unread.slice(0, 5).map((n) => (
              <div
                key={n.id}
                className="rounded-lg border border-border bg-background/60 p-3 text-sm"
              >
                <div className="font-semibold">{n.title}</div>
                {n.body && <div className="text-xs text-muted-foreground">{n.body}</div>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {isBH && (
        <Card className="border-border shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4 text-primary" /> Login users
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loginUsers.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No login users found.
              </p>
            ) : (
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {loginUsers.map((u) => (
                  <div
                    key={u.id}
                    className="rounded-lg border border-border bg-background/60 p-3 text-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{u.name}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {u.phone || "No phone"}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {u.email || "No email"}
                          </span>
                        </div>
                      </div>
                      {u.role && (
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          {ROLE_LABELS[u.role]}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-3 grid gap-1.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="h-3 w-3" />
                        Last login: {formatDateTime(u.lastSignInAt)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="h-3 w-3" />
                        Created: {formatDateTime(u.createdAt)}
                      </span>
                      {u.adminPassword && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-warning/30 bg-warning/10 px-2 py-1 font-mono text-[11px] text-foreground">
                          <KeyRound className="h-3 w-3 text-warning" />
                          Admin password: {u.adminPassword}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className={cn("grid gap-4", isMember ? "max-w-2xl" : "sm:grid-cols-2 xl:grid-cols-3")}>
        {filtered.length === 0 && (
          <p className="col-span-full py-12 text-center text-sm text-muted-foreground">
            {isMember
              ? "No activity yet — capture an intake to start scoring."
              : "No salespeople yet. Capture intakes to populate the team."}
          </p>
        )}
        {filtered.map((r, i) => {
          const monthStats = monthByRep.get(r.name) ?? { won: 0, pipeline: 0 };
          const targetPct = Math.min(100, Math.round((monthStats.won / monthlyTargetPerRep) * 100));
          const targetTone = targetPct >= 80 ? "success" : targetPct >= 40 ? "info" : "warning";
          const rank = i + 1;
          const rankStyles =
            rank === 1
              ? {
                  ring: "ring-2 ring-warning/50",
                  avatar: "bg-gradient-to-br from-amber-400 via-yellow-500 to-orange-500",
                  chip: "bg-warning/15 text-warning-foreground border-warning/40",
                }
              : rank === 2
                ? {
                    ring: "ring-1 ring-info/40",
                    avatar: "bg-gradient-to-br from-slate-300 via-slate-400 to-slate-500",
                    chip: "bg-info/15 text-info-foreground border-info/30",
                  }
                : rank === 3
                  ? {
                      ring: "ring-1 ring-destructive/30",
                      avatar: "bg-gradient-to-br from-orange-400 via-amber-600 to-rose-500",
                      chip: "bg-accent text-accent-foreground border-border",
                    }
                  : {
                      ring: "",
                      avatar: "bg-gradient-to-br from-primary via-info to-primary",
                      chip: "bg-secondary text-secondary-foreground border-border",
                    };
          const scoreTone =
            r.score >= 70 ? "text-success" : r.score >= 40 ? "text-warning" : "text-destructive";
          return (
            <button key={r.name} onClick={() => setOpen(r)} className="text-left">
              <Card
                className={cn(
                  "card-soft border-0 shadow-none hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden",
                  rankStyles.ring,
                )}
              >
                <div
                  className={cn(
                    "h-1.5 w-full",
                    rank === 1
                      ? "bg-gradient-to-r from-amber-400 to-orange-500"
                      : rank === 2
                        ? "bg-gradient-to-r from-slate-300 to-slate-500"
                        : rank === 3
                          ? "bg-gradient-to-r from-amber-500 to-rose-500"
                          : "bg-gradient-to-r from-primary to-info",
                  )}
                />
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg font-bold text-white shadow-md",
                        rankStyles.avatar,
                      )}
                    >
                      {r.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="truncate text-base">{r.name}</CardTitle>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                        {!isMember && rank === 1 && <Trophy className="h-3 w-3 text-warning" />}
                        <span
                          className={cn(
                            "rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                            rankStyles.chip,
                          )}
                        >
                          {isMember ? "Your scorecard" : `Rank #${rank}`}
                        </span>
                        {r.roleLabel && (
                          <span className="inline-flex items-center gap-0.5 rounded-full border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            <Shield className="h-2.5 w-2.5" />
                            {r.roleLabel}
                          </span>
                        )}
                        {r.phone && (
                          <span className="inline-flex items-center gap-0.5 text-[10px]">
                            <Phone className="h-2.5 w-2.5" />
                            {r.phone}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={cn("text-2xl font-bold tabular-nums", scoreTone)}>
                        {r.score}
                      </div>
                      <div className="text-[10px] uppercase text-muted-foreground">score</div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <Mini label="Won" value={fmtINR(r.won)} tone="success" />
                    <Mini label="Pipeline" value={fmtINR(r.pipeline)} tone="info" />
                    <Mini label="Active" value={r.open} />
                  </div>
                  <Meter
                    label="Commitment accuracy"
                    value={r.accuracy}
                    tone={
                      r.accuracy >= 70 ? "success" : r.accuracy >= 40 ? "warning" : "destructive"
                    }
                  />
                  <Meter
                    label="Pipeline health"
                    value={Math.min(100, Math.round(Math.log10(1 + r.pipeline) * 15))}
                    tone="info"
                  />
                  <Meter
                    label={`Monthly target ${fmtINR(monthStats.won)} / ${fmtINR(monthlyTargetPerRep)}`}
                    value={targetPct}
                    tone={targetTone}
                  />
                  <Meter
                    label="Follow-up score"
                    value={Math.max(0, 100 - r.missed * 10)}
                    tone={r.missed > 3 ? "destructive" : "success"}
                  />
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-[10px]">
                      {r.commitments} total
                    </Badge>
                    {monthStats.pipeline > 0 && (
                      <Badge className="bg-info/15 text-info border-info/30 text-[10px]">
                        {fmtINR(monthStats.pipeline)} month pipeline
                      </Badge>
                    )}
                    <Badge className="bg-success/15 text-success border-success/30 text-[10px]">
                      <CheckCircle2 className="mr-0.5 h-3 w-3" /> {r.completed} kept
                    </Badge>
                    {r.missed > 0 && (
                      <Badge className="bg-destructive/15 text-destructive border-destructive/30 text-[10px]">
                        <AlertTriangle className="mr-0.5 h-3 w-3" /> {r.missed} missed
                      </Badge>
                    )}
                  </div>
                  <div className="rounded-lg border border-primary/20 bg-gradient-to-r from-primary/5 to-info/5 p-2.5 text-xs flex gap-2">
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary mt-0.5" />
                    <span>{coachingFor(r)}</span>
                  </div>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{open?.name}</DialogTitle>
          </DialogHeader>
          {open && (
            <RepProfile
              rep={open}
              commitments={commitments}
              intakes={intakes}
              canManageRole={isBH && !!open.memberId}
              onRoleChange={async (newRole) => {
                if (!open.memberId) return;
                try {
                  await doChangeRole({ data: { userId: open.memberId, role: newRole } });
                  toast.success(`${open.name} is now ${ROLE_LABELS[newRole]}`);
                  qc.invalidateQueries({ queryKey: ["team-members"] });
                  setOpen(null);
                } catch (e: unknown) {
                  toast.error(e instanceof Error ? e.message : "Failed");
                }
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatDateTime(value?: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function MemberTaskPanel({ commitments }: { commitments: Commitment[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const tasks = commitments
    .filter(
      (c) =>
        c.status !== "completed" &&
        (c.promise_date === today ||
          c.promise_date === yesterday ||
          effectiveStatus(c) === "missed"),
    )
    .sort((a, b) => (a.promise_date ?? "").localeCompare(b.promise_date ?? ""))
    .slice(0, 8);
  const todayCount = tasks.filter((c) => c.promise_date === today).length;
  const yesterdayCount = tasks.filter((c) => c.promise_date === yesterday).length;

  return (
    <Card className="border-border shadow-none">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4 text-primary" /> My task reminders
          </CardTitle>
          <div className="flex gap-1.5">
            <Badge variant="secondary" className="text-[10px]">
              {todayCount} today
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {yesterdayCount} yesterday
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No pending reminders for yesterday or today.
          </p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-1">
            {tasks.map((c) => {
              const missed = c.promise_date === yesterday || effectiveStatus(c) === "missed";
              return (
                <div
                  key={c.id}
                  className={cn(
                    "rounded-lg border p-3 text-sm",
                    missed
                      ? "border-destructive/30 bg-destructive/10"
                      : "border-warning/30 bg-warning/10",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{c.title}</div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {c.customer ?? "No customer"} · {c.promise_date ?? "No date"}
                      </div>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {missed ? "Follow up" : "Today"}
                    </Badge>
                  </div>
                  {c.next_action && (
                    <div className="mt-2 line-clamp-2 text-xs text-foreground/80">
                      {c.next_action}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RepProfile({
  rep,
  commitments,
  intakes,
  canManageRole,
  onRoleChange,
}: {
  rep: RepStats & {
    phone?: string;
    roleLabel?: string;
    memberId?: string;
    memberRole?: TeamMember["role"];
  };
  commitments: Commitment[];
  intakes: IntakeRow[];
  canManageRole?: boolean;
  onRoleChange?: (role: "business_head" | "sales_head" | "sales_member") => void;
}) {
  const own = (commitments ?? []).filter(
    (c) =>
      (c.salesperson ?? "").trim() === rep.name ||
      (!!rep.memberId && c.assigned_to === rep.memberId),
  );
  const ownIntakes = (intakes ?? []).filter((i) => {
    const ext = (i.extracted ?? {}) as { salesperson?: string };
    return ext.salesperson?.trim() === rep.name;
  });
  const conv = own.length
    ? Math.round((own.filter((c) => c.status === "completed").length / own.length) * 100)
    : 0;

  // Customer breakdown
  const customerMap: Record<
    string,
    { won: number; pipeline: number; missed: number; count: number; lastTouch: string | null }
  > = {};
  for (const c of own) {
    const cust = (c.customer ?? "").trim() || "Unknown";
    customerMap[cust] ??= { won: 0, pipeline: 0, missed: 0, count: 0, lastTouch: null };
    customerMap[cust].count++;
    const eff = effectiveStatus(c);
    if (c.status === "completed") customerMap[cust].won += Number(c.expected_revenue ?? 0);
    else if (eff === "missed") customerMap[cust].missed++;
    else customerMap[cust].pipeline += Number(c.expected_revenue ?? 0);
    if (!customerMap[cust].lastTouch || c.created_at > customerMap[cust].lastTouch!)
      customerMap[cust].lastTouch = c.created_at;
  }
  const customers = Object.entries(customerMap).sort(
    (a, b) => b[1].won + b[1].pipeline - (a[1].won + a[1].pipeline),
  );

  return (
    <div className="space-y-4">
      {(rep.phone || rep.roleLabel || canManageRole) && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
          {rep.roleLabel && (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-medium text-primary">
              <Shield className="h-3 w-3" />
              {rep.roleLabel}
            </span>
          )}
          {rep.phone && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Phone className="h-3 w-3" />
              +91 {rep.phone}
            </span>
          )}
          {canManageRole && onRoleChange && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-muted-foreground">Change role:</span>
              <Select
                value={rep.memberRole ?? "sales_member"}
                onValueChange={(v) =>
                  onRoleChange(v as "business_head" | "sales_head" | "sales_member")
                }
              >
                <SelectTrigger className="h-7 w-36 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="business_head">{ROLE_LABELS.business_head}</SelectItem>
                  <SelectItem value="sales_head">{ROLE_LABELS.sales_head}</SelectItem>
                  <SelectItem value="sales_member">{ROLE_LABELS.sales_member}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={TrendingUp} label="Revenue won" value={fmtINR(rep.won)} />
        <Stat icon={Target} label="Pipeline" value={fmtINR(rep.pipeline)} />
        <Stat icon={Activity} label="Conversion" value={`${conv}%`} />
        <Stat icon={AlertTriangle} label="Missed" value={rep.missed} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 text-center">
        <Mini label="Open leads" value={rep.open} />
        <Mini label="Customers" value={customers.length} />
        <Mini label="Intakes" value={ownIntakes.length} />
        <Mini label="Accuracy" value={`${rep.accuracy}%`} />
      </div>

      <Tabs defaultValue="commitments" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="commitments">Commitments ({own.length})</TabsTrigger>
          <TabsTrigger value="customers">Customers ({customers.length})</TabsTrigger>
          <TabsTrigger value="intakes">Intakes ({ownIntakes.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="commitments" className="mt-3">
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {own.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">No commitments yet.</p>
            )}
            {own.slice(0, 50).map((c) => {
              const eff = effectiveStatus(c);
              return (
                <div
                  key={c.id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-2.5 text-sm",
                    eff === "completed"
                      ? "border-success/30 bg-success/5"
                      : eff === "missed"
                        ? "border-destructive/30 bg-destructive/5"
                        : "border-border bg-background/50",
                  )}
                >
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      eff === "completed"
                        ? "bg-success"
                        : eff === "missed"
                          ? "bg-destructive"
                          : "bg-info",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{c.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {c.customer ?? "—"} · {c.promise_date ?? "no date"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-semibold">{fmtINR(c.expected_revenue ?? 0)}</div>
                    <div className="text-[10px] uppercase text-muted-foreground">{eff}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="customers" className="mt-3">
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {customers.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">No customers yet.</p>
            )}
            {customers.map(([name, s]) => (
              <div key={name} className="rounded-lg border border-border bg-background/50 p-3">
                <div className="flex items-center justify-between text-sm">
                  <div className="font-semibold truncate">{name}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.count} commit{s.count !== 1 ? "s" : ""}
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <Mini label="Won" value={fmtINR(s.won)} tone="success" />
                  <Mini label="Pipeline" value={fmtINR(s.pipeline)} tone="info" />
                  <Mini
                    label="Missed"
                    value={s.missed}
                    tone={s.missed > 0 ? "destructive" : undefined}
                  />
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="intakes" className="mt-3">
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {ownIntakes.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">No intakes yet.</p>
            )}
            {ownIntakes.slice(0, 50).map((i, idx) => {
              const ext = (i.extracted ?? {}) as {
                customer?: string;
                summary?: string;
                expected_revenue?: number;
              };
              const num = ownIntakes.length - idx;
              return (
                <div
                  key={i.id}
                  className="flex items-start gap-3 rounded-lg border border-border bg-background/50 p-2.5 text-sm"
                >
                  <div className="flex h-8 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 font-mono text-[11px] font-bold text-primary">
                    #{num}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-semibold truncate">{ext.customer ?? "Unknown"}</span>
                      <Badge variant="secondary" className="text-[10px] uppercase">
                        {i.source}
                      </Badge>
                    </div>
                    <div className="line-clamp-2 text-xs text-muted-foreground">
                      {ext.summary ?? i.raw_text}
                    </div>
                  </div>
                  {ext.expected_revenue ? (
                    <div className="text-xs font-semibold text-success">
                      {fmtINR(Number(ext.expected_revenue))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
        <div className="flex items-center gap-2 font-medium">
          <Sparkles className="h-4 w-4 text-primary" /> AI coaching
        </div>
        <p className="mt-1 text-foreground/80">{coachingFor(rep)}</p>
      </div>

      {rep.memberId && <TeamChat memberId={rep.memberId} memberName={rep.name} />}
    </div>
  );
}

function TeamChat({
  memberId,
  memberName,
  embedded,
}: {
  memberId: string;
  memberName: string;
  embedded?: boolean;
}) {
  const { user, name, role } = useAuth();
  const qc = useQueryClient();
  const { data: messages = [] } = useChatMessages(memberId);
  const [body, setBody] = useState("");
  const canSend = !!user && !!body.trim();

  useEffect(() => {
    if (!memberId) return;
    const channel = supabase
      .channel(`sales-chat-${memberId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "sales_team_messages",
          filter: `member_id=eq.${memberId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["sales-chat", memberId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [memberId, qc]);

  async function send() {
    if (!canSend) return;
    const text = body.trim();
    setBody("");
    const { error } = await supabase
      .from("sales_team_messages")
      .insert({ member_id: memberId, sender_id: user!.id, body: text });
    if (error) {
      setBody(text);
      toast.error(error.message);
      return;
    }
    if (role !== "sales_member" && memberId !== user!.id) {
      await supabase.from("notifications").insert({
        user_id: memberId,
        kind: "chat",
        title: "New sales team message",
        body: `${name ?? "Team"}: ${text.slice(0, 80)}`,
      });
    }
    qc.invalidateQueries({ queryKey: ["sales-chat", memberId] });
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-background/60 p-3",
        embedded && "min-h-[320px]",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <MessageSquare className="h-4 w-4 text-primary" /> Team chat
        </div>
        <Badge variant="secondary" className="text-[10px]">
          {memberName}
        </Badge>
      </div>
      <div
        className={cn(
          "space-y-2 overflow-y-auto pr-1",
          embedded ? "max-h-72 min-h-48" : "max-h-56",
        )}
      >
        {messages.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">No messages yet.</p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === user?.id;
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[82%] rounded-lg border px-3 py-2 text-sm",
                  mine ? "border-primary/30 bg-primary/10" : "border-border bg-muted/40",
                )}
              >
                <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {m.sender?.name ?? (mine ? "You" : "Team")}
                </div>
                <div>{m.body}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex gap-2">
        <Input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder="Type a message..."
        />
        <Button onClick={send} disabled={!canSend} size="icon" aria-label="Send message">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function coachingFor(r: RepStats) {
  if (r.commitments === 0) return "No activity yet — onboard with their first intake.";
  if (r.accuracy >= 80 && r.won > 0)
    return `Top performer pattern. Have ${r.name} share their closing playbook in the next stand-up.`;
  if (r.missed >= 3)
    return `${r.missed} missed commitments — work on realistic dates and proactive escalation.`;
  if (r.accuracy < 50)
    return `Low commitment discipline (${r.accuracy}%). Coach on setting smaller, achievable promises.`;
  if (r.pipeline > r.won * 3 && r.won > 0)
    return "Strong pipeline build — focus on closing motion this week.";
  return "On track. Keep cadence steady and protect the active pipeline.";
}

function Mini({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "success" | "info" | "destructive";
}) {
  const toneCls =
    tone === "success"
      ? "text-success"
      : tone === "info"
        ? "text-info-foreground"
        : tone === "destructive"
          ? "text-destructive"
          : "text-foreground";
  const bgCls =
    tone === "success"
      ? "bg-success/10 border-success/20"
      : tone === "info"
        ? "bg-info/10 border-info/20"
        : tone === "destructive"
          ? "bg-destructive/10 border-destructive/20"
          : "border-border bg-background/50";
  return (
    <div className={cn("rounded-lg border p-2", bgCls)}>
      <div className={cn("text-sm font-semibold tabular-nums", toneCls)}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/60 p-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="mt-1 text-lg font-bold">{value}</div>
    </div>
  );
}

function Meter({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "destructive" | "success" | "warning" | "info";
}) {
  const barCls =
    tone === "destructive"
      ? "[&>*]:bg-destructive"
      : tone === "success"
        ? "[&>*]:bg-success"
        : tone === "warning"
          ? "[&>*]:bg-warning"
          : tone === "info"
            ? "[&>*]:bg-info"
            : "";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{value}%</span>
      </div>
      <Progress value={value} className={cn("h-1.5", barCls)} />
    </div>
  );
}
