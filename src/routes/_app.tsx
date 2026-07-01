import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, FileText, CheckSquare, LogOut, Sparkles, Menu, Swords, Users, Building2, Activity, MessageSquareText, Sun, Moon, Bell, Clock, AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { signOut } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ensureAdminRole } from "@/lib/admin.functions";
import { effectiveStatus, fmtINR, useCommitments, useNotifications, type Commitment } from "@/lib/sales-data";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_app")({ component: AppShell });

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/war-room", label: "War Room", icon: Swords },
  { to: "/intake", label: "Intake", icon: FileText },
  { to: "/commitments", label: "Commitments", icon: CheckSquare },
  { to: "/sales-team", label: "Sales Team", icon: Users },
  { to: "/customers", label: "Customers", icon: Building2 },
  { to: "/ceo-pulse", label: "CEO Pulse", icon: Activity },
  { to: "/ask-ai", label: "Ask AI", icon: MessageSquareText },
];

function AppShell() {
  const { user, loading, role, name, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();

  async function confirmSignOut() {
    if (!confirm("Are you sure you want to sign out?")) return;
    await signOut();
    navigate({ to: "/auth", replace: true });
  }

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { redirect: location.pathname }, replace: true });
  }, [user, loading, navigate, location.pathname]);

  // Auto-promote to business_head if this user's phone matches ADMIN_PHONE env var
  useEffect(() => {
    if (user && role !== "business_head") {
      ensureAdminRole().then((r) => { if (r.promoted) refresh(); }).catch(() => {});
    }
  }, [role, user?.id]);

  useEffect(() => {
    if (!user) return;

    const refreshLiveData = () => {
      qc.invalidateQueries({ queryKey: ["commitments"] });
      qc.invalidateQueries({ queryKey: ["notifications", user.id] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    };

    const channel = supabase
      .channel(`live-work-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "commitments",
          filter: role === "business_head" ? undefined : `assigned_to=eq.${user.id}`,
        },
        refreshLiveData,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          refreshLiveData();
          if (payload.eventType === "INSERT") {
            const row = payload.new as { title?: string | null; body?: string | null };
            toast.info(row.title ?? "New notification", {
              description: row.body ?? undefined,
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, role, user]);

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <Sidebar />
      <div className="min-w-0 lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur lg:px-8">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden"><Menu className="h-5 w-5" /></Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0"><SidebarContent /></SheetContent>
          </Sheet>
          <div className="flex-1" />
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
            <NotificationBell />
            <ThemeToggle />
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium leading-tight">{name ?? "User"}</div>
              <div className="text-xs text-muted-foreground">{role ? ROLE_LABELS[role] : ""}</div>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-linear-to-br from-primary to-info text-sm font-semibold text-primary-foreground shadow-sm">
              {(name ?? "U").slice(0, 1).toUpperCase()}
            </div>
            <Button variant="ghost" size="icon" onClick={confirmSignOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <main className="min-w-0 px-3 py-5 sm:px-4 sm:py-6 lg:px-8 lg:py-8"><Outlet /></main>
      </div>
    </div>
  );
}

function NotificationBell() {
  const { data: commitments = [] } = useCommitments();
  const { data: notifications = [] } = useNotifications();
  const today = todayLocal();
  const yesterday = shiftDate(today, -1);
  const rows = useMemo(() => {
    const relevant = commitments
      .filter((c) => c.status !== "completed" && (c.promise_date === today || c.promise_date === yesterday))
      .map((c) => ({
        id: c.id,
        date: c.promise_date,
        title: c.title,
        body: `${c.customer ?? "No customer"} · ${fmtINR(Number(c.expected_revenue ?? 0))}`,
        tone: c.promise_date === yesterday || effectiveStatus(c) === "missed" ? "destructive" as const : "warning" as const,
        commitment: c,
      }));
    return relevant.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  }, [commitments, today, yesterday]);
  const unread = notifications.filter((n) => !n.read_at);
  const total = rows.length + unread.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {total > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
              {total > 9 ? "9+" : total}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[calc(100vw-2rem)] max-w-sm p-0">
        <div className="border-b border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="font-semibold">Notifications</div>
            <Badge variant="secondary" className="text-[10px]">{total} active</Badge>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">Yesterday and today task reminders</div>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-2">
          {total === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No task reminders right now.</p>}
          {rows.map((row) => <ReminderItem key={row.id} row={row} />)}
          {unread.slice(0, 8).map((n) => (
            <Link key={n.id} to="/sales-team" className="block rounded-lg border border-border bg-background/60 p-3 text-sm transition-colors hover:border-primary/40 hover:bg-primary/5">
              <div className="flex items-start gap-2">
                <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{n.title}</div>
                  {n.body && <div className="line-clamp-2 text-xs text-muted-foreground">{n.body}</div>}
                </div>
              </div>
            </Link>
          ))}
        </div>
        <div className="border-t border-border p-2">
          <Button asChild variant="ghost" className="w-full justify-center">
            <Link to="/commitments">View all commitments</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ReminderItem({ row }: { row: { id: string; date: string | null; title: string; body: string; tone: "warning" | "destructive"; commitment: Commitment } }) {
  const Icon = row.tone === "destructive" ? AlertTriangle : Clock;
  return (
    <Link to="/commitments" className={cn("mb-2 block rounded-lg border p-3 text-sm transition-colors hover:bg-background", row.tone === "destructive" ? "border-destructive/30 bg-destructive/10" : "border-warning/30 bg-warning/10")}>
      <div className="flex items-start gap-2">
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", row.tone === "destructive" ? "text-destructive" : "text-warning-foreground")} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-semibold">{row.title}</span>
            <Badge variant="outline" className="text-[10px]">{row.date === todayLocal() ? "Today" : "Yesterday"}</Badge>
          </div>
          <div className="line-clamp-2 text-xs text-muted-foreground">{row.body}</div>
        </div>
      </div>
    </Link>
  );
}

function todayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shiftDate(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme" title={theme === "dark" ? "Switch to light" : "Switch to dark"}>
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-sidebar-border bg-sidebar lg:block">
      <SidebarContent />
    </aside>
  );
}

function SidebarContent() {
  const { pathname } = useLocation();
  const { role } = useAuth();
  return (
    <div className="flex h-full flex-col">
      <div className="px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: "var(--gradient-brand)" }}>
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight">Chimertech</div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Sales Intelligence OS</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3 overflow-y-auto">
        {NAV.map((item) => {
          const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4" />{item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border px-6 py-4 text-xs text-muted-foreground">
        Role: <span className="text-foreground">{role ? ROLE_LABELS[role] : "—"}</span>
      </div>
    </div>
  );
}
