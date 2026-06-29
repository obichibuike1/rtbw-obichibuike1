import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { checkLoginLock, registerFailedLogin, registerSuccessfulLogin, seedDemo } from "@/lib/banking.functions";
import { Activity, Loader2, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/auth")({ component: AuthPage });

function AuthPage() {
  const nav = useNavigate();
  const { role, loading, roleLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    if (loading || roleLoading) return;
    if (role === "admin") nav({ to: "/admin/dashboard" });
    else if (role === "customer") nav({ to: "/app/dashboard" });
  }, [role, loading, roleLoading, nav]);

  // Live countdown
  useEffect(() => {
    if (!lockedUntil) return;
    tickRef.current = window.setInterval(() => setNow(Date.now()), 250);
    return () => { if (tickRef.current) window.clearInterval(tickRef.current); };
  }, [lockedUntil]);

  useEffect(() => {
    if (lockedUntil && now >= lockedUntil) setLockedUntil(null);
  }, [now, lockedUntil]);

  const secondsLeft = lockedUntil ? Math.max(0, Math.ceil((lockedUntil - now) / 1000)) : 0;

  const onSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockedUntil && Date.now() < lockedUntil) return;
    setBusy(true);
    try {
      // Pre-check lock
      const lock = await checkLoginLock({ data: { email } });
      if (lock.locked && lock.until) {
        setLockedUntil(new Date(lock.until).getTime());
        toast.error("Account temporarily locked");
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const r = await registerFailedLogin({ data: { email } });
        if (r.locked && r.until) {
          setLockedUntil(new Date(r.until).getTime());
          toast.error("Too many failed attempts — locked for 1 minute");
        } else {
          const remaining = Math.max(0, 3 - r.attempts);
          toast.error(`${error.message}${remaining > 0 ? ` · ${remaining} attempt${remaining===1?"":"s"} left` : ""}`);
        }
        return;
      }
      // success — reset counter
      try { await registerSuccessfulLogin(); } catch {}
      toast.success("Welcome back");
    } finally {
      setBusy(false);
    }
  };

  const onSignUp = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: redirectUrl, data: { full_name: name } },
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Account created — signing you in");
  };

  const runSeed = async () => {
    setSeeding(true);
    try { await seedDemo(); toast.success("Demo data ready. Ask your instructor for sign-in details."); }
    catch (e: any) { toast.error(e.message ?? "Seed failed"); }
    finally { setSeeding(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/40">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2 mb-1"><Activity className="size-5 text-primary" /><span className="font-semibold">PulseBank</span></div>
          <CardTitle>Welcome</CardTitle>
          <CardDescription>Sign in to your account or create a new one.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <form onSubmit={onSignIn} className="space-y-3 mt-4">
                <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
                <div><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
                {lockedUntil && secondsLeft > 0 && (
                  <div className="flex items-start gap-2 p-3 rounded-md border border-destructive/40 bg-destructive/10 text-destructive text-sm">
                    <ShieldAlert className="size-4 mt-0.5 shrink-0" />
                    <div>
                      <div className="font-medium">Too many failed attempts.</div>
                      <div className="tabular-nums">Try again in {secondsLeft}s</div>
                    </div>
                  </div>
                )}
                <Button type="submit" disabled={busy || (!!lockedUntil && secondsLeft > 0)} className="w-full">
                  {busy && <Loader2 className="size-4 animate-spin mr-2" />}
                  {lockedUntil && secondsLeft > 0 ? `Locked · ${secondsLeft}s` : "Sign in"}
                </Button>
              </form>
              <div className="mt-6 border-t pt-4">
                <Button size="sm" variant="ghost" className="w-full" onClick={runSeed} disabled={seeding}>
                  {seeding && <Loader2 className="size-3 animate-spin mr-2" />}
                  {seeding ? "Preparing demo data…" : "Initialize demo data (first run)"}
                </Button>
                <p className="mt-2 text-[10px] text-muted-foreground text-center">
                  Sign-in credentials are not shown publicly. Use the credentials provided for your evaluation.
                </p>
              </div>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={onSignUp} className="space-y-3 mt-4">
                <div><Label>Full name</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
                <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
                <div><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></div>
                <Button type="submit" disabled={busy} className="w-full">{busy && <Loader2 className="size-4 animate-spin mr-2" />}Create account</Button>
                <p className="text-xs text-muted-foreground">New sign-ups create a customer account. Admin access is seeded.</p>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
