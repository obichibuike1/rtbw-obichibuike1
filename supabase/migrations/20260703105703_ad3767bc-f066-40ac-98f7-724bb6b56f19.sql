
-- ==== system_settings ====
CREATE TABLE public.system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settings readable by all authenticated" ON public.system_settings
  FOR SELECT TO authenticated USING (true);

-- writes go through has_role admin RPC only

-- ==== soc_events ====
CREATE TABLE public.soc_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  threat_type TEXT NOT NULL,          -- xss, sql_injection, brute_force, csrf, enumeration, session_hijack, phishing, duplicate_attack, credential_stuffing
  severity TEXT NOT NULL,             -- red / orange / yellow / blue
  status TEXT NOT NULL DEFAULT 'flagged',  -- blocked / flagged / monitoring / dismissed
  priority INT NOT NULL DEFAULT 0,    -- higher = escalated
  ip_address TEXT,
  user_agent TEXT,
  fingerprint TEXT,
  target_email TEXT,
  target_account_id UUID,
  field TEXT,
  payload TEXT,
  simulated BOOLEAN NOT NULL DEFAULT false,
  reviewed BOOLEAN NOT NULL DEFAULT false,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX soc_events_created_idx ON public.soc_events (created_at DESC);
CREATE INDEX soc_events_ip_idx ON public.soc_events (ip_address);
CREATE INDEX soc_events_reviewed_idx ON public.soc_events (reviewed);

GRANT SELECT ON public.soc_events TO authenticated;
GRANT ALL ON public.soc_events TO service_role;

ALTER TABLE public.soc_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "soc events admin read" ON public.soc_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ==== blocked_ips ====
CREATE TABLE public.blocked_ips (
  ip_address TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  attack_count INT NOT NULL DEFAULT 1,
  blocked_by TEXT NOT NULL DEFAULT 'auto',   -- auto or admin
  permanent BOOLEAN NOT NULL DEFAULT false,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.blocked_ips TO authenticated;
GRANT ALL ON public.blocked_ips TO service_role;

ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blocked ips admin read" ON public.blocked_ips
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ==== Realtime ====
ALTER PUBLICATION supabase_realtime ADD TABLE public.soc_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.system_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.blocked_ips;

-- ==== RPCs ====

-- log a SOC event (any authenticated user OR anon via customer app for their own actions)
CREATE OR REPLACE FUNCTION public.log_soc_event(
  _threat_type TEXT,
  _severity TEXT,
  _ip_address TEXT,
  _user_agent TEXT,
  _fingerprint TEXT,
  _target_email TEXT,
  _field TEXT,
  _payload TEXT,
  _simulated BOOLEAN,
  _details JSONB
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_id UUID;
  status_val TEXT := 'flagged';
BEGIN
  IF _severity = 'red' THEN status_val := 'blocked'; END IF;
  INSERT INTO public.soc_events (
    threat_type, severity, status, ip_address, user_agent, fingerprint,
    target_email, field, payload, simulated, details
  ) VALUES (
    _threat_type, _severity, status_val, _ip_address, _user_agent, _fingerprint,
    _target_email, _field, _payload, COALESCE(_simulated, false), COALESCE(_details, '{}'::jsonb)
  ) RETURNING id INTO new_id;

  -- auto-flag IP after 3 red threats
  IF _severity = 'red' AND _ip_address IS NOT NULL THEN
    IF (SELECT COUNT(*) FROM public.soc_events
        WHERE ip_address = _ip_address AND severity = 'red'
          AND created_at > now() - interval '1 hour') >= 3 THEN
      INSERT INTO public.blocked_ips (ip_address, reason, attack_count, blocked_by)
      VALUES (_ip_address, 'Auto: 3+ red threats in 1h', 1, 'auto')
      ON CONFLICT (ip_address) DO UPDATE
        SET attack_count = public.blocked_ips.attack_count + 1,
            last_seen = now();
    END IF;
  END IF;

  RETURN new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_soc_event(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,BOOLEAN,JSONB) TO authenticated;

-- admin actions
CREATE OR REPLACE FUNCTION public.admin_flag_ip(_ip TEXT, _reason TEXT, _permanent BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  INSERT INTO public.blocked_ips (ip_address, reason, attack_count, blocked_by, permanent)
  VALUES (_ip, COALESCE(_reason, 'Manual admin flag'), 1, 'admin', COALESCE(_permanent, false))
  ON CONFLICT (ip_address) DO UPDATE
    SET reason = EXCLUDED.reason,
        blocked_by = 'admin',
        permanent = EXCLUDED.permanent OR public.blocked_ips.permanent,
        last_seen = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_flag_ip(TEXT,TEXT,BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_unblock_ip(_ip TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  DELETE FROM public.blocked_ips WHERE ip_address = _ip;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_unblock_ip(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_soc_action(_event_id UUID, _action TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _action = 'dismiss' THEN
    UPDATE public.soc_events SET reviewed = true, status = 'dismissed' WHERE id = _event_id;
  ELSIF _action = 'escalate' THEN
    UPDATE public.soc_events SET priority = 10, status = 'flagged' WHERE id = _event_id;
  ELSIF _action = 'review' THEN
    UPDATE public.soc_events SET reviewed = true WHERE id = _event_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_soc_action(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_setting(_key TEXT, _value JSONB)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  INSERT INTO public.system_settings (key, value, updated_at)
  VALUES (_key, _value, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_setting(TEXT, JSONB) TO authenticated;

-- Seed default settings
INSERT INTO public.system_settings (key, value) VALUES
  ('rule.transaction_simulator', 'true'::jsonb),
  ('rule.xss_detection', 'true'::jsonb),
  ('rule.sql_injection_detection', 'true'::jsonb),
  ('rule.brute_force_detection', 'true'::jsonb),
  ('rule.csrf_detection', 'true'::jsonb),
  ('rule.enumeration_detection', 'true'::jsonb),
  ('rule.session_hijack_detection', 'true'::jsonb),
  ('rule.phishing_detection', 'true'::jsonb),
  ('rule.duplicate_transfer', 'true'::jsonb),
  ('rule.cap_90', 'true'::jsonb),
  ('rule.security_challenge_80', 'true'::jsonb),
  ('rule.dormant_account', 'true'::jsonb),
  ('rule.night_activity', 'true'::jsonb),
  ('rule.micro_transaction', 'true'::jsonb),
  ('rule.new_recipient_large', 'true'::jsonb),
  ('rule.multiple_recipients', 'true'::jsonb),
  ('rule.daily_balance_drop', 'true'::jsonb),
  ('rule.login_lockout', 'true'::jsonb),
  ('rule.pin_lockout', 'true'::jsonb),
  ('ui.sound_alerts', 'true'::jsonb),
  ('sim.xss', 'false'::jsonb),
  ('sim.sql', 'false'::jsonb),
  ('sim.brute', 'false'::jsonb),
  ('sim.hijack', 'false'::jsonb),
  ('sim.enum', 'false'::jsonb),
  ('sim.phishing', 'false'::jsonb),
  ('sim.csrf', 'false'::jsonb),
  ('sim.full_demo', 'false'::jsonb),
  ('sim.speed', '"normal"'::jsonb)
ON CONFLICT (key) DO NOTHING;
