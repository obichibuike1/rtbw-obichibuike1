import { createFileRoute, Outlet, useNavigate, Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";
import { Activity, ShieldAlert, Users, BarChart3, LogOut, ShieldCheck, Radar, ShieldOff, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { tickSimulator } from "@/lib/banking.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { money } from "@/lib/format";
import { isRuleOn, useSystemSettings } from "@/lib/use-system-settings";
import { ThreatBanner } from "@/components/admin/ThreatBanner";

export const Route = createFileRoute("/admin")({ component: AdminLayout });


const items = [
  { title: "Live Monitor", url: "/admin/dashboard", icon: Activity },
  { title: "Control Panel", url: "/admin/control", icon: SlidersHorizontal },
  { title: "Threat Intelligence", url: "/admin/soc", icon: Radar, badgeKey: "unreviewed" as const },
  { title: "IP Management", url: "/admin/ips", icon: ShieldOff },
  { title: "Fraud Detection", url: "/admin/fraud", icon: ShieldAlert },
  { title: "Security Events", url: "/admin/security", icon: ShieldCheck },
  { title: "Accounts", url: "/admin/accounts", icon: Users },
  { title: "Analytics", url: "/admin/analytics", icon: BarChart3 },
];

function AdminLayout() {
  const { role, loading, roleLoading, signOut, user } = useAuth();
  const nav = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const settings = useSystemSettings();
  const simulatorOn = isRuleOn(settings, "rule.transaction_simulator", true);
  const [unreviewed, setUnreviewed] = useState(0);

  useEffect(() => {
    if (loading || roleLoading) return;
    if (!user) nav({ to: "/auth" });
    else if (role !== "admin") nav({ to: "/app/dashboard" });
  }, [role, user, loading, roleLoading, nav]);

  // Threat counter
  useEffect(() => {
    if (role !== "admin") return;
    const load = async () => {
      const { count } = await supabase.from("soc_events").select("*", { count: "exact", head: true }).eq("reviewed", false);
      setUnreviewed(count ?? 0);
    };
    load();
    const ch = supabase.channel("admin-threat-count")
      .on("postgres_changes", { event: "*", schema: "public", table: "soc_events" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [role]);

  // Background simulator — respects the toggle
  useEffect(() => {
    if (role !== "admin" || !simulatorOn) return;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try { await tickSimulator(); } catch {}
      const next = 2000 + Math.random() * 3000;
      setTimeout(tick, next);
    };
    const id = setTimeout(tick, 1500);
    return () => { stopped = true; clearTimeout(id); };
  }, [role, simulatorOn]);

  // Fraud toast feed (admin global)
  useEffect(() => {
    if (role !== "admin") return;
    const ch = supabase.channel("admin-flag-toast")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "transactions" }, (payload) => {
        const t = payload.new as any;
        if (t.status === "flagged") {
          toast.warning("Flagged transaction", { description: `${t.reason_flagged} · ${money(t.amount)}` });
        }
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [role]);

  if (loading || roleLoading || role !== "admin") return null;

  return (
    <div className="admin-theme">
      <ThreatBanner />
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-background text-foreground">
          <Sidebar collapsible="icon">
            <SidebarContent>
              <div className="px-3 py-4 flex items-center gap-2 font-semibold">
                <Activity className="size-5 text-primary" /><span className="group-data-[collapsible=icon]:hidden">PulseBank SOC</span>
              </div>
              <SidebarGroup>
                <SidebarGroupLabel>Monitoring</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {items.map((it) => (
                      <SidebarMenuItem key={it.url}>
                        <SidebarMenuButton asChild isActive={pathname === it.url}>
                          <Link to={it.url}>
                            <it.icon className="size-4" />
                            <span className="flex-1">{it.title}</span>
                            {it.badgeKey === "unreviewed" && unreviewed > 0 && (
                              <Badge variant="destructive" className="ml-auto text-[10px] h-5 min-w-5 justify-center px-1 group-data-[collapsible=icon]:hidden">{unreviewed > 99 ? "99+" : unreviewed}</Badge>
                            )}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>
          <div className="flex-1 flex flex-col min-w-0">
            <header className="h-14 border-b flex items-center justify-between px-4 bg-card/40 backdrop-blur">
              <div className="flex items-center gap-3">
                <SidebarTrigger />
                <span className="text-sm text-muted-foreground">Signed in as <span className="text-foreground font-medium">{user?.email}</span></span>
              </div>
              <Button variant="ghost" size="sm" onClick={async () => { await signOut(); nav({ to: "/auth" }); }}>
                <LogOut className="size-4 mr-1" /> Sign out
              </Button>
            </header>
            <main className="flex-1 p-6 overflow-auto"><Outlet /></main>
          </div>
        </div>
      </SidebarProvider>
    </div>
  );
}
