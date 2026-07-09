import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Ban, ShieldOff, Radar } from "lucide-react";
import { toast } from "sonner";
import { fullTime } from "@/lib/format";

export const Route = createFileRoute("/admin/ips")({ component: IpManagement });

type Blocked = { ip_address: string; reason: string; attack_count: number; blocked_by: string; permanent: boolean; first_seen: string; last_seen: string };
type LiveIp = { ip: string; count: number; last: string; targets: Set<string> };

function IpManagement() {
  const [blocked, setBlocked] = useState<Blocked[]>([]);
  const [events, setEvents] = useState<Array<{ ip_address: string | null; target_email: string | null; created_at: string }>>([]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const [{ data: b }, { data: e }] = await Promise.all([
        supabase.from("blocked_ips").select("*").order("last_seen", { ascending: false }),
        supabase.from("soc_events").select("ip_address,target_email,created_at").gte("created_at", new Date(Date.now() - 5 * 60_000).toISOString()).order("created_at", { ascending: false }).limit(500),
      ]);
      if (!mounted) return;
      setBlocked((b ?? []) as Blocked[]);
      setEvents((e ?? []) as any);
    };
    load();
    const ch = supabase.channel("ip-mgmt")
      .on("postgres_changes", { event: "*", schema: "public", table: "blocked_ips" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "soc_events" }, load)
      .subscribe();
    const interval = window.setInterval(load, 5000);
    return () => { mounted = false; supabase.removeChannel(ch); window.clearInterval(interval); };
  }, []);

  const liveIps: LiveIp[] = useMemo(() => {
    const map = new Map<string, LiveIp>();
    events.forEach((r) => {
      if (!r.ip_address) return;
      const cur = map.get(r.ip_address) ?? { ip: r.ip_address, count: 0, last: r.created_at, targets: new Set<string>() };
      cur.count++;
      if (r.created_at > cur.last) cur.last = r.created_at;
      if (r.target_email) cur.targets.add(r.target_email);
      map.set(r.ip_address, cur);
    });
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [events]);

  const flag = async (ip: string, permanent = false) => {
    const { error } = await supabase.rpc("admin_flag_ip", { _ip: ip, _reason: permanent ? "Permanent ban" : "Manual flag from IP Management", _permanent: permanent } as any);
    if (error) toast.error(error.message); else toast.success(`IP ${ip} ${permanent ? "permanently banned" : "flagged"}`);
  };
  const unblock = async (ip: string) => {
    const { error } = await supabase.rpc("admin_unblock_ip", { _ip: ip } as any);
    if (error) toast.error(error.message); else toast.success(`IP ${ip} unblocked`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><ShieldOff className="size-6 text-primary" /> IP Management</h1>
        <p className="text-sm text-muted-foreground">Blocked list, live traffic monitor, and manual controls.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Ban className="size-4 text-destructive" /> Blocked IPs ({blocked.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground border-b">
                <tr><th className="text-left p-3">IP Address</th><th className="text-left p-3">Reason</th><th className="text-left p-3">Blocked</th><th className="text-right p-3">Attacks</th><th className="text-left p-3">Source</th><th className="text-right p-3">Actions</th></tr>
              </thead>
              <tbody>
                {blocked.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No blocked IPs.</td></tr>}
                {blocked.map((b) => (
                  <tr key={b.ip_address} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-mono text-destructive">{b.ip_address}</td>
                    <td className="p-3 text-muted-foreground">{b.reason}</td>
                    <td className="p-3 text-xs text-muted-foreground">{fullTime(b.first_seen)}</td>
                    <td className="p-3 text-right font-semibold tabular-nums">{b.attack_count}</td>
                    <td className="p-3"><Badge variant={b.blocked_by === "admin" ? "default" : "secondary"} className="text-[10px] uppercase">{b.blocked_by}</Badge>{b.permanent && <Badge variant="destructive" className="ml-1 text-[10px]">PERMANENT</Badge>}</td>
                    <td className="p-3 text-right space-x-1">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => unblock(b.ip_address)}>Unblock</Button>
                      {!b.permanent && <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => flag(b.ip_address, true)}>Permanent Ban</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Radar className="size-4 text-primary" /> Live IP Monitor (last 5 min)</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground border-b sticky top-0 bg-card">
                <tr><th className="text-left p-3">IP</th><th className="text-left p-3">Targets</th><th className="text-right p-3">Requests</th><th className="text-left p-3">Last seen</th><th className="text-right p-3">Action</th></tr>
              </thead>
              <tbody>
                {liveIps.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground text-sm">No live IP activity.</td></tr>}
                {liveIps.map((r) => {
                  const isBlocked = blocked.some((b) => b.ip_address === r.ip);
                  return (
                    <tr key={r.ip} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-mono"><span className={isBlocked ? "text-red-400" : r.count > 5 ? "text-amber-400" : "text-emerald-400"}>{r.ip}</span></td>
                      <td className="p-3 text-xs text-muted-foreground truncate max-w-xs">{[...r.targets].join(", ") || "—"}</td>
                      <td className="p-3 text-right font-semibold tabular-nums">{r.count}</td>
                      <td className="p-3 text-xs text-muted-foreground">{new Date(r.last).toLocaleTimeString()}</td>
                      <td className="p-3 text-right">
                        {isBlocked
                          ? <Badge variant="destructive" className="text-[10px]">BLOCKED</Badge>
                          : <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => flag(r.ip)}>Flag</Button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
