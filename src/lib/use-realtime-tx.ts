import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Tx = {
  id: string;
  account_id: string;
  related_account_id: string | null;
  amount: number;
  type: "deposit" | "withdrawal" | "transfer_out" | "transfer_in";
  status: "normal" | "flagged";
  reason_flagged: string | null;
  location: string | null;
  note: string | null;
  timestamp: string;
  initiated_by: "system" | "customer";
};

type Opts = { accountIds?: string[]; flaggedOnly?: boolean; limit?: number };

export function useLiveTransactions(opts: Opts = {}) {
  const [rows, setRows] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const newIdsRef = useRef<Set<string>>(new Set());
  const limit = opts.limit ?? 100;
  const accountIds = opts.accountIds;
  const flaggedOnly = opts.flaggedOnly;
  const filterKey = (accountIds ?? []).join(",") + "|" + (flaggedOnly ? "1" : "0");

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    (async () => {
      let q = supabase.from("transactions").select("*").order("timestamp", { ascending: false }).limit(limit);
      if (flaggedOnly) q = q.eq("status", "flagged");
      if (accountIds && accountIds.length) {
        const list = accountIds.map((id) => `account_id.eq.${id},related_account_id.eq.${id}`).join(",");
        q = q.or(list);
      }
      const { data } = await q;
      if (!mounted) return;
      setRows((data ?? []) as Tx[]);
      setLoading(false);
    })();

    const channel = supabase
      .channel("tx-live-" + filterKey + "-" + Math.random().toString(36).slice(2))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "transactions" }, (payload) => {
        const t = payload.new as Tx;
        if (flaggedOnly && t.status !== "flagged") return;
        if (accountIds && accountIds.length && !accountIds.includes(t.account_id) && !(t.related_account_id && accountIds.includes(t.related_account_id))) return;
        newIdsRef.current.add(t.id);
        setRows((prev) => [t, ...prev].slice(0, limit));
        setTimeout(() => newIdsRef.current.delete(t.id), 2000);
      })
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, limit]);

  return { rows, loading, isNew: (id: string) => newIdsRef.current.has(id) };
}

export function useLiveBalance(accountId: string | null) {
  const [balance, setBalance] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    let mounted = true;
    supabase.from("accounts").select("balance").eq("id", accountId).maybeSingle().then(({ data }) => {
      if (mounted && data) setBalance(Number(data.balance));
    });
    const ch = supabase.channel("bal-" + accountId)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "accounts", filter: `id=eq.${accountId}` }, (payload) => {
        setBalance(Number((payload.new as any).balance));
        setFlash(true);
        setTimeout(() => setFlash(false), 700);
      })
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [accountId]);

  return { balance, flash };
}
