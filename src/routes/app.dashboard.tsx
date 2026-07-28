import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useMyAccount } from "@/lib/use-my-account";
import { useLiveBalance, useLiveTransactions } from "@/lib/use-realtime-tx";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { money, shortTime, txTypeLabel } from "@/lib/format";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Send,
  ArrowLeftRight,
  CircleDollarSign,
  TrendingDown,
  TrendingUp,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/app/dashboard")({ component: CustomerHome });

function CustomerHome() {
  const { account, loading } = useMyAccount();
  const { balance, flash } = useLiveBalance(account?.id ?? null);
  const { rows, isNew } = useLiveTransactions({
    accountIds: account ? [account.id] : [],
    limit: 10,
  });

  const { monthIn, monthOut } = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    let inSum = 0;
    let outSum = 0;
    for (const t of rows) {
      if (new Date(t.timestamp) < startOfMonth) continue;
      const isIn = t.type === "deposit" || t.type === "transfer_in";
      if (isIn) inSum += Number(t.amount);
      else outSum += Number(t.amount);
    }
    return { monthIn: inSum, monthOut: outSum };
  }, [rows]);

  if (loading || !account)
    return (
      <div className="p-6 space-y-5 animate-pulse">
        <div className="h-8 bg-muted rounded-lg w-48" />
        <div className="h-40 bg-muted rounded-3xl" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-24 bg-muted rounded-2xl" />
          <div className="h-24 bg-muted rounded-2xl" />
        </div>
      </div>
    );

  const shown = balance ?? Number(account.balance);

  return (
    <div className="p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Welcome back</p>
          <h1 className="text-lg font-semibold truncate max-w-56">{account.full_name}</h1>
        </div>
        <Button asChild variant="ghost" size="icon" className="rounded-full" aria-label="Profile">
          <Link to="/app/profile"><User className="size-5" /></Link>
        </Button>
      </div>

      {/* Balance card */}
      <Card
        className={`relative overflow-hidden p-6 bg-gradient-to-br from-primary via-primary to-secondary text-primary-foreground rounded-3xl transition-all ${
          flash ? "scale-[1.02] ring-4 ring-primary/30" : ""
        }`}
      >
        <div className="absolute -top-6 -right-6 size-32 rounded-full bg-white/5" />
        <div className="absolute -bottom-4 -left-4 size-24 rounded-full bg-white/5" />
        <div className="relative">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider opacity-80">
            <CircleDollarSign className="size-3.5" /> Available balance
          </div>
          <div className="text-4xl font-bold mt-1.5 tabular-nums tracking-tight">
            {money(shown)}
          </div>
          <div className="flex items-center gap-3 mt-3 text-[11px] opacity-70 font-mono">
            <span>{account.account_number}</span>
            <span className="w-1 h-1 rounded-full bg-current opacity-50" />
            <span className="capitalize">{account.account_type.replace("_", " ")}</span>
          </div>
        </div>
      </Card>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button asChild size="lg" className="h-20 rounded-2xl flex-col gap-0.5">
          <Link to="/app/send">
            <Send className="size-5" />
            <span className="text-xs font-normal">Send money</span>
          </Link>
        </Button>
        <Button
          asChild
          size="lg"
          variant="outline"
          className="h-20 rounded-2xl flex-col gap-0.5"
        >
          <Link to="/app/transactions">
            <ArrowLeftRight className="size-5" />
            <span className="text-xs font-normal">All activity</span>
          </Link>
        </Button>
      </div>

      {/* Monthly summary */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 rounded-2xl space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <TrendingUp className="size-3.5 text-success" />
            Money in
          </div>
          <div className="text-lg font-bold tabular-nums text-success">{money(monthIn)}</div>
          <div className="text-[11px] text-muted-foreground">This month</div>
        </Card>
        <Card className="p-4 rounded-2xl space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <TrendingDown className="size-3.5 text-destructive" />
            Money out
          </div>
          <div className="text-lg font-bold tabular-nums text-destructive">{money(monthOut)}</div>
          <div className="text-[11px] text-muted-foreground">This month</div>
        </Card>
      </div>

      {/* Recent activity */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Recent activity</h2>
          <Link
            to="/app/transactions"
            className="text-xs text-primary font-medium"
          >
            See all
          </Link>
        </div>
        <Card className="divide-y rounded-2xl overflow-hidden">
          {rows.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No transactions yet. Send your first payment!
            </div>
          )}
          {rows.map((t) => {
            const isIncoming =
              t.type === "deposit" || t.type === "transfer_in";
            return (
              <div
                key={t.id}
                className={`flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/30 ${
                  isNew(t.id) ? "row-enter" : ""
                }`}
              >
                <div
                  className={`size-9 shrink-0 rounded-xl flex items-center justify-center ${
                    isIncoming
                      ? "bg-success/15 text-success"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isIncoming ? (
                    <ArrowDownLeft className="size-4.5" />
                  ) : (
                    <ArrowUpRight className="size-4.5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {txTypeLabel(t.type)}
                    </span>
                    {t.status === "flagged" && (
                      <Badge
                        variant="destructive"
                        className="text-[10px] h-4 px-1.5"
                      >
                        Flagged
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {shortTime(t.timestamp)}
                    {t.location ? <> · {t.location}</> : null}
                  </div>
                </div>
                <div
                  className={`text-right text-sm font-semibold tabular-nums ${
                    isIncoming ? "text-success" : ""
                  }`}
                >
                  {isIncoming ? "+" : "−"}
                  {money(t.amount)}
                </div>
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
}
