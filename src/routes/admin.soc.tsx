import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { SEVERITY_STYLE, THREAT_META, type Severity } from "@/lib/soc";
import { Ban, Eye, ShieldCheck, ArrowUp, User, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/admin/soc")({ component: SocFeed });

type Evt = {
  id: string; threat_type: string; severity: Severity; status: string; priority: number;
  ip_address: string | null; target_email: string | null; field: string | null; payload: string | null;
  simulated: boolean; reviewed: boolean; created_at: string;
};

function SocFeed() {
  const [rows, setRows] = useState<Evt[]>([]);
  const newRef = useRef<Set<string>>(new Set());
  const [, force] = useState(0);
  const [severityFilter, setSeverityFilter] = useState<Severity | "all">("all");

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.from("soc_events")
        .select("*").order("priority", { ascending: false }).order("created_at", { ascending: false }).limit(200);
      if (mounted) setRows((data ?? []) as Evt[]);
    })();
    const ch = supabase.channel("soc-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "soc_events" }, (payload) => {
        if (payload.eventType === "INSERT") {
          const e = payload.new as Evt;
          newRef.current.add(e.id);
          setRows((prev) => [e, ...prev].slice(0, 300));
          setTimeout(() => { newRef.current.delete(e.id); force((n) => n + 1); }, 3000);
        } else if (payload.eventType === "UPDATE") {
          const e = payload.new as Evt;
          setRows((prev) => prev.map((r) => r.id === e.id ? e : r).sort((a, b) => (b.priority - a.priority) || (new Date(b.created_at).getTime() - new Date(a.created_at).getTime())));
        }
      }).subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, []);

  const flagIp = async (ip: string) => {
    const { error } = await supabase.rpc("admin_flag_ip", { _ip: ip, _reason: "Flagged from SOC feed", _permanent: false } as any);
    if (error) toast.error(error.message); else toast.success(`IP ${ip} flagged`);
  };
  const act = async (id: string, action: "dismiss" | "escalate" | "review") => {
    const { error } = await supabase.rpc("admin_soc_action", { _event_id: id, _action: action } as any);
    if (error) toast.error(error.message); else if (action === "escalate") toast.success("Escalated");
  };

  const clearSimulated = async () => {
    const { data, error } = await supabase.rpc("admin_clear_simulated_soc" as any);
    if (error) { toast.error(error.message); return; }
    setRows((prev) => prev.filter((r) => !r.simulated));
    toast.success(`Cleared ${data ?? 0} simulated event${data === 1 ? "" : "s"}`);
  };

  const filtered = severityFilter === "all" ? rows : rows.filter((r) => r.severity === severityFilter);
  const unreviewed = rows.filter((r) => !r.reviewed).length;
  const simCount = rows.filter((r) => r.simulated).length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><ShieldCheck className="size-6 text-primary" /> Threat Intelligence Feed</h1>
          <p className="text-sm text-muted-foreground">Live SOC — every detected attack across the platform. {unreviewed} unreviewed.</p>
        </div>
        <div className="flex gap-1 flex-wrap items-center">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" className="text-xs" disabled={simCount === 0}>
                <Trash2 className="size-3 mr-1" /> Clear simulated ({simCount})
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear all simulated events?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes every event tagged <span className="font-mono px-1 border rounded bg-muted">SIMULATED</span> from the SOC feed. Real detections stay.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={clearSimulated}>Clear simulated</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {(["all","red","orange","yellow","blue"] as const).map((s) => (
            <Button key={s} size="sm" variant={severityFilter === s ? "default" : "outline"}
              onClick={() => setSeverityFilter(s as any)} className="text-xs uppercase">
              {s === "all" ? "All" : (<><span className={`inline-block size-2 rounded-full ${SEVERITY_STYLE[s].dot} mr-1.5`} />{s}</>)}
            </Button>
          ))}
        </div>
      </div>

      <Card className="soc-terminal">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-mono uppercase tracking-widest text-primary">// live threat stream</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[720px] overflow-auto">
            {filtered.length === 0 && <div className="p-12 text-center text-muted-foreground text-sm font-mono">// no threats detected</div>}
            {filtered.map((e) => {
              const style = SEVERITY_STYLE[e.severity] ?? SEVERITY_STYLE.blue;
              const meta = THREAT_META[e.threat_type] ?? { label: e.threat_type };
              const isNewRow = newRef.current.has(e.id);
              const isEscalated = e.priority > 0;
              return (
                <div key={e.id}
                  className={`p-3 border-b border-border/40 ${style.row} ${isNewRow ? "threat-new-pulse" : ""} ${isEscalated ? "bg-destructive/10" : ""} ${e.reviewed ? "opacity-60" : ""}`}>
                  <div className="flex items-start gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                      <Badge className={`${style.badge} border font-mono text-[10px] uppercase`}>{style.label}</Badge>
                      <span className="font-semibold text-sm">{meta.label}</span>
                      <Badge variant={e.status === "blocked" ? "destructive" : "outline"} className="text-[10px] uppercase font-mono">{e.status}</Badge>
                      {isEscalated && <Badge variant="destructive" className="text-[10px] uppercase">HIGH PRIORITY</Badge>}
                      {e.simulated && <Badge variant="secondary" className="text-[10px] uppercase font-mono bg-muted-foreground/20">SIMULATED</Badge>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {e.ip_address && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => flagIp(e.ip_address!)}><Ban className="size-3 mr-1" />Flag IP</Button>}
                      {e.target_email && <Button asChild size="sm" variant="outline" className="h-7 text-xs"><Link to="/admin/accounts"><User className="size-3 mr-1" />Account</Link></Button>}
                      {!isEscalated && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => act(e.id, "escalate")}><ArrowUp className="size-3 mr-1" />Escalate</Button>}
                      {!e.reviewed && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => act(e.id, "dismiss")}><Eye className="size-3 mr-1" />Dismiss</Button>}
                    </div>
                  </div>
                  <div className="mt-1.5 text-xs font-mono text-muted-foreground flex flex-wrap gap-3">
                    <span>{new Date(e.created_at).toLocaleTimeString()}</span>
                    {e.ip_address && <span>IP <span className="text-primary">{e.ip_address}</span></span>}
                    {e.field && <span>@ {e.field}</span>}
                    {e.target_email && <span>→ {e.target_email}</span>}
                  </div>
                  {e.payload && (
                    <div className="mt-2 p-2 rounded bg-muted/60 border border-border/60 font-mono text-xs text-warning break-all">
                      {e.payload}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
