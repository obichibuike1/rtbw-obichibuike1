import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { fullTime, money } from "@/lib/format";
import { Ban, Copy, KeyRound, Mail, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { Ban, Copy, KeyRound, Mail, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";

export const Route = createFileRoute("/admin/security")({ component: SecurityFeed });

type Evt = {
  id: string;
  event_type: string;
  email: string | null;
  user_id: string | null;
  account_id: string | null;
  details: Record<string, any>;
  created_at: string;
};

function SecurityFeed() {
  const [rows, setRows] = useState<Evt[]>([]);
  const newIdsRef = useRef<Set<string>>(new Set());
  const [, setTick] = useState(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from("security_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (mounted) setRows((data ?? []) as Evt[]);
    })();
    const ch = supabase.channel("admin-sec-events")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "security_events" }, (payload) => {
        const e = payload.new as Evt;
        newIdsRef.current.add(e.id);
        setRows((prev) => [e, ...prev].slice(0, 200));
        setTick((n) => n + 1);
        setTimeout(() => { newIdsRef.current.delete(e.id); setTick((n) => n + 1); }, 2500);
      })
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, []);

  const counts = rows.reduce((acc, r) => { acc[r.event_type] = (acc[r.event_type] ?? 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><ShieldCheck className="size-6 text-primary" /> Security Events</h1>
        <p className="text-sm text-muted-foreground">Behavioral and access-pattern monitoring — separate from transaction fraud.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard label="Login lockouts" value={counts.login_lockout ?? 0} icon={ShieldAlert} />
        <StatCard label="PIN lockouts" value={counts.pin_lockout ?? 0} icon={KeyRound} />
        <StatCard label="90% cap rejections" value={counts.cap_rejection ?? 0} icon={Ban} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Live event feed</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[640px] overflow-auto">
            {rows.length === 0 && <div className="p-10 text-center text-muted-foreground text-sm">No security events yet.</div>}
            {rows.map((e) => {
              const isNew = newIdsRef.current.has(e.id);
              const meta = describe(e);
              return (
                <div key={e.id} className={`p-4 border-b ${isNew ? "row-flag" : ""}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <meta.icon className="size-4 text-muted-foreground" />
                        <span className="font-medium">{meta.title}</span>
                        <Badge variant={meta.variant}>{meta.tag}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {fullTime(e.created_at)} · {e.email ?? "unknown user"}
                      </div>
                      <div className="text-sm mt-1">{meta.body}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: any }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="size-10 rounded-lg bg-accent flex items-center justify-center"><Icon className="size-5 text-primary" /></div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-xl font-semibold tabular-nums">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function describe(e: Evt) {
  switch (e.event_type) {
    case "login_lockout":
      return {
        title: "Login lockout", tag: "LOGIN", variant: "destructive" as const, icon: ShieldAlert,
        body: `Account locked for ${e.details?.duration_seconds ?? 60}s after repeated failed sign-in attempts.`,
      };
    case "pin_lockout":
      return {
        title: "Transfer PIN lockout", tag: "PIN", variant: "destructive" as const, icon: KeyRound,
        body: `Transfers disabled for ${e.details?.duration_seconds ?? 120}s after repeated incorrect PIN entries.`,
      };
    case "cap_rejection":
      return {
        title: "90% cap rejection", tag: "CAP", variant: "secondary" as const, icon: Ban,
        body: `Attempted ${fmt(e.details?.attempted_amount)} · balance ${fmt(e.details?.balance)} · cap ${fmt(e.details?.cap)}${e.details?.recipient ? ` → ${e.details.recipient}` : ""}.`,
      };
    case "duplicate_attempt":
      return {
        title: "Duplicate transfer attempt",
        tag: "DUPLICATE",
        variant: (e.details?.resolution === "confirmed" ? "destructive" : "secondary") as any,
        icon: Copy,
        body: `${e.details?.resolution === "confirmed" ? "Sent anyway" : "Cancelled"} · ${fmt(e.details?.amount)} → ${e.details?.recipient_name ?? e.details?.recipient_account ?? "—"} (repeat within ${e.details?.seconds_ago ?? 0}s).`,
      };
    case "security_challenge_triggered":
      return {
        title: "Security question challenged", tag: "80% CHECK", variant: "secondary" as const, icon: ShieldQuestion,
        body: `Triggered on transfer of ${fmt(e.details?.amount)} (${e.details?.percent ?? "?"}% of balance ${fmt(e.details?.balance)}).`,
      };
    case "security_challenge_passed":
      return {
        title: "Security question passed", tag: "PASSED", variant: "secondary" as const, icon: ShieldCheck,
        body: `Correct answer on transfer of ${fmt(e.details?.amount)} (${e.details?.percent ?? "?"}% of balance).`,
      };
    case "security_challenge_failed":
      return {
        title: "Security question failed", tag: "FAILED", variant: "destructive" as const, icon: ShieldQuestion,
        body: `Wrong answer on ${fmt(e.details?.amount)} transfer — ${e.details?.remaining ?? 0} attempt(s) remaining.`,
      };
    case "security_challenge_locked":
      return {
        title: "HIGH VALUE ALERT — Send Money locked", tag: "HIGH VALUE ALERT", variant: "destructive" as const, icon: ShieldAlert,
        body: `Security question failed on high-value transfer attempt (${fmt(e.details?.amount)}). Send Money locked for ${Math.round((e.details?.duration_seconds ?? 300) / 60)} minutes.`,
      };
    case "password_reset_request":
      return {
        title: "Password reset requested", tag: "RESET", variant: "secondary" as const, icon: Mail,
        body: `Reset link sent to ${e.details?.masked_email ?? e.email ?? "—"}.`,
      };
    default:
      return { title: e.event_type, tag: "EVENT", variant: "secondary" as const, icon: ShieldCheck, body: JSON.stringify(e.details) };
  }
}


function fmt(n: any) {
  const v = Number(n);
  if (!isFinite(v)) return "—";
  return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
}
