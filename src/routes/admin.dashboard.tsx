import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useLiveTransactions, type Tx } from "@/lib/use-realtime-tx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { money, shortTime, txTypeLabel } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { Activity, AlertTriangle, BanknoteArrowUp, TrendingUp, ShieldOff, Target, Bug, Timer, Radar } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Line, LineChart, Legend } from "recharts";

export const Route = createFileRoute("/admin/dashboard")({ component: AdminDashboard });


function AdminDashboard() {
  const { rows, isNew } = useLiveTransactions({ limit: 50 });
  const [todayStats, setTodayStats] = useState({ count: 0, volume: 0, flagged: 0, avg: 0 });

  // recompute stats whenever rows change (cheap, demo scale)
  useEffect(() => {
    const since = new Date(); since.setHours(0, 0, 0, 0);
    (async () => {
      const { data } = await supabase
        .from("transactions").select("amount,status,timestamp")
        .gte("timestamp", since.toISOString());
      if (!data) return;
      const count = data.length;
      const volume = data.reduce((s: number, t: any) => s + Number(t.amount), 0);
      const flagged = data.filter((t: any) => t.status === "flagged").length;
      const avg = count ? volume / count : 0;
      setTodayStats({ count, volume, flagged, avg });
    })();
  }, [rows.length]);

  const chartData = useMemo(() => {
    const buckets = new Map<string, number>();
    rows.forEach((t) => {
      const k = new Date(t.timestamp);
      k.setSeconds(0, 0);
      const key = k.toISOString();
      buckets.set(key, (buckets.get(key) ?? 0) + Number(t.amount));
    });
    return [...buckets.entries()].sort().map(([t, v]) => ({ t: shortTime(t), volume: Number(v.toFixed(2)) }));
  }, [rows]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Live Monitoring</h1>
        <p className="text-sm text-muted-foreground">Real-time transaction stream across all accounts.</p>
      </div>

      <SecurityOverview />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={Activity} label="Transactions today" value={String(todayStats.count)} />
        <Stat icon={BanknoteArrowUp} label="Volume processed" value={money(todayStats.volume)} />
        <Stat icon={AlertTriangle} label="Flagged" value={String(todayStats.flagged)} accent="destructive" />
        <Stat icon={TrendingUp} label="Avg tx value" value={money(todayStats.avg)} />
      </div>

      <ThreatTimeline />


      <Card>
        <CardHeader><CardTitle className="text-base">Volume — last {chartData.length || 0} minutes</CardTitle></CardHeader>
        <CardContent className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="volg" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} />
              <YAxis tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }} />
              <Area type="monotone" dataKey="volume" stroke="var(--color-primary)" fill="url(#volg)" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Transaction feed</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card border-b text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Time</th>
                  <th className="text-left p-3">Type</th>
                  <th className="text-left p-3">Source</th>
                  <th className="text-left p-3">Location</th>
                  <th className="text-right p-3">Amount</th>
                  <th className="text-left p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t: Tx) => (
                  <tr key={t.id}
                    className={`border-b border-border/60 ${isNew(t.id) ? "row-enter" : ""} ${t.status === "flagged" ? "bg-destructive/10" : ""}`}>
                    <td className="p-3 font-mono text-xs">{shortTime(t.timestamp)}</td>
                    <td className="p-3">{txTypeLabel(t.type)}</td>
                    <td className="p-3">
                      <Badge variant={t.initiated_by === "customer" ? "default" : "secondary"}>
                        {t.initiated_by === "customer" ? "Customer Transfer" : "Simulated"}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground">{t.location ?? "—"}</td>
                    <td className="p-3 text-right font-medium">{money(t.amount)}</td>
                    <td className="p-3">
                      {t.status === "flagged"
                        ? <Badge variant="destructive">Flagged</Badge>
                        : <Badge variant="outline" className="text-muted-foreground">Normal</Badge>}
                    </td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Waiting for live transactions…</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent?: "destructive" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-muted-foreground"><span className="text-xs uppercase">{label}</span><Icon className={`size-4 ${accent === "destructive" ? "text-destructive" : "text-primary"}`} /></div>
        <div className={`text-2xl font-semibold mt-2 ${accent === "destructive" ? "text-destructive" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function SecurityOverview() {
  const [s, setS] = useState({ threats: 0, blocked: 0, ipsBlocked: 0, topAccount: "—", topAttack: "—", processed: 0, blockedTx: 0, avgResponse: "—" });
  const [uptimeStart] = useState(() => Date.now());
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tick((n) => n + 1), 60_000); return () => clearInterval(i); }, []);
  useEffect(() => {
    const load = async () => {
      const since = new Date(); since.setHours(0, 0, 0, 0);
      const [{ data: threats }, { count: ipsCount }, { data: txs }] = await Promise.all([
        supabase.from("soc_events").select("threat_type,target_email,created_at,reviewed,status").gte("created_at", since.toISOString()),
        supabase.from("blocked_ips").select("*", { count: "exact", head: true }),
        supabase.from("transactions").select("status").gte("timestamp", since.toISOString()),
      ]);
      const t = threats ?? [];
      const blockedTx = (txs ?? []).filter((x: any) => x.status === "flagged").length;
      const targets = new Map<string, number>();
      const types = new Map<string, number>();
      let responseSum = 0, responseCount = 0;
      t.forEach((r: any) => {
        if (r.target_email) targets.set(r.target_email, (targets.get(r.target_email) ?? 0) + 1);
        types.set(r.threat_type, (types.get(r.threat_type) ?? 0) + 1);
        if (r.reviewed) responseCount++;
      });
      const top = [...targets.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
      const topAttack = [...types.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
      setS({
        threats: t.length,
        blocked: t.filter((r: any) => r.status === "blocked").length,
        ipsBlocked: ipsCount ?? 0,
        topAccount: top,
        topAttack,
        processed: (txs ?? []).length,
        blockedTx,
        avgResponse: responseCount ? "reviewed" : "pending",
      });
    };
    load();
    const ch = supabase.channel("sec-overview")
      .on("postgres_changes", { event: "*", schema: "public", table: "soc_events" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "blocked_ips" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);
  const upSec = Math.floor((Date.now() - uptimeStart) / 1000);
  const upStr = `${Math.floor(upSec/3600)}h ${Math.floor((upSec%3600)/60)}m`;
  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-2"><CardTitle className="text-sm uppercase tracking-widest text-primary font-mono">// security overview</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Mini icon={Radar} label="Threats today" value={String(s.threats)} accent="primary" />
        <Mini icon={ShieldOff} label="Auto-blocked" value={String(s.blocked)} accent="destructive" />
        <Mini icon={Bug} label="Blocked IPs" value={String(s.ipsBlocked)} accent="destructive" />
        <Mini icon={Target} label="Top targeted" value={s.topAccount === "—" ? "—" : s.topAccount.split("@")[0]} />
        <Mini icon={AlertTriangle} label="Top attack" value={s.topAttack} />
        <Mini icon={Activity} label="Uptime" value={upStr} accent="primary" />
        <Mini icon={Timer} label="Avg response" value={s.avgResponse} />
        <Mini icon={BanknoteArrowUp} label="Tx processed / blocked" value={`${s.processed} / ${s.blockedTx}`} />
      </CardContent>
    </Card>
  );
}

function Mini({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent?: "primary" | "destructive" }) {
  const color = accent === "destructive" ? "text-destructive" : accent === "primary" ? "text-primary" : "text-foreground";
  return (
    <div className="p-3 rounded-lg border bg-card/40">
      <div className="flex items-center justify-between text-muted-foreground text-[10px] uppercase"><span>{label}</span><Icon className={`size-3.5 ${color}`} /></div>
      <div className={`text-lg font-semibold mt-1 tabular-nums truncate ${color}`}>{value}</div>
    </div>
  );
}

function ThreatTimeline() {
  const [data, setData] = useState<Array<Record<string, any>>>([]);
  useEffect(() => {
    const load = async () => {
      const since = new Date(Date.now() - 24 * 3600 * 1000);
      const { data: rows } = await supabase.from("soc_events").select("threat_type,severity,created_at").gte("created_at", since.toISOString());
      const buckets = new Map<string, Record<string, number>>();
      for (let i = 0; i < 24; i++) {
        const d = new Date(Date.now() - (23 - i) * 3600 * 1000); d.setMinutes(0, 0, 0);
        buckets.set(d.toISOString(), { red: 0, orange: 0, yellow: 0, blue: 0 });
      }
      (rows ?? []).forEach((r: any) => {
        const d = new Date(r.created_at); d.setMinutes(0, 0, 0);
        const b = buckets.get(d.toISOString()); if (b) b[r.severity] = (b[r.severity] ?? 0) + 1;
      });
      setData([...buckets.entries()].map(([iso, v]) => ({ t: new Date(iso).getHours() + ":00", ...v })));
    };
    load();
    const ch = supabase.channel("timeline").on("postgres_changes", { event: "INSERT", schema: "public", table: "soc_events" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Threat Timeline — last 24h</CardTitle></CardHeader>
      <CardContent className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <XAxis dataKey="t" tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} />
            <YAxis tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} allowDecimals={false} />
            <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="red" stroke="#ef4444" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="orange" stroke="#f97316" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="yellow" stroke="#eab308" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="blue" stroke="#3b82f6" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

