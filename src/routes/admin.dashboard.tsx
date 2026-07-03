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
