import { createFileRoute } from "@tanstack/react-router";
import { useLiveTransactions } from "@/lib/use-realtime-tx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { money, fullTime, txTypeLabel } from "@/lib/format";

export const Route = createFileRoute("/admin/fraud")({ component: FraudPage });

function FraudPage() {
  const { rows, isNew } = useLiveTransactions({ flaggedOnly: true, limit: 100 });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">Fraud Detection</h1>
        <p className="text-sm text-muted-foreground">Rule-based flagging across all accounts. New flags trigger a toast.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Flagged transactions</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[640px] overflow-auto">
            {rows.length === 0 && <div className="p-10 text-center text-muted-foreground text-sm">No flagged transactions yet.</div>}
            {rows.map((t) => (
              <div key={t.id}
                className={`p-4 border-b bg-destructive/10 ${isNew(t.id) ? "row-flag" : ""}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{txTypeLabel(t.type)} · {money(t.amount)}</div>
                    <div className="text-xs text-muted-foreground">{fullTime(t.timestamp)} · {t.location ?? "—"}</div>
                  </div>
                  <Badge variant="destructive">Flagged</Badge>
                </div>
                <div className="mt-2 text-sm"><span className="text-muted-foreground">Reason: </span>{t.reason_flagged}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
