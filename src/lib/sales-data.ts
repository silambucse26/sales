import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { salesCode } from "@/lib/auth";

export const DEFAULT_MONTHLY_TARGET_PER_REP = 5_000_000; // Rs 50 Lakhs per sales member per month

export type Commitment = {
  id: string;
  user_id: string;
  assigned_to: string | null;
  intake_id: string | null;
  title: string;
  customer: string | null;
  salesperson: string | null;
  product: string | null;
  expected_revenue: number | null;
  promise_date: string | null;
  status: "open" | "completed" | "missed" | "delayed";
  risk_level: string | null;
  remarks: string | null;
  next_action: string | null;
  missed_reason: string | null;
  ai_note: string | null;
  created_at: string;
};

export type IntakeRow = {
  id: string;
  user_id: string;
  source: string;
  raw_text: string | null;
  file_name: string | null;
  extracted: unknown;
  created_at: string;
};

export type ProfileRow = { id: string; name: string; phone: string };
export type NotificationRow = {
  id: string;
  user_id: string;
  commitment_id: string | null;
  title: string;
  body: string | null;
  kind: "assignment" | "reminder" | "chat";
  read_at: string | null;
  created_at: string;
};
export type ChatMessage = {
  id: string;
  member_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender?: ProfileRow | null;
};

export function todayISO() { return new Date().toISOString().slice(0, 10); }

export function effectiveStatus(c: Commitment): Commitment["status"] {
  if (c.status === "open" && c.promise_date && c.promise_date < todayISO()) return "missed";
  return c.status;
}

export function fmtINR(n: number) {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
}

export function useMonthlyTarget() {
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
      const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : DEFAULT_MONTHLY_TARGET_PER_REP;
      return Number.isFinite(n) && n > 0 ? n : DEFAULT_MONTHLY_TARGET_PER_REP;
    },
  });
}

export function useCommitments() {
  const { user, role, name, phone } = useAuth();
  return useQuery({
    queryKey: ["commitments", user?.id, role, name, phone],
    queryFn: async () => {
      let query = supabase
        .from("commitments")
        .select("*")
        .order("promise_date", { ascending: true, nullsFirst: false });
      if (role === "sales_member") {
        const code = salesCode(name, phone);
        const clauses = [`user_id.eq.${user!.id}`, `assigned_to.eq.${user!.id}`, `salesperson.eq.${code}`];
        if (name) clauses.push(`salesperson.eq.${name}`);
        query = query.or(clauses.join(","));
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Commitment[];
    },
    enabled: !!user,
  });
}

export function useIntakes() {
  const { user, role, name, phone } = useAuth();
  return useQuery({
    queryKey: ["intakes", user?.id, role, name, phone],
    queryFn: async () => {
      let query = supabase
        .from("intakes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (role === "sales_member") {
        const code = salesCode(name, phone);
        const clauses = [`user_id.eq.${user!.id}`, `extracted->>salesperson.eq.${code}`];
        if (name) clauses.push(`extracted->>salesperson.eq.${name}`);
        query = query.or(clauses.join(","));
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as IntakeRow[];
    },
    enabled: !!user,
  });
}

export function useProfiles() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["profiles-all", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id,name,phone");
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
    enabled: !!user,
  });
}

export type TeamMember = { id: string; name: string; phone: string; role: "business_head" | "sales_head" | "sales_member" | null };

export function useTeamMembers() {
  const { user, role } = useAuth();
  return useQuery({
    queryKey: ["team-members", user?.id, role],
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id,name,phone"),
        supabase.from("user_roles").select("user_id,role"),
      ]);
      const roleMap = new Map<string, TeamMember["role"]>();
      for (const r of roles ?? []) roleMap.set(r.user_id, r.role as TeamMember["role"]);
      return (profiles ?? []).map((p) => ({ id: p.id, name: p.name, phone: p.phone, role: roleMap.get(p.id) ?? null })) as TeamMember[];
    },
    enabled: !!user && role !== "sales_member",
  });
}

export function useNotifications() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
    enabled: !!user,
  });
}

