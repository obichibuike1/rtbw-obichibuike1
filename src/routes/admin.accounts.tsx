import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { money, fullTime, txTypeLabel } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin/accounts")({ component: AccountsPage });

type Acc = { id: string; account_number: string; full_name: string; balance: number; account_type: string; is_system: boolean };

function AccountsPage() {
  const [accounts, setAccounts] = useState<Acc[]>([]);
  const [selected, setSelected] = useState<Acc | null>(null);
  const [txs, setTxs] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("accounts").select("*").order("full_name");
      setAccounts((data ?? []) as Acc[]);
    };
    load();
    const ch = supabase.channel("admin-accounts")
      .on("postgres_changes", { event: "*", schema: "public", table: "accounts" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  useEffect(() => {
    if (!selected) return;
    const load = async () => {
      const { data } = await supabase.from("transactions").select("*")
        .or(`account_id.eq.${selected.id},related_account_id.eq.${selected.id}`)
        .order("timestamp", { ascending: false }).limit(50);
      setTxs(data ?? []);
    };
    load();
    const ch = supabase.channel("admin-account-tx-" + selected.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "transactions" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [selected]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Accounts</h1>
      <Card>
        <CardHeader><CardTitle className="text-base">All accounts ({accounts.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground border-b">
              <tr><th className="text-left p-3">Account #</th><th className="text-left p-3">Holder</th><th className="text-left p-3">Type</th><th className="text-right p-3">Balance</th></tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} onClick={() => setSelected(a)} className="border-b cursor-pointer hover:bg-accent/40">
                  <td className="p-3 font-mono">{a.account_number}</td>
                  <td className="p-3">{a.full_name}</td>
                  <td className="p-3"><Badge variant="outline">{a.account_type}</Badge></td>
                  <td className="p-3 text-right font-semibold">{money(a.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {selected && (
        <Card>
          <CardHeader><CardTitle className="text-base">History · {selected.full_name} ({selected.account_number})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground border-b sticky top-0 bg-card">
                  <tr><th className="text-left p-3">Time</th><th className="text-left p-3">Type</th><th className="text-right p-3">Amount</th><th className="text-left p-3">Status</th></tr>
                </thead>
                <tbody>
                  {txs.map((t) => (
                    <tr key={t.id} className="border-b">
                      <td className="p-3 font-mono text-xs">{fullTime(t.timestamp)}</td>
                      <td className="p-3">{txTypeLabel(t.type)}</td>
                      <td className="p-3 text-right">{money(t.amount)}</td>
                      <td className="p-3">{t.status === "flagged" ? <Badge variant="destructive">Flagged</Badge> : <Badge variant="outline">Normal</Badge>}</td>
                    </tr>
                  ))}
                  {!txs.length && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No transactions.</td></tr>}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
