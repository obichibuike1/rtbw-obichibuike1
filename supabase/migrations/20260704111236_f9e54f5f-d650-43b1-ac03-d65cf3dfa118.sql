
-- Function to check if an email belongs to an admin (before sending password reset)
CREATE OR REPLACE FUNCTION public.is_admin_email(_email text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    JOIN public.user_roles r ON r.user_id = u.id
    WHERE u.email = _email AND r.role = 'admin'
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_email(text) TO anon, authenticated;

-- Function to flag an IP as a targeted admin attack (public, security-log style)
CREATE OR REPLACE FUNCTION public.flag_admin_login_attack(_ip text, _email text, _attempts int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _ip IS NULL OR length(_ip) = 0 THEN RETURN; END IF;
  INSERT INTO public.blocked_ips (ip_address, reason, attack_count, blocked_by, permanent)
  VALUES (
    _ip,
    'Repeated failed admin login attempts — possible targeted admin account attack from IP ' || _ip,
    COALESCE(_attempts, 3),
    'auto',
    false
  )
  ON CONFLICT (ip_address) DO UPDATE
    SET attack_count = public.blocked_ips.attack_count + 1,
        reason = EXCLUDED.reason,
        last_seen = now();

  INSERT INTO public.soc_events (
    threat_type, severity, status, ip_address, target_email, field, payload, simulated, details
  ) VALUES (
    'admin_targeted_attack', 'red', 'blocked', _ip, _email, 'admin_login',
    'Repeated failed admin login attempts from ' || _ip, false,
    jsonb_build_object('attempts', _attempts, 'email', _email)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.flag_admin_login_attack(text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.flag_admin_login_attack(text, text, int) TO anon, authenticated;
