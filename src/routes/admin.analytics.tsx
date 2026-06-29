import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";

export const Route = createFileRoute("/admin/analytics")({ component: Analytics });

function Analytics() {
  const [txs, setTxs] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const since = new Date(); since.setHours(since.getHours() - 24);
      const { data } = await supabase.from("transactions").select("*").gte("timestamp", since.toISOString()).order("timestamp");
      setTxs(data ?? []);
    };
    load();
    const ch = supabase.channel("analytics-tx")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "transactions" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const byHour = useMemo(() => {
    const buckets = new Map<number, number>();
    for (const t of txs) {
      const h = new Date(t.timestamp).getHours();
      buckets.set(h, (buckets.get(h) ?? 0) + Number(t.amount));
    }
    return Array.from({ length: 24 }, (_, h) => ({ hour: `${h}:00`, volume: Number((buckets.get(h) ?? 0).toFixed(2)) }));
  }, [txs]);

  const byType = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of txs) m.set(t.type, (m.get(t.type) ?? 0) + 1);
    return [...m.entries()].map(([name, value]) => ({ name, value }));
  }, [txs]);

  const ratio = useMemo(() => {
    const buckets = new Map<string, { flagged: number; normal: number }>();
    for (const t of txs) {
      const k = new Date(t.timestamp); k.setMinutes(0, 0, 0);
      const key = k.toISOString();
      const cur = buckets.get(key) ?? { flagged: 0, normal: 0 };
      if (t.status === "flagged") cur.flagged += 1; else cur.normal += 1;
      buckets.set(key, cur);
    }
    return [...buckets.entries()].sort().map(([t, v]) => ({ t: new Date(t).getHours() + ":00", ...v }));
  }, [txs]);

  const COLORS = ["#22c5b9", "#5b8def", "#f59e0b", "#ef4444"];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Analytics</h1>
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Volume by hour (24h)</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byHour}>
                <XAxis dataKey="hour" tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} />
                <YAxis tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }} />
                <Bar dataKey="volume" fill="var(--color-primary)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Type breakdown</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byType} dataKey="value" nameKey="name" outerRadius={90} label>
                  {byType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Flagged vs Normal — over time</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={ratio}>
                <XAxis dataKey="t" tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} />
                <YAxis tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }} />
                <Legend />
                <Line type="monotone" dataKey="normal" stroke="var(--color-primary)" />
                <Line type="monotone" dataKey="flagged" stroke="var(--color-destructive)" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
