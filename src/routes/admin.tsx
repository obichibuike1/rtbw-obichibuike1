import { createFileRoute, Outlet, useNavigate, Link, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";
import { Activity, ShieldAlert, Users, BarChart3, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tickSimulator } from "@/lib/banking.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({ component: AdminLayout });


const items = [
  { title: "Live Monitor", url: "/admin/dashboard", icon: Activity },
  { title: "Fraud Detection", url: "/admin/fraud", icon: ShieldAlert },
  { title: "Security Events", url: "/admin/security", icon: ShieldCheck },
  { title: "Accounts", url: "/admin/accounts", icon: Users },
  { title: "Analytics", url: "/admin/analytics", icon: BarChart3 },
];

function AdminLayout() {
  const { role, loading, roleLoading, signOut, user } = useAuth();
  const nav = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (loading || roleLoading) return;
    if (!user) nav({ to: "/auth" });
    else if (role !== "admin") nav({ to: "/app/dashboard" });
  }, [role, user, loading, roleLoading, nav]);

  // Background simulator: fires while admin is in the app
  useEffect(() => {
    if (role !== "admin") return;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try { await tickSimulator(); } catch {}
      const next = 2000 + Math.random() * 3000;
      setTimeout(tick, next);
    };
    const id = setTimeout(tick, 1500);
    return () => { stopped = true; clearTimeout(id); };
  }, [role]);

  // Fraud toast feed (admin global)
  useEffect(() => {
    if (role !== "admin") return;
    const ch = supabase.channel("admin-flag-toast")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "transactions" }, (payload) => {
        const t = payload.new as any;
        if (t.status === "flagged") {
          toast.warning("Flagged transaction", { description: `${t.reason_flagged} · $${t.amount}` });
        }
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [role]);

  if (loading || role !== "admin") return null;

  return (
    <div className="admin-theme">
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-background text-foreground">
          <Sidebar collapsible="icon">
            <SidebarContent>
              <div className="px-3 py-4 flex items-center gap-2 font-semibold">
                <Activity className="size-5 text-primary" /><span className="group-data-[collapsible=icon]:hidden">PulseBank Ops</span>
              </div>
              <SidebarGroup>
                <SidebarGroupLabel>Monitoring</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {items.map((it) => (
                      <SidebarMenuItem key={it.url}>
                        <SidebarMenuButton asChild isActive={pathname === it.url}>
                          <Link to={it.url}><it.icon className="size-4" /><span>{it.title}</span></Link>
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
