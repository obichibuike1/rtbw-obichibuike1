import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useMyAccount } from "@/lib/use-my-account";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LogOut, User } from "lucide-react";

export const Route = createFileRoute("/app/profile")({ component: Page });

function Page() {
  const { user, signOut } = useAuth();
  const { account } = useMyAccount();
  const nav = useNavigate();
  return (
    <div className="p-5 space-y-4">
      <h1 className="text-xl font-semibold">Profile</h1>
      <Card className="p-5 rounded-2xl flex items-center gap-4">
        <div className="size-14 rounded-full bg-primary/15 text-primary flex items-center justify-center"><User className="size-7" /></div>
        <div>
          <div className="font-semibold">{account?.full_name ?? user?.email}</div>
          <div className="text-xs text-muted-foreground">{user?.email}</div>
        </div>
      </Card>
      {account && (
        <Card className="p-5 rounded-2xl space-y-3">
          <Row k="Account number" v={account.account_number} />
          <Row k="Account type" v={account.account_type} />
        </Card>
      )}
      <Button variant="outline" className="w-full" onClick={async () => { await signOut(); nav({ to: "/auth" }); }}>
        <LogOut className="size-4 mr-2" /> Sign out
      </Button>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{k}</span><span className="font-medium">{v}</span></div>;
}
