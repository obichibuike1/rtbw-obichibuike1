import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";

import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  checkLoginLock,
  logPasswordReset,
  registerFailedLogin,
  registerSuccessfulLogin,
  seedDemo,
} from "@/lib/banking.functions";
import { Activity, ArrowLeft, Loader2, MailCheck, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/auth")({ component: AuthPage });

type View = "signin" | "forgot" | "forgot-sent";

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
  const [view, setView] = useState<View>("signin");
  const [forgotEmail, setForgotEmail] = useState("");

  useEffect(() => {
    if (loading || roleLoading) return;
    if (role === "admin") nav({ to: "/admin/dashboard" });
    else if (role === "customer") nav({ to: "/app/dashboard" });
  }, [role, loading, roleLoading, nav]);

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

    // XSS + SQLi scan on credentials (client-side)
    try {
      const { detectXss, detectSql, logSocEvent } = await import("@/lib/soc");
      const xss = detectXss(email) || detectXss(password);
      if (xss.hit) {
        await logSocEvent({ threat_type: "xss", severity: "red", field: "login", payload: xss.match, target_email: email });
        toast.error("Invalid characters detected. Please enter plain text only.");
        return;
      }
      const sql = detectSql(email) || detectSql(password);
      if (sql.hit) {
        await logSocEvent({ threat_type: "sql_injection", severity: "red", field: "login", payload: sql.match, target_email: email });
        toast.error("Invalid characters detected. Please enter plain text only.");
        return;
      }
    } catch {}

    setBusy(true);
    try {
      const lock = await checkLoginLock({ data: { email } });
      if (lock.locked && lock.until) {
        setLockedUntil(new Date(lock.until).getTime());
        toast.error("Account temporarily locked");
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const r = await registerFailedLogin({ data: { email } });
        // Log brute-force attempts to SOC feed
        try {
          const { logSocEvent } = await import("@/lib/soc");
          await logSocEvent({
            threat_type: r.attempts >= 5 ? "brute_force" : "credential_stuffing",
            severity: "orange",
            field: "login",
            payload: `Failed login attempt #${r.attempts} for ${email}`,
            target_email: email,
            details: { attempts: r.attempts },
          });
        } catch {}
        if (r.locked && r.until) {
          setLockedUntil(new Date(r.until).getTime());
          toast.error("Too many failed attempts — locked for 1 minute");
        } else {
          const remaining = Math.max(0, 3 - r.attempts);
          toast.error(`${error.message}${remaining > 0 ? ` · ${remaining} attempt${remaining===1?"":"s"} left` : ""}`);
        }
        return;
      }

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

  const onForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setBusy(true);
    try {
      // Always attempt reset (never confirm/deny) and log to admin feed.
      const redirectTo = `${window.location.origin}/reset-password`;
      await supabase.auth.resetPasswordForEmail(forgotEmail, { redirectTo });
      try { await logPasswordReset({ data: { email: forgotEmail } }); } catch {}
      setView("forgot-sent");
    } finally {
      setBusy(false);
    }
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
          <CardTitle>
            {view === "forgot" ? "Reset your password" :
             view === "forgot-sent" ? "Check your email" : "Welcome"}
          </CardTitle>
          <CardDescription>
            {view === "forgot" ? "Enter your registered email address and we'll send you a reset link." :
             view === "forgot-sent" ? "If this email is registered, you will receive a reset link." :
             "Sign in to your account or create a new one."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {view === "signin" && (
            <Tabs defaultValue="signin">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>
              <TabsContent value="signin">
                <form onSubmit={onSignIn} className="space-y-3 mt-4">
                  <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
                  <div>
                    <Label>Password</Label>
                    <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required />
                    <button
                      type="button"
                      className="mt-1 text-xs text-primary hover:underline"
                      onClick={() => { setForgotEmail(email); setView("forgot"); }}
                    >
                      Forgot password?
                    </button>
                  </div>
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
          )}

          {view === "forgot" && (
            <form onSubmit={onForgot} className="space-y-3 mt-2">
              <div>
                <Label>Registered email</Label>
                <Input type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} required autoFocus />
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={() => setView("signin")}>
                  <ArrowLeft className="size-4 mr-1" /> Back
                </Button>
                <Button type="submit" className="flex-1" disabled={busy}>
                  {busy && <Loader2 className="size-4 animate-spin mr-2" />}Send reset link
                </Button>
              </div>
            </form>
          )}

          {view === "forgot-sent" && (
            <div className="space-y-4 mt-2 text-center">
              <div className="flex justify-center">
                <div className="size-14 rounded-full bg-primary/15 text-primary flex items-center justify-center">
                  <MailCheck className="size-7" />
                </div>
              </div>
              <p className="text-sm">
                A password reset link has been sent to your email. Check your inbox and follow the instructions.
              </p>
              <p className="text-xs text-muted-foreground">
                If this email is registered, you will receive a reset link.
              </p>
              <Button variant="outline" className="w-full" onClick={() => setView("signin")}>
                <ArrowLeft className="size-4 mr-1" /> Back to sign in
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
