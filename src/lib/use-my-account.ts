import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type Account = {
  id: string; account_number: string; full_name: string;
  balance: number; account_type: string;
};

export function useMyAccount() {
  const { user } = useAuth();
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!user) return;
    let mounted = true;
    supabase.from("accounts").select("*").eq("customer_id", user.id).maybeSingle()
      .then(({ data }) => { if (mounted) { setAccount(data as Account | null); setLoading(false); } });
    return () => { mounted = false; };
  }, [user]);
  return { account, loading };
}