export function useChatMessages(memberId?: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["sales-chat", memberId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_team_messages")
        .select("*,sender:profiles(id,name,phone)")
        .eq("member_id", memberId!)
        .order("created_at", { ascending: true })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as ChatMessage[];
    },
    enabled: !!user && !!memberId,
  });
}

// Aggregate commitments per salesperson string
export type RepStats = {
  name: string;
  commitments: number;
  completed: number;
  missed: number;
  open: number;
  won: number;
  pipeline: number;
  accuracy: number; // %
  score: number; // 0-100
};

export function aggregateReps(commitments: Commitment[]): RepStats[] {
  const m: Record<string, RepStats> = {};
  for (const c of commitments) {
    const name = (c.salesperson ?? "Unassigned").trim() || "Unassigned";
    m[name] ??= { name, commitments: 0, completed: 0, missed: 0, open: 0, won: 0, pipeline: 0, accuracy: 0, score: 0 };
    m[name].commitments++;
    const eff = effectiveStatus(c);
    if (c.status === "completed") { m[name].completed++; m[name].won += Number(c.expected_revenue ?? 0); }
    else if (eff === "missed") m[name].missed++;
    else { m[name].open++; m[name].pipeline += Number(c.expected_revenue ?? 0); }
  }
  return Object.values(m).map((r) => {
    r.accuracy = r.commitments ? Math.round((r.completed / r.commitments) * 100) : 0;
    const wonScore = Math.log10(1 + r.won) * 10;
    const pipeScore = Math.log10(1 + r.pipeline) * 6;
    r.score = Math.min(100, Math.round(r.accuracy * 0.6 + wonScore + pipeScore));
    return r;
  }).sort((a, b) => b.score - a.score);
}

export type CustomerStats = {
  name: string;
  commitments: number;
  open: number;
  missed: number;
  pipeline: number;
  won: number;
  lastTouch: string | null;
  competitor: string | null;
  relationship: number; // 0-100
  buyingProb: number;   // 0-100
  rep: string | null;
};

export function aggregateCustomers(commitments: Commitment[], intakes: IntakeRow[]): CustomerStats[] {
  const m: Record<string, CustomerStats> = {};
  for (const c of commitments) {
    const name = (c.customer ?? "").trim();
    if (!name) continue;
    m[name] ??= { name, commitments: 0, open: 0, missed: 0, pipeline: 0, won: 0, lastTouch: null, competitor: null, relationship: 60, buyingProb: 50, rep: null };
    m[name].commitments++;
    m[name].rep = m[name].rep ?? c.salesperson;
    const eff = effectiveStatus(c);
    if (c.status === "completed") m[name].won += Number(c.expected_revenue ?? 0);
    else if (eff === "missed") { m[name].missed++; m[name].relationship -= 5; }
    else { m[name].open++; m[name].pipeline += Number(c.expected_revenue ?? 0); }
    if (!m[name].lastTouch || (c.created_at && c.created_at > m[name].lastTouch!)) m[name].lastTouch = c.created_at;
  }
  for (const i of intakes) {
    const ext = (i.extracted ?? {}) as { customer?: string | null; competitor?: string | null; sentiment?: string | null };
    const name = ext.customer?.trim();
    if (!name) continue;
    m[name] ??= { name, commitments: 0, open: 0, missed: 0, pipeline: 0, won: 0, lastTouch: i.created_at, competitor: null, relationship: 60, buyingProb: 50, rep: null };
    if (ext.competitor) m[name].competitor = ext.competitor;
    if (ext.sentiment === "Positive") m[name].relationship += 3;
    if (ext.sentiment === "Negative") m[name].relationship -= 4;
    if (!m[name].lastTouch || i.created_at > m[name].lastTouch!) m[name].lastTouch = i.created_at;
  }
  return Object.values(m).map((c) => {
    c.relationship = Math.max(0, Math.min(100, c.relationship));
    const winRatio = c.commitments ? c.won > 0 ? 70 : 40 : 30;
    c.buyingProb = Math.max(5, Math.min(95, Math.round(winRatio + (c.open - c.missed) * 4)));
    return c;
  }).sort((a, b) => (b.pipeline + b.won) - (a.pipeline + a.won));
}
