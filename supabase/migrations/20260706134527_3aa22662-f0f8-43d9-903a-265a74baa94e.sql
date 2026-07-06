
-- Helper: read a boolean rule flag from system_settings with a default.
CREATE OR REPLACE FUNCTION public.is_rule_on(_key text, _default boolean DEFAULT true)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT (value #>> '{}')::boolean FROM public.system_settings WHERE key = _key),
    _default
  );
$$;

REVOKE ALL ON FUNCTION public.is_rule_on(text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_rule_on(text, boolean) TO authenticated, service_role;

-- ---- Re-create rule-gated versions of existing SECURITY DEFINER functions ----

CREATE OR REPLACE FUNCTION public.check_duplicate_transfer(_recipient_account_number text, _amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  sender public.accounts;
  recipient public.accounts;
  prev public.transactions;
BEGIN
  IF NOT public.is_rule_on('rule.duplicate_transfer', true) THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT * INTO sender FROM public.accounts WHERE customer_id = auth.uid() LIMIT 1;
  IF sender.id IS NULL THEN RETURN jsonb_build_object('found', false); END IF;
  SELECT * INTO recipient FROM public.accounts WHERE account_number = _recipient_account_number LIMIT 1;
  IF recipient.id IS NULL THEN RETURN jsonb_build_object('found', false); END IF;

  SELECT * INTO prev FROM public.transactions
    WHERE account_id = sender.id
      AND related_account_id = recipient.id
      AND type = 'transfer_out'
      AND amount = _amount
      AND timestamp > now() - interval '2 minutes'
    ORDER BY timestamp DESC LIMIT 1;

  IF prev.id IS NULL THEN RETURN jsonb_build_object('found', false); END IF;

  RETURN jsonb_build_object(
    'found', true,
    'tx_id', prev.id,
    'seconds_ago', EXTRACT(EPOCH FROM (now() - prev.timestamp))::int,
    'amount', _amount,
    'recipient_name', recipient.full_name,
    'recipient_account', recipient.account_number
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_transfer(_recipient_account_number text, _amount numeric, _note text, _location text, _confirm_duplicate boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  sender public.accounts;
  recipient public.accounts;
  fraud RECORD;
  out_tx UUID;
  in_tx UUID;
  cap NUMERIC;
  dup_exists BOOLEAN := false;
  dup_seconds INT := 0;
  final_status public.tx_status;
  final_reason TEXT;
  is_dup_confirmed BOOLEAN := false;
  cap_rule_on BOOLEAN;
  dup_rule_on BOOLEAN;
BEGIN
  IF _amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  SELECT * INTO sender FROM public.accounts WHERE customer_id = auth.uid() LIMIT 1;
  IF sender.id IS NULL THEN RAISE EXCEPTION 'No account for current user'; END IF;

  cap_rule_on := public.is_rule_on('rule.cap_90', true);
  dup_rule_on := public.is_rule_on('rule.duplicate_transfer', true);

  cap := round(sender.balance * 0.9, 2);
  IF cap_rule_on AND _amount > cap THEN
    RAISE EXCEPTION 'Transfer exceeds 90%% cap of available balance (max %)', cap;
  END IF;

  SELECT * INTO recipient FROM public.accounts WHERE account_number = _recipient_account_number LIMIT 1;
  IF recipient.id IS NULL THEN RAISE EXCEPTION 'Recipient not found'; END IF;
  IF recipient.id = sender.id THEN RAISE EXCEPTION 'Cannot transfer to your own account'; END IF;
  IF sender.balance < _amount THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  IF dup_rule_on THEN
    SELECT true, EXTRACT(EPOCH FROM (now() - t.timestamp))::int
      INTO dup_exists, dup_seconds
    FROM public.transactions t
    WHERE t.account_id = sender.id
      AND t.related_account_id = recipient.id
      AND t.type = 'transfer_out'
      AND t.amount = _amount
      AND t.timestamp > now() - interval '2 minutes'
    ORDER BY t.timestamp DESC LIMIT 1;

    IF dup_exists AND NOT _confirm_duplicate THEN
      RAISE EXCEPTION 'DUPLICATE_DETECTED:%', dup_seconds;
    END IF;
  END IF;

  SELECT * INTO fraud FROM public.evaluate_fraud(sender.id, _amount, _location);
  final_status := fraud.status;
  final_reason := fraud.reason;

  IF dup_exists AND _confirm_duplicate THEN
    final_status := 'flagged'::public.tx_status;
    final_reason := 'Duplicate transfer — same amount to same recipient within 2 minutes';
    is_dup_confirmed := true;

    INSERT INTO public.security_events(event_type, email, user_id, account_id, details)
    VALUES ('duplicate_attempt',
            (SELECT email FROM auth.users WHERE id = auth.uid()),
            auth.uid(),
            sender.id,
            jsonb_build_object(
              'resolution', 'confirmed',
              'amount', _amount,
              'recipient_account', recipient.account_number,
              'recipient_name', recipient.full_name,
              'sender_account', sender.account_number,
              'seconds_ago', dup_seconds
            ));
  END IF;

  UPDATE public.accounts SET balance = balance - _amount WHERE id = sender.id;
  UPDATE public.accounts SET balance = balance + _amount WHERE id = recipient.id;

  INSERT INTO public.transactions(account_id, related_account_id, amount, type, status, reason_flagged, location, note, initiated_by, duplicate_confirmed)
    VALUES (sender.id, recipient.id, _amount, 'transfer_out', final_status, final_reason, _location, _note, 'customer', is_dup_confirmed)
    RETURNING id INTO out_tx;
  INSERT INTO public.transactions(account_id, related_account_id, amount, type, status, reason_flagged, location, note, initiated_by, duplicate_confirmed)
    VALUES (recipient.id, sender.id, _amount, 'transfer_in', final_status, final_reason, _location, _note, 'customer', is_dup_confirmed)
    RETURNING id INTO in_tx;

  RETURN jsonb_build_object('out_tx', out_tx, 'in_tx', in_tx, 'status', final_status, 'reason', final_reason, 'duplicate_confirmed', is_dup_confirmed);
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_transfer_pin(_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  acc public.accounts;
  attempts INT;
  lock_until TIMESTAMPTZ;
  lockout_on BOOLEAN;
BEGIN
  SELECT * INTO acc FROM public.accounts WHERE customer_id = auth.uid() LIMIT 1;
  IF acc.id IS NULL THEN RAISE EXCEPTION 'No account for current user'; END IF;
  lockout_on := public.is_rule_on('rule.pin_lockout', true);

  IF lockout_on AND acc.pin_locked_until IS NOT NULL AND acc.pin_locked_until > now() THEN
    RETURN jsonb_build_object('ok', false, 'locked', true, 'until', acc.pin_locked_until);
  END IF;

  IF acc.transfer_pin_hash IS NOT NULL AND extensions.digest(_pin, 'sha256') = acc.transfer_pin_hash THEN
    UPDATE public.accounts SET failed_pin_attempts = 0, pin_locked_until = NULL WHERE id = acc.id;
    RETURN jsonb_build_object('ok', true);
  END IF;

  IF NOT lockout_on THEN
    RETURN jsonb_build_object('ok', false, 'locked', false, 'attempts', 0, 'remaining', 999);
  END IF;

  UPDATE public.accounts
    SET failed_pin_attempts = COALESCE(failed_pin_attempts, 0) + 1
    WHERE id = acc.id
    RETURNING failed_pin_attempts INTO attempts;

  IF attempts >= 3 THEN
    lock_until := now() + interval '2 minutes';
    UPDATE public.accounts
      SET pin_locked_until = lock_until, failed_pin_attempts = 0
      WHERE id = acc.id;
    INSERT INTO public.security_events(event_type, email, user_id, account_id, details)
      VALUES ('pin_lockout',
              (SELECT email FROM auth.users WHERE id = auth.uid()),
              auth.uid(), acc.id,
              jsonb_build_object('locked_until', lock_until, 'duration_seconds', 120));
    RETURN jsonb_build_object('ok', false, 'locked', true, 'until', lock_until, 'attempts', attempts);
  END IF;

  RETURN jsonb_build_object('ok', false, 'locked', false, 'attempts', attempts, 'remaining', 3 - attempts);
END;
$$;

CREATE OR REPLACE FUNCTION public.register_failed_login(_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid UUID;
  attempts INT;
  lock_until TIMESTAMPTZ;
BEGIN
  IF NOT public.is_rule_on('rule.login_lockout', true) THEN
    RETURN jsonb_build_object('attempts', 0, 'locked', false);
  END IF;
  SELECT id INTO uid FROM auth.users WHERE email = _email LIMIT 1;
  IF uid IS NULL THEN
    RETURN jsonb_build_object('attempts', 0, 'locked', false);
  END IF;

  UPDATE public.profiles
    SET failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1
    WHERE id = uid
    RETURNING failed_login_attempts INTO attempts;

  IF attempts >= 3 THEN
    lock_until := now() + interval '1 minute';
    UPDATE public.profiles
      SET login_locked_until = lock_until, failed_login_attempts = 0
      WHERE id = uid;
    INSERT INTO public.security_events(event_type, email, user_id, details)
      VALUES ('login_lockout', _email, uid,
              jsonb_build_object('locked_until', lock_until, 'duration_seconds', 60));
    RETURN jsonb_build_object('attempts', attempts, 'locked', true, 'until', lock_until);
  END IF;

  RETURN jsonb_build_object('attempts', attempts, 'locked', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.check_login_lock(_email text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid UUID;
  locked TIMESTAMPTZ;
BEGIN
  IF NOT public.is_rule_on('rule.login_lockout', true) THEN
    RETURN jsonb_build_object('locked', false);
  END IF;
  SELECT id INTO uid FROM auth.users WHERE email = _email LIMIT 1;
  IF uid IS NULL THEN RETURN jsonb_build_object('locked', false); END IF;
  SELECT login_locked_until INTO locked FROM public.profiles WHERE id = uid;
  IF locked IS NOT NULL AND locked > now() THEN
    RETURN jsonb_build_object('locked', true, 'until', locked);
  END IF;
  RETURN jsonb_build_object('locked', false);
END;
$$;

-- Also gate the security-challenge lockout side-effect on verify_security_answer
CREATE OR REPLACE FUNCTION public.verify_security_answer(_answer text, _amount numeric, _balance numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  prof public.profiles;
  acc public.accounts;
  attempts INT;
  lock_until TIMESTAMPTZ;
  eml TEXT;
BEGIN
  SELECT * INTO prof FROM public.profiles WHERE id = auth.uid();
  SELECT * INTO acc FROM public.accounts WHERE customer_id = auth.uid() LIMIT 1;
  eml := (SELECT email FROM auth.users WHERE id = auth.uid());

  IF NOT public.is_rule_on('rule.security_challenge_80', true) THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  IF prof.security_answer_hash IS NULL THEN
    RAISE EXCEPTION 'No security question set';
  END IF;

  IF extensions.digest(lower(trim(_answer)), 'sha256') = prof.security_answer_hash THEN
    UPDATE public.profiles SET failed_security_attempts = 0 WHERE id = auth.uid();
    INSERT INTO public.security_events(event_type, email, user_id, account_id, details)
    VALUES ('security_challenge_passed', eml, auth.uid(), acc.id,
            jsonb_build_object('amount', _amount, 'balance', _balance,
                               'percent', round((_amount/NULLIF(_balance,0))*100, 2)));
    RETURN jsonb_build_object('ok', true);
  END IF;

  UPDATE public.profiles
    SET failed_security_attempts = COALESCE(failed_security_attempts, 0) + 1
    WHERE id = auth.uid()
    RETURNING failed_security_attempts INTO attempts;

  IF attempts >= 3 THEN
    lock_until := now() + interval '5 minutes';
    UPDATE public.profiles SET failed_security_attempts = 0 WHERE id = auth.uid();
    UPDATE public.accounts SET send_locked_until = lock_until WHERE id = acc.id;
    INSERT INTO public.security_events(event_type, email, user_id, account_id, details)
    VALUES ('security_challenge_locked', eml, auth.uid(), acc.id,
            jsonb_build_object('amount', _amount, 'balance', _balance,
                               'reason', 'Security question failed on high-value transfer attempt',
                               'locked_until', lock_until, 'duration_seconds', 300, 'high_value', true));
    RETURN jsonb_build_object('ok', false, 'locked', true, 'until', lock_until, 'attempts', attempts);
  END IF;

  INSERT INTO public.security_events(event_type, email, user_id, account_id, details)
  VALUES ('security_challenge_failed', eml, auth.uid(), acc.id,
          jsonb_build_object('amount', _amount, 'balance', _balance, 'attempts', attempts, 'remaining', 3 - attempts));

  RETURN jsonb_build_object('ok', false, 'locked', false, 'attempts', attempts, 'remaining', 3 - attempts);
END;
$$;

-- ---- Admin maintenance actions ----

CREATE OR REPLACE FUNCTION public.admin_clear_simulated_soc()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE deleted_count INT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  WITH d AS (DELETE FROM public.soc_events WHERE simulated = true RETURNING 1)
  SELECT count(*) INTO deleted_count FROM d;
  RETURN deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reset_demo()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  soc_n INT;
  ip_n INT;
  acc_n INT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;

  WITH d AS (DELETE FROM public.soc_events RETURNING 1) SELECT count(*) INTO soc_n FROM d;
  WITH d AS (DELETE FROM public.blocked_ips RETURNING 1) SELECT count(*) INTO ip_n FROM d;
  DELETE FROM public.security_events;
  DELETE FROM public.transactions;

  UPDATE public.accounts
    SET balance = 50000,
        failed_pin_attempts = 0,
        pin_locked_until = NULL,
        send_locked_until = NULL
    WHERE is_system = false;
  GET DIAGNOSTICS acc_n = ROW_COUNT;

  UPDATE public.profiles
    SET failed_login_attempts = 0,
        login_locked_until = NULL,
        failed_security_attempts = 0;

  RETURN jsonb_build_object('soc_cleared', soc_n, 'ips_cleared', ip_n, 'accounts_reset', acc_n);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_clear_simulated_soc() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_reset_demo() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_clear_simulated_soc() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_reset_demo() TO authenticated, service_role;
