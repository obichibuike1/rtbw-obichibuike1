import { createFileRoute, Outlet, useNavigate, Link, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Home, ArrowLeftRight, Bell, User } from "lucide-react";

export const Route = createFileRoute("/app")({ component: CustomerLayout });

const tabs = [
  { url: "/app/dashboard", label: "Home", icon: Home },
  { url: "/app/transactions", label: "Activity", icon: ArrowLeftRight },
  { url: "/app/alerts", label: "Alerts", icon: Bell },
  { url: "/app/profile", label: "Profile", icon: User },
];

function CustomerLayout() {
  const { role, user, loading } = useAuth();
  const nav = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (loading) return;
    if (!user) nav({ to: "/auth" });
    else if (role !== "customer") nav({ to: "/admin/dashboard" });
  }, [user, role, loading, nav]);

  if (loading || role !== "customer") return null;

  return (
    <div className="min-h-screen bg-background flex flex-col mx-auto max-w-md w-full pb-20">
      <main className="flex-1"><Outlet /></main>
      <nav className="fixed bottom-0 inset-x-0 mx-auto max-w-md border-t bg-card">
        <div className="grid grid-cols-4">
          {tabs.map((t) => {
            const active = pathname === t.url;
            return (
              <Link key={t.url} to={t.url}
                className={`flex flex-col items-center justify-center gap-1 py-3 text-xs transition-colors ${active ? "text-primary" : "text-muted-foreground"}`}>
                <t.icon className="size-5" />
                <span className="font-medium">{t.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
