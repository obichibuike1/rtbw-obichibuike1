import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { resetAdminCredentials } from "@/lib/admin-recovery.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { ArrowLeft, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/recover")({ component: AdminRecover });

type Strength = { score: 0 | 1 | 2 | 3 | 4; label: string; color: string };

function scorePassword(pw: string): Strength {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  const map: Strength[] = [
    { score: 0, label: "Too weak", color: "bg-destructive" },
    { score: 1, label: "Weak", color: "bg-destructive" },
    { score: 2, label: "Fair", color: "bg-amber-500" },
    { score: 3, label: "Good", color: "bg-emerald-500" },
    { score: 4, label: "Strong", color: "bg-emerald-500" },
  ];
  return map[s];
}

function AdminRecover() {
  const nav = useNavigate();
  const runReset = useServerFn(resetAdminCredentials);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = useMemo(() => scorePassword(newPassword), [newPassword]);
  const pwMismatch = confirm.length > 0 && confirm !== newPassword;
  const canSubmit =
    recoveryKey.trim().length > 0 &&
    newEmail.trim().length > 0 &&
    newPassword.length >= 8 &&
    strength.score >= 2 &&
    !pwMismatch;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!canSubmit) return;
    setBusy(true);
    try {
      const res = await runReset({
        data: {
          recoveryKey: recoveryKey.trim(),
          newEmail: newEmail.trim(),
          newPassword,
        },
      });
      if (!res.ok) {
        setError("Invalid recovery key. Access denied.");
        return;
      }
      toast.success("Credentials updated successfully");
      nav({ to: "/admin/login" });
    } catch (err: any) {
      setError(err?.message ?? "Recovery failed");
    } finally {
      setBusy(false);
    }
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
            <div className="flex items-center gap-2 mb-1">
              <KeyRound className="size-4 text-primary" />
              <h1 className="text-lg font-semibold">Admin Credential Recovery</h1>
            </div>
            <p className="text-xs text-muted-foreground mb-5">
              Use your out-of-band recovery key to replace the admin sign-in credentials.
              This flow does not require an active session.
            </p>

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <Label>Recovery Key</Label>
                <PasswordInput
                  value={recoveryKey}
                  onChange={(e) => setRecoveryKey(e.target.value)}
                  autoComplete="off"
                  eyeVariant="admin"
                  required
                />
              </div>

              <div>
                <Label>New Admin Username (Email)</Label>
                <Input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>

              <div>
                <Label>New Password</Label>
                <PasswordInput
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  eyeVariant="admin"
                  required
                />
                {newPassword.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <div className="h-1.5 w-full rounded bg-muted overflow-hidden">
                      <div
                        className={`h-full ${strength.color} transition-all`}
                        style={{ width: `${(strength.score / 4) * 100}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Strength: <span className="font-medium">{strength.label}</span>
                      {strength.score < 2 && " · use 8+ chars, mixed case, numbers & symbols"}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <Label>Confirm New Password</Label>
                <PasswordInput
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  eyeVariant="admin"
                  required
                />
                {pwMismatch && (
                  <p className="mt-1 text-[11px] text-destructive">Passwords do not match</p>
                )}
              </div>

              {error && (
                <div className="p-3 rounded-md border border-destructive/40 bg-destructive/10 text-destructive text-xs">
                  {error}
                </div>
              )}

              <Button type="submit" disabled={busy || !canSubmit} className="w-full">
                {busy && <Loader2 className="size-4 animate-spin mr-2" />}
                Reset Credentials
              </Button>

              <Link
                to="/admin/login"
                className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-primary"
              >
                <ArrowLeft className="size-3" /> Back to admin sign in
              </Link>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
