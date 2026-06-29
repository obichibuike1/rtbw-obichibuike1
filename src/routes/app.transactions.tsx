import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMyAccount } from "@/lib/use-my-account";
import { useLiveTransactions } from "@/lib/use-realtime-tx";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { money, fullTime, txTypeLabel } from "@/lib/format";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/app/transactions")({ component: Page });

function Page() {
  const { account } = useMyAccount();
  const { rows, isNew } = useLiveTransactions({ accountIds: account ? [account.id] : [], limit: 200 });
  const [type, setType] = useState<string>("all");
  const [range, setRange] = useState<string>("30");

  const filtered = useMemo(() => {
    const cutoff = Date.now() - Number(range) * 24 * 3600 * 1000;
    return rows.filter((t) => (type === "all" || t.type === type) && new Date(t.timestamp).getTime() >= cutoff);
  }, [rows, type, range]);

  return (
    <div className="p-5 space-y-4">
      <h1 className="text-xl font-semibold">Activity</h1>
      <div className="flex gap-2">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="deposit">Deposits</SelectItem>
            <SelectItem value="withdrawal">Withdrawals</SelectItem>
            <SelectItem value="transfer_in">Received</SelectItem>
            <SelectItem value="transfer_out">Sent</SelectItem>
          </SelectContent>
        </Select>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Last 24h</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="365">Last year</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Card className="divide-y rounded-2xl overflow-hidden">
        {filtered.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No transactions match.</div>}
        {filtered.map((t) => {
          const isIncoming = t.type === "deposit" || t.type === "transfer_in";
          return (
            <div key={t.id} className={`flex items-center gap-3 p-4 ${isNew(t.id) ? "row-enter" : ""}`}>
              <div className={`size-10 rounded-full flex items-center justify-center ${isIncoming ? "bg-success/15 text-success" : "bg-muted"}`}>
                {isIncoming ? <ArrowDownLeft className="size-5" /> : <ArrowUpRight className="size-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2"><span className="font-medium">{txTypeLabel(t.type)}</span>
                  {t.status === "flagged" && <Badge variant="destructive" className="text-[10px]">Flagged</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">{fullTime(t.timestamp)}{t.location ? ` · ${t.location}` : ""}</div>
              </div>
              <div className={`text-right font-semibold tabular-nums ${isIncoming ? "text-success" : ""}`}>
                {isIncoming ? "+" : "−"}{money(t.amount)}
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
