import { createFileRoute, Link } from "@tanstack/react-router";
import { useMyAccount } from "@/lib/use-my-account";
import { useLiveBalance, useLiveTransactions } from "@/lib/use-realtime-tx";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { money, shortTime, txTypeLabel } from "@/lib/format";
import { ArrowDownLeft, ArrowUpRight, FileText, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/app/dashboard")({ component: CustomerHome });

function CustomerHome() {
  const { account, loading } = useMyAccount();
  const { balance, flash } = useLiveBalance(account?.id ?? null);
  const { rows, isNew } = useLiveTransactions({ accountIds: account ? [account.id] : [], limit: 10 });

  if (loading || !account) return <div className="p-6 text-muted-foreground">Loading…</div>;

  const shown = balance ?? Number(account.balance);

  return (
    <div className="p-5 space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">Welcome back,</p>
        <h1 className="text-xl font-semibold">{account.full_name}</h1>
      </div>

      <Card className={`p-6 bg-gradient-to-br from-primary to-primary/80 text-primary-foreground rounded-3xl transition-all ${flash ? "scale-[1.02] ring-4 ring-primary/30" : ""}`}>
        <div className="text-xs uppercase opacity-80">Available balance</div>
        <div className="text-4xl font-bold mt-1 tabular-nums">{money(shown)}</div>
        <div className="text-xs opacity-80 mt-3 font-mono">{account.account_number} · {account.account_type}</div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Button asChild size="lg" className="h-16 rounded-2xl">
          <Link to="/app/send"><Send className="size-5 mr-2" /> Send Money</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="h-16 rounded-2xl">
          <Link to="/app/transactions"><FileText className="size-5 mr-2" /> Statement</Link>
        </Button>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Recent activity</h2>
          <Link to="/app/transactions" className="text-xs text-primary">See all</Link>
        </div>
        <Card className="divide-y rounded-2xl overflow-hidden">
          {rows.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No transactions yet.</div>}
          {rows.map((t) => {
            const isIncoming = t.type === "deposit" || (t.type === "transfer_in");
            return (
              <div key={t.id} className={`flex items-center gap-3 p-4 ${isNew(t.id) ? "row-enter" : ""}`}>
                <div className={`size-10 rounded-full flex items-center justify-center ${isIncoming ? "bg-success/15 text-success" : "bg-muted text-foreground"}`}>
                  {isIncoming ? <ArrowDownLeft className="size-5" /> : <ArrowUpRight className="size-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{txTypeLabel(t.type)}</span>
                    {t.status === "flagged" && <Badge variant="destructive" className="text-[10px]">Flagged</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">{shortTime(t.timestamp)}{t.location ? ` · ${t.location}` : ""}</div>
                </div>
                <div className={`text-right font-semibold tabular-nums ${isIncoming ? "text-success" : ""}`}>
                  {isIncoming ? "+" : "−"}{money(t.amount)}
                </div>
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
}
