import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Sparkles, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { signInWithPhone, signUpWithPhone } from "@/lib/auth";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const search = useSearch({ from: "/auth" });
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: search.redirect ?? "/", replace: true });
  }, [user, loading, navigate, search.redirect]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        if (!name.trim() || !phone.trim() || password.length < 6) {
          toast.error("Name, phone, and a 6+ char password are required."); setBusy(false); return;
        }
        const { error } = await signUpWithPhone(name.trim(), phone.trim(), password);
        if (error) throw error;
        toast.success("Account created. Signing you in…");
        // The first user becomes Admin automatically.
        const { error: e2 } = await signInWithPhone(phone.trim(), password);
        if (e2) throw e2;
      } else {
        const { error } = await signInWithPhone(phone.trim(), password);
        if (error) throw error;
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 -left-40 h-[480px] w-[480px] rounded-full opacity-30" style={{ background: "var(--gradient-brand)", filter: "blur(80px)" }} />
        <div className="absolute -bottom-40 -right-40 h-[420px] w-[420px] rounded-full opacity-20" style={{ background: "var(--gradient-brand)", filter: "blur(80px)" }} />
      </div>

      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-4 py-10 lg:grid lg:grid-cols-2 lg:gap-16">
        <div className="hidden lg:block">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-soft">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            AI Sales Execution OS
          </div>
          <h1 className="mt-6 text-5xl font-bold leading-[1.05] tracking-tight">
            Sell with <span className="gradient-text">clarity.</span><br />
            Execute with <span className="gradient-text">discipline.</span>
          </h1>
          <p className="mt-5 max-w-md text-base text-muted-foreground">
            Chimertech's intelligence layer for sales — turn EOD chatter, voice notes, and PO scans into commitments your team actually keeps.
          </p>
          <ul className="mt-8 grid gap-3 text-sm text-foreground/80">
            {["AI-extracted intake from any text or voice", "Commitment tracker with traffic-light risk", "Role-aware dashboards for Business Head, Sales Head, Sales Member"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" /> {t}
              </li>
            ))}
          </ul>
        </div>


        <div className="card-soft w-full max-w-md p-8 mx-auto">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold">Welcome to Chimertech</h2>
            <p className="text-sm text-muted-foreground">Sign in to your sales workspace.</p>
          </div>
          <Tabs value={mode} onValueChange={(v) => setMode(v as "signin" | "signup")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>
            <form onSubmit={submit} className="mt-6 space-y-4">
              <TabsContent value="signup" className="space-y-4 m-0">
                <div>
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Praveen Kumar" className="mt-1.5" />
                </div>
              </TabsContent>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="mt-1.5" />
              </div>
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{mode === "signin" ? "Sign in" : "Create account"} <ArrowRight className="ml-2 h-4 w-4" /></>}
              </Button>
              {mode === "signup" && (
                <p className="text-xs text-muted-foreground">
                  The first account created becomes the Business Head. Additional accounts default to Sales Member and can be promoted by the Business Head.
                </p>
              )}

            </form>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
