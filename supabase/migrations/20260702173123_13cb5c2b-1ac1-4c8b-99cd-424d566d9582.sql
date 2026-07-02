
-- Revoke EXECUTE from anon/authenticated on server-only SECURITY DEFINER functions.
-- These are only invoked by the backend using the service role.

REVOKE EXECUTE ON FUNCTION public.simulate_tick() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_password_reset(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_login_lock(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.register_failed_login(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.evaluate_fraud(uuid, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.simulate_tick() TO service_role;
GRANT EXECUTE ON FUNCTION public.log_password_reset(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_login_lock(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.register_failed_login(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.evaluate_fraud(uuid, numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
