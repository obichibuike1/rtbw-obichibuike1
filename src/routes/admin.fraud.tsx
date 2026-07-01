import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useLiveTransactions } from "@/lib/use-realtime-tx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { money, fullTime, txTypeLabel } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { Copy } from "lucide-react";

export const Route = createFileRoute("/admin/fraud")({ component: FraudPage });

type DupEvt = {
  id: string;
  email: string | null;
  created_at: string;
  details: {
    resolution?: "confirmed" | "cancelled";
    amount?: number;
    recipient_name?: string;
    recipient_account?: string;
    sender_account?: string;
    seconds_ago?: number;
  };
};

function FraudPage() {
  const { rows, isNew } = useLiveTransactions({ flaggedOnly: true, limit: 100 });
  const [dupEvents, setDupEvents] = useState<DupEvt[]>([]);
  const newDupRef = useRef<Set<string>>(new Set());
  const [, force] = useState(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from("security_events")
        .select("id,email,created_at,details")
        .eq("event_type", "duplicate_attempt")
        .order("created_at", { ascending: false })
        .limit(100);
      if (mounted) setDupEvents((data ?? []) as DupEvt[]);
    })();
    const ch = supabase.channel("admin-fraud-dup")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "security_events", filter: "event_type=eq.duplicate_attempt" }, (payload) => {
        const e = payload.new as DupEvt;
        newDupRef.current.add(e.id);
        setDupEvents((prev) => [e, ...prev].slice(0, 200));
        force((n) => n + 1);
        setTimeout(() => { newDupRef.current.delete(e.id); force((n) => n + 1); }, 2500);
      })
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">Fraud Detection</h1>
        <p className="text-sm text-muted-foreground">Rule-based flagging across all accounts. New flags trigger a toast.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Copy className="size-4" /> Duplicate transfer attempts</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[300px] overflow-auto">
            {dupEvents.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">No duplicate attempts yet.</div>}
            {dupEvents.map((e) => {
              const isNewRow = newDupRef.current.has(e.id);
              const confirmed = e.details?.resolution === "confirmed";
              return (
                <div key={e.id} className={`p-4 border-b ${isNewRow ? "row-flag" : ""}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="destructive">DUPLICATE</Badge>
                        <Badge variant={confirmed ? "destructive" : "secondary"}>{confirmed ? "SENT ANYWAY" : "CANCELLED"}</Badge>
                        <span className="font-medium">{money(e.details?.amount ?? 0)}</span>
                        <span className="text-xs text-muted-foreground">→ {e.details?.recipient_name ?? e.details?.recipient_account ?? "—"}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {fullTime(e.created_at)} · {e.email ?? "unknown"} · same amount within {e.details?.seconds_ago ?? 0}s
                      </div>
                      <div className="text-sm mt-1">Reason: Duplicate transfer — same amount to same recipient within 2 minutes</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Flagged transactions</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[640px] overflow-auto">
            {rows.length === 0 && <div className="p-10 text-center text-muted-foreground text-sm">No flagged transactions yet.</div>}
            {rows.map((t) => {
              const isDup = (t.reason_flagged ?? "").toLowerCase().includes("duplicate");
              return (
                <div key={t.id}
                  className={`p-4 border-b bg-destructive/10 ${isNew(t.id) ? "row-flag" : ""}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{txTypeLabel(t.type)} · {money(t.amount)}</div>
                      <div className="text-xs text-muted-foreground">{fullTime(t.timestamp)} · {t.location ?? "—"}</div>
                    </div>
                    <div className="flex gap-1">
                      {isDup && <Badge variant="destructive">DUPLICATE</Badge>}
                      <Badge variant="destructive">Flagged</Badge>
                    </div>
                  </div>
                  <div className="mt-2 text-sm"><span className="text-muted-foreground">Reason: </span>{t.reason_flagged}</div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
