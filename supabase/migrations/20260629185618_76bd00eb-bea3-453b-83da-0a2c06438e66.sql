
-- Tighten accounts policy
DROP POLICY IF EXISTS "auth read all accounts" ON public.accounts;
CREATE POLICY "accounts read own or system or admin" ON public.accounts
  FOR SELECT TO authenticated
  USING (
    customer_id = auth.uid()
    OR is_system = true
    OR public.has_role(auth.uid(), 'admin')
  );

-- Tighten profiles policy
DROP POLICY IF EXISTS "profiles self read" ON public.profiles;
CREATE POLICY "profiles read own or admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Safe recipient lookup (returns name only) since customers can no longer read other accounts
CREATE OR REPLACE FUNCTION public.lookup_recipient(_account_number text)
RETURNS TABLE(account_number text, full_name text, account_type text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.account_number, a.full_name, a.account_type
  FROM public.accounts a
  WHERE a.account_number = _account_number
    AND a.is_system = false
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.lookup_recipient(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lookup_recipient(text) TO authenticated;

-- Revoke execute on internal SECURITY DEFINER functions that should not be callable via the API
REVOKE ALL ON FUNCTION public.simulate_tick() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.evaluate_fraud(uuid, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Keep authenticated EXECUTE only on functions intended to be called from the app
REVOKE ALL ON FUNCTION public.execute_transfer(text, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_transfer(text, numeric, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

REVOKE ALL ON FUNCTION public.get_my_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
