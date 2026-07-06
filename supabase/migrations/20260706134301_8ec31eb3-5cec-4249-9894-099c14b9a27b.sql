DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role)                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role()                                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_duplicate_transfer(text, numeric)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_transfer(text, numeric, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_duplicate_attempt(text, numeric, text, integer)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_security_question()                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_security_question(text, text)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_security_answer(text, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_security_challenge_triggered(numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_transfer_pin(text)                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_cap_rejection(numeric, numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_recipient(text)                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_successful_login()                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_setting(text, jsonb)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_flag_ip(text, text, boolean)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unblock_ip(text)                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_soc_action(uuid, text)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_soc_event(text,text,text,text,text,text,text,text,boolean,jsonb) TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_admin_email(text)                           TO anon;
GRANT EXECUTE ON FUNCTION public.flag_admin_login_attack(text, text, integer)   TO anon;
GRANT EXECUTE ON FUNCTION public.log_soc_event(text,text,text,text,text,text,text,text,boolean,jsonb) TO anon;