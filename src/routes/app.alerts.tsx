import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useMyAccount } from "@/lib/use-my-account";
import { useLiveTransactions } from "@/lib/use-realtime-tx";
import { Card } from "@/components/ui/card";
import { fullTime, money, txTypeLabel } from "@/lib/format";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/alerts")({ component: Page });

function Page() {
  const { account } = useMyAccount();
  const { rows, isNew } = useLiveTransactions({ accountIds: account ? [account.id] : [], flaggedOnly: true, limit: 50 });

  useEffect(() => {
    if (!rows.length) return;
    // Toast newest if just arrived
    const newest = rows[0];
    if (isNew(newest.id)) {
      toast.warning("Unusual transaction detected on your account", { description: newest.reason_flagged ?? undefined });
    }
  }, [rows, isNew]);

  return (
    <div className="p-5 space-y-4">
      <h1 className="text-xl font-semibold">Alerts</h1>
      <p className="text-sm text-muted-foreground">We notify you the moment anything on your account looks unusual.</p>

      {rows.length === 0 && (
        <Card className="p-8 text-center rounded-2xl">
          <div className="mx-auto size-12 rounded-full bg-success/15 text-success flex items-center justify-center mb-3">✓</div>
          <p className="text-sm">No alerts. Your account looks healthy.</p>
        </Card>
      )}

      <div className="space-y-3">
        {rows.map((t) => (
          <Card key={t.id} className={`p-4 rounded-2xl border-destructive/40 ${isNew(t.id) ? "row-flag" : ""}`}>
            <div className="flex items-start gap-3">
              <div className="size-10 rounded-full bg-destructive/15 text-destructive flex items-center justify-center"><AlertTriangle className="size-5" /></div>
              <div className="flex-1">
                <div className="font-medium">Unusual {txTypeLabel(t.type).toLowerCase()} — {money(t.amount)}</div>
                <div className="text-xs text-muted-foreground">{fullTime(t.timestamp)}</div>
                <div className="mt-2 text-sm">{t.reason_flagged}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
