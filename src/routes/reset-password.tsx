import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";

import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({ component: ResetPassword });

function ResetPassword() {
  const nav = useNavigate();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // Supabase parses the recovery token from the URL hash and fires PASSWORD_RECOVERY.
    // Also check current session in case the user already has one.
    const sub = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    return () => { sub.data.subscription.unsubscribe(); };
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (pw.length < 8) { setErr("Password must be at least 8 characters."); return; }
    if (pw !== pw2) { setErr("Passwords do not match."); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) { setErr(error.message); return; }
      toast.success("Password updated successfully");
      await supabase.auth.signOut();
      nav({ to: "/auth" });
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/40">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2 mb-1"><Activity className="size-5 text-primary" /><span className="font-semibold">PulseBank</span></div>
          <CardTitle>Set a new password</CardTitle>
          <CardDescription>
            {ready ? "Choose a strong password of at least 8 characters." : "Waiting for a valid reset link…"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <Label>New password</Label>
              <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} required />
            </div>
            <div>
              <Label>Confirm new password</Label>
              <Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} minLength={8} required />
            </div>
            {err && <p className="text-xs text-destructive">{err}</p>}
            <Button type="submit" disabled={busy || !ready} className="w-full">
              {busy && <Loader2 className="size-4 animate-spin mr-2" />}Update password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
