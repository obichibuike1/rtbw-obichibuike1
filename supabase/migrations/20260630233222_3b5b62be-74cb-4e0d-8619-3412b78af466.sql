
-- 1) Tighten accounts SELECT: remove is_system public visibility
DROP POLICY IF EXISTS "accounts read own or system or admin" ON public.accounts;
CREATE POLICY "accounts read own or admin"
  ON public.accounts FOR SELECT TO authenticated
  USING ((customer_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'));

-- 2) user_roles: explicit deny for INSERT/UPDATE/DELETE by any authenticated user.
--    service_role bypasses RLS, so admin/maintenance scripts still work.
DROP POLICY IF EXISTS "user_roles no insert" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles no update" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles no delete" ON public.user_roles;
CREATE POLICY "user_roles no insert" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "user_roles no update" ON public.user_roles FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "user_roles no delete" ON public.user_roles FOR DELETE TO authenticated USING (false);

-- 3) Revoke broad EXECUTE on all SECURITY DEFINER functions, then grant narrowly.
REVOKE EXECUTE ON FUNCTION public.simulate_tick()                                            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.evaluate_fraud(uuid, numeric, text)                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                                          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role)                            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_role()                                              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.execute_transfer(text, numeric, text, text)                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.lookup_recipient(text)                                     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_login_lock(text)                                     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.register_failed_login(text)                                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.register_successful_login()                                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_transfer_pin(text)                                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_cap_rejection(numeric, numeric, numeric, text)         FROM PUBLIC, anon, authenticated;

-- Functions that authenticated users (or RLS) must call:
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role()                                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_transfer(text, numeric, text, text)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_recipient(text)                             TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_successful_login()                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_transfer_pin(text)                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_cap_rejection(numeric, numeric, numeric, text) TO authenticated;

-- Internal functions (simulate_tick, evaluate_fraud, handle_new_user, check_login_lock,
-- register_failed_login) are invoked only by service_role (server-side) or by triggers,
-- both of which bypass these grants. No anon/authenticated grant needed.
