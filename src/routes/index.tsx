import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Activity, ShieldCheck, Smartphone, Zap } from "lucide-react";

export const Route = createFileRoute("/")({ component: Landing });

function Landing() {
  const { role, loading } = useAuth();
  const nav = useNavigate();
  useEffect(() => {
    if (!loading && role === "admin") nav({ to: "/admin/dashboard" });
    else if (!loading && role === "customer") nav({ to: "/app/dashboard" });
  }, [role, loading, nav]);

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold">
            <Activity className="size-5 text-primary" /> PulseBank
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost"><Link to="/auth">Sign in</Link></Button>
            <Button asChild><Link to="/auth">Get started</Link></Button>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-20">
        <div className="max-w-3xl">
          <span className="inline-block text-xs font-medium px-2 py-1 rounded-full bg-accent text-accent-foreground mb-4">
            Final-year CS project · Real-time data processing
          </span>
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight">
            Real-time banking. <span className="text-primary">Watched live.</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            PulseBank streams every transaction the instant it posts. Admins monitor the firehose and
            detect fraud in real time. Customers see their balance and transfers update with zero refresh.
          </p>
          <div className="mt-8 flex gap-3">
            <Button asChild size="lg"><Link to="/auth">Open dashboard</Link></Button>
          </div>
        </div>
        <div className="grid sm:grid-cols-3 gap-4 mt-16">
          {[
            { icon: Activity, title: "Live monitoring", body: "All transactions stream into a single ops console." },
            { icon: ShieldCheck, title: "Fraud detection", body: "Rule-based flagging fires the moment a tx posts." },
            { icon: Smartphone, title: "Mobile banking", body: "Customer app updates balances and feeds instantly." },
          ].map((c) => (
            <div key={c.title} className="rounded-2xl border bg-card p-6">
              <c.icon className="size-5 text-primary" />
              <h3 className="mt-3 font-semibold">{c.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{c.body}</p>
            </div>
          ))}
        </div>
      </main>
      <footer className="border-t mt-20">
        <div className="max-w-6xl mx-auto px-6 py-6 text-sm text-muted-foreground flex items-center gap-2">
          <Zap className="size-4" /> Powered by realtime streaming. Demo project.
        </div>
      </footer>
    </div>
  );
}
