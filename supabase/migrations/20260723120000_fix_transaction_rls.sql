-- Fix RLS on transactions: users should only see rows where their account
-- is the account_id (own perspective), not where they appear as related_account_id
-- (which is the other party's perspective of the same transaction).

DROP POLICY IF EXISTS "tx read own or related or admin" ON public.transactions;

CREATE POLICY "tx read own" ON public.transactions FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = account_id AND a.customer_id = auth.uid())
);
