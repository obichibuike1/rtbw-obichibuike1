
-- 1. Lock down SECURITY DEFINER functions: revoke from PUBLIC/anon, grant to appropriate roles

-- Revoke default PUBLIC execute on all our SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_login_lock(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.register_successful_login() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_security_challenge_triggered(numeric, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.verify_transfer_pin(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.register_failed_login(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_unblock_ip(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.verify_security_answer(text, numeric, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_soc_action(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_password_reset(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin_email(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.lookup_recipient(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_setting(text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_flag_ip(text, text, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.evaluate_fraud(uuid, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_rule_on(text, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_clear_simulated_soc() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_security_question() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_security_question(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.execute_transfer(text, numeric, text, text, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_cap_rejection(numeric, numeric, numeric, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_soc_event(text, text, text, text, text, text, text, text, boolean, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.flag_admin_login_attack(text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_reset_demo() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.simulate_tick() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_duplicate_attempt(text, numeric, text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_duplicate_transfer(text, numeric) FROM PUBLIC, anon;

-- Grant EXECUTE to authenticated only for functions the app calls with a user session.
-- Admin-guarded functions self-check via has_role, so authenticated is safe.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_successful_login() TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_security_challenge_triggered(numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_transfer_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unblock_ip(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_security_answer(text, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_soc_action(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_recipient(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_setting(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_flag_ip(text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_rule_on(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_clear_simulated_soc() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_security_question() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_security_question(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_transfer(text, numeric, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_cap_rejection(numeric, numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_demo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_duplicate_attempt(text, numeric, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_duplicate_transfer(text, numeric) TO authenticated;

-- 2. accounts: add explicit deny-by-default write policies (no client write path; writes go through SECURITY DEFINER RPCs owned by postgres, which bypass RLS)
DROP POLICY IF EXISTS "Deny client inserts on accounts" ON public.accounts;
DROP POLICY IF EXISTS "Deny client updates on accounts" ON public.accounts;
DROP POLICY IF EXISTS "Deny client deletes on accounts" ON public.accounts;
CREATE POLICY "Deny client inserts on accounts" ON public.accounts FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "Deny client updates on accounts" ON public.accounts FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "Deny client deletes on accounts" ON public.accounts FOR DELETE TO anon, authenticated USING (false);

-- 3. transactions: add explicit deny-by-default write policies
DROP POLICY IF EXISTS "Deny client inserts on transactions" ON public.transactions;
DROP POLICY IF EXISTS "Deny client updates on transactions" ON public.transactions;
DROP POLICY IF EXISTS "Deny client deletes on transactions" ON public.transactions;
CREATE POLICY "Deny client inserts on transactions" ON public.transactions FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "Deny client updates on transactions" ON public.transactions FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "Deny client deletes on transactions" ON public.transactions FOR DELETE TO anon, authenticated USING (false);

-- 4. system_settings: restrict SELECT to admins only. Server-side rule checks use is_rule_on() (SECURITY DEFINER) and are unaffected.
DROP POLICY IF EXISTS "Authenticated can read settings" ON public.system_settings;
DROP POLICY IF EXISTS "Anyone authenticated can read system_settings" ON public.system_settings;
DROP POLICY IF EXISTS "read system_settings" ON public.system_settings;
DROP POLICY IF EXISTS "Admins can read system_settings" ON public.system_settings;
CREATE POLICY "Admins can read system_settings" ON public.system_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
