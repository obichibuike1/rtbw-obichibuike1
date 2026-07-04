import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Loader2, ShieldCheck, Check, X } from "lucide-react";
import { toast } from "sonner";
import { logSocEvent } from "@/lib/soc";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/reset-password")({ component: AdminResetPassword });

function maskEmail(e: string | null | undefined) {
  if (!e) return "***";
  const [local, domain] = e.split("@");
  if (!domain) return "***";
  if (local.length <= 2) return `${local[0] ?? ""}***@${domain}`;
  return `${local.slice(0, 2)}${"*".repeat(Math.max(local.length - 2, 1))}@${domain}`;
}

function evalStrength(pw: string) {
  const checks = {
    length: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    number: /\d/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw),
  };
  const score = Object.values(checks).filter(Boolean).length;
  const label = score <= 1 ? "Weak" : score === 2 ? "Fair" : score === 3 ? "Strong" : "Excellent";
  return { checks, score, label, allMet: score === 4 };
}

function AdminResetPassword() {
  const nav = useNavigate();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const sub = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setReady(true);
        setEmail(session?.user.email ?? null);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) { setReady(true); setEmail(data.session.user.email ?? null); }
    });
    return () => sub.data.subscription.unsubscribe();
  }, []);

  const strength = useMemo(() => evalStrength(pw), [pw]);
  const match = pw.length > 0 && pw === pw2;
  const canSubmit = ready && strength.allMet && match && !busy && !done;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!strength.allMet) { setErr("Password does not meet requirements."); return; }
    if (!match) { setErr("Passwords do not match."); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) { setErr(error.message); return; }
      await logSocEvent({
        threat_type: "admin_password_reset",
        severity: "blue",
        field: "admin_login",
        payload: `Admin password reset completed for ${maskEmail(email)}`,
        target_email: email ?? undefined,
        details: { result: "completed", masked: maskEmail(email) },
      });
      toast.success("Admin password updated successfully");
      setDone(true);
      setTimeout(async () => {
        await supabase.auth.signOut();
        nav({ to: "/admin/login" });
      }, 2000);
    } finally { setBusy(false); }
  };

  return (
    <div className="admin-theme min-h-screen flex items-center justify-center p-4 bg-background text-foreground">
      <div className="w-full max-w-md">
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
            <h1 className="text-lg font-semibold mb-1">Set a new admin password</h1>
            <p className="text-xs text-muted-foreground mb-5">
              {ready ? "Choose a strong password. All requirements must be met." : "Waiting for a valid reset link…"}
            </p>

            {done ? (
              <div className="text-center space-y-3 py-4">
                <div className="mx-auto size-12 rounded-full bg-success/15 text-success flex items-center justify-center">
                  <Check className="size-6" />
                </div>
                <p className="text-sm">Admin password updated successfully. Redirecting to login…</p>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <Label>New password</Label>
                  <PasswordInput
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    eyeVariant="admin"
                    autoComplete="new-password"
                    required
                  />
                  {pw.length > 0 && (
                    <div className="mt-2 space-y-2">
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden flex gap-0.5">
                        {[0, 1, 2, 3].map((i) => (
                          <div
                            key={i}
                            className={cn(
                              "flex-1 transition-colors",
                              i < strength.score
                                ? strength.score <= 1 ? "bg-destructive"
                                : strength.score === 2 ? "bg-warning"
                                : "bg-primary"
                                : "bg-transparent",
                            )}
                          />
                        ))}
                      </div>
                      <div className="text-[11px] text-muted-foreground">Strength: <span className="font-medium text-foreground">{strength.label}</span></div>
                    </div>
                  )}
                </div>

                <div>
                  <Label>Confirm new password</Label>
                  <PasswordInput
                    value={pw2}
                    onChange={(e) => setPw2(e.target.value)}
                    eyeVariant="admin"
                    autoComplete="new-password"
                    required
                  />
                  {pw2.length > 0 && !match && (
                    <p className="mt-1 text-xs text-destructive">Passwords do not match.</p>
                  )}
                </div>

                <ul className="text-xs space-y-1 rounded-md border border-border p-3 bg-muted/30">
                  <Req ok={strength.checks.length}>Minimum 8 characters</Req>
                  <Req ok={strength.checks.upper}>At least one uppercase letter</Req>
                  <Req ok={strength.checks.number}>At least one number</Req>
                  <Req ok={strength.checks.special}>At least one special character</Req>
                </ul>

                {err && <p className="text-xs text-destructive">{err}</p>}

                <Button type="submit" disabled={!canSubmit} className="w-full">
                  {busy && <Loader2 className="size-4 animate-spin mr-2" />}Update Password
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Req({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={cn("flex items-center gap-2", ok ? "text-success" : "text-muted-foreground")}>
      {ok ? <Check className="size-3.5" /> : <X className="size-3.5" />}
      <span>{children}</span>
    </li>
  );
}
