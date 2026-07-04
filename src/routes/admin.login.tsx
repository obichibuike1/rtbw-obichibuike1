import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { ArrowLeft, Loader2, MailCheck, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { logSocEvent, getSessionIp } from "@/lib/soc";

export const Route = createFileRoute("/admin/login")({ component: AdminLogin });

type View = "signin" | "forgot" | "forgot-sent";

const ADMIN_FAIL_KEY = "pulsebank.admin_login_fails";

function readFailCount(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(ADMIN_FAIL_KEY);
  if (!raw) return 0;
  try {
    const p = JSON.parse(raw) as { count: number; t: number };
    if (Date.now() - p.t > 60 * 60_000) return 0;
    return p.count;
  } catch { return 0; }
}
function writeFailCount(count: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ADMIN_FAIL_KEY, JSON.stringify({ count, t: Date.now() }));
}

function AdminLogin() {
  const nav = useNavigate();
  const { role, user, loading, roleLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>("signin");
  const [forgotEmail, setForgotEmail] = useState("");
  const [rejectedRole, setRejectedRole] = useState(false);
  const failRef = useRef<number>(readFailCount());

  // Redirect signed-in users appropriately
  useEffect(() => {
    if (loading || roleLoading) return;
    if (!user) return;
    if (role === "admin") nav({ to: "/admin/dashboard" });
    else if (role === "customer") nav({ to: "/app/dashboard" });
  }, [role, user, loading, roleLoading, nav]);

  const onSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setRejectedRole(false);
    setBusy(true);
    const ip = getSessionIp();
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        failRef.current += 1;
        writeFailCount(failRef.current);
        // Blue informational event for every failed admin login
        await logSocEvent({
          threat_type: "admin_login_failed",
          severity: "blue",
          field: "admin_login",
          payload: `Failed admin login attempt for ${email}`,
          target_email: email,
          details: { result: "failed", attempts: failRef.current, ip },
        });
        // After 3 fails, auto-block IP + fire red alert
        if (failRef.current >= 3) {
          try {
            await supabase.rpc("flag_admin_login_attack" as any, {
              _ip: ip, _email: email, _attempts: failRef.current,
            });
          } catch {}
          toast.error("Too many failed admin login attempts. This IP has been flagged.");
        } else {
          toast.error(error.message);
        }
        return;
      }

      // Signed in — verify admin role BEFORE letting through
      const uid = data.user?.id;
      if (!uid) { toast.error("Login failed"); return; }
      const { data: roleRows } = await supabase
        .from("user_roles").select("role").eq("user_id", uid);
      const roles = (roleRows ?? []).map((r) => r.role);
      if (!roles.includes("admin")) {
        // Reject — sign back out
        await supabase.auth.signOut();
        setRejectedRole(true);
        await logSocEvent({
          threat_type: "admin_login_rejected",
          severity: "orange",
          field: "admin_login",
          payload: `Non-admin user attempted admin portal: ${email}`,
          target_email: email,
          details: { result: "rejected_role", ip },
        });
        return;
      }

      // Success
      failRef.current = 0;
      writeFailCount(0);
      await logSocEvent({
        threat_type: "admin_login_success",
        severity: "blue",
        field: "admin_login",
        payload: `Admin signed in: ${email}`,
        target_email: email,
        details: { result: "success", ip },
      });
      toast.success("Welcome, administrator");
      nav({ to: "/admin/dashboard" });
    } finally {
      setBusy(false);
    }
  };

  const onForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setBusy(true);
    try {
      // Verify email belongs to admin
      const { data: isAdmin } = await supabase.rpc("is_admin_email" as any, { _email: forgotEmail });
      if (isAdmin === false) {
        toast.error("This email is not registered as an admin account");
        await logSocEvent({
          threat_type: "admin_password_reset",
          severity: "blue",
          field: "admin_login",
          payload: `Admin reset requested for non-admin email: ${forgotEmail}`,
          target_email: forgotEmail,
          details: { result: "not_admin" },
        });
        setBusy(false);
        return;
      }
      const redirectTo = `${window.location.origin}/admin/reset-password`;
      await supabase.auth.resetPasswordForEmail(forgotEmail, { redirectTo });
      await logSocEvent({
        threat_type: "admin_password_reset",
        severity: "blue",
        field: "admin_login",
        payload: `Admin password reset link sent to ${forgotEmail}`,
        target_email: forgotEmail,
        details: { result: "sent" },
      });
      setView("forgot-sent");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-theme min-h-screen flex items-center justify-center p-4 bg-background text-foreground">
      <div className="w-full max-w-md">
        {/* Logo + label */}
        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="size-12 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
            <ShieldCheck className="size-6 text-primary" />
          </div>
          <div className="text-xl font-semibold tracking-tight">PulseBank</div>
          <div className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            Administration Portal
          </div>
        </div>

        <div className="admin-gradient-border">
          <div className="rounded-[calc(0.75rem-2px)] bg-card p-6 shadow-2xl">
            {view === "signin" && (
              <>
                <h1 className="text-lg font-semibold mb-1">Sign in</h1>
                <p className="text-xs text-muted-foreground mb-5">
                  Enter your administrator credentials to access the operations console.
                </p>
                <form onSubmit={onSignIn} className="space-y-4">
                  <div>
                    <Label>Email</Label>
                    <Input
                      type="email" value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="username"
                      required
                    />
                  </div>
                  <div>
                    <Label>Password</Label>
                    <PasswordInput
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      eyeVariant="admin"
                      required
                    />
                    <button
                      type="button"
                      className="mt-2 text-xs text-primary hover:underline"
                      onClick={() => { setForgotEmail(email); setView("forgot"); }}
                    >
                      Forgot password?
                    </button>
                  </div>

                  {rejectedRole && (
                    <div className="p-3 rounded-md border border-destructive/40 bg-destructive/10 text-destructive text-xs">
                      This portal is for administrators only.{" "}
                      <Link to="/auth" className="underline font-medium">
                        Use the customer login instead.
                      </Link>
                    </div>
                  )}

                  <Button type="submit" disabled={busy} className="w-full">
                    {busy && <Loader2 className="size-4 animate-spin mr-2" />}
                    Sign in
                  </Button>
                </form>
                <p className="mt-5 text-center text-[10px] uppercase tracking-widest text-muted-foreground/70">
                  Authorized Personnel Only — Unauthorized access is monitored and logged
                </p>
              </>
            )}

            {view === "forgot" && (
              <>
                <h1 className="text-lg font-semibold mb-1">Reset admin password</h1>
                <p className="text-xs text-muted-foreground mb-5">
                  Enter your admin email and we'll send you a secure reset link.
                </p>
                <form onSubmit={onForgot} className="space-y-4 animate-in slide-in-from-right-4 fade-in duration-300">
                  <div>
                    <Label>Admin email address</Label>
                    <Input
                      type="email" autoFocus required
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={() => setView("signin")}>
                      <ArrowLeft className="size-4 mr-1" /> Back
                    </Button>
                    <Button type="submit" className="flex-1" disabled={busy}>
                      {busy && <Loader2 className="size-4 animate-spin mr-2" />}
                      Send Reset Link
                    </Button>
                  </div>
                </form>
              </>
            )}

            {view === "forgot-sent" && (
              <div className="space-y-4 text-center py-2 animate-in fade-in duration-300">
                <div className="flex justify-center">
                  <div className="size-14 rounded-full bg-primary/15 text-primary flex items-center justify-center">
                    <MailCheck className="size-7" />
                  </div>
                </div>
                <p className="text-sm">
                  If this admin email is registered, a secure reset link has been sent. Check your inbox.
                </p>
                <Button variant="outline" className="w-full" onClick={() => setView("signin")}>
                  <ArrowLeft className="size-4 mr-1" /> Back to sign in
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
