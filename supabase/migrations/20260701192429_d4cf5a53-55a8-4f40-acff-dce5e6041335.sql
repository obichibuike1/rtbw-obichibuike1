
-- ============ Schema additions ============

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS security_question text,
  ADD COLUMN IF NOT EXISTS security_answer_hash bytea,
  ADD COLUMN IF NOT EXISTS failed_security_attempts integer NOT NULL DEFAULT 0;

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS send_locked_until timestamptz;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS duplicate_confirmed boolean NOT NULL DEFAULT false;

-- ============ Duplicate detection ============

CREATE OR REPLACE FUNCTION public.check_duplicate_transfer(
  _recipient_account_number text,
  _amount numeric
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  sender public.accounts;
  recipient public.accounts;
  prev public.transactions;
BEGIN
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

CREATE OR REPLACE FUNCTION public.log_duplicate_attempt(
  _recipient_account_number text,
  _amount numeric,
  _resolution text,
  _seconds_ago integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  sender public.accounts;
  recipient public.accounts;
BEGIN
  SELECT * INTO sender FROM public.accounts WHERE customer_id = auth.uid() LIMIT 1;
  SELECT * INTO recipient FROM public.accounts WHERE account_number = _recipient_account_number LIMIT 1;
  INSERT INTO public.security_events(event_type, email, user_id, account_id, details)
  VALUES ('duplicate_attempt',
          (SELECT email FROM auth.users WHERE id = auth.uid()),
          auth.uid(),
          sender.id,
          jsonb_build_object(
            'resolution', _resolution,
            'amount', _amount,
            'recipient_account', _recipient_account_number,
            'recipient_name', COALESCE(recipient.full_name, _recipient_account_number),
            'sender_account', sender.account_number,
            'seconds_ago', _seconds_ago
          ));
END;
$$;

-- ============ execute_transfer: add duplicate confirmation param ============

DROP FUNCTION IF EXISTS public.execute_transfer(text, numeric, text, text);
DROP FUNCTION IF EXISTS public.execute_transfer(text, numeric, text, text, boolean);

CREATE OR REPLACE FUNCTION public.execute_transfer(
  _recipient_account_number text,
  _amount numeric,
  _note text,
  _location text,
  _confirm_duplicate boolean DEFAULT false
) RETURNS jsonb
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
BEGIN
  IF _amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  SELECT * INTO sender FROM public.accounts WHERE customer_id = auth.uid() LIMIT 1;
  IF sender.id IS NULL THEN RAISE EXCEPTION 'No account for current user'; END IF;

  cap := round(sender.balance * 0.9, 2);
  IF _amount > cap THEN
    RAISE EXCEPTION 'Transfer exceeds 90%% cap of available balance (max %)', cap;
  END IF;

  SELECT * INTO recipient FROM public.accounts WHERE account_number = _recipient_account_number LIMIT 1;
  IF recipient.id IS NULL THEN RAISE EXCEPTION 'Recipient not found'; END IF;
  IF recipient.id = sender.id THEN RAISE EXCEPTION 'Cannot transfer to your own account'; END IF;
  IF sender.balance < _amount THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  -- Duplicate detection
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

-- ============ Security question ============

CREATE OR REPLACE FUNCTION public.set_security_question(
  _question text,
  _answer text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF _question IS NULL OR length(trim(_question)) = 0 THEN RAISE EXCEPTION 'Question required'; END IF;
  IF _answer IS NULL OR length(trim(_answer)) = 0 THEN RAISE EXCEPTION 'Answer required'; END IF;
  UPDATE public.profiles
    SET security_question = _question,
        security_answer_hash = extensions.digest(lower(trim(_answer)), 'sha256'),
        failed_security_attempts = 0
    WHERE id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_security_question()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT security_question FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.verify_security_answer(
  _answer text,
  _amount numeric,
  _balance numeric
) RETURNS jsonb
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

CREATE OR REPLACE FUNCTION public.log_security_challenge_triggered(
  _amount numeric, _balance numeric
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  acc public.accounts;
BEGIN
  SELECT * INTO acc FROM public.accounts WHERE customer_id = auth.uid() LIMIT 1;
  INSERT INTO public.security_events(event_type, email, user_id, account_id, details)
  VALUES ('security_challenge_triggered',
          (SELECT email FROM auth.users WHERE id = auth.uid()),
          auth.uid(), acc.id,
          jsonb_build_object('amount', _amount, 'balance', _balance,
                             'percent', round((_amount/NULLIF(_balance,0))*100, 2)));
END;
$$;

-- ============ Password reset logging ============

CREATE OR REPLACE FUNCTION public.log_password_reset(_email text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  masked TEXT;
  parts TEXT[];
  local_part TEXT;
BEGIN
  parts := string_to_array(_email, '@');
  IF array_length(parts, 1) = 2 THEN
    local_part := parts[1];
    IF length(local_part) <= 2 THEN
      masked := left(local_part, 1) || '***@' || parts[2];
    ELSE
      masked := left(local_part, 2) || repeat('*', greatest(length(local_part) - 2, 1)) || '@' || parts[2];
    END IF;
  ELSE
    masked := '***';
  END IF;
  INSERT INTO public.security_events(event_type, email, details)
  VALUES ('password_reset_request', masked, jsonb_build_object('masked_email', masked));
END;
$$;

-- ============ Permissions ============

REVOKE ALL ON FUNCTION public.execute_transfer(text, numeric, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_transfer(text, numeric, text, text, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.check_duplicate_transfer(text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_duplicate_transfer(text, numeric) TO authenticated;

REVOKE ALL ON FUNCTION public.log_duplicate_attempt(text, numeric, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_duplicate_attempt(text, numeric, text, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.set_security_question(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_security_question(text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_my_security_question() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_security_question() TO authenticated;

REVOKE ALL ON FUNCTION public.verify_security_answer(text, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_security_answer(text, numeric, numeric) TO authenticated;

REVOKE ALL ON FUNCTION public.log_security_challenge_triggered(numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_security_challenge_triggered(numeric, numeric) TO authenticated;

REVOKE ALL ON FUNCTION public.log_password_reset(text) FROM PUBLIC, anon, authenticated;
-- log_password_reset called via server function with service role
